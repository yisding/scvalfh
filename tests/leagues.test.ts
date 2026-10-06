/**
 * lib/leagues.ts: the SPEC §2.4 invariants (also enforced by assertLeagues() at import), the §2.3
 * helpers, the SCVAL strings that must stay byte-identical to today's, and the Southern California
 * amendment's regions, sections and four leagues (DESIGN-socal §2.1), their copy held to the site's
 * honesty rules.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_DIVISIONS, CCS, CCS_LEAGUE_IDS, DATA_QUALITY, DEFAULT_REGION, INDEPENDENT_LEAGUES, LEAGUES, LEAGUES_PROPER,
  LEAGUE_IDS, NO_POSTSEASON_LEAGUE_IDS,
  REGIONS, RESERVED_SEGMENTS, SECTIONS, SECTION_PLAYOFFS_LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS,
  assertLeagues, divisionDisplay, divisionHeading, divisionLabel, divisionsOf, drawNumberOf, findDivision, findLeague,
  getDivision, getLeague, getRegion, getSection, isIndependentDivision, isIndependentLeague, isLeagueId, isSingleDivision,
  ladderFor, ladderRung,
  leagueOfDivision, leaguePlayEnds, leaguePlayStarts, leagueStandingsUrl, leaguesInRegion, regionOf,
  seasonWindowBounds, sectionOf, sectionsInRegion, standingsLabel, statusesOf, tiebreakChainFor,
  type LeagueConfig, type SectionConfig,
} from '../lib/leagues';
import { getTeamById } from '../lib/teams';
import { CCS_BRACKET_URL } from '../lib/season';
import type { PlayoffStatus, RegionId, TiebreakStage } from '../lib/types';
import { SEED_CLAIM, umpireOfficialClaims } from '../scripts/copy-rules';

const UNCOMPUTABLE: readonly TiebreakStage[] = ['coin-flip', 'ccs-points', 'no-rule'];

function chainsOf(l: LeagueConfig): Array<[number | null, readonly TiebreakStage[]]> {
  return [
    [null, l.rules.tiebreaks.default],
    ...Object.entries(l.rules.tiebreaks.byBucketStart ?? {}).map(
      ([k, v]) => [Number(k), v!] as [number, readonly TiebreakStage[]],
    ),
  ];
}

/** Every string a league could render (Gabilan check). */
function renderedStrings(l: LeagueConfig): string[] {
  const out: string[] = [
    l.name, l.shortName, l.cities, l.alignmentSource, ...l.links.map((x) => x.label), l.membershipNote ?? '',
  ];
  for (const d of l.divisions) {
    out.push(d.label, ...d.searchAliases, d.knownCause ?? '', d.home.lineLabel ?? '', d.ladderLine?.label ?? '');
    if (d.official.mode === 'none') out.push(d.official.note);
  }
  const r = l.rules;
  out.push(
    r.citations.points, r.citations.order, r.citations.doubleRoundRobin, r.citations.overtime,
    r.citations.coChampions, r.citations.incomplete ?? '', ...Object.values(r.citations.stages).map(String),
    r.coChampionsLabel, r.unresolvedSuffix,
  );
  for (const rung of l.postseason.ladder) out.push(rung.label, rung.phrase, rung.badge, rung.legend);
  const ps = l.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      out.push(ps.citation);
      for (const p of ps.pairings) out.push(p.label, ...p.seatLabels);
      break;
    case 'league-tournament':
      out.push(ps.name, ps.titleNote, ps.finalSite.label, ...Object.values(ps.citations), ...ps.rounds.map((x) => x.pairing));
      break;
    case 'unbracketed-tournament':
      out.push(ps.name, ps.note, ...Object.values(ps.citations));
      break;
    case 'no-postseason':
      out.push(ps.note, ps.sourceLabel, ...Object.values(ps.citations));
      break;
    case 'section-playoffs':
      out.push(ps.name, ps.note, ps.qualificationLine, ps.sourceLabel, ...ps.divisions.map((d) => d.name), ...Object.values(ps.citations));
      break;
  }
  out.push(...l.keyDates.map((k) => k.label));
  // The league's section prints too, wherever the league's rules or postseason are explained.
  const section: SectionConfig = getSection(l.sectionId);
  out.push(section.name, section.briefLabel, section.rulesSource.name, section.noChampionshipNote ?? '');
  if (section.shootout) out.push(section.shootout.words, section.shootout.citation);
  return out;
}

const SOCAL_IDS = ['sunset', 'city', 'north-county', 'metro', 'independents'];
const socal = (): LeagueConfig[] => LEAGUES.filter((l) => SOCAL_IDS.includes(l.id));

/** Mutate the live config, expect assertLeagues() to throw, then restore. */
function expectViolation(mutate: () => () => void, message: RegExp): void {
  const restore = mutate();
  try {
    expect(() => assertLeagues()).toThrow(message);
  } finally {
    restore();
  }
  expect(() => assertLeagues()).not.toThrow();
}

