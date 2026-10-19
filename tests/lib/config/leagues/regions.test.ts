/**
 * lib/config/leagues/regions.ts: the two regions and their sections, the words the client switcher prints,
 * and the shared region and tiebreak-stage helpers.
 */

import { describe, expect, it } from 'vitest';

import { ConfigInvariantError } from '@/lib/config/invariant';
import {
  ALL_DIVISIONS, CCS, DEFAULT_REGION, LEAGUES, LEAGUE_IDS, REGIONS, SECTIONS, getLeague, getRegion, getSection,
  leaguesInRegion, regionOf, sectionsInRegion, PLACE_VS_STAGES, UNCOMPUTABLE_STAGES, byRegion, isDefaultRegion,
  regionIdSuffix, tiebreakChains,
} from '@/lib/config/leagues';
import { RESERVED_SEGMENTS } from '@/lib/config/reserved-segments';
import type { RegionId } from '@/lib/model/ids';
import { REGION_WORDS, SECTION_NAMES } from '@/lib/shared/region-words';
import { UNCOMPUTABLE, SOCAL_IDS } from '@/tests/support/leagues';

describe('leagues: ids and helpers (SPEC §2.3)', () => {
  it('builds REGIONS and SECTIONS names from lib/shared/region-words.ts, the words the client switcher prints', () => {
    for (const r of REGIONS) expect(REGION_WORDS[r.id]).toEqual({ shortName: r.shortName, name: r.name });
    for (const s of SECTIONS) expect(SECTION_NAMES[s.shortName], s.id).toBe(s.name);
    expect(Object.keys(SECTION_NAMES)).toEqual(SECTIONS.map((s) => s.shortName));
    // Key order is part of any serialized region: name before shortName, as it always was.
    expect(Object.keys(REGIONS[0])).toEqual(['id', 'name', 'shortName']);
  });

  it('splits the sections into two regions, NorCal first and by default; a league’s region is its section’s', () => {
    expect(REGIONS).toEqual([
      { id: 'norcal', name: 'Northern California', shortName: 'NorCal' },
      { id: 'socal', name: 'Southern California', shortName: 'SoCal' },
    ]);
    expect(DEFAULT_REGION).toBe('norcal');
    expect(getRegion('socal').name).toBe('Southern California');
    expect(() => getRegion('midcal' as RegionId)).toThrow(/lib\/config\/leagues\.ts: unknown region/);
    expect(() => getRegion('midcal' as RegionId)).toThrow(ConfigInvariantError);
    expect(SECTIONS.map((s) => [s.id, s.region])).toEqual([
      ['ccs', 'norcal'], ['ncs', 'norcal'], ['ns', 'norcal'], ['ss', 'socal'], ['sds', 'socal'],
    ]);
    expect(sectionsInRegion('norcal').map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns']);
    expect(sectionsInRegion('socal').map((s) => s.id)).toEqual(['ss', 'sds']);
    expect(leaguesInRegion('norcal').map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    expect(leaguesInRegion('socal').map((l) => l.id)).toEqual(SOCAL_IDS);
    for (const l of LEAGUES) expect(regionOf(l.id), l.id).toBe(getSection(l.sectionId).region);
    expect(() => regionOf('nope')).toThrow(/unknown league/);
    // Each region is one contiguous run of LEAGUES (the switcher's lists and the no-JS reading order rely on it).
    const regions = LEAGUES.map((l) => regionOf(l.id));
    expect(regions.join(',')).toBe([...Array(5).fill('norcal'), ...Array(5).fill('socal')].join(','));
    // The region ids are reserved route segments and name nothing else.
    expect(RESERVED_SEGMENTS).toContain('norcal');
    expect(RESERVED_SEGMENTS).toContain('socal');
    const ids = [...SECTIONS.map((s) => s.id as string), ...LEAGUE_IDS, ...ALL_DIVISIONS.map((d) => d.id)];
    for (const r of REGIONS) expect(ids).not.toContain(r.id);
  });

  it('names each section’s rules document and its shootout rule (null where none is published)', () => {
    expect(SECTIONS.map((s) => [s.id, s.rulesSource.name, s.rulesSource.format])).toEqual([
      ['ccs', 'CCS Field Hockey Bylaws 2026-27', 'PDF'],
      ['ncs', 'CIF North Coast Section website', 'web page'],
      ['ns', 'Northern Section Field Hockey Guidelines 2026-28', 'PDF'],
      ['ss', 'CIF-SS Blue Book 2026-27, Article 200 (Field Hockey)', 'PDF'],
      ['sds', 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (Field Hockey)', 'Google Doc'],
    ]);
    expect(getSection('ccs').rulesSource.url).toBe(CCS.sources.bylaws);
    expect(getSection('ns').rulesSource.url).toBe((getLeague('eal').postseason as { sourceUrl: string }).sourceUrl);
    expect(getSection('ss').rulesSource.url).toBe('https://cifss.org/wp-content/uploads/2026/07/Field-Hockey-2026-27-Blue-Book.pdf');
    expect(getSection('sds').rulesSource.url).toBe('https://docs.google.com/document/d/1JE9fAJPGJSnCi0r398lSJZknG54O3gZ3vSc24gPOr90/edit');
    for (const s of SECTIONS) expect(s.rulesSource.url, s.id).toMatch(/^https:\/\//);
    expect(SECTIONS.map((s) => [s.id, s.shootout?.words ?? null])).toEqual([
      ['ccs', null], ['ncs', null], ['ns', '1 v 1s'], ['ss', null], ['sds', 'a shootout'],
    ]);
    // The Northern Section's 1 v 1 wins are confirmed by a box score's 'SO Win' column; the San Diego
    // Section's level W/L finals are not (si.com and the power rankings record Mt. Carmel–Poway as 2-0).
    expect(SECTIONS.map((s) => [s.id, s.shootout?.inference ?? null])).toEqual([
      ['ccs', null], ['ncs', null], ['ns', 'verified'], ['ss', null], ['sds', 'unverified'],
    ]);
    // The SDFHOA procedures do not cover invitational tournaments; §VII.E.4 makes no such exception.
    expect(SECTIONS.map((s) => [s.id, s.shootout?.coversTournaments ?? null])).toEqual([
      ['ccs', null], ['ncs', null], ['ns', true], ['ss', null], ['sds', false],
    ]);
    expect(getSection('ns').shootout?.disagreement).toBeNull();
    expect(getSection('sds').shootout?.disagreement).toBe(
      'si.com and the Section’s power rankings record some of these games with a decisive score (Mt. Carmel–Poway, Sep 11: 2-0).',
    );
    expect(getSection('ns').shootout?.citation).toBe(
      'Northern Section Field Hockey Guidelines §VII.E.4 (one 10-minute sudden-victory period, then 1 v 1s)',
    );
    expect(getSection('sds').shootout?.citation).toBe(
      'San Diego Field Hockey Officials Association 2026 Mercy & Overtime Procedures (a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal)',
    );
  });

  it('adds the Southern Section (no playoffs) and the San Diego Section (its own playoffs)', () => {
    expect(getSection('ss')).toMatchObject({
      name: 'Southern Section', shortName: 'SS', holdsFieldHockeyChampionship: false,
      maxprepsSectionId: '8e11e7d4-d3fa-4e6f-827f-652c29439d27',
      officialUrl: 'https://cifss.org/sports/field-hockey/',
      seasonWindow: { start: '2026-08-01', end: '2026-11-07' },
      noChampionshipNote: 'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaw 2011.1 and 3500.2) and CIF holds no state championship: a Sunset team’s season ends with its last game, Oct 31 at the latest.',
    });
    expect(getSection('sds')).toMatchObject({
      name: 'San Diego Section', shortName: 'SDS', holdsFieldHockeyChampionship: true,
      maxprepsSectionId: 'bab8c451-e991-413d-93ac-ee77067952a3',
      officialUrl: 'https://www.cifsds.org/sports/fh/index',
      seasonWindow: { start: '2026-08-01', end: '2026-11-21' },
      noChampionshipNote: null,
    });
  });
});

describe('leagues: the shared region and tiebreak-stage helpers', () => {
  it('suffixes the ids of a region\'s repeated blocks: nothing for the default region, -socal for SoCal', () => {
    expect(REGIONS.map((r) => [r.id, isDefaultRegion(r.id), regionIdSuffix(r.id)])).toEqual([
      ['norcal', true, ''],
      ['socal', false, '-socal'],
    ]);
    expect(isDefaultRegion(DEFAULT_REGION)).toBe(true);
  });

  it('groups items by region in REGIONS order, each region present, each group in the items\' order', () => {
    const groups = byRegion(LEAGUES, (l) => regionOf(l.id));
    expect(groups.map((g) => g.region.id)).toEqual(REGIONS.map((r) => r.id));
    expect(groups.flatMap((g) => g.items.map((l) => l.id)).sort()).toEqual(LEAGUE_IDS.slice().sort());
    for (const { region, items } of groups) {
      expect(items.map((l) => l.id)).toEqual(LEAGUES.filter((l) => regionOf(l.id) === region.id).map((l) => l.id));
    }
    expect(byRegion([], () => 'norcal').map((g) => g.items)).toEqual([[], []]);
  });

  it('lists a league\'s tiebreak chains: the default first, then each byBucketStart key', () => {
    for (const l of LEAGUES) {
      const chains = tiebreakChains(l);
      expect(chains[0]).toEqual({ start: null, chain: l.rules.tiebreaks.default });
      expect(chains.slice(1).map((c) => c.start)).toEqual(Object.keys(l.rules.tiebreaks.byBucketStart ?? {}).map(Number));
    }
  });

  it('names the uncomputable and the place-relative stages once', () => {
    expect([...UNCOMPUTABLE_STAGES].sort()).toEqual([...UNCOMPUTABLE].sort());
    expect([...PLACE_VS_STAGES].sort()).toEqual(['record-vs-higher-placed', 'record-vs-lower-placed']);
  });
});
