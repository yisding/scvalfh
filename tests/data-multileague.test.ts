/**
 * SPEC §12.2 (B-int): the site read API (lib/data.ts) over the all-2026-10-02 corpus snapshot built
 * by the real pipeline — once with si.com (the cron default) and once with --no-sblive. §7.9 fixes
 * the expected PCAL tables; the D2 corpus fills (6541425, 6543072 absent-fixture; 6499423
 * score-pending) are asserted here because they need B2's unmatched fixtures and B3's backfill
 * together. Every other si.com-sourced score would be a new, uninvestigated input: the lists below
 * are exact.
 *
 * Every assertion message names the module that produces the value, so a failure is routed to its
 * owner.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadSnapshot } from '../lib/snapshot-schema';
import type { DivisionId, LeagueId, Snapshot, Standing } from '../lib/types';
import { corpusSnapshotPath } from './helpers';

type DataModule = typeof import('../lib/data');

interface Variant {
  name: 'si.com' | '--no-sblive';
  file: string;
  snapshot: Snapshot;
  data: DataModule;
}

const priorEnv = process.env.SCVAL_SNAPSHOT;
const variants: Variant[] = [];

async function load(name: Variant['name'], file: string): Promise<Variant> {
  process.env.SCVAL_SNAPSHOT = file;
  vi.resetModules();
  const data = (await import('../lib/data')) as DataModule;
  const snapshot = loadSnapshot(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  return { name, file, snapshot, data };
}

beforeAll(async () => {
  variants.push(await load('si.com', corpusSnapshotPath('all-2026-10-02')));
  variants.push(await load('--no-sblive', corpusSnapshotPath('all-2026-10-02', { extraArgs: ['--no-sblive'] })));
});

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

const withSblive = () => variants[0];
const withoutSblive = () => variants[1];

/** `slug place[=] pts` per row, in table order (`=` marks a shared place). */
function table(rows: readonly Standing[]): string[] {
  return rows.map((r) => `${r.slug} ${r.computed.place}${r.tiebreak.shared ? '=' : ''} ${r.computed.pts}`);
}

function rowsOf(v: Variant, league: LeagueId, division: DivisionId): Standing[] {
  const d = v.data.getLeagueStandings(league).find((x) => x.division === division);
  if (!d) throw new Error(`lib/data.ts getLeagueStandings('${league}'): no ${division} table`);
  return d.rows;
}

const MCAL_TABLE = [
  'tamalpais 1 31',
  'university-sf 2 23',
  'redwood 3 22',
  'marin-catholic 4 20',
  'convent-sacred-heart 5 14',
  'lick-wilmerding 6 9',
  'marin-academy 7 6',
  'berkeley 8 5',
  'archie-williams 9 5',
];

const MCAL_SEEDS = ['tamalpais', 'university-sf', 'redwood', 'marin-catholic', 'convent-sacred-heart', 'lick-wilmerding'];