describe('leagues: ids and helpers (SPEC §2.3)', () => {
  it('configures the nine leagues and the independents in order: NorCal first; one bracketed tournament, one unbracketed, two without a postseason, three section playoffs', () => {
    expect(LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    // The Southern Section independents are a group with no table, not a league: every count of leagues leaves them out.
    expect(LEAGUES_PROPER.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro']);
    expect(INDEPENDENT_LEAGUES.map((l) => l.id)).toEqual(['independents']);
    expect(LEAGUE_IDS.filter(isIndependentLeague)).toEqual(['independents']);
    expect(isIndependentDivision('independents')).toBe(true);
    expect(isIndependentDivision('sunset')).toBe(false);
    expect(CCS_LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal']);
    expect(TOURNAMENT_LEAGUE_IDS).toEqual(['mcal']);
    expect(UNBRACKETED_LEAGUE_IDS).toEqual(['eal']);
    expect(NO_POSTSEASON_LEAGUE_IDS).toEqual(['sunset', 'independents']);
    expect(SECTION_PLAYOFFS_LEAGUE_IDS).toEqual(['city', 'north-county', 'metro']);
    expect(ALL_DIVISIONS.map((d) => d.id)).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county', 'eal',
      'sunset', 'city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay',
      'independents',
    ]);
    expect(SECTIONS.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(SECTIONS.map((s) => s.shortName)).toEqual(['CCS', 'NCS', 'NS', 'SS', 'SDS']);
    expect(SECTIONS.map((s) => s.briefLabel)).toEqual(['CCS', 'NCS', 'Northern Section', 'Southern Section', 'San Diego Section']);
    // Sixteen divisions' worth of teams: 49 NorCal + 53 SoCal (the 48 league teams and the five independents) = 102.
    expect(ALL_DIVISIONS.reduce((n, d) => n + d.expectedTeams, 0)).toBe(102);
  });

  it('splits the sections into two regions, NorCal first and by default; a league’s region is its section’s', () => {
    expect(REGIONS).toEqual([
      { id: 'norcal', name: 'Northern California', shortName: 'NorCal' },
      { id: 'socal', name: 'Southern California', shortName: 'SoCal' },
    ]);
    expect(DEFAULT_REGION).toBe('norcal');
    expect(getRegion('socal').name).toBe('Southern California');
    expect(() => getRegion('midcal' as RegionId)).toThrow(/lib\/leagues\.ts: unknown region/);
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

  it('labels divisions, and single-division leagues have no division heading', () => {
    expect(divisionHeading('pcal')).toBeNull();
    expect(divisionHeading('marin-county')).toBeNull();
    expect(divisionHeading('de-anza')).toBe('De Anza');
    expect(divisionHeading('mt-hamilton')).toBe('Mt. Hamilton');
    expect(divisionLabel('pcal')).toBe('PCAL');
    expect(divisionLabel('marin-county')).toBe('MCAL');
    expect(divisionDisplay('mt-hamilton')).toBe('BVAL · Mt. Hamilton');
    expect(divisionDisplay('marin-county')).toBe('MCAL');
    expect(divisionDisplay('de-anza')).toBe('SCVAL · De Anza');
    expect(divisionHeading('eal')).toBeNull();
    expect(divisionLabel('eal')).toBe('EAL');
    expect(divisionDisplay('eal')).toBe('EAL');
    expect(isSingleDivision('eal')).toBe(true);
    expect(isSingleDivision('pcal')).toBe(true);
    expect(isSingleDivision('scval')).toBe(false);
  });

  it('looks things up, and throws on an unknown id', () => {
    expect(getLeague('bval').shortName).toBe('BVAL');
    expect(findLeague('nope')).toBeUndefined();
    expect(isLeagueId('mcal')).toBe(true);
    expect(isLeagueId('marin-county')).toBe(false);
    expect(getDivision('santa-teresa').leagueId).toBe('bval');
    expect(findDivision('gabilan')).toBeUndefined();
    expect(leagueOfDivision('pcal').id).toBe('pcal');
    expect(divisionsOf('scval').map((d) => d.id)).toEqual(['de-anza', 'el-camino']);
    expect(getSection('ncs').holdsFieldHockeyChampionship).toBe(false);
    expect(sectionOf('mcal').id).toBe('ncs');
    expect(sectionOf('pcal').id).toBe('ccs');
    expect(sectionOf('eal').id).toBe('ns');
    expect(getSection('ns')).toMatchObject({
      name: 'Northern Section', shortName: 'NS', holdsFieldHockeyChampionship: true,
      officialUrl: 'https://www.cifns.org/sports/fh/index', noChampionshipNote: null,
    });
    expect(getDivision('eal').leagueId).toBe('eal');
    expect(() => getLeague('nope')).toThrow(/lib\/leagues\.ts/);
    expect(() => getDivision('nope')).toThrow(/lib\/leagues\.ts/);
    expect(() => getSection('xyz' as 'ccs')).toThrow(/lib\/leagues\.ts/);
  });

  it('builds no MaxPreps URL for a division MaxPreps has no table for, and keeps MaxPreps’ own table names', () => {
    expect(leagueStandingsUrl('valley')).toBeNull();
    expect(leagueStandingsUrl('metro-mesa')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/metro-south-bay/?leagueid=6dfe5a12-b82f-45d7-b103-71a5c13c0093',
    );
    expect(leagueStandingsUrl('sunset')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/sunset/?leagueid=aa46adc4-c188-4e3b-b5fd-857064176297',
    );
    for (const d of ALL_DIVISIONS) {
      const url = leagueStandingsUrl(d.id);
      if (url !== null) expect(url, d.id).not.toMatch(/null/);
      expect(url === null, d.id).toBe(d.maxprepsLeagueId === null);
    }
  });

  it("keeps today's MaxPreps standings URLs for De Anza and El Camino", () => {
    expect(leagueStandingsUrl('de-anza')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/santa-clara-valley--de-anza/?leagueid=ea062dfe-9fb9-45c7-9839-0801993d6ac6',
    );
    expect(leagueStandingsUrl('el-camino')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/santa-clara-valley--el-camino/?leagueid=7bdfb2a7-8dde-4a21-88c9-832f1593554d',
    );
    expect(leagueStandingsUrl('pcal')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/pacific-coast--gabilan/?leagueid=50ac53cd-e46f-4df9-824b-5a954c583b95',
    );
    expect(leagueStandingsUrl('eal')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/eastern-athletic/?leagueid=60959b47-b0cf-4d7d-b054-d8ea140870ef',
    );
  });

  it('reads ladders, chains, statuses and dates', () => {
    expect(ladderRung('de-anza', 4).status).toBe('play-in');
    expect(ladderRung('el-camino', 8).status).toBe('out');
    expect(ladderRung('santa-teresa', 1).badge).toBe('Play-in host');
    expect(ladderRung('mt-hamilton', 5).status).toBe('no-aq-route');
    expect(ladderRung('marin-county', 6).status).toBe('tournament');
    expect(ladderRung('marin-county', 120).status).toBe('below-line');
    expect(ladderFor('santa-teresa').map((r) => r.status)).toEqual(['play-in', 'no-aq-route']);
    expect(statusesOf('scval')).toEqual(['aq', 'play-in', 'at-large', 'out']);
    expect(statusesOf('bval')).toEqual(['aq', 'play-in', 'no-aq-route']);
    expect(statusesOf('mcal')).toEqual(['bye', 'tournament', 'below-line']);
    expect(statusesOf('eal')).toEqual(['tournament', 'below-line']);
    expect(statusesOf('sunset')).toEqual(['no-postseason']);
    for (const id of ['city', 'north-county', 'metro']) expect(statusesOf(id), id).toEqual(['tournament', 'selection']);
    expect(ladderRung('sunset', 1).label).toBe('No section playoffs');
    expect(ladderRung('sunset', 10).status).toBe('no-postseason');
    expect(ladderRung('city-western', 1).badge).toBe('1st');
    expect(ladderRung('valley', 2).status).toBe('selection');
    expect(tiebreakChainFor('sunset', 1)).toEqual(['no-rule']);
    expect(tiebreakChainFor('metro-mesa', 2)).toEqual(['no-rule']);
    expect(ladderRung('eal', 6).label).toBe('Super Regional place');
    expect(ladderRung('eal', 7).status).toBe('below-line');
    expect(tiebreakChainFor('eal', 1)).toEqual(['no-rule']);
    expect(tiebreakChainFor('pcal', 1)).toEqual(['head-to-head', 'record-vs-lower-placed', 'ccs-points']);
    expect(tiebreakChainFor('pcal', 2)).toEqual([
      'head-to-head', 'record-vs-higher-placed', 'record-vs-lower-placed', 'ccs-points',
    ]);
    expect(tiebreakChainFor('pcal', 3)).toEqual(['no-rule']);
    expect(tiebreakChainFor('de-anza', 5)).toEqual([
      'head-to-head', 'division-wins', 'h2h-goals-against', 'h2h-goal-diff', 'coin-flip',
    ]);
    expect(tiebreakChainFor('marin-county', 1)).toEqual(['h2h-win-pct', 'record-above-tie', 'draw-number']);
    expect(drawNumberOf(getLeague('mcal').rules, 'archie-williams')).toBe(1);
    expect(drawNumberOf(getLeague('mcal').rules, 'marin-academy')).toBe(9);
    // No fallback: a league without draw numbers, or a slug with none, is a caller's bug.
    expect(() => drawNumberOf(getLeague('scval').rules, 'archie-williams')).toThrow(/no draw number/);
    expect(() => drawNumberOf(getLeague('mcal').rules, 'homestead')).toThrow(/no draw number/);
    expect(leaguePlayEnds('scval')).toBe('2026-10-28');
    expect(leaguePlayEnds('bval')).toBe('2026-10-30');
    expect(leaguePlayEnds('mcal')).toBe('2026-10-22');
    expect(leaguePlayEnds('eal')).toBe('2026-10-28');
    expect(leaguePlayStarts('sunset')).toBe('2026-08-25');
    expect(leaguePlayEnds('sunset')).toBe('2026-10-31');
    expect(leaguePlayStarts('city')).toBe('2026-09-01');
    expect(leaguePlayStarts('north-county')).toBe('2026-09-09');
    expect(leaguePlayStarts('metro')).toBe('2026-09-28');
    for (const id of ['city', 'north-county', 'metro']) expect(leaguePlayEnds(id), id).toBe('2026-10-30');
    // The Northern, Southern and San Diego Sections' windows sit inside the union.
    expect(seasonWindowBounds()).toEqual({ start: '2026-08-01', end: '2026-11-30' });
  });

  it('sets the overtime rule, the order scope and the MCAL schedule-changes page', () => {
    expect(LEAGUES.map((l) => [l.id, l.rules.leagueOvertime])).toEqual([
      ['scval', 'sudden-victory'], ['bval', 'sudden-victory'], ['pcal', 'none'], ['mcal', 'none'], ['eal', 'shootout'],
      ['sunset', 'none'], ['city', 'shootout'], ['north-county', 'shootout'], ['metro', 'shootout'], ['independents', 'none'],
    ]);
    // Every NorCal league's own document orders its table by points, except the EAL's, which decides only the
    // title; no SoCal league publishes a points rule, so this site orders those tables itself.
    expect(LEAGUES.map((l) => [l.id, l.rules.orderScope])).toEqual([
      ['scval', 'table'], ['bval', 'table'], ['pcal', 'table'], ['mcal', 'table'], ['eal', 'title'],
      ['sunset', 'site'], ['city', 'site'], ['north-county', 'site'], ['metro', 'site'], ['independents', 'site'],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.rules.classification])).toEqual([
      ['scval', 'contest-type'], ['bval', 'official-fixtures'], ['pcal', 'official-fixtures'], ['mcal', 'official-fixtures'],
      ['eal', 'contest-type'], ['sunset', 'contest-type'], ['city', 'membership'], ['north-county', 'membership'], ['metro', 'membership'],
      ['independents', 'membership'],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.membershipNote === null])).toEqual([
      ['scval', true], ['bval', true], ['pcal', true], ['mcal', true], ['eal', false],
      ['sunset', false], ['city', true], ['north-county', true], ['metro', true], ['independents', false],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.alignmentSource])).toEqual([
      ['scval', 'its official schedule'], ['bval', 'its official schedule'], ['pcal', 'its official schedule'],
      ['mcal', 'its official schedule'], ['eal', 'MaxPreps’ table and league flag'],
      ['sunset', 'MaxPreps’ 2024-25 and 2025-26 Sunset tables'], ['city', 'the CIF-SDS 2026-27 League Alignment'],
      ['north-county', 'the CIF-SDS 2026-27 League Alignment'], ['metro', 'the CIF-SDS 2026-27 League Alignment'],
      ['independents', 'MaxPreps’ 2026-27 team pages and schedules (five Southern Section schools in no field hockey league, which play each other)'],
    ]);
    // `region` was renamed `cities`; NorCal's words are unchanged.
    expect(LEAGUES.slice(0, 5).map((l) => l.cities)).toEqual([
      'Santa Clara County and San Francisco', 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
      'Monterey County and Hollister', 'Marin County, San Francisco and Berkeley', 'Chico, Corning, Susanville, Davis and Fair Oaks',
    ]);
    expect('region' in getLeague('scval')).toBe(false);
    expect(getLeague('mcal').officialChanges).toEqual({
      url: 'https://www.mcalsports.org/Schedir.htm',
      cellMarker: 'Girls Field Hockey:',
      sha256: 'b1e5c523b251021522a77ed459d5d7035fe0c9100cb2b727f1ea63c467566b76',
    });
    for (const id of ['scval', 'bval', 'pcal', 'eal', ...SOCAL_IDS]) expect(getLeague(id).officialChanges).toBeNull();
    expect(CCS.bracketUrl).toBe(CCS_BRACKET_URL);
  });
});

describe('leagues: SCVAL strings are today’s, verbatim', () => {
  const scval = getLeague('scval');

  it('cites Article VI exactly as BYLAW_CITATIONS did', () => {
    expect(scval.rules.citations).toEqual({
      points: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie)',
      pointsShort: 'Art. VI §2',
      order: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (standings are the order of points)',
      doubleRoundRobin: 'Article VI §1 (double round robin; division games only count to the division record)',
      overtime: 'Article IV (one 7-minute sudden-victory period; still tied ⇒ the game ends in a tie)',
      coChampions: 'Article VI §2 (a tie at the top means co-champions)',
      stages: {
        'head-to-head': 'Article VI §3 (better head-to-head record among the tied teams)',
        'division-wins': 'Article VI §4 (greater number of wins in division play)',
        'h2h-goals-against': 'Article VI §5 (least goals given up between the tied teams)',
        'h2h-goal-diff': 'Article VI §6 (goal differential between the tied teams)',
        'coin-flip': 'Article VI §7 (coin flip — we cannot compute it, so the teams stay tied)',
      },
    });
    expect(scval.rules.unresolvedSuffix).toBe('— Article VI §7 decides it with a coin flip');
    expect(scval.postseason.kind === 'ccs-ladder' && scval.postseason.citation).toBe(
      'Article VII §2 (first three in each division are automatic qualifiers; fourth place plays in for the SCVAL 7th AQ; the play-in loser and both fifth-place teams go to CCS for at-large consideration)',
    );
  });

  it('keeps the Article VII ladder and its four copy strings per rung', () => {
    expect(
      scval.postseason.ladder.map((r) => [r.places, r.status, r.label, r.phrase, r.badge, r.legend]),
    ).toEqual([
      [[1, 3], 'aq', 'Automatic qualifier', 'automatic qualifier', 'AQ', 'Places 1-3 — automatic CCS qualifier'],
      [[4, 4], 'play-in', 'Play-in game Oct 30', 'the Oct 30 play-in', 'Play-in', '4th place — play-in {date} for the SCVAL 7th berth'],
      [[5, 5], 'at-large', 'At-large consideration', 'at-large consideration', 'At-large', '5th place — submitted to CCS for at-large consideration'],
      [[6, 99], 'out', 'No automatic path', 'no automatic path', 'No AQ', '6th or lower — no automatic path'],
    ]);
  });

  it('keeps the Oct 30 crossover pairings and their labels', () => {
    if (scval.postseason.kind !== 'ccs-ladder') throw new Error('scval is a CCS ladder league');
    expect(
      scval.postseason.pairings.map((p) => [p.id, p.date, p.seats, p.seatLabels, p.host, p.isPlayIn, p.label, p.tag]),
    ).toEqual([1, 2, 3, 4].map((seed) => [
      `scval-crossover-${seed}`, '2026-10-30',
      [{ division: 'de-anza', place: seed }, { division: 'el-camino', place: seed }],
      [`De Anza #${seed}`, `El Camino #${seed}`], null, seed === 4,
      seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
      'scval-crossover',
    ]));
  });

  it('keeps the CCS field and key dates', () => {
    expect(CCS.autoQualifiers).toEqual({ scval: 7, bval: 4, pcal: 2, atLarge: 3, total: 16 });
    expect(CCS.keyDates).toEqual({
      entriesDue: '2026-11-02T12:00:00', seedingMeeting: '2026-11-02T13:00:00',
      quarterfinals: '2026-11-07', semifinals: '2026-11-11', finals: '2026-11-14',
      evaluationMeeting: '2026-11-19T16:00:00', endOfLeagueSeason: '2026-10-31',
    });
  });
});

