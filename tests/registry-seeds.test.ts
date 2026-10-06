/**
 * lib/registry/* is a transcription of the five verified registry seeds in tests/fixtures/seeds/
 * (CCS, NCS, the Northern Section's EAL, and for Southern California the Southern Section's Sunset and
 * its five independents, and the San Diego Section's City, North County and Metro conferences). The
 * SS seed file holds the Sunset eight and then the five independents; TEAMS (LEAGUES order) puts the
 * independents last, after the San Diego Section's 40. Every transcribed field
 * must equal the seed JSON (SPEC §3.1), except the documented differences:
 *   - `section` is derived from the league (ccs for scval/bval/pcal, ncs for mcal, ns for eal, ss for
 *     sunset and independents, sds for city/north-county/metro);
 *   - `sbliveSchoolId` for ten CCS schools comes from SPEC §3.2 (observed on si.com logo URLs),
 *     because the CCS seed predates that field;
 *   - the seed's `officialCodes` live in LeagueConfig.officialCodes, never on a team;
 *   - the seed's `verified` / `notes` provenance blocks are not copied.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getLeague } from '../lib/leagues';
import { BVAL_SEEDS } from '../lib/registry/bval';
import { CITY_SEEDS } from '../lib/registry/city';
import { EAL_SEEDS } from '../lib/registry/eal';
import { INDEPENDENTS_SEEDS } from '../lib/registry/independents';
import { MCAL_SEEDS } from '../lib/registry/mcal';
import { METRO_SEEDS } from '../lib/registry/metro';
import { NORTH_COUNTY_SEEDS } from '../lib/registry/north-county';
import { PCAL_SEEDS } from '../lib/registry/pcal';
import { SCVAL_SEEDS } from '../lib/registry/scval';
import type { Seed } from '../lib/registry/seed';
import { SUNSET_SEEDS } from '../lib/registry/sunset';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

interface JsonSeed {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  abbr: string;
  acronym: string;
  mascot: string;
  city: string;
  section?: string;
  league: string;
  division: string;
  dataCoverage: string;
  colors: [string, string];
  colorSource: string;
  maxprepsPath: string | null;
  aliases: string[];
  sbliveTeamId?: string;
  sbliveSlug?: string;
  sbliveSchoolId?: string;
  vnnSiteId?: string;
  officialCodes?: string[];
}

const readSeed = (file: string): JsonSeed[] =>
  (JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'seeds', file), 'utf8')) as { teams: JsonSeed[] }).teams;

const CCS_JSON = readSeed('registry-seed.json');
const NCS_JSON = readSeed('registry-seed-ncs.json');
const NSS_JSON = readSeed('registry-seed-ns.json');
const SS_JSON = readSeed('registry-seed-ss.json');
const SDS_JSON = readSeed('registry-seed-sds.json');
const ALL_JSON = [...CCS_JSON, ...NCS_JSON, ...NSS_JSON, ...SS_JSON, ...SDS_JSON];
/** The registry's order: LEAGUES order, so the SS file's five independents follow the San Diego Section's 40. */
const REGISTRY_JSON = [
  ...CCS_JSON, ...NCS_JSON, ...NSS_JSON, ...SS_JSON.filter((s) => s.league !== 'independents'), ...SDS_JSON,
  ...SS_JSON.filter((s) => s.league === 'independents'),
];

/** SPEC §3.2: si.com school ids for CCS schools, not in the CCS seed. */
const CCS_SCHOOL_IDS: Readonly<Record<string, string>> = {
  'los-altos': '12174',
  'valley-christian': '319',
  fremont: '11003',
  cupertino: '11002',
  homestead: '11004',
  'santa-clara': '13089',
  carmel: '10223',
  greenfield: '11486',
  hollister: '12876',
  salinas: '12870',
};

const SOCAL_SEEDS: readonly Seed[] = [...SUNSET_SEEDS, ...CITY_SEEDS, ...NORTH_COUNTY_SEEDS, ...METRO_SEEDS, ...INDEPENDENTS_SEEDS];
const SEEDS: readonly Seed[] = [...SCVAL_SEEDS, ...BVAL_SEEDS, ...PCAL_SEEDS, ...MCAL_SEEDS, ...EAL_SEEDS, ...SOCAL_SEEDS];