describe('both runs: the four leagues through lib/data', () => {
  it('serve 43 teams, every league fresh, and the configured division tables', () => {
    for (const v of variants) {
      expect(v.data.getCounts().teams, `lib/pipeline/steps/assemble.ts: teams [${v.name}]`).toBe(43);
      expect(
        v.data.getAllLeagueHealth().map((h) => `${h.leagueId}:${h.state}`),
        `lib/pipeline/steps/standings.ts: LeagueHealth states [${v.name}]`,
      ).toEqual(['scval:fresh', 'bval:fresh', 'pcal:fresh', 'mcal:fresh']);
      const shape = (['scval', 'bval', 'pcal', 'mcal'] as const).map((l) =>
        v.data.getLeagueStandings(l).map((d) => `${d.division}:${d.heading ?? '-'}:${d.rows.length}`),
      );
      expect(shape, `lib/data.ts getLeagueStandings [${v.name}]`).toEqual([
        ['de-anza:De Anza:7', 'el-camino:El Camino:8'],
        ['mt-hamilton:Mt. Hamilton:6', 'santa-teresa:Santa Teresa:6'],
        ['pcal:-:7'],
        ['marin-county:-:9'],
      ]);
    }
  });

  it('MCAL table: Tamalpais first; Berkeley above Archie Williams (5 points each, BK won 3-1 on 9/22)', () => {
    for (const v of variants) {
      expect(table(rowsOf(v, 'mcal', 'marin-county')), `lib/standings.ts computeStandings: MCAL table [${v.name}]`).toEqual(MCAL_TABLE);
      const bk = rowsOf(v, 'mcal', 'marin-county').find((r) => r.slug === 'berkeley');
      expect(bk?.tiebreak.shared, `lib/standings.ts: Berkeley/Archie Williams tie resolved [${v.name}]`).toBe(false);
    }
  });

  it("getStandingContext('marin-county'): uneven games played (9 to 12 of 16), the rest still to play", () => {
    for (const v of variants) {
      const ctx = v.data.getStandingContext('marin-county');
      const bySlug = new Map(rowsOf(v, 'mcal', 'marin-county').map((r) => [r.slug, ctx.get(r.teamId)]));
      expect(
        [...bySlug].map(([slug, c]) => `${slug} ${c?.counted}/${c?.scheduled} left ${c?.remaining} max ${c?.maxPts}`),
        `lib/data.ts getStandingContext('marin-county') [${v.name}]`,
      ).toEqual([
        'tamalpais 12/16 left 4 max 43',
        'university-sf 9/16 left 7 max 44',
        'redwood 9/16 left 7 max 43',
        'marin-catholic 12/16 left 4 max 32',
        'convent-sacred-heart 12/16 left 4 max 26',
        'lick-wilmerding 10/16 left 6 max 27',
        'marin-academy 10/16 left 6 max 24',
        'berkeley 11/16 left 5 max 20',
        'archie-williams 11/16 left 5 max 20',
      ]);
      expect(v.data.getGamesPlayedSpread('marin-county'), `lib/data.ts getGamesPlayedSpread [${v.name}]`).toEqual({
        min: 9,
        max: 12,
        scheduled: 16,
      });
      expect([...ctx.values()].every((c) => c.missingPast === 0 && c.backfilled === 0), `lib/data.ts: MCAL missing/backfilled [${v.name}]`).toBe(true);
    }
  });

  it("getMissingOfficialResults('santa-teresa'): the two 10/01 games MaxPreps lists without a score", () => {
    for (const v of variants) {
      const rows = v.data.getMissingOfficialResults('santa-teresa');
      expect(
        rows.map((r) => `${r.kind} ${r.dateKey} ${r.awaySlug}@${r.homeSlug} ${r.game?.contestId ?? '-'}`),
        `lib/standings.ts missingOfficialResults (via lib/data.ts) [${v.name}]`,
      ).toEqual([
        'missing 2026-10-01 prospect@del-mar 3c691d2c-7e22-46bf-9438-25db21df4640',
        'missing 2026-10-01 sobrato@live-oak be7bd768-4ae2-42a7-b88c-b8e7930b2290',
      ]);
      const st = v.snapshot.leagueHealth.find((h) => h.leagueId === 'bval')?.divisions.find((d) => d.divisionId === 'santa-teresa');
      expect(st?.official?.missingPast, `lib/pipeline/steps/standings.ts: DivisionHealth.official.missingPast [${v.name}]`).toBe(2);
    }
  });

  it("getLeagueTournament('mcal'): seeds Tamalpais, University, Redwood, Marin Catholic, Convent, Lick-Wilmerding", () => {
    for (const v of variants) {
      const t = v.data.getLeagueTournament('mcal');
      expect(t.status, `lib/postseason.ts buildLeagueTournament: status [${v.name}]`).toBe('projected');
      expect(
        t.seeds.map((s) => s.seat.map((x) => x.slug).join('|')),
        `lib/postseason.ts buildLeagueTournament: seeds [${v.name}]`,
      ).toEqual(MCAL_SEEDS);
      expect(t.playInNeeded, `lib/postseason.ts: play-in [${v.name}]`).toBe('no');
    }
  });

  it('no MCAL score comes from si.com', () => {
    for (const v of variants) {
      const mcal = new Set(v.data.getTeams({ league: 'mcal' }).map((t) => t.id));
      const fromSblive = v.snapshot.games.filter(
        (g) => g.provenance.scores === 'sblive' && (mcal.has(g.home.teamId ?? '') || mcal.has(g.away.teamId ?? '')),
      );
      expect(fromSblive.map((g) => g.contestId), `lib/backfill.ts: MCAL fills [${v.name}]`).toEqual([]);
      const health = v.snapshot.leagueHealth.find((h) => h.leagueId === 'mcal');
      expect(health?.divisions.map((d) => d.backfilled), `lib/pipeline/steps/standings.ts: MCAL backfilled [${v.name}]`).toEqual([0]);
    }
  });
});

