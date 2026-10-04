/**
 * lib/registry/* is a transcription of the three verified registry seeds in tests/fixtures/seeds/
 * (CCS, NCS, and the Northern Section's EAL). Every transcribed field must equal the seed JSON
 * (SPEC §3.1), except the documented differences:
 *   - `section` is derived from the league (ccs for scval/bval/pcal, ncs for mcal, ns for eal);
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
import { EAL_SEEDS } from '../lib/registry/eal';
import { MCAL_SEEDS } from '../lib/registry/mcal';
import { PCAL_SEEDS } from '../lib/registry/pcal';
import { SCVAL_SEEDS } from '../lib/registry/scval';
import type { Seed } from '../lib/registry/seed';
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
const ALL_JSON = [...CCS_JSON, ...NCS_JSON, ...NSS_JSON];

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

const SEEDS: readonly Seed[] = [...SCVAL_SEEDS, ...BVAL_SEEDS, ...PCAL_SEEDS, ...MCAL_SEEDS, ...EAL_SEEDS];

const COPIED = [
  'id', 'slug', 'name', 'shortName', 'abbr', 'acronym', 'mascot', 'city', 'league', 'division',
  'dataCoverage', 'colors', 'colorSource', 'maxprepsPath', 'aliases', 'sbliveTeamId', 'sbliveSlug',
  'vnnSiteId',
] as const;

describe('registry seeds: lib/registry/* equals tests/fixtures/seeds/*.json', () => {
  it('has the same 49 teams in the same order (SCVAL, BVAL, PCAL from the CCS seed; MCAL from the NCS seed; EAL from the NS seed)', () => {
    expect(CCS_JSON).toHaveLength(34);
    expect(NCS_JSON).toHaveLength(9);
    expect(NSS_JSON).toHaveLength(6);
    expect(SEEDS).toHaveLength(49);
    expect(SEEDS.map((s) => s.slug)).toEqual(ALL_JSON.map((s) => s.slug));
    expect(TEAMS.map((t) => t.slug)).toEqual(ALL_JSON.map((s) => s.slug));
    expect(SCVAL_SEEDS.every((s) => s.league === 'scval')).toBe(true);
    expect(BVAL_SEEDS.every((s) => s.league === 'bval')).toBe(true);
    expect(PCAL_SEEDS.every((s) => s.league === 'pcal')).toBe(true);
    expect(MCAL_SEEDS.every((s) => s.league === 'mcal')).toBe(true);
    expect(EAL_SEEDS.every((s) => s.league === 'eal')).toBe(true);
    // EAL seed order is alphabetical.
    expect(EAL_SEEDS.map((s) => s.slug)).toEqual([...EAL_SEEDS.map((s) => s.slug)].sort());
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
    expect(EAL_SEEDS.every((s) => s.section === 'ns')).toBe(true);
  });

  it('carries sbliveSchoolId only where observed (NCS and NS seeds, or SPEC §3.2 for the CCS schools)', () => {
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