const COPIED = [
  'id', 'slug', 'name', 'shortName', 'abbr', 'acronym', 'mascot', 'city', 'league', 'division',
  'dataCoverage', 'colors', 'colorSource', 'maxprepsPath', 'aliases', 'sbliveTeamId', 'sbliveSlug',
  'vnnSiteId',
] as const;

describe('registry seeds: lib/registry/* equals tests/fixtures/seeds/*.json', () => {
  it('has the same 102 teams in the same order (SCVAL, BVAL, PCAL from the CCS seed; MCAL from the NCS seed; EAL from the NS seed; Sunset and the independents from the SS seed; City, North County, Metro from the SDS seed)', () => {
    expect(CCS_JSON).toHaveLength(34);
    expect(NCS_JSON).toHaveLength(9);
    expect(NSS_JSON).toHaveLength(6);
    expect(SS_JSON).toHaveLength(13);
    expect(SDS_JSON).toHaveLength(40);
    expect(SEEDS).toHaveLength(102);
    expect(SEEDS.map((s) => s.slug)).toEqual(REGISTRY_JSON.map((s) => s.slug));
    expect(TEAMS.map((t) => t.slug)).toEqual(REGISTRY_JSON.map((s) => s.slug));
    // The SS seed file: the Sunset eight, then the five independents, each run alphabetical.
    expect(SS_JSON.map((s) => s.league)).toEqual([...Array(8).fill('sunset'), ...Array(5).fill('independents')]);
    expect(INDEPENDENTS_SEEDS.map((s) => s.slug)).toEqual(['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks']);
    expect(SCVAL_SEEDS.every((s) => s.league === 'scval')).toBe(true);
    expect(BVAL_SEEDS.every((s) => s.league === 'bval')).toBe(true);
    expect(PCAL_SEEDS.every((s) => s.league === 'pcal')).toBe(true);
    expect(MCAL_SEEDS.every((s) => s.league === 'mcal')).toBe(true);
    expect(EAL_SEEDS.every((s) => s.league === 'eal')).toBe(true);
    expect(SUNSET_SEEDS.every((s) => s.league === 'sunset')).toBe(true);
    expect(CITY_SEEDS.every((s) => s.league === 'city')).toBe(true);
    expect(NORTH_COUNTY_SEEDS.every((s) => s.league === 'north-county')).toBe(true);
    expect(METRO_SEEDS.every((s) => s.league === 'metro')).toBe(true);
    expect(INDEPENDENTS_SEEDS.every((s) => s.league === 'independents')).toBe(true);
    // EAL seed order is alphabetical.
    expect(EAL_SEEDS.map((s) => s.slug)).toEqual([...EAL_SEEDS.map((s) => s.slug)].sort());
    // SoCal seed order: by division (in the league config's order), alphabetical within each.
    const runs: Array<[string, number]> = [];
    for (const s of SOCAL_SEEDS) {
      const last = runs[runs.length - 1];
      if (last && last[0] === s.division) last[1] += 1;
      else runs.push([s.division, 1]);
    }
    expect(runs).toEqual([
      ['sunset', 8], ['city-western', 6], ['city-eastern', 6], ['avocado', 6], ['palomar', 7], ['valley', 6],
      ['metro-mesa', 5], ['metro-south-bay', 4], ['independents', 5],
    ]);
    for (const [division] of runs) {
      const slugs = SOCAL_SEEDS.filter((s) => s.division === division).map((s) => s.slug);
      expect(slugs, division).toEqual([...slugs].sort());
    }
  });

  it('copies every transcribed field exactly', () => {
    for (const json of ALL_JSON) {
      const seed = SEEDS.find((s) => s.slug === json.slug)!;
      expect(seed, json.slug).toBeDefined();
      for (const key of COPIED) {
        expect(seed[key], `${json.slug}.${key}`).toEqual(json[key]);
      }
    }
  });

  it('derives section from the league', () => {
    for (const seed of SEEDS) {
      expect(seed.section, seed.slug).toBe(getLeague(seed.league).sectionId);
    }
    for (const json of NCS_JSON) expect(json.section).toBe('ncs');
    for (const json of NSS_JSON) expect(json.section).toBe('ns');
    for (const json of SS_JSON) expect(json.section).toBe('ss');
    for (const json of SDS_JSON) expect(json.section).toBe('sds');
    expect(EAL_SEEDS.every((s) => s.section === 'ns')).toBe(true);
    expect(SUNSET_SEEDS.every((s) => s.section === 'ss')).toBe(true);
    expect(INDEPENDENTS_SEEDS.every((s) => s.section === 'ss')).toBe(true);
    expect([...CITY_SEEDS, ...NORTH_COUNTY_SEEDS, ...METRO_SEEDS].every((s) => s.section === 'sds')).toBe(true);
  });

  it('carries sbliveSchoolId only where observed (NCS, NS, SS and SDS seeds, or SPEC §3.2 for the CCS schools)', () => {
    for (const json of ALL_JSON) {
      const seed = SEEDS.find((s) => s.slug === json.slug)!;
      const expected = json.sbliveSchoolId ?? CCS_SCHOOL_IDS[json.slug];
      expect(seed.sbliveSchoolId, json.slug).toBe(expected);
      expect(getTeamBySlug(json.slug)!.external.sbliveSchoolId, json.slug).toBe(expected);
    }
    for (const slug of Object.keys(CCS_SCHOOL_IDS)) {
      expect(CCS_JSON.find((j) => j.slug === slug)!.sbliveSchoolId, slug).toBeUndefined();
    }
  });

  it('keeps the seed officialCodes on the league, never on a team', () => {
    for (const json of ALL_JSON) {
      const seed = SEEDS.find((s) => s.slug === json.slug)!;
      expect(Object.keys(seed)).not.toContain('officialCodes');
      const codes = getLeague(json.league).officialCodes;
      for (const code of json.officialCodes ?? []) expect(codes[code], `${json.slug} ${code}`).toBe(json.slug);
      const team = getTeamBySlug(json.slug)!;
      for (const code of json.officialCodes ?? []) expect(team.aliases).not.toContain(code);
    }
  });

  it('never copies the SoCal seeds\' provenance notes onto a seed, and gives every SoCal seed its si.com ids', () => {
    for (const seed of SOCAL_SEEDS) {
      expect(Object.keys(seed), seed.slug).not.toContain('notes');
      expect([seed.sbliveTeamId, seed.sbliveSlug, seed.sbliveSchoolId].every(Boolean), seed.slug).toBe(true);
      expect(seed.sbliveSlug!.startsWith(`${seed.sbliveTeamId}-`), seed.slug).toBe(true);
      expect(seed.dataCoverage, seed.slug).toBe('full');
    }
  });

  it('keeps vnnSiteId only on los-gatos and palo-alto', () => {
    expect(SEEDS.filter((s) => s.vnnSiteId).map((s) => [s.slug, s.vnnSiteId])).toEqual([
      ['los-gatos', '2634860'],
      ['palo-alto', '2635290'],
    ]);
  });

  it('builds each Team from its seed', () => {
    for (const seed of SEEDS) {
      const t = getTeamBySlug(seed.slug)!;
      expect(t.id).toBe(seed.id);
      expect([t.name, t.shortName, t.abbr, t.acronym, t.mascot, t.city]).toEqual([
        seed.name, seed.shortName, seed.abbr, seed.acronym, seed.mascot, seed.city,
      ]);
      expect([t.section, t.league, t.division, t.dataCoverage]).toEqual([
        seed.section, seed.league, seed.division, seed.dataCoverage,
      ]);
      expect([t.colors.primary, t.colors.secondary, t.colors.source]).toEqual([
        seed.colors[0], seed.colors[1], seed.colorSource,
      ]);
      expect(t.aliases).toEqual(seed.aliases);
      expect(t.external.maxprepsTeamId).toBe(seed.id);
      expect(t.external.maxprepsTeamUrl).toBe(seed.maxprepsPath ? `https://www.maxpreps.com${seed.maxprepsPath}` : null);
      expect(t.external.sbliveTeamId).toBe(seed.sbliveTeamId);
    }
  });
});
