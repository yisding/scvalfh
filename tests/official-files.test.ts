/**
 * data/official/{bval,pcal,mcal}-2026.json (SPEC §7.8): each bundle passes the schema and the
 * config checks, every division is a double round robin (30 + 30, 42, 72), the build script
 * reproduces the committed bytes, codes resolve through the league's scope only, and York is never
 * a fixture side.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDivision, getLeague } from '../lib/leagues';
import {
  OfficialBundleSchema,
  bundleToFixtures,
  loadBundledFixtures,
  officialFixtureId,
  parseOfficialBundle,
  readOfficialBundle,
  serializeBundle,
} from '../lib/official/schema';
import { OfficialValidationError, assertDoubleRoundRobin } from '../lib/official/validate';
import { isWithdrawnSchool, resolveOfficialName, resolveTeam, teamsInDivision } from '../lib/teams';
import type { OfficialFixture } from '../lib/types';
import { BUNDLED_LEAGUES, buildBundles, outputFileOf } from '../scripts/build-official-fixtures';
import { REPO } from './helpers';

const raw = (league: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO, 'data', 'official', `${league}-2026.json`), 'utf8')) as unknown;

const EXPECTED: Record<string, Record<string, number>> = {
  bval: { 'mt-hamilton': 30, 'santa-teresa': 30 },
  pcal: { pcal: 42 },
  mcal: { 'marin-county': 72 },
};

describe('official bundles: schema, config and the double round robin', () => {
  for (const league of BUNDLED_LEAGUES) {
    it(`${league}: passes the schema and the config checks`, () => {
      const bundle = OfficialBundleSchema.parse(raw(league));
      expect(bundle.schema).toBe('scvalfh-official-fixtures/1');
      expect(bundle.league).toBe(league);
      expect(bundle.transcribedOn).toBe('2026-10-02');
      expect(() => parseOfficialBundle(raw(league), league)).not.toThrow();
      // One document per division, hashed exactly as config's bundledSha256.
      for (const doc of bundle.documents) {
        expect(doc.sha256).toBe(getDivision(doc.division).official.bundledSha256);
        expect(doc.url).toBe(getDivision(doc.division).official.revisionCheckUrl);
      }
      expect(bundle.documents.map((d) => d.division)).toEqual(Object.keys(EXPECTED[league]));
    });

    it(`${league}: every division is a double round robin of the registry members`, () => {
      const fixtures = loadBundledFixtures(league);
      expect(fixtures).toHaveLength(Object.values(EXPECTED[league]).reduce((a, b) => a + b, 0));
      for (const [division, count] of Object.entries(EXPECTED[league])) {
        const own = fixtures.filter((f) => f.division === division);
        expect(own).toHaveLength(count);
        const n = teamsInDivision(division).length;
        expect(count).toBe(n * (n - 1));
        expect(() => assertDoubleRoundRobin(own, division)).not.toThrow();
        for (const f of own) {
          expect(f.league).toBe(league);
          expect(f.source).toBe(getDivision(division).official.source);
          expect(f.id).toBe(`${division}:${f.dateKey}:${f.awaySlug}@${f.homeSlug}`);
        }
      }
    });

    it(`${league}: the build script reproduces the committed file byte for byte`, () => {
      const built = buildBundles()[league];
      const file = outputFileOf(league);
      expect(path.relative(REPO, file)).toBe(getLeague(league).divisions[0].official.bundledFile);
      expect(serializeBundle(built)).toBe(readFileSync(file, 'utf8'));
      // …and serializing what was read back is the identity.
      expect(serializeBundle(readOfficialBundle(league))).toBe(readFileSync(file, 'utf8'));
    });
  }

  it('BVAL: 10 games and 5 home games per team; the 10/31 play-in is an event, never a fixture', () => {
    const fixtures = loadBundledFixtures('bval');
    for (const division of ['mt-hamilton', 'santa-teresa']) {
      for (const t of teamsInDivision(division)) {
        expect(fixtures.filter((f) => f.awaySlug === t.slug || f.homeSlug === t.slug)).toHaveLength(10);
        expect(fixtures.filter((f) => f.homeSlug === t.slug)).toHaveLength(5);
      }
    }
    expect(fixtures.some((f) => f.dateKey === '2026-10-31')).toBe(false);
    const bundle = readOfficialBundle('bval');
    expect(bundle.events).toEqual([
      { kind: 'play-in', date: '2026-10-31', time: '11:00', verbatim: 'CCS Play-in Game / 4th Place MH @ ST Champion 11am' },
    ]);
    expect(bundle.documents.map((d) => d.revisionMarker)).toEqual(['Revised 9/20/26', 'Revised 9/22/26']);
    expect(fixtures.find((f) => f.id === 'mt-hamilton:2026-09-17:leigh@gilroy')?.time).toBe('17:00');
    expect(fixtures.find((f) => f.id === 'mt-hamilton:2026-10-30:branham@christopher')?.time).toBe('17:15');
    expect(fixtures.find((f) => f.id === 'santa-teresa:2026-10-27:silver-creek@prospect')?.time).toBe('18:15');
  });

  it('PCAL: varsity 16:00, names from the source codes map', () => {
    const fixtures = loadBundledFixtures('pcal');
    expect(new Set(fixtures.map((f) => f.time))).toEqual(new Set(['16:00']));
    const first = fixtures.find((f) => f.id === 'pcal:2026-09-03:carmel@hollister');
    expect(first?.homeName).toBe('Hollister (San Benito HS)');
    expect(readOfficialBundle('pcal').events).toEqual([]);
  });

  it('MCAL: post-change dates, originalDate kept for the 2 approved changes, 16:30 only where the note says so', () => {
    const bundle = readOfficialBundle('mcal');
    const moved = bundle.fixtures.filter((f) => f.originalDate !== null);
    expect(moved.map((f) => [f.id, f.originalDate, f.time])).toEqual([
      ['marin-county:2026-09-29:berkeley@lick-wilmerding', '2026-09-24', '16:30'],
      ['marin-county:2026-10-15:lick-wilmerding@marin-catholic', '2026-10-12', '16:30'],
    ]);
    expect(bundle.fixtures.filter((f) => f.time !== '16:00').map((f) => f.id)).toEqual(moved.map((f) => f.id));
  });
});

describe('official bundles: codes resolve through the league scope only', () => {
  it('maps grid codes through officialCodes, never through the global resolver', () => {
    const pcal = readOfficialBundle('pcal');
    const mcal = readOfficialBundle('mcal');
    const tokens = new Set([...pcal.fixtures, ...mcal.fixtures].flatMap((f) => [f.away, f.home]));
    for (const code of ['STE', 'CAR', 'HOL', 'MON', 'SAL', 'GRE', 'CAT', 'AW', 'R', 'T', 'B', 'LW', 'U', 'MC', 'CSH', 'MA']) {
      expect(tokens.has(code)).toBe(true);
    }
    expect(resolveOfficialName('pcal', 'CAT')?.slug).toBe('santa-catalina');
    expect(resolveOfficialName('mcal', 'U')?.slug).toBe('university-sf');
    expect(resolveOfficialName('bval', 'WG')?.slug).toBe('willow-glen');
    // A grid code is meaningless outside its league.
    expect(resolveTeam('CAT')?.slug).not.toBe('santa-catalina');
    expect(resolveTeam('U')).toBeUndefined();
    expect(resolveTeam('WG')).toBeUndefined();
    expect(resolveOfficialName('bval', 'CAT')).toBeUndefined();
    expect(resolveOfficialName('pcal', 'U')).toBeUndefined();
    expect(resolveOfficialName('scval', 'MC')).toBeUndefined();
  });

  it('rejects a bundle whose token resolves only in another league', () => {
    const bundle = OfficialBundleSchema.parse(raw('pcal'));
    const tampered = { ...bundle, fixtures: bundle.fixtures.map((f, i) => (i === 0 ? { ...f, away: 'U' } : f)) };
    expect(() => parseOfficialBundle(tampered, 'pcal')).toThrow(/away "U" resolves to no pcal team/);
  });

  it('never has York (PCAL JV, withdrawn) as a fixture side', () => {
    expect(isWithdrawnSchool('York', 'pcal')).toBe(true);
    for (const league of BUNDLED_LEAGUES) {
      for (const f of readOfficialBundle(league).fixtures) {
        for (const side of [f.away, f.home, f.awayName, f.homeName]) {
          expect(side).not.toMatch(/york|\bYOR\b/i);
          expect(isWithdrawnSchool(side)).toBe(false);
        }
      }
    }
  });
});

describe('official bundles: load-time rejection', () => {
  const pcal = () => OfficialBundleSchema.parse(raw('pcal'));

  it('rejects the wrong league, a changed document hash and a tampered id', () => {
    expect(() => parseOfficialBundle(raw('pcal'), 'mcal')).toThrow();
    const sha = pcal();
    sha.documents[0] = { ...sha.documents[0], sha256: '0'.repeat(64) };
    expect(() => parseOfficialBundle(sha, 'pcal')).toThrow(/sha256/);
    const id = pcal();
    id.fixtures[0] = { ...id.fixtures[0], id: 'pcal:2026-09-02:x@y' };
    expect(() => parseOfficialBundle(id, 'pcal')).toThrow(/id should be pcal:2026-09-02:stevenson@monterey/);
  });

  it('rejects schema violations (bad date, bad time, extra keys)', () => {
    const bad = pcal();
    expect(() => parseOfficialBundle({ ...bad, fixtures: [{ ...bad.fixtures[0], date: '9/2/26' }] }, 'pcal')).toThrow(/schema/);
    expect(() => parseOfficialBundle({ ...bad, fixtures: [{ ...bad.fixtures[0], time: '4pm' }] }, 'pcal')).toThrow(/schema/);
    expect(() => parseOfficialBundle({ ...bad, extra: 1 }, 'pcal')).toThrow(/schema/);
  });

  it('builds OfficialFixture ids by the lib/types.ts rule', () => {
    expect(officialFixtureId('pcal', '2026-09-02', { slug: 'stevenson', name: 'Stevenson' }, { slug: null, name: 'Nowhere' }))
      .toBe('pcal:2026-09-02:stevenson@Nowhere');
    expect(bundleToFixtures(pcal())[0]).toEqual({
      id: 'pcal:2026-09-02:stevenson@monterey', league: 'pcal', division: 'pcal', dateKey: '2026-09-02', time: '16:00',
      awayName: 'Stevenson', homeName: 'Monterey', awaySlug: 'stevenson', homeSlug: 'monterey', source: 'pcal-pdf',
    });
  });
});

describe('assertDoubleRoundRobin', () => {
  const pcal = () => loadBundledFixtures('pcal');
  const problems = (fixtures: OfficialFixture[]): string[] => {
    try {
      assertDoubleRoundRobin(fixtures, 'pcal');
      return [];
    } catch (err) {
      expect(err).toBeInstanceOf(OfficialValidationError);
      return [...(err as OfficialValidationError).problems];
    }
  };

  it('reports a missing leg, a duplicated leg and the wrong per-team count', () => {
    const missing = problems(pcal().slice(1));
    expect(missing).toContain('41 fixtures, expected 42 (7 teams)');
    expect(missing).toContain('stevenson@monterey appears 0 times');
    expect(missing).toContain('stevenson plays 11, expected 12');
    const dup = pcal();
    dup[1] = { ...dup[0], id: `${dup[0].id}-copy` };
    expect(problems(dup)).toContain('stevenson@monterey appears 2 times');
  });

  it('reports a team playing twice on one date and a date outside league play', () => {
    const f = pcal();
    const i = f.findIndex((x) => x.id === 'pcal:2026-09-03:carmel@hollister');
    f[i] = { ...f[i], dateKey: '2026-09-02' }; // Carmel/Hollister now share Sep 2 with Stevenson @ Monterey: fine…
    expect(problems(f)).toEqual([]);
    f[i] = { ...f[i], dateKey: '2026-09-04', homeSlug: 'hollister' }; // …Greenfield @ Santa Catalina is Sep 4: fine
    expect(problems(f)).toEqual([]);
    const j = f.findIndex((x) => x.id === 'pcal:2026-09-08:hollister@stevenson');
    f[j] = { ...f[j], dateKey: '2026-09-02' };
    expect(problems(f)).toContain('stevenson plays 2 times on 2026-09-02');
    const late = pcal();
    late[0] = { ...late[0], dateKey: '2026-11-05' };
    expect(problems(late).some((p) => /outside league play 2026-09-02…2026-10-29/.test(p))).toBe(true);
  });

  it('reports a side that is not a member of the division', () => {
    const f = pcal();
    f[0] = { ...f[0], awaySlug: null, awayName: 'York' };
    expect(problems(f)).toContain('pcal:2026-09-02:stevenson@monterey: away "York" is not a member of pcal');
  });
});