describe('leagues: the EAL (Northern Section)', () => {
  const eal = getLeague('eal');
  const division = getDivision('eal');

  it('classifies by MaxPreps’ league flag behind official mode none, and lists Red Bluff as an extra row', () => {
    expect(eal.rules.classification).toBe('contest-type');
    expect(eal.rules.excludeContestTypes).toEqual([2, 4, 5]);
    expect(eal.rules.postseasonFrom).toBe('2026-10-30');
    expect(division.official.mode).toBe('none');
    expect(division.official.mode === 'none' && division.official.note).toMatch(/^The EAL publishes no schedule or standings document of its own\./);
    expect([division.expectedTeams, division.gamesPerTeam, division.maxprepsTeamCount]).toEqual([6, 10, 7]);
    expect(division.leaguePlay).toEqual({ first: '2026-08-24', last: '2026-10-28' });
    expect(division.maxprepsExtraRows).toEqual({
      '4d3da788-bbe2-4ab9-b854-d95aa9786cda': 'Red Bluff: a 0-0-0 row with no games; not fielding a varsity team in 2026',
    });
    expect(division.reportedTrust).toBe('records-only');
    expect(division.ladderLine).toBeNull();
    expect(eal.withdrawnNames).toContain('Red Bluff');
  });

  it('is an unbracketed Super Regional for the top six, Oct 30-31', () => {
    if (eal.postseason.kind !== 'unbracketed-tournament') throw new Error('eal is an unbracketed tournament league');
    expect(eal.postseason).toMatchObject({
      name: 'Super Regional', qualifiers: 6, dates: { first: '2026-10-30', last: '2026-10-31' },
      sourceUrl: 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf',
    });
    expect(Object.keys(eal.postseason.citations).sort()).toEqual(['eligibility', 'format', 'noFurtherPath', 'qualification', 'seeding']);
    // §VII.J ties the deadline to "the Last contest of the season", one Section date, not each school's own last game.
    expect(eal.postseason.citations.eligibility).toMatch(/by noon the day after the last contest of the season is not eligible/);
    expect(eal.postseason.citations.eligibility).not.toMatch(/its last contest/);
    expect(eal.keyDates.map((k) => [k.id, k.date])).toEqual([['league-play-ends', '2026-10-28'], ['super-regional', '2026-10-30']]);
  });

  it('records Red Bluff as not covered and its si.com ids as ignored', () => {
    expect(DATA_QUALITY.notCovered.find((n) => n.name === 'Red Bluff')?.reason).toBe('Red Bluff is not fielding a varsity team in 2026.');
    for (const id of ['490259', '490260', '635037']) expect(DATA_QUALITY.sbliveIgnoredTeamIds[id], id).toBeTruthy();
  });

  it('never says a Red Bluff team was cancelled or withdrew', () => {
    const strings = [
      ...renderedStrings(eal), ...Object.values(DATA_QUALITY.sbliveIgnoredTeamIds),
      ...DATA_QUALITY.notCovered.map((n) => n.reason), ...Object.values(division.maxprepsExtraRows),
    ];
    for (const s of strings) expect(s, s).not.toMatch(/Red Bluff[^.;:]{0,80}\b(cancel\w*|withdr\w*|dropped|no (field hockey )?program)\b/i);
  });
});

describe('leagues: never configured, never rendered', () => {
  it('never configures Pacific Coast - Mission', () => {
    const mission = '6e1f97d4-5211-4d98-bf59-282cd754bc5c';
    expect(ALL_DIVISIONS.map((d) => d.maxprepsLeagueId)).not.toContain(mission);
    expect(ALL_DIVISIONS.map((d) => d.maxprepsName).join('|')).not.toMatch(/Mission/);
    expect(Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)).toContain(mission);
  });

  it('never puts "Gabilan" in a rendered string (it is data only, in maxprepsName/maxprepsSlug)', () => {
    for (const l of LEAGUES) {
      for (const s of renderedStrings(l)) expect(s, `${l.id}: ${s}`).not.toMatch(/gabilan/i);
    }
    for (const s of SECTIONS) expect(`${s.name} ${s.noChampionshipNote ?? ''}`).not.toMatch(/gabilan/i);
    expect(getDivision('pcal').maxprepsName).toBe('Pacific Coast - Gabilan');
  });

  it('never writes "eliminated"', () => {
    for (const l of LEAGUES) {
      for (const s of renderedStrings(l)) expect(s, `${l.id}: ${s}`).not.toMatch(/eliminat/i);
    }
  });
});