describe('with si.com (the cron default): D2 fills exactly three PCAL games', () => {
  it('PCAL table: STE 18, HOL 15, CAR 12, MON 9, SAL 6, CAT 3, GRE 0', () => {
    expect(table(rowsOf(withSblive(), 'pcal', 'pcal')), 'lib/standings.ts computeStandings: PCAL table with si.com').toEqual([
      'stevenson 1 18',
      'hollister 2 15',
      'carmel 3 12',
      'monterey 4 9',
      'salinas 5 6',
      'santa-catalina 6 3',
      'greenfield 7 0',
    ]);
  });

  it('publishes exactly three BackfillRows: 6541425 and 6543072 (absent-fixture), 6499423 (score-pending)', () => {
    const rows = withSblive().snapshot.sbliveCrossCheck?.backfilled ?? [];
    expect(
      rows.map((b) => `${b.rule} ${b.dateKey} ${b.label} ${b.contestId} si.com ${b.sbliveUrl.match(/\/games\/(\d+)-/)?.[1]} ${b.sblive.away}-${b.sblive.home}`),
      'lib/backfill.ts: PCAL fills (BackfillRow list)',
    ).toEqual([
      'absent-fixture 2026-09-04 Greenfield at Santa Catalina sblive:6541425 si.com 6541425 0-1',
      'score-pending 2026-09-29 Carmel at Stevenson f06f9d76-c8a1-4358-b7a9-1c97c2d686f0 si.com 6499423 0-9',
      'absent-fixture 2026-09-30 Hollister at Greenfield sblive:6543072 si.com 6543072 3-1',
    ]);
    // Rules 2 and 3 replace no MaxPreps score (rule 4 would record MaxPreps' value here).
    expect(rows.map((b) => b.maxpreps), 'lib/backfill.ts: BackfillRow.maxpreps').toEqual([null, null, null]);
  });

  it('the filled games are counted PCAL finals with si.com provenance; nothing else is si.com-sourced', () => {
    const { snapshot } = withSblive();
    const filled = snapshot.games.filter((g) => g.provenance.scores === 'sblive');
    expect(
      filled.map((g) => `${g.contestId} ${g.status} ${g.away.slug} ${g.away.score} @ ${g.home.slug} ${g.home.score} counts ${g.countsFor} ${g.provenance.backfill?.rule}`),
      'lib/backfill.ts applyBackfill (classified by lib/classify.ts)',
    ).toEqual([
      'sblive:6541425 final greenfield 0 @ santa-catalina 1 counts pcal absent-fixture',
      'f06f9d76-c8a1-4358-b7a9-1c97c2d686f0 final carmel 0 @ stevenson 9 counts pcal score-pending',
      'sblive:6543072 final hollister 3 @ greenfield 1 counts pcal absent-fixture',
    ]);
    for (const g of filled.filter((x) => x.contestId.startsWith('sblive:'))) {
      expect(g.urls.maxpreps, `lib/backfill.ts: ${g.contestId} urls.maxpreps`).toBeNull();
      expect(g.urls.sblive, `lib/backfill.ts: ${g.contestId} urls.sblive`).toMatch(/^https:\/\/www\.si\.com\/high-school\/stats\/california\/field-hockey\/games\//);
      expect(g.official?.source, `lib/backfill.ts: ${g.contestId} official stamp`).toBe('pcal-pdf');
    }
    const pcal = snapshot.leagueHealth.find((h) => h.leagueId === 'pcal')?.divisions[0];
    expect(pcal?.backfilled, 'lib/pipeline/steps/standings.ts: PCAL DivisionHealth.backfilled').toBe(3);
    expect(snapshot.counts.byLeague.pcal.backfilled, 'lib/pipeline/steps/assemble.ts: counts.byLeague.pcal.backfilled').toBe(3);
  });

  it('getStandingContext counts each team’s si.com-sourced games', () => {
    const v = withSblive();
    const ctx = v.data.getStandingContext('pcal');
    expect(
      rowsOf(v, 'pcal', 'pcal').map((r) => `${r.slug} ${ctx.get(r.teamId)?.backfilled} missing ${ctx.get(r.teamId)?.missingPast}`),
      'lib/data.ts getStandingContext(pcal) with si.com',
    ).toEqual([
      'stevenson 1 missing 0',
      'hollister 1 missing 0',
      'carmel 1 missing 0',
      'monterey 0 missing 0',
      'salinas 0 missing 0',
      'santa-catalina 1 missing 0',
      'greenfield 2 missing 0',
    ]);
  });
});

describe('with --no-sblive: no si.com input, so the three PCAL results stay missing', () => {
  it('PCAL table: STE 15, HOL 12 (head-to-head over CAR), CAR 12, MON 9, SAL 6, then GRE and CAT sharing 6th', () => {
    const rows = rowsOf(withoutSblive(), 'pcal', 'pcal');
    expect(table(rows), 'lib/standings.ts computeStandings: PCAL table without si.com').toEqual([
      'stevenson 1 15',
      'hollister 2 12',
      'carmel 3 12',
      'monterey 4 9',
      'salinas 5 6',
      'greenfield 6= 0',
      'santa-catalina 6= 0',
    ]);
    expect(rows.find((r) => r.slug === 'hollister')?.tiebreak.resolvedBy, 'lib/standings.ts: HOL/CAR tie for 2nd').toBe('head-to-head');
    expect(rows.find((r) => r.slug === 'greenfield')?.tiebreak.resolvedBy, 'lib/standings.ts: GRE/CAT tie below 2nd').toBe('no-rule');
  });

  it('publishes no si.com score and lists the three PCAL results as missing', () => {
    const v = withoutSblive();
    expect(v.snapshot.games.filter((g) => g.provenance.scores === 'sblive').length, 'lib/pipeline/steps/sblive.ts: --no-sblive fills').toBe(0);
    expect(v.snapshot.sbliveCrossCheck, 'lib/pipeline/steps/sblive.ts: --no-sblive cross-check').toBeUndefined();
    expect(
      v.data.getMissingOfficialResults('pcal').map((r) => `${r.kind} ${r.dateKey} ${r.awaySlug}@${r.homeSlug}`),
      'lib/standings.ts missingOfficialResults (via lib/data.ts): PCAL without si.com',
    ).toEqual([
      'missing 2026-09-04 greenfield@santa-catalina',
      'missing 2026-09-29 carmel@stevenson',
      'missing 2026-09-30 hollister@greenfield',
    ]);
  });
});