describe('leagues: assertLeagues invariants (SPEC §2.4)', () => {
  it('passes on the shipped config', () => {
    expect(() => assertLeagues()).not.toThrow();
  });

  it('1. ids are unique; a league id equals only its own single division; no reserved segment', () => {
    const ids = [...SECTIONS.map((s) => s.id as string), ...LEAGUE_IDS];
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    expect(new Set(LEAGUE_IDS).size).toBe(LEAGUE_IDS.length);
    expect(new Set(ALL_DIVISIONS.map((d) => d.id)).size).toBe(ALL_DIVISIONS.length);
    for (const l of LEAGUES) {
      expect(RESERVED_SEGMENTS as readonly string[]).not.toContain(l.id);
      const clash = ALL_DIVISIONS.find((d) => d.id === l.id);
      if (clash) expect(l.divisions.map((d) => d.id)).toEqual([l.id]);
    }
    expect(ids.length).toBeGreaterThan(0);
    expectViolation(() => {
      const d = getLeague('bval').divisions[0] as { id: string };
      d.id = 'de-anza';
      return () => { d.id = 'mt-hamilton'; };
    }, /duplicate division id/);
    expectViolation(() => {
      const d = getLeague('bval').divisions[1] as { id: string };
      d.id = 'scval';
      return () => { d.id = 'santa-teresa'; };
    }, /single division/);
  });

  it('2. every ladder covers 1..99 exactly once per division, with statuses of its kind', () => {
    const ccsStatuses: PlayoffStatus[] = ['aq', 'play-in', 'at-large', 'out', 'no-aq-route'];
    const tournamentStatuses: PlayoffStatus[] = ['bye', 'tournament', 'below-line'];
    const unbracketedStatuses: PlayoffStatus[] = ['tournament', 'below-line'];
    for (const l of LEAGUES) {
      for (const d of l.divisions) {
        for (let p = 1; p <= 99; p++) {
          const n = l.postseason.ladder.filter(
            (r) => (r.divisions === '*' || r.divisions.includes(d.id)) && r.places[0] <= p && p <= r.places[1],
          ).length;
          expect(n, `${d.id} place ${p}`).toBe(1);
        }
      }
      const allowed = {
        'ccs-ladder': ccsStatuses, 'league-tournament': tournamentStatuses, 'unbracketed-tournament': unbracketedStatuses,
        'no-postseason': ['no-postseason'] as PlayoffStatus[], 'section-playoffs': ['tournament', 'selection'] as PlayoffStatus[],
      }[l.postseason.kind];
      for (const r of l.postseason.ladder) expect(allowed).toContain(r.status);
    }
    expectViolation(() => {
      const rung = getLeague('pcal').postseason.ladder[1] as { places: readonly [number, number] };
      rung.places = [4, 99];
      return () => { rung.places = [3, 99]; };
    }, /covers place 3 0 times/);
    expectViolation(() => {
      const rung = getLeague('eal').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'bye';
      return () => { rung.status = 'below-line'; };
    }, /ladder status bye not allowed for unbracketed-tournament/);
    expectViolation(() => {
      const rung = getLeague('sunset').postseason.ladder[0] as { status: PlayoffStatus };
      rung.status = 'below-line';
      return () => { rung.status = 'no-postseason'; };
    }, /ladder status below-line not allowed for no-postseason/);
    expectViolation(() => {
      const rung = getLeague('scval').postseason.ladder[3] as { status: PlayoffStatus };
      rung.status = 'selection';
      return () => { rung.status = 'out'; };
    }, /ladder status selection not allowed for ccs-ladder/);
    expectViolation(() => {
      const rung = getLeague('metro').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'no-postseason';
      return () => { rung.status = 'selection'; };
    }, /ladder status no-postseason not allowed for section-playoffs/);
  });

  it('2b. an unbracketed tournament: places 1..qualifiers are tournament, no rung straddles, dates after league play', () => {
    expectViolation(() => {
      const [a, b] = getLeague('eal').postseason.ladder as unknown as Array<{ places: readonly [number, number] }>;
      a.places = [1, 7];
      b.places = [8, 99];
      return () => { a.places = [1, 6]; b.places = [7, 99]; };
    }, /places 1-6 \(and only they\) are 'tournament'/);
    expectViolation(() => {
      const [a, b] = getLeague('eal').postseason.ladder as unknown as Array<{ places: readonly [number, number] }>;
      a.places = [1, 5];
      b.places = [6, 99];
      return () => { a.places = [1, 6]; b.places = [7, 99]; };
    }, /straddles the 6 qualifiers/);
    expectViolation(() => {
      const dates = (getLeague('eal').postseason as { dates: { first: string } }).dates;
      dates.first = '2026-10-28';
      return () => { dates.first = '2026-10-30'; };
    }, /dates\.first is not after leaguePlay\.last/);
    expectViolation(() => {
      const rules = getLeague('eal').rules as { postseasonFrom: string | null };
      rules.postseasonFrom = null;
      return () => { rules.postseasonFrom = '2026-10-30'; };
    }, /postseasonFrom on or before dates\.first/);
    expectViolation(() => {
      const ps = getLeague('eal').postseason as { sourceUrl: string };
      ps.sourceUrl = 'http://www.cifns.org/';
      return () => { ps.sourceUrl = 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf'; };
    }, /sourceUrl must start with https/);
  });

  it('3. the CCS field: keys, per-league berths, 7 + 4 + 2 + 3 === 16', () => {
    expect(Object.keys(CCS.autoQualifiers).sort()).toEqual([...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort());
    for (const l of LEAGUES) {
      if (l.postseason.kind === 'ccs-ladder') {
        expect(l.postseason.autoBerths).toBe(CCS.autoQualifiers[l.id]);
      }
    }
    expect(7 + 4 + 2 + 3).toBe(CCS.autoQualifiers.total);
    expectViolation(() => {
      const ps = getLeague('pcal').postseason as { autoBerths: number };
      ps.autoBerths = 3;
      return () => { ps.autoBerths = 2; };
    }, /autoBerths/);
  });

  it('4. chains: at most one uncomputable stage, last; draw-number last; no play-in; every stage cited', () => {
    for (const l of LEAGUES) {
      for (const [, chain] of chainsOf(l)) {
        const unc = chain.filter((s) => UNCOMPUTABLE.includes(s));
        expect(unc.length).toBeLessThanOrEqual(1);
        if (unc.length) expect(chain.at(-1)).toBe(unc[0]);
        if (chain.includes('draw-number')) expect(chain.at(-1)).toBe('draw-number');
        expect(chain).not.toContain('play-in');
        for (const s of chain) expect(l.rules.citations.stages[s], `${l.id} ${s}`).toBeTruthy();
      }
      if (l.postseason.kind === 'league-tournament') {
        expect(l.rules.citations.stages['play-in']).toBeTruthy();
        expect(l.rules.unresolvedSuffix).toBeTruthy();
      }
    }
    expectViolation(() => {
      const t = getLeague('scval').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['coin-flip', 'head-to-head'];
      return () => { t.default = before; };
    }, /not last/);
    expectViolation(() => {
      const t = getLeague('mcal').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['h2h-win-pct', 'play-in'];
      return () => { t.default = before; };
    }, /play-in/);
    expectViolation(() => {
      const stages = getLeague('bval').rules.citations.stages as Record<string, string>;
      const before = stages['division-goals-against'];
      delete stages['division-goals-against'];
      return () => { stages['division-goals-against'] = before; };
    }, /no citation/);
  });

  it('5. drawNumbers exist exactly when a chain uses draw-number, with distinct values', () => {
    for (const l of LEAGUES) {
      const uses = chainsOf(l).some(([, c]) => c.includes('draw-number'));
      expect(l.rules.drawNumbers !== null, l.id).toBe(uses);
    }
    const draw = getLeague('mcal').rules.drawNumbers!;
    expect(new Set(Object.values(draw)).size).toBe(9);
    expectViolation(() => {
      const rules = getLeague('bval').rules as { drawNumbers: Record<string, number> | null };
      rules.drawNumbers = { branham: 1 };
      return () => { rules.drawNumbers = null; };
    }, /drawNumbers/);
  });

  it('6. pairing seats are divisions of the same league, places ≥ 1', () => {
    for (const l of LEAGUES) {
      if (l.postseason.kind !== 'ccs-ladder') continue;
      for (const p of l.postseason.pairings) {
        for (const seat of p.seats) {
          expect(l.divisions.map((d) => d.id)).toContain(seat.division);
          expect(seat.place).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(getLeague('pcal').postseason.kind === 'ccs-ladder' && getLeague('pcal').postseason).toMatchObject({ pairings: [] });
  });

  it('8. no ignored MaxPreps league is configured', () => {
    for (const id of Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)) {
      expect(ALL_DIVISIONS.map((d) => d.maxprepsLeagueId)).not.toContain(id);
    }
  });

  it('9. games per team, league-play dates, MCAL postseason boundary, dates inside the section window', () => {
    for (const l of LEAGUES) {
      const section = getSection(l.sectionId);
      for (const d of l.divisions) {
        // null only for the Sunset (no fixed schedule) and the independents (no league games); every other
        // division is a double round robin.
        if (d.id === 'sunset' || d.id === 'independents') expect(d.gamesPerTeam).toBeNull();
        else expect(d.gamesPerTeam, d.id).toBe((d.expectedTeams - 1) * 2);
        expect(d.leaguePlay.first <= d.leaguePlay.last).toBe(true);
        for (const date of [d.leaguePlay.first, d.leaguePlay.last]) {
          expect(date >= section.seasonWindow.start && date <= section.seasonWindow.end, `${d.id} ${date}`).toBe(true);
        }
      }
      for (const k of l.keyDates) {
        expect(k.date >= section.seasonWindow.start && k.date <= section.seasonWindow.end, `${l.id} ${k.id}`).toBe(true);
      }
    }
    const mcal = getLeague('mcal');
    expect(mcal.divisions[0].leaguePlay.last < mcal.rules.postseasonFrom!).toBe(true);
    expectViolation(() => {
      const d = getLeague('bval').divisions[0] as { gamesPerTeam: number };
      d.gamesPerTeam = 12;
      return () => { d.gamesPerTeam = 10; };
    }, /gamesPerTeam/);
    expectViolation(() => {
      const lp = getLeague('mcal').divisions[0].leaguePlay as { last: string };
      lp.last = '2026-10-23';
      return () => { lp.last = '2026-10-22'; };
    }, /postseasonFrom/);
  });

  it('10. every bundled official source names its file, revision URL and sha256', () => {
    for (const d of ALL_DIVISIONS) {
      if (d.official.mode !== 'bundled') continue;
      expect(d.official.bundledFile).toMatch(/^data\/official\/.+\.json$/);
      expect(d.official.revisionCheckUrl).toMatch(/^https:\/\//);
      expect(d.official.bundledSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(getDivision('de-anza').official.mode).toBe('live-pdf');
    expectViolation(() => {
      const o = getDivision('pcal').official as { bundledSha256: string | null };
      const before = o.bundledSha256;
      o.bundledSha256 = null;
      return () => { o.bundledSha256 = before; };
    }, /bundled/);
  });

  it("10b. official mode 'none' only on a contest-type, membership or independent league, with a note", () => {
    for (const d of ALL_DIVISIONS) {
      if (d.official.mode !== 'none') continue;
      expect(['contest-type', 'membership'], d.id).toContain(leagueOfDivision(d.id).rules.classification);
      expect(d.official.note.length, d.id).toBeGreaterThan(0);
    }
    expectViolation(() => {
      const d = getDivision('pcal') as { official: unknown };
      const before = d.official;
      d.official = { mode: 'none', note: 'PCAL publishes nothing.' };
      return () => { d.official = before; };
    }, /official mode 'none' on an official-fixtures league/);
    expectViolation(() => {
      const o = getDivision('eal').official as { note: string };
      const before = o.note;
      o.note = ' ';
      return () => { o.note = before; };
    }, /needs a note/);
  });

  it('13. MaxPreps rows: maxprepsTeamCount + maxprepsMissing − maxprepsExtraRows === expectedTeams', () => {
    for (const d of ALL_DIVISIONS) {
      expect(d.maxprepsTeamCount + d.maxprepsMissing.length - Object.keys(d.maxprepsExtraRows).length, d.id).toBe(d.expectedTeams);
    }
    expectViolation(() => {
      const d = getDivision('eal') as { maxprepsTeamCount: number };
      d.maxprepsTeamCount = 6;
      return () => { d.maxprepsTeamCount = 7; };
    }, /maxprepsTeamCount \+ maxprepsMissing − maxprepsExtraRows/);
    expectViolation(() => {
      const d = getDivision('eal') as { maxprepsExtraRows: Record<string, string> };
      const before = d.maxprepsExtraRows;
      d.maxprepsExtraRows = { 'red-bluff': 'not a GUID' };
      return () => { d.maxprepsExtraRows = before; };
    }, /is not a GUID/);
  });

  it('14. rule shapes: no excluded league flag, 1 v 1s only by contest type, a non-empty membership note', () => {
    expectViolation(() => {
      const r = getLeague('eal').rules as { excludeContestTypes: readonly number[] };
      r.excludeContestTypes = [0, 2];
      return () => { r.excludeContestTypes = [2, 4, 5]; };
    }, /excludeContestTypes may not contain 0/);
    expectViolation(() => {
      const r = getLeague('mcal').rules as { leagueOvertime: string };
      r.leagueOvertime = 'shootout';
      return () => { r.leagueOvertime = 'none'; };
    }, /mcal: leagueOvertime 'shootout' exactly when its section ncs has a shootout rule/);
    // With its section's rule in place too, an official-fixtures league still may not decide level games by shootout.
    expectViolation(() => {
      const r = getLeague('mcal').rules as { leagueOvertime: string };
      const s = getSection('ncs') as { shootout: SectionConfig['shootout'] };
      r.leagueOvertime = 'shootout';
      s.shootout = { words: '1 v 1s', citation: 'a rule', inference: 'verified', disagreement: null, coversTournaments: true };
      return () => { r.leagueOvertime = 'none'; s.shootout = null; };
    }, /leagueOvertime 'shootout' needs classification 'contest-type' or 'membership'/);
    expectViolation(() => {
      const l = getLeague('bval') as { membershipNote: string | null };
      l.membershipNote = '';
      return () => { l.membershipNote = null; };
    }, /membershipNote is empty/);
    expectViolation(() => {
      const s = getSection('ns') as { shortName: string };
      s.shortName = 'NCS';
      return () => { s.shortName = 'NS'; };
    }, /duplicate section shortName: NCS/);
  });

  it('11. place-relative stages appear only in byBucketStart chains for 1 and 2', () => {
    for (const l of LEAGUES) {
      for (const [start, chain] of chainsOf(l)) {
        if (start === 1 || start === 2) continue;
        expect(chain).not.toContain('record-vs-higher-placed');
        expect(chain).not.toContain('record-vs-lower-placed');
      }
    }
    expectViolation(() => {
      const t = getLeague('pcal').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['record-vs-lower-placed', 'no-rule'];
      return () => { t.default = before; };
    }, /record-vs-lower-placed/);
  });

  it('12. home mini tables and ladder lines fit the division', () => {
    for (const d of ALL_DIVISIONS) {
      expect(d.home.miniRows).toBeLessThanOrEqual(d.expectedTeams);
      if (d.home.lineAfter !== null) expect(d.home.lineAfter).toBeLessThan(d.home.miniRows);
      if (d.ladderLine !== null) expect(d.ladderLine.after).toBeLessThan(d.expectedTeams);
      else {
        const ps = leagueOfDivision(d.id).postseason;
        expect((ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams) || ps.kind === 'no-postseason', d.id).toBe(true);
      }
    }
    expect(LEAGUES.map((l) => l.postseason.kind)).toEqual([
      'ccs-ladder', 'ccs-ladder', 'ccs-ladder', 'league-tournament', 'unbracketed-tournament',
      'no-postseason', 'section-playoffs', 'section-playoffs', 'section-playoffs', 'no-postseason',
    ]);
    expectViolation(() => {
      const d = getDivision('pcal') as { ladderLine: { after: number; label: string } | null };
      const before = d.ladderLine;
      d.ladderLine = null;
      return () => { d.ladderLine = before; };
    }, /ladderLine may be null only for an unbracketed tournament whose qualifiers >= expectedTeams, or a league with no postseason/);
    expectViolation(() => {
      const d = getDivision('sunset') as { ladderLine: { after: number; label: string } | null };
      d.ladderLine = { after: 1, label: 'Line' };
      return () => { d.ladderLine = null; };
    }, /sunset: a no-postseason league draws no ladder or home line/);
    expectViolation(() => {
      const h = getDivision('santa-teresa').home as { miniRows: number };
      h.miniRows = 7;
      return () => { h.miniRows = 3; };
    }, /miniRows/);
  });
});

describe('leagues: the Sunset (Southern Section)', () => {
  const sunset = getLeague('sunset');
  const division = getDivision('sunset');

  it('is a field hockey grouping of ten, named apart from the all-sports Sunset League', () => {
    expect(sunset).toMatchObject({
      sectionId: 'ss', name: 'Sunset field hockey league', shortName: 'Sunset',
      cities: 'Huntington Beach, Newport Beach, Fountain Valley and Temecula',
      officialUrl: 'https://cifss.org/sports/field-hockey/',
      sblive: { leagueSlugs: ['4249-sunset'], backfill: true },
      withdrawnNames: [],
      membershipNote: 'The Sunset here is a field hockey grouping of eight Southern Section schools in Orange and Riverside counties, not the all-sports Sunset League.',
    });
    expect(isSingleDivision('sunset')).toBe(true);
    expect(divisionHeading('sunset')).toBeNull();
    expect(divisionDisplay('sunset')).toBe('Sunset');
    expect(division.searchAliases).toEqual(['Sunset']);
  });

  it('classifies by MaxPreps’ league flag, with no fixed schedule and a five-row MaxPreps table', () => {
    expect(sunset.rules).toMatchObject({
      classification: 'contest-type', excludeContestTypes: [2, 4], postseasonFrom: null, orderScope: 'site',
      gamesWord: 'league', matcher: 'two-phase', tiebreaks: { default: ['no-rule'] }, leagueOvertime: 'none',
      coChampionsLabel: 'Sunset co-leaders', unresolvedSuffix: '', drawNumbers: null, leagueGameOverrides: [],
    });
    expect(division).toMatchObject({
      expectedTeams: 8, gamesPerTeam: null, leaguePlay: { first: '2026-08-25', last: '2026-10-31' },
      maxprepsLeagueId: 'aa46adc4-c188-4e3b-b5fd-857064176297', maxprepsName: 'Sunset', maxprepsSlug: 'sunset',
      maxprepsTeamCount: 5, reportedTrust: 'informational', ladderLine: null,
      home: { miniRows: 8, lineAfter: null, lineLabel: null },
    });
    expect(division.maxprepsMissing).toEqual(['edison', 'fountain-valley', 'huntington-beach', 'marina', 'newport-harbor']);
    // MaxPreps' Sunset rows for the two independents (DESIGN §24.10): registry teams of another division, skipped.
    expect(Object.keys(division.maxprepsExtraRows).sort()).toEqual([
      '4c2dd7e8-2f3e-43aa-891b-9218932cdf9d', '742a32d0-2dc9-4aa8-ad92-8c4576f73a12',
    ]);
    expect(getTeamById('4c2dd7e8-2f3e-43aa-891b-9218932cdf9d')?.slug).toBe('bonita');
    expect(getTeamById('742a32d0-2dc9-4aa8-ad92-8c4576f73a12')?.slug).toBe('chaminade');
    expect(division.official.mode === 'none' && division.official.note).toBe(
      'No Sunset document exists that we could find: no league site, bylaws, schedule or standings. The eight teams here are eight of the ten in MaxPreps’ Sunset table in 2024-25 and 2025-26; the other two, Bonita and Chaminade, are listed with the Southern Section independents (that group’s note says why). For 2026-27, MaxPreps’ table lists three of the eight, with Bonita and Chaminade, and assigns the five Orange County schools to no league; si.com’s table (also shown on the Southern Section’s scores site) lists six of the eight, with Bonita, Chaminade, and Westlake and Los Alamitos with no games, and puts Chaparral and Temecula Valley in a separate table. A Sunset game here is a game between two of the eight that MaxPreps marks as a league game, so teams play different numbers.',
    );
    expect(division.knownCause).toBe(
      'MaxPreps’ Sunset table lists three of the eight teams, with Bonita and Chaminade, and orders them by winning percentage. This site orders all eight by 3-1-0 points and lists Bonita and Chaminade with the Southern Section independents, so Great Oak’s Aug 27 win over Bonita, which MaxPreps marks as a league game, is not counted here. si.com marks more games as league games than MaxPreps does, so its Sunset records differ from ours.',
    );
  });

  it('cites no league rule: the 3-1-0 order is this site’s, and the overtime citation names the Oct 2 overtime game', () => {
    expect(sunset.rules.citations).toEqual({
      points: 'this site’s 3-1-0 points (the league publishes no points rule)',
      pointsShort: 'site 3-1-0',
      order: 'no league document orders the table; this site orders it by its own 3-1-0 points',
      doubleRoundRobin: 'no league schedule is published and there is no round robin: a Sunset game is a game between two of the eight that MaxPreps marks as a league game',
      overtime: 'No league or Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules). A game between Sunset teams has ended level (Fountain Valley 1-1 Marina, Sep 11; MaxPreps does not mark it as a league game), and a Sunset league game has been decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2), so this site records each game as it is reported',
      coChampions: 'no published rule names a champion; teams level on points at the top are shown level',
      stages: { 'no-rule': 'No Sunset document exists that we could find, so no rule breaks this tie and it is left as it is' },
    });
  });

  it('has no postseason: one rung for every place, a note, the Blue Book as its source', () => {
    if (sunset.postseason.kind !== 'no-postseason') throw new Error('sunset has no postseason');
    expect(sunset.postseason.ladder.map((r) => [r.divisions, r.places, r.status, r.label, r.phrase, r.badge, r.legend])).toEqual([
      ['*', [1, 99], 'no-postseason', 'No section playoffs', 'no postseason', 'No playoffs',
        'The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)'],
    ]);
    expect(sunset.postseason.note).toBe(
      'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaws 2011.1 and 3500.2), and CIF holds no regional or state championship, so a Sunset team’s season ends with its last game, Oct 31 at the latest.',
    );
    expect(sunset.postseason.citations.noPlayoffs).toMatch(/^CIF-SS Blue Book 2026-27, Bylaw 2011\.1 .* and Bylaw 3500\.2 /);
    expect([sunset.postseason.sourceLabel, sunset.postseason.sourceUrl]).toEqual([
      'CIF-SS Blue Book 2026-27', 'https://cifss.org/wp-content/uploads/2026/07/Field-Hockey-2026-27-Blue-Book.pdf',
    ]);
    expect(sunset.phases).toEqual([{ phase: 'regular', through: 'league-play' }]);
    expect(sunset.keyDates).toEqual([{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }]);
  });
});

describe('leagues: the San Diego Section (City, North County, Metro)', () => {
  const sds = ['city', 'north-county', 'metro'].map(getLeague);

  it('aligns the 40 teams in seven divisions from the CIF-SDS League Alignment', () => {
    expect(sds.map((l) => [l.id, l.name, l.shortName, l.divisions.map((d) => [d.id, d.label, d.expectedTeams, d.gamesPerTeam])])).toEqual([
      ['city', 'City Conference', 'City', [['city-western', 'City Western', 6, 10], ['city-eastern', 'City Eastern', 6, 10]]],
      ['north-county', 'North County Conference', 'North', [
        ['avocado', 'Avocado', 6, 10], ['palomar', 'Palomar', 7, 12], ['valley', 'Valley', 6, 10],
      ]],
      ['metro', 'Metro Conference', 'Metro', [['metro-mesa', 'Metro Mesa', 5, 8], ['metro-south-bay', 'Metro South Bay', 4, 6]]],
    ]);
    expect(sds.flatMap((l) => l.divisions).reduce((n, d) => n + d.expectedTeams, 0)).toBe(40);
    expect(divisionDisplay('metro-south-bay')).toBe('Metro · Metro South Bay');
    expect(sds.map((l) => l.sblive.leagueSlugs)).toEqual([
      ['4179-city-western', '4178-city-eastern'],
      ['4170-avocado-east', '4171-avocado-west', '4234-palomar'],
      ['4214-metro-mesa', '4199-grossmont'],
    ]);
    expect(sds.map((l) => l.withdrawnNames[0] ?? null)).toEqual(['Madison', null, 'Santana']);
    for (const l of sds) {
      expect(l.sectionId).toBe('sds');
      expect(l.officialUrl).toBe('https://www.cifsds.org/sports/fh/index');
      expect(l.membershipNote).toBeNull();
    }
  });

  it('starts each division’s league play at its first game between two members and ends it Oct 30', () => {
    expect(sds.flatMap((l) => l.divisions.map((d) => [d.id, d.leaguePlay.first, d.leaguePlay.last]))).toEqual([
      ['city-western', '2026-09-01', '2026-10-30'], ['city-eastern', '2026-09-15', '2026-10-30'],
      ['avocado', '2026-09-28', '2026-10-30'], ['palomar', '2026-09-09', '2026-10-30'], ['valley', '2026-09-28', '2026-10-30'],
      ['metro-mesa', '2026-09-28', '2026-10-30'], ['metro-south-bay', '2026-10-07', '2026-10-30'],
    ]);
  });

  it('counts every game between two members (membership), with MaxPreps’ tables reconciled division by division', () => {
    for (const l of sds) {
      expect(l.rules).toMatchObject({
        classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2026-11-02', orderScope: 'site',
        gamesWord: 'division', tiebreaks: { default: ['no-rule'] }, leagueOvertime: 'shootout', unresolvedSuffix: '',
      });
      // North County keeps its full words: 'North co-leaders' would read as a direction.
      expect(l.rules.coChampionsLabel).toBe(`${l.id === 'north-county' ? 'North County' : l.shortName} co-leaders`);
      for (const d of l.divisions) {
        expect(d.official).toEqual({
          mode: 'none',
          note: 'We found no schedule or standings published by a San Diego Section league. Members come from the Section’s 2026-27 League Alignment, and this site counts every game between two members of the division as a league game whether or not MaxPreps marks it as one.',
        });
        expect(d.reportedTrust, d.id).toBe('informational');
        expect(d.home, d.id).toEqual({ miniRows: d.expectedTeams, lineAfter: null, lineLabel: null });
        expect(d.ladderLine, d.id).toEqual({ after: 1, label: 'Champion line' });
      }
    }
    expect(ALL_DIVISIONS.filter((d) => getLeague(d.leagueId).sectionId === 'sds').map((d) => [
      d.id, d.maxprepsLeagueId, d.maxprepsName, d.maxprepsSlug, d.maxprepsTeamCount, d.maxprepsMissing, Object.keys(d.maxprepsExtraRows),
    ])).toEqual([
      ['city-western', '35dc98fe-887a-475b-992c-0edfe7fc4c58', 'City - Western', 'city--western', 6, [], []],
      ['city-eastern', '6f9a29a0-78af-4d30-a087-cfa9feb91b89', 'City - Eastern', 'city--eastern', 6, ['patrick-henry'], ['fef1da70-bea2-4958-a60b-9962851f6a1d']],
      ['avocado', '75ed156b-09c9-4a0c-ac58-11a371443815', 'Avocado', 'avocado', 4, ['mt-carmel', 'rancho-bernardo'], []],
      ['palomar', 'e4a7e9c3-986b-446f-8547-8348be95e282', 'Palomar', 'palomar', 7, [], []],
      ['valley', null, null, null, 0, ['escondido', 'mission-hills', 'sage-creek', 'san-pasqual', 'vista', 'westview'], []],
      ['metro-mesa', '6dfe5a12-b82f-45d7-b103-71a5c13c0093', 'Metro- South Bay', 'metro-south-bay', 5, [], []],
      ['metro-south-bay', 'ca8e2856-b13d-4aa7-8c15-37cb50a55c60', 'Grossmont', 'grossmont', 3, ['hilltop', 'southwest'], ['1125d6e8-e661-4190-a41d-5722364dee38']],
    ]);
    expect(getDivision('valley').knownCause).toBeNull();
    expect(getDivision('metro-mesa').knownCause).toBe(
      'MaxPreps files these five teams under ‘Metro- South Bay’. On Oct 5 MaxPreps listed Bonita Vista and Helix meeting once (Oct 23), so unless a second meeting is added each ends a game short of the eight.',
    );
    expect(getDivision('city-eastern').knownCause).toBe(
      'MaxPreps’ table leaves out Patrick Henry and lists Madison, which has no varsity game; MaxPreps marks none of Patrick Henry’s league games as league games. MaxPreps also counts the City Eastern teams’ games against Mission Bay as league games; the alignment puts Mission Bay in City Western, so they count in neither table here.',
    );
    expect(getDivision('city-western').knownCause).toMatch(/Mission Bay’s five games against City Eastern teams/);
    expect(getDivision('palomar').knownCause).toMatch(/also lists Rancho Buena Vista under Valley/);
  });

  it('cites the officials’ association’s overtime procedures and paraphrases the Green Book where its words are banned', () => {
    for (const l of sds) {
      expect(l.rules.citations.overtime).toBe(
        'San Diego Field Hockey Officials Association 2026 procedures: a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal, so a league, non-league or playoff varsity game does not end level (the procedures do not cover invitational tournaments, and several tournament games this season have ended level). MaxPreps records such a game as a level score marked W and L with no tally, and this site counts it as the flagged team’s win',
      );
      expect(l.rules.citations.doubleRoundRobin).toBe(
        'members play each other home and away (MaxPreps schedules and the CIF-SDS 2026-27 League Alignment; on Oct 5 one Metro Mesa pair, Bonita Vista and Helix, was listed once); the league publishes no schedule',
      );
      expect(l.rules.citations.points).toBe('this site’s 3-1-0 points (the league publishes no points rule)');
      expect(l.rules.citations.coChampions).toMatch(/^the league designates its champion/);
    }
  });

  it('plays the Section playoffs: 1st has at least a play-in as designated champion, everyone else is by selection', () => {
    for (const l of sds) {
      const ps = l.postseason;
      if (ps.kind !== 'section-playoffs') throw new Error(`${l.id} plays the section playoffs`);
      expect(ps).toMatchObject({
        name: 'San Diego Section playoffs', dates: { first: '2026-11-02', last: '2026-11-14' },
        qualificationLine: 'San Diego Section playoffs, Nov 2–14 (finals Nov 14 at La Jolla HS): Open 8, Division I 12, Division II 12, placed by the Section from its power rankings; a designated league champion gets at least a play-in.',
        divisions: [{ name: 'Open', teams: 8 }, { name: 'Division I', teams: 12 }, { name: 'Division II', teams: 12 }],
        sourceLabel: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1',
        sourceUrl: 'https://docs.google.com/document/d/1JE9fAJPGJSnCi0r398lSJZknG54O3gZ3vSc24gPOr90/edit',
        powerRankingsUrl: 'https://www.cifsds.org/school-resources/CIFSDS_Power_Rankings',
      });
      expect(ps.ladder.map((r) => [r.places, r.status, r.label, r.phrase, r.badge, r.legend])).toEqual([
        [[1, 1], 'tournament', '1st: at least a play-in if named league champion', 'at least a play-in if named league champion', '1st',
          '1st — the league’s designated champion (not co-champions) is guaranteed at least a play-in game (Green Book 2000.1). The league names its champion; this table does not'],
        [[2, 99], 'selection', 'No league route', 'no league route into the playoffs', 'Selection only',
          '2nd or lower — no league route; the Section places Division I teams in the Open or Division I bracket and picks 12 Division II teams, from its power rankings (Green Book 2000.1)'],
      ]);
      expect(ps.citations.roundDates).toBe(
        'Round dates and the finals site (La Jolla HS) are from the San Diego Field Hockey Officials Association’s calendar; the Section’s own bulletin is not reachable.',
      );
      expect(Object.keys(ps.playoffDivisionOf)).toHaveLength(l.divisions.reduce((n, d) => n + d.expectedTeams, 0));
      expect(l.phases).toEqual([{ phase: 'regular', through: 'league-play' }, { phase: 'tournament', through: '2026-11-14' }]);
      expect(l.keyDates.map((k) => [k.id, k.date])).toEqual([
        ['league-play-ends', '2026-10-30'], ['seeding-meeting', '2026-10-31'], ['play-in', '2026-11-02'], ['finals', '2026-11-14'],
      ]);
    }
  });

  it('records each team’s 2026 playoff division: 20 in Division I, 20 in Division II (the Divisions sheet)', () => {
    const all = Object.assign({}, ...sds.map((l) => (l.postseason as { playoffDivisionOf: Record<string, 'I' | 'II'> }).playoffDivisionOf)) as Record<string, 'I' | 'II'>;
    expect(Object.keys(all)).toHaveLength(40);
    expect(Object.keys(all).filter((k) => all[k] === 'I').sort()).toEqual([
      'bishops', 'canyon-crest-academy', 'canyon-hills', 'cathedral-catholic', 'clairemont', 'del-norte', 'eastlake', 'fallbrook',
      'la-costa-canyon', 'la-jolla', 'la-jolla-country-day', 'mission-bay', 'mt-carmel', 'poway', 'rancho-bernardo',
      'san-dieguito-academy', 'san-marcos', 'scripps-ranch', 'torrey-pines', 'university-city',
    ]);
    // Every Valley and Metro South Bay team is Division II; every maxprepsMissing slug has a division.
    for (const d of ['valley', 'metro-south-bay']) {
      for (const slug of getDivision(d).maxprepsMissing) expect(all[slug], slug).toBe('II');
    }
  });

  it('excludes the two stray Palomar rows', () => {
    // c7dbdbcc has Poway at home, as in the Sep 15 meeting, while Fallbrook hosts Oct 13: the note ties it to neither.
    expect(DATA_QUALITY.excludedContestIds['c7dbdbcc-5f41-4192-b8b2-eb79cca2523a']).toBe(
      'Poway vs Fallbrook, Oct 9 with no time: a third MaxPreps row for the pair, which already has both of its Palomar meetings on the schedule (Sep 15, 67865f1e; Oct 13, 0b3cfb7d)',
    );
    expect(DATA_QUALITY.excludedContestIds['9c027452-e21e-4e47-9eac-d2e800bfb42c']).toMatch(/^Mission Vista vs Fallbrook, Oct 30 .*Oct 29 \(5067646d\)/);
  });
});

describe('leagues: not covered (search)', () => {
  const reasonOf = (name: string): string | undefined => DATA_QUALITY.notCovered.find((n) => n.name === name)?.reason;

  it('explains each school with games but no league, and each school with none, in whole sentences', () => {
    // Glendora, Harvard-Westlake and Thousand Oaks are covered now (the 'independents' group), so search
    // finds their pages and no longer prints a not-covered sentence for them.
    expect(DATA_QUALITY.notCovered.map((n) => n.name)).toEqual([
      'York', 'Wilcox', 'Red Bluff',
      'Madison', 'Santana', 'Castle Park', 'Chula Vista', 'Montgomery', 'Sweetwater',
      'River Valley', 'North Salinas', 'Notre Dame (Salinas)', 'Mayfair',
    ]);
    expect(reasonOf('River Valley')).toBe('River Valley (Yuba City, Sac-Joaquin Section) has no 2026 varsity game on MaxPreps, so it has no page here.');
    for (const school of ['North Salinas', 'Notre Dame (Salinas)']) {
      expect(reasonOf(school)).toBe(`${school} has no 2026 varsity game on MaxPreps, so it has no page here.`);
    }
    for (const school of ['Madison', 'Santana', 'Castle Park', 'Chula Vista', 'Montgomery', 'Sweetwater']) {
      expect(reasonOf(school)).toBe(`${school} has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.`);
    }
    expect(reasonOf('Mayfair')).toBe('Mayfair has no 2026 varsity game on MaxPreps and is not on the Southern Section’s list of participating schools.');
    for (const n of DATA_QUALITY.notCovered) {
      expect(n.reason, n.name).toMatch(/^[A-Z].*\.$/);
      expect(n.keys.length, n.name).toBeGreaterThan(0);
    }
  });

  it('never calls a school with no games inactive, withdrawn, dropped or cancelled', () => {
    const strings = [
      ...DATA_QUALITY.notCovered.map((n) => n.reason), ...Object.values(DATA_QUALITY.excludedContestIds),
      ...ALL_DIVISIONS.flatMap((d) => Object.values(d.maxprepsExtraRows)), ...socal().flatMap(renderedStrings),
    ];
    for (const s of strings) expect(s, s).not.toMatch(/\b(inactive|withdr\w*|dropped|cancel\w*|no (field hockey )?program)\b/i);
  });
});

describe('leagues: SoCal copy is honest (DESIGN-socal §2.4 copy rules)', () => {
  const strings = socal().flatMap((l) => renderedStrings(l).map((text) => [l.id, text] as const)).filter(([, t]) => t);

  it('never says "at-large" or "automatic qualifier" (non-CCS pages), nor "eliminated"', () => {
    for (const [id, t] of strings) expect(t, `${id}: ${t}`).not.toMatch(/automatic qualifier|at-large|eliminat/i);
  });

  it('never prints a seed word, so never the Green Book’s play-in sentence', () => {
    for (const [id, t] of strings) {
      expect(SEED_CLAIM.test(t), `${id}: ${t}`).toBe(false);
      expect(t, `${id}: ${t}`).not.toMatch(/lowest-seeded/i);
    }
  });

  it('says "Sunset League" only beside "all-sports", and never "Sunset school(s)/member(s)"', () => {
    for (const [id, t] of strings) {
      for (const sentence of t.split(/(?<=[.;])\s+/)) {
        if (/\bSunset League\b/.test(sentence)) expect(sentence, `${id}: ${sentence}`).toMatch(/all-sports/);
      }
      expect(t, `${id}: ${t}`).not.toMatch(/\bSunset (school|member)s?\b/);
    }
  });

  it('never says a league’s own rules order a table it publishes no rules for, and never calls an umpires’ source official', () => {
    for (const [id, t] of strings) {
      expect(t, `${id}: ${t}`).not.toMatch(/rules require/i);
      expect(umpireOfficialClaims(t), `${id}: ${t}`).toEqual([]);
    }
  });
});

describe('leagues: SoCal invariants (DESIGN-socal §2.1.7)', () => {
  it('reserves the region ids: no section, league or division may take one', () => {
    expectViolation(() => {
      const d = getDivision('valley') as { id: string };
      d.id = 'socal';
      return () => { d.id = 'valley'; };
    }, /socal: a section, league or division id may not be a region id/);
    expectViolation(() => {
      const s = getSection('ss') as { region: string };
      s.region = 'midcal';
      return () => { s.region = 'socal'; };
    }, /ss: unknown region midcal/);
    expectViolation(() => {
      const [ss, sds] = [getSection('ss'), getSection('sds')] as Array<{ region: string }>;
      ss.region = 'norcal';
      sds.region = 'norcal';
      return () => { ss.region = 'socal'; sds.region = 'socal'; };
    }, /region socal has no section/);
  });

  it('every section names its rules on https, and a shootout rule has its words', () => {
    expectViolation(() => {
      const r = getSection('ss').rulesSource as { url: string };
      const before = r.url;
      r.url = 'http://cifss.org/';
      return () => { r.url = before; };
    }, /ss: rulesSource\.url must start with https/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { words: ' ', citation: 'x', inference: 'unverified', disagreement: 'x', coversTournaments: false };
      return () => { s.shootout = before; };
    }, /sds: shootout needs words and a citation/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { words: 'a shootout', citation: 'x', inference: 'maybe' as 'verified', disagreement: null, coversTournaments: false };
      return () => { s.shootout = before; };
    }, /sds: shootout\.inference must be one of verified, unverified/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { ...before!, disagreement: null };
      return () => { s.shootout = before; };
    }, /sds: shootout\.disagreement is set exactly when the inference is 'unverified'/);
  });

  it('a date correction names a contest GUID, a real date in a season window, and a source', () => {
    const overrides = DATA_QUALITY.contestDateOverrides as Record<string, { dateKey: string; timeTba: true; source: string }>;
    const id = 'fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0';
    const set = (key: string, value: { dateKey: string; timeTba: true; source: string }) => () => {
      const before = overrides[key];
      overrides[key] = value;
      return () => { if (before) overrides[key] = before; else delete overrides[key]; };
    };
    const ok = overrides[id];
    expectViolation(set('fc8be1f8', ok), /contestDateOverrides: fc8be1f8 is not a contest GUID/);
    expectViolation(set(id, { ...ok, dateKey: '2026-09-31' }), /dateKey 2026-09-31 is not a valid YYYY-MM-DD date/);
    expectViolation(set(id, { ...ok, dateKey: '2027-03-01' }), /2027-03-01 is outside every section's season window/);
    expectViolation(set(id, { ...ok, source: ' ' }), /contestDateOverrides fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0: needs a source/);
    expectViolation(set('c7dbdbcc-5f41-4192-b8b2-eb79cca2523a', ok), /c7dbdbcc-5f41-4192-b8b2-eb79cca2523a: the contest is excluded/);
  });

  it('a section’s shootout rule and its leagues’ leagueOvertime agree both ways', () => {
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = null;
      return () => { s.shootout = before; };
    }, /city: leagueOvertime 'shootout' exactly when its section sds has a shootout rule/);
    expectViolation(() => {
      const r = getLeague('metro').rules as { leagueOvertime: string };
      r.leagueOvertime = 'none';
      return () => { r.leagueOvertime = 'shootout'; };
    }, /metro: leagueOvertime 'shootout' exactly when its section sds has a shootout rule/);
  });

  it('a missing MaxPreps table names nothing and has no rows; a present one is a GUID with a name and slug', () => {
    expectViolation(() => {
      const d = getDivision('valley') as { maxprepsSlug: string | null };
      d.maxprepsSlug = 'valley';
      return () => { d.maxprepsSlug = null; };
    }, /valley: maxprepsLeagueId null needs maxprepsName and maxprepsSlug null/);
    expectViolation(() => {
      const d = getDivision('valley') as { maxprepsTeamCount: number; maxprepsMissing: readonly string[] };
      const before = d.maxprepsMissing;
      d.maxprepsTeamCount = 1;
      d.maxprepsMissing = before.slice(1);
      return () => { d.maxprepsTeamCount = 0; d.maxprepsMissing = before; };
    }, /valley: maxprepsLeagueId null needs maxprepsTeamCount 0/);
    expectViolation(() => {
      const d = getDivision('palomar') as { maxprepsName: string | null };
      d.maxprepsName = null;
      return () => { d.maxprepsName = 'Palomar'; };
    }, /palomar: a MaxPreps table needs maxprepsName and maxprepsSlug/);
    expectViolation(() => {
      const d = getDivision('palomar') as { maxprepsLeagueId: string | null };
      d.maxprepsLeagueId = 'palomar';
      return () => { d.maxprepsLeagueId = 'e4a7e9c3-986b-446f-8547-8348be95e282'; };
    }, /palomar: maxprepsLeagueId palomar is not a GUID/);
  });

  it('gamesPerTeam null only on a contest-type or membership league with no official schedule', () => {
    expectViolation(() => {
      const d = getDivision('de-anza') as { gamesPerTeam: number | null };
      d.gamesPerTeam = null;
      return () => { d.gamesPerTeam = 12; };
    }, /de-anza: gamesPerTeam null needs/);
  });

  it("'membership' only with official mode 'none'; 'none' never on an official-fixtures league", () => {
    expectViolation(() => {
      const d = getDivision('avocado') as { official: unknown };
      const before = d.official;
      d.official = {
        mode: 'bundled', source: 'pcal-pdf', scheduleUrl: 'https://example.org/a.pdf', bundledFile: 'data/official/x.json',
        revisionCheckUrl: 'https://example.org/a.pdf', bundledSha256: 'a'.repeat(64), revisedOn: null,
      };
      return () => { d.official = before; };
    }, /avocado: classification 'membership' needs official mode 'none'/);
  });

  it('no postseason: a note, a source, no postseasonFrom', () => {
    expectViolation(() => {
      const ps = getLeague('sunset').postseason as { note: string };
      const before = ps.note;
      ps.note = '';
      return () => { ps.note = before; };
    }, /sunset: a no-postseason league needs a note/);
    expectViolation(() => {
      const r = getLeague('sunset').rules as { postseasonFrom: string | null };
      r.postseasonFrom = '2026-11-01';
      return () => { r.postseasonFrom = null; };
    }, /sunset: a no-postseason league has no postseasonFrom/);
    expectViolation(() => {
      const ps = getLeague('sunset').postseason as { sourceUrl: string };
      const before = ps.sourceUrl;
      ps.sourceUrl = 'http://cifss.org/';
      return () => { ps.sourceUrl = before; };
    }, /sunset: postseason sourceUrl must start with https/);
  });

  it('section playoffs: only 1st is a league route, the dates follow league play, every member has a playoff division', () => {
    expectViolation(() => {
      const rung = getLeague('city').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'tournament';
      return () => { rung.status = 'selection'; };
    }, /city: ladder rung \[2, 99\] is tournament, but only place 1 \(and only it\) is 'tournament'/);
    expectViolation(() => {
      const dates = (getLeague('north-county').postseason as { dates: { first: string } }).dates;
      dates.first = '2026-10-30';
      return () => { dates.first = '2026-11-02'; };
    }, /avocado: postseason dates\.first is not after leaguePlay\.last/);
    expectViolation(() => {
      const r = getLeague('metro').rules as { postseasonFrom: string | null };
      r.postseasonFrom = null;
      return () => { r.postseasonFrom = '2026-11-02'; };
    }, /metro: section playoffs need postseasonFrom on or before dates\.first/);
    expectViolation(() => {
      const ps = getLeague('metro').postseason as { playoffDivisionOf: Record<string, string> };
      const before = ps.playoffDivisionOf;
      ps.playoffDivisionOf = Object.fromEntries(Object.entries(before).filter(([slug]) => slug !== 'southwest'));
      return () => { ps.playoffDivisionOf = before; };
    }, /metro: 8 playoff divisions for 9 teams/);
    expectViolation(() => {
      const ps = getLeague('metro').postseason as { playoffDivisionOf: Record<string, string> };
      const before = ps.playoffDivisionOf;
      ps.playoffDivisionOf = { ...before, hilltop: 'III' };
      return () => { ps.playoffDivisionOf = before; };
    }, /metro: playoffDivisionOf hilltop is III, not I or II/);
    expectViolation(() => {
      const ps = getLeague('city').postseason as { powerRankingsUrl: string };
      const before = ps.powerRankingsUrl;
      ps.powerRankingsUrl = 'cifsds.org';
      return () => { ps.powerRankingsUrl = before; };
    }, /city: postseason sourceUrl and powerRankingsUrl must start with https/);
  });

  it("the CCS ladder stays inside the CCS", () => {
    expectViolation(() => {
      const l = getLeague('scval') as { sectionId: string };
      l.sectionId = 'ncs';
      return () => { l.sectionId = 'ccs'; };
    }, /scval: a CCS ladder league outside the CCS/);
  });
});

describe('leagues: the Southern Section independents (DESIGN §24.9, §24.10)', () => {
  const group = getLeague('independents');
  const division = getDivision('independents');

  it('is a group of five with a table of its members’ games: membership, no MaxPreps table, no postseason', () => {
    expect([group.sectionId, group.name, group.shortName, group.cities, group.independents]).toEqual([
      'ss', 'Southern Section independents', 'Independent', 'Glendora, La Verne, Studio City, Thousand Oaks and West Hills', true,
    ]);
    expect(group.sblive.leagueSlugs).toEqual(['4235-palomares', '4207-league-b', '4213-marmonte']);
    expect(group.rules).toMatchObject({
      classification: 'membership', orderScope: 'site', gamesWord: 'league', excludeContestTypes: [2, 4],
      postseasonFrom: null, leagueOvertime: 'none', tiebreaks: { default: ['no-rule'] },
    });
    expect(division).toMatchObject({
      label: 'Independents', searchAliases: ['Independents', 'independent'], expectedTeams: 5, gamesPerTeam: null,
      maxprepsLeagueId: null, maxprepsName: null, maxprepsSlug: null, maxprepsTeamCount: 0,
      maxprepsMissing: ['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks'], reportedTrust: 'informational',
      knownCause: null, ladderLine: null, home: { miniRows: 5, lineAfter: null, lineLabel: null },
    });
    // The first games between two of the five (Sep 8) to the Section's last allowable contest.
    expect(division.leaguePlay).toEqual({ first: '2026-09-08', last: '2026-10-31' });
    expect(division.official).toEqual({
      mode: 'none',
      note: 'No league gathers these five schools. Glendora, Harvard-Westlake and Thousand Oaks are the only field hockey teams in their all-sports leagues on MaxPreps (the Palomares League, League B and the Marmonte League). MaxPreps and si.com list Bonita and Chaminade in the Sunset, but MaxPreps marks none of their games against the five Orange County Sunset teams as a league game, and each plays every other independent home and away, so this site lists them here. The table counts every game between two of the five, whether or not MaxPreps marks it as a league game (it marks only Bonita’s two games with Chaminade), and orders them by this site’s 3-1-0 points.',
    });
    expect(group.membershipNote).toBe(
      'The independents are five Southern Section schools in no field hockey league. The table counts their games against each other.',
    );
    expect(group.postseason.kind).toBe('no-postseason');
    expect(group.keyDates).toEqual([{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }]);
    expect(leagueStandingsUrl('independents')).toBeNull();
    expect(isIndependentLeague('independents')).toBe(true);
    expect(LEAGUES_PROPER.map((l) => l.id)).not.toContain('independents');
    expect(INDEPENDENT_LEAGUES.map((l) => l.id)).toEqual(['independents']);
    expect(standingsLabel('independents')).toBe('Independents standings');
    expect(standingsLabel('sunset')).toBe('Sunset standings');
  });

  it('says only what is true of a group in no league: no citation claims a league rule', () => {
    const c = group.rules.citations;
    for (const text of [c.points, c.order, c.doubleRoundRobin, c.coChampions, c.stages['no-rule'] ?? '']) {
      expect(text, text).toMatch(/no league( exists| schedule| names| to publish)/i);
    }
    expect(c.overtime).toBe('No Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules), so this site records each game as it is reported');
  });

  it("a group of independents needs membership, official mode 'none', no MaxPreps table, no postseason, no line and no cause", () => {
    const d = division as unknown as Record<string, unknown>;
    const cases: Array<[string, unknown, RegExp]> = [
      ['maxprepsLeagueId', '37e34960-1d6f-4028-a4f8-4fba3e99f9be', /independents: a group of independents needs maxprepsLeagueId null/],
      ['gamesPerTeam', 4, /independents: gamesPerTeam 4/],
      ['reportedTrust', 'records-only', /independents: a group of independents needs reportedTrust 'informational'/],
      ['knownCause', 'A cause.', /independents: a group of independents needs knownCause null/],
    ];
    for (const [key, value, message] of cases) {
      expectViolation(() => {
        const before = d[key];
        d[key] = value;
        if (key === 'maxprepsLeagueId') {
          d.maxprepsName = 'Palomares';
          d.maxprepsSlug = 'palomares';
        }
        return () => {
          d[key] = before;
          if (key === 'maxprepsLeagueId') {
            d.maxprepsName = null;
            d.maxprepsSlug = null;
          }
        };
      }, message);
    }
    expectViolation(() => {
      const r = group.rules as { classification: string };
      r.classification = 'contest-type';
      return () => { r.classification = 'membership'; };
    }, /independents: a group of independents needs classification 'membership'/);
  });
});
