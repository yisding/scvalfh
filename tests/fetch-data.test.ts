/**
 * End to end: the real cron script (`scripts/fetch-data.ts --fixtures …`, with the real official
 * and si.com steps) over the two committed corpora (SPEC §7.3, §12.2):
 *   - the SCVAL corpus (2026-09-29): 102 teams in the snapshot, the other nine leagues (the EAL, the
 *     four SoCal leagues and the LA independents among them) frozen
 *     "not fetched in this run" — never an abort;
 *   - the all-2026-10-02 corpus: per-league counts, LeagueHealth, the §7.9 PCAL and MCAL tables,
 *     the 56 MaxPreps resources in live-shaped order (and never the Mission league), the summary line.
 *     Its manifest names four leagues: the EAL and the four Southern California leagues (added later)
 *     are frozen "not fetched in this run" there, so the run asks for its four leagues' 6 metas, 6
 *     tables and 43 schedules (the live sweep is 131: 1 + 2 × 14 division tables + 102 schedules; the
 *     San Diego Valley division and the LA independents have no MaxPreps table and are
 *     never requested).
 * Plus the CLI behaviours kept from today's script: stable output, --dry-run, unknown flags, the
 * season-window guard, the empty-feed guard, never-0-0.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ALL_DIVISIONS, LEAGUES, getLeague } from '../lib/leagues';
import type { SnapshotMeta } from '../lib/pipeline/contract';
import { readManifest } from '../lib/pipeline/corpus';
import { SPORT_SEASON_ID } from '../lib/season';
import { loadSnapshot, parseSnapshot } from '../lib/snapshot-schema';
import { FETCHABLE_TEAMS, TEAMS } from '../lib/teams';
import type { Snapshot, Standing } from '../lib/types';
import { REPO, corpusDir, corpusSnapshotPath, runFixtureCli, type CliRun } from './helpers';
import { writeTempVariant } from './pipeline/support/run-corpus';

/**
 * The freeze reason of a league not in this run (lib/pipeline/steps/guards.ts notInRunReason): '<SHORT> was
 * not fetched in this run.', and for the LA independents, whose short name is an adjective,
 * the group by name with a plural verb (DESIGN §24.9).
 */
function notFetchedReason(id: Parameters<typeof getLeague>[0]): string {
  return id === 'independents'
    ? 'The LA independents were not fetched in this run.'
    : `${getLeague(id).shortName} was not fetched in this run.`;
}

const MISSION_LEAGUE_ID = '6e1f97d4-5211-4d98-bf59-282cd754bc5c';
const SUMMARY_RE =
  /^summary: teams (\d+) · games (\d+) \(league (\d+)\) · finals (\d+) · pending (\d+) · backfilled (\d+) · mismatches (\d+) · sources ok (\d+)\/(\d+) · requests maxpreps:(\d+) sblive:(\d+) official:(\d+) · leagues scval:(\w+) bval:(\w+) pcal:(\w+) mcal:(\w+) eal:(\w+) sunset:(\w+) city:(\w+) north-county:(\w+) metro:(\w+) independents:(\w+)$/m;

/** The four Southern California leagues, frozen "not fetched in this run" in every NorCal corpus. */
const SOCAL_FROZEN = ['sunset:frozen', 'city:frozen', 'north-county:frozen', 'metro:frozen', 'independents:frozen'] as const;

/** The leagues the all-2026-10-02 corpus was captured for (its manifest): every league but the EAL. */
const ALL_CORPUS_LEAGUES: readonly string[] = readManifest(corpusDir('all-2026-10-02')).leagues;

function readSnapshot(file: string): Snapshot {
  return parseSnapshot(JSON.parse(readFileSync(file, 'utf8')) as unknown);
}

function mustRun(run: CliRun): CliRun {
  if (run.status !== 0) throw new Error(`scripts/fetch-data.ts exited ${run.status}\n${run.output}`);
  return run;
}

/** `slug place[=] pts` per row of a division, in table order. */
function table(snapshot: Snapshot, division: string): string[] {
  return snapshot.standings
    .filter((s: Standing) => s.division === division)
    .map((r) => `${r.slug} ${r.computed.place}${r.tiebreak.shared ? '=' : ''} ${r.computed.pts}`);
}

// ---------------------------------------------------------------- the SCVAL corpus

describe('fetch-data --fixtures <the SCVAL corpus>', () => {
  let run: CliRun;
  let snapshot: Snapshot;

  beforeAll(() => {
    run = mustRun(runFixtureCli({ corpus: 'scval' }));
    snapshot = readSnapshot(run.out);
  });

  it('publishes all 102 teams; SCVAL fresh, the other leagues frozen "not fetched in this run" — no abort', () => {
    expect(run.status).toBe(0);
    expect(snapshot.fetchedAt).toBe('2026-09-29T15:00:00.000Z');
    expect(snapshot.teams.length).toBe(102);
    expect(snapshot.standings.length).toBe(102);
    expect(snapshot.leagueHealth.map((h) => `${h.leagueId}:${h.state}`)).toEqual([
      'scval:fresh',
      'bval:frozen',
      'pcal:frozen',
      'mcal:frozen',
      'eal:frozen',
      ...SOCAL_FROZEN,
    ]);
    for (const h of snapshot.leagueHealth.filter((x) => x.leagueId !== 'scval')) {
      expect(h.reasons, h.leagueId).toEqual([notFetchedReason(h.leagueId)]);
      expect(h.lastFreshAt, h.leagueId).toBeNull();
    }
    // Frozen with no previous data: no league games of theirs (only the SCVAL feeds' games against
    // them), every row "no results reported".
    for (const id of ['bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents'] as const) {
      expect(snapshot.counts.byLeague[id].leagueGames, id).toBe(0);
    }
    // 34 NorCal rows plus the 53 SoCal rows.
    expect(snapshot.standings.filter((s) => !s.hasReportedResults).length).toBe(87);
  });

  it('keeps the SCVAL numbers of today’s offline run', () => {
    expect(snapshot.games.length).toBe(158);
    expect(snapshot.counts.finals).toBe(80);
    expect(snapshot.counts.pending).toBe(3);
    expect(snapshot.counts.byLeague.scval).toMatchObject({ games: 158, leagueGames: 96, finals: 80, backfilled: 0 });
  });

  it('requests only SCVAL resources: 20 MaxPreps requests', () => {
    const urls = run.output.split('\n').filter((l) => l.startsWith('maxpreps GET '));
    expect(urls.length).toBe(1 + 2 + 2 + 15);
    expect(run.stdout).toMatch(SUMMARY_RE);
    const m = SUMMARY_RE.exec(run.stdout)!;
    expect(m[10]).toBe('20');
    expect(m.slice(13, 23)).toEqual(['fresh', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen']);
  });

  it('writes the meta file beside it, with per-league rows and the commit summary', () => {
    const metaPath = run.out.replace(/\.json$/, '.meta.json');
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as SnapshotMeta;
    expect(meta.fetchedAt).toBe(snapshot.fetchedAt);
    expect(meta.counts.games).toBe(snapshot.games.length);
    expect(meta.leagues.map((l) => `${l.id}:${l.state}`)).toEqual([
      'scval:fresh',
      'bval:frozen',
      'pcal:frozen',
      'mcal:frozen',
      'eal:frozen',
      ...SOCAL_FROZEN,
    ]);
    expect(meta.commitSummary).toMatch(/BVAL frozen/);
  });

  it('writes stable, key-sorted JSON so a re-run produces an identical file', () => {
    const again = mustRun(runFixtureCli({ corpus: 'scval' }));
    const text = readFileSync(run.out, 'utf8');
    expect(readFileSync(again.out, 'utf8')).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
    expect(keys).toEqual([...keys].sort());
  });

  it('never emits a score for a game that is not final', () => {
    for (const g of snapshot.games) {
      if (g.status === 'final') continue;
      expect(`${g.home.score}-${g.away.score}`, g.contestId).toBe('null-null');
    }
  });

  it('computes the season window and the CCS key dates', () => {
    expect(snapshot.season.year).toBe('26-27');
    expect(snapshot.season.window.firstGame).toMatch(/^2026-08-24/);
    expect(snapshot.playoffs.keyDates.endOfLeagueSeason).toBe('2026-10-31');
    expect(snapshot.playoffs.keyDates.quarterfinals).toBe('2026-11-07');
    expect(snapshot.playoffs.format.autoQualifiers).toEqual({ scval: 7, bval: 4, pcal: 2, atLarge: 3, total: 16 });
    expect(snapshot.playoffs.bracketPublished).toBe(false);
  });
});

// ---------------------------------------------------------------- the all-league corpus

describe('fetch-data --fixtures <all-2026-10-02>', () => {
  let run: CliRun;
  let snapshot: Snapshot;

  beforeAll(() => {
    run = mustRun(runFixtureCli({ corpus: 'all-2026-10-02' }));
    snapshot = readSnapshot(run.out);
  });

  it('requests the 56 MaxPreps resources in live-shaped order, and never the Mission league', () => {
    const urls = run.output
      .split('\n')
      .filter((l) => l.startsWith('maxpreps GET '))
      .map((l) => l.slice('maxpreps GET '.length));
    // The corpus's four leagues only: 1 bootstrap + 6 metas + 6 tables + 43 schedules.
    const divisions = ALL_DIVISIONS.filter((d) => ALL_CORPUS_LEAGUES.includes(d.leagueId));
    const teams = FETCHABLE_TEAMS.filter((t) => ALL_CORPUS_LEAGUES.includes(t.league));
    expect(urls.length).toBe(56);
    expect(urls.length).toBe(1 + 2 * divisions.length + teams.length);
    expect(urls[0]).toBe('https://www.maxpreps.com/ca/field-hockey/');
    const metas = urls.slice(1, 7);
    const standings = urls.slice(7, 13);
    const schedules = urls.slice(13);
    expect(metas).toEqual(divisions.map((d) => `https://production.api.maxpreps.com/leagues/${d.maxprepsLeagueId}/v1`));
    expect(standings).toEqual(
      divisions.map(
        (d) => `https://production.api.maxpreps.com/leagues/${d.maxprepsLeagueId}/standings/v1?sportseasonid=${SPORT_SEASON_ID}`,
      ),
    );
    expect(schedules.map((u) => new URL(u).searchParams.get('teamId'))).toEqual(teams.map((t) => t.id));
    expect(teams.length).toBe(43);
    expect(FETCHABLE_TEAMS.length).toBe(102);
    // The EAL and the SoCal leagues are not in this corpus's run: none of their MaxPreps resources is
    // asked for (the Valley division has no table at all, so it has no id to look for).
    for (const d of ALL_DIVISIONS.filter((x) => !ALL_CORPUS_LEAGUES.includes(x.leagueId))) {
      if (d.maxprepsLeagueId !== null) expect(run.output).not.toContain(d.maxprepsLeagueId);
    }
    expect(run.output).not.toContain('/leagues/null/');
    expect(run.output).not.toContain(MISSION_LEAGUE_ID);
  });

  it('prints the summary line', () => {
    const line = SUMMARY_RE.exec(run.stdout);
    expect(line, run.stdout.slice(-2000)).not.toBeNull();
    const m = line!;
    expect(m[1]).toBe('102');
    expect(Number(m[2])).toBe(snapshot.games.length);
    expect(Number(m[3])).toBe(snapshot.counts.leagueGames);
    expect(Number(m[4])).toBe(snapshot.counts.finals);
    expect(m[6]).toBe('3');
    expect(Number(m[9])).toBe(snapshot.sources.length);
    expect(m[10]).toBe('56');
    expect(m.slice(13, 23)).toEqual(['fresh', 'fresh', 'fresh', 'fresh', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen', 'frozen']);
  });

  it('publishes per-league counts', () => {
    expect(snapshot.teams.length).toBe(102);
    expect(snapshot.counts.teams).toBe(102);
    // EAL and the SoCal leagues: not in the run, so only the other feeds' games against their teams,
    // and no league game. The San Diego schools became registry teams after this corpus was captured:
    // the NorCal feeds' 14 games against City and North County teams (10 + 4; 4 of them final) now
    // have two registry sides, but only the NorCal side's feed is in the run. Each is kept once, from
    // that feed, with countsFor null (a non-league game) and its score as that feed reports it:
    // nothing is invented for the SoCal side, and nothing is dropped.
    expect(snapshot.counts.byLeague).toEqual({
      scval: { teams: 15, games: 158, leagueGames: 96, finals: 80, backfilled: 0 },
      bval: { teams: 12, games: 116, leagueGames: 60, finals: 65, backfilled: 0 },
      pcal: { teams: 7, games: 56, leagueGames: 36, finals: 38, backfilled: 3 },
      mcal: { teams: 9, games: 86, leagueGames: 72, finals: 56, backfilled: 0 },
      eal: { teams: 6, games: 9, leagueGames: 0, finals: 4, backfilled: 0 },
      sunset: { teams: 8, games: 0, leagueGames: 0, finals: 0, backfilled: 0 },
      city: { teams: 12, games: 10, leagueGames: 0, finals: 2, backfilled: 0 },
      'north-county': { teams: 19, games: 4, leagueGames: 0, finals: 2, backfilled: 0 },
      metro: { teams: 9, games: 0, leagueGames: 0, finals: 0, backfilled: 0 },
      independents: { teams: 5, games: 0, leagueGames: 0, finals: 0, backfilled: 0 },
    });
    const socal = new Set(['sunset', 'city', 'north-county', 'metro']);
    const leagueOf = new Map(TEAMS.map((t) => [t.slug, t.league]));
    const crossRegion = snapshot.games.filter(
      (g) => socal.has(leagueOf.get(g.home.slug ?? '') ?? '') || socal.has(leagueOf.get(g.away.slug ?? '') ?? ''),
    );
    expect(crossRegion.length).toBe(14);
    expect(new Set(crossRegion.map((g) => g.contestId)).size).toBe(14);
    for (const g of crossRegion) {
      expect(g.countsFor, g.contestId).toBeNull();
      expect(g.provenance.scores, g.contestId).toBe('maxpreps-api');
    }
    // Tamalpais v Del Norte (San Diego), Oct 16: now a registry pair, still one game.
    expect(crossRegion.find((g) => g.contestId.startsWith('a05bedf5'))).toMatchObject({
      home: { slug: 'tamalpais' },
      away: { slug: 'del-norte' },
      status: 'scheduled',
    });
    expect(snapshot.counts.leagueGames).toBe(snapshot.games.filter((g) => g.countsFor !== null).length);
  });

  it('publishes one LeagueHealth row per league, the corpus leagues fresh with every feed read, the EAL frozen', () => {
    expect(snapshot.leagueHealth.map((h) => h.leagueId)).toEqual(LEAGUES.map((l) => l.id));
    for (const h of snapshot.leagueHealth.filter((x) => !ALL_CORPUS_LEAGUES.includes(x.leagueId))) {
      expect(h.state, h.leagueId).toBe('frozen');
      expect(h.reasons, h.leagueId).toEqual([notFetchedReason(h.leagueId)]);
      expect(h.teamFeeds, h.leagueId).toEqual({ total: TEAMS.filter((t) => t.league === h.leagueId).length, ok: 0, carried: 0, failed: 0 });
    }
    // A division with no official schedule (EAL) reports its missing league results outside `official`.
    expect(snapshot.leagueHealth.find((h) => h.leagueId === 'eal')?.divisions).toMatchObject([
      { divisionId: 'eal', classification: 'contest-type', official: null, countedFinals: 0, missingLeaguePast: 0 },
    ]);
    for (const h of snapshot.leagueHealth.filter((x) => ALL_CORPUS_LEAGUES.includes(x.leagueId))) {
      const league = getLeague(h.leagueId);
      expect(h.state, h.leagueId).toBe('fresh');
      expect(h.reasons, h.leagueId).toEqual([]);
      expect(h.lastFreshAt, h.leagueId).toBe(snapshot.fetchedAt);
      const n = TEAMS.filter((t) => t.league === h.leagueId).length;
      expect(h.teamFeeds, h.leagueId).toEqual({ total: n, ok: n, carried: 0, failed: 0 });
      expect(h.divisions.map((d) => d.divisionId), h.leagueId).toEqual(league.divisions.map((d) => d.id));
      for (const d of h.divisions) {
        expect(d.meta, d.divisionId).toBe('ok');
        expect(d.reportedTable, d.divisionId).toBe('ok');
        expect(d.classification, d.divisionId).toBe(league.rules.classification);
        expect(d.official?.carried, d.divisionId).toBe(false);
        expect(d.official?.revisedUpstream, d.divisionId).toBe(false);
        expect(d.missingLeaguePast, d.divisionId).toBeUndefined();
      }
    }
    const div = (id: string) => snapshot.leagueHealth.flatMap((h) => h.divisions).find((d) => d.divisionId === id)!;
    // Official fixtures (§7.8): BVAL 60/60, PCAL 34/42 + 2 si.com fills, MCAL 72/72; SCVAL 96/98.
    expect(div('mt-hamilton').official).toMatchObject({ total: 30, matched: 30, missingPast: 0 });
    expect(div('santa-teresa').official).toMatchObject({ total: 30, matched: 30, missingPast: 2 });
    expect(div('pcal').official).toMatchObject({ total: 42, matched: 36, missingPast: 0 });
    expect(div('marin-county').official).toMatchObject({ total: 72, matched: 72, missingPast: 0 });
    expect((div('de-anza').official?.matched ?? 0) + (div('el-camino').official?.matched ?? 0)).toBe(96);
    expect(div('pcal').backfilled).toBe(3);
  });

  it('PCAL table (§7.9, with si.com): STE 18, HOL 15, CAR 12, MON 9, SAL 6, CAT 3, GRE 0', () => {
    expect(table(snapshot, 'pcal')).toEqual([
      'stevenson 1 18',
      'hollister 2 15',
      'carmel 3 12',
      'monterey 4 9',
      'salinas 5 6',
      'santa-catalina 6 3',
      'greenfield 7 0',
    ]);
  });

  it('MCAL table: Tamalpais, University, Redwood, Marin Catholic, Convent, Lick-Wilmerding, Marin Academy, Berkeley, Archie Williams', () => {
    expect(table(snapshot, 'marin-county')).toEqual([
      'tamalpais 1 31',
      'university-sf 2 23',
      'redwood 3 22',
      'marin-catholic 4 20',
      'convent-sacred-heart 5 14',
      'lick-wilmerding 6 9',
      'marin-academy 7 6',
      'berkeley 8 5',
      'archie-williams 9 5',
    ]);
  });

  it('PCAL table with --no-sblive: HOL above CAR on head-to-head, GRE and CAT sharing 6th', () => {
    const noSblive = loadSnapshot(
      JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02', { extraArgs: ['--no-sblive'] }), 'utf8')) as unknown,
    );
    expect(table(noSblive, 'pcal')).toEqual([
      'stevenson 1 15',
      'hollister 2 12',
      'carmel 3 12',
      'monterey 4 9',
      'salinas 5 6',
      'greenfield 6= 0',
      'santa-catalina 6= 0',
    ]);
    expect(noSblive.counts.byLeague.pcal.backfilled).toBe(0);
  });

  it('publishes the dropped contests: the Del Norte ghost duplicate, 5cf5e3df, the three TBA rows', () => {
    expect(snapshot.dropped.map((d) => `${d.reason} ${d.contestId.slice(0, 8)}`).sort()).toEqual([
      'excluded-by-config 5cf5e3df',
      'ghost-team 5b9ff911',
      'tba-opponent 55207683',
      'tba-opponent 64c8188b',
      'tba-opponent 64e0b2e5',
    ]);
  });

  it('never emits a score for a game that is not final', () => {
    for (const g of snapshot.games) {
      if (g.status === 'final') continue;
      expect(`${g.home.score}-${g.away.score}`, g.contestId).toBe('null-null');
    }
  });
});

// ---------------------------------------------------------------- CLI behaviours

describe('fetch-data: flags', () => {
  it('honours --dry-run by writing nothing', () => {
    const res = runFixtureCli({ corpus: 'scval', extraArgs: ['--dry-run'] });
    expect(res.status, res.output).toBe(0);
    expect(res.output).toMatch(/dry run: nothing written/);
    expect(existsSync(res.out)).toBe(false);
  });

  it('fails loudly on an unknown flag', () => {
    const res = runFixtureCli({ corpus: 'scval', extraArgs: ['--nope'] });
    expect(res.status).toBe(1);
    expect(res.output).toMatch(/unknown flag: --nope/);
  });

  it('honours --no-sblive / --no-official (alias --no-scval) / --no-ccs / --no-vnn', () => {
    const res = runFixtureCli({
      corpus: 'all-2026-10-02',
      extraArgs: ['--dry-run', '--no-sblive', '--no-scval', '--no-ccs', '--no-vnn'],
    });
    expect(res.status, res.output).toBe(0);
    expect(res.output).toMatch(/sblive: skipped \(--no-sblive\)/);
    expect(res.output).toMatch(/vnn: skipped \(--no-vnn\)/);
    expect(res.output).toMatch(/ccs: skipped \(--no-ccs\)/);
    const m = SUMMARY_RE.exec(res.stdout)!;
    expect(m[6], 'backfilled').toBe('0');
    expect(m.slice(10, 13), 'requests maxpreps / sblive / official').toEqual(['56', '0', '0']);
  });
});

describe('fetch-data: the season-window guard', () => {
  it('exits 0 with "out of season" and touches nothing outside Aug 1 - Nov 30', () => {
    for (const month of ['07', '12']) {
      const res = runFixtureCli({ corpus: 'scval', fetchedAt: `2026-${month}-15T20:00:00.000Z` });
      expect(res.status, res.output).toBe(0);
      expect(res.output, month).toMatch(/out of season/);
      expect(res.output, month).not.toMatch(/summary:/);
      expect(existsSync(res.out), month).toBe(false);
    }
  });

  it('runs anyway with --force', () => {
    const res = runFixtureCli({ corpus: 'scval', fetchedAt: '2026-12-15T20:00:00.000Z', extraArgs: ['--force', '--dry-run'] });
    expect(res.status, res.output).toBe(0);
    expect(res.output).not.toMatch(/out of season/);
    expect(res.stdout).toMatch(/summary: teams 102/);
  });

  it('is in season through the whole league and playoff calendar', () => {
    for (const month of ['08', '09', '10', '11']) {
      const res = runFixtureCli({ corpus: 'scval', fetchedAt: `2026-${month}-15T20:00:00.000Z`, extraArgs: ['--dry-run'] });
      expect(res.status, res.output).toBe(0);
      expect(res.output, month).not.toMatch(/out of season/);
    }
  });
});

describe('fetch-data: carrying a failed team feed', () => {
  /**
   * A 200 with an empty schedule array is legitimate for a school that has published nothing, but
   * for a team we already hold games for it is an upstream blip: taking it at face value would
   * silently delete that team's non-league games.
   */
  it('treats an empty feed for a team we already have games for as a failure and carries its games', () => {
    const previousFile = corpusSnapshotPath('scval');
    const before = loadSnapshot(JSON.parse(readFileSync(previousFile, 'utf8')) as unknown);
    const cupertino = before.teams.find((t) => t.slug === 'cupertino')!;
    const mine = (s: Snapshot) =>
      s.games.filter((g) => g.home.teamId === cupertino.id || g.away.teamId === cupertino.id).map((g) => g.contestId).sort();
    expect(mine(before).length).toBeGreaterThan(0);

    const empty = writeTempVariant({
      'maxpreps/schedule/cupertino': {
        rel: 'maxpreps/schedule/cupertino.json',
        body: JSON.stringify({ status: 200, message: 'Success', data: [] }),
      },
    });
    const res = mustRun(
      runFixtureCli({ corpus: 'scval', variants: [empty], previous: previousFile, fetchedAt: '2026-09-29T16:00:00.000Z' }),
    );
    expect(res.output).toMatch(/WARN cupertino schedule failed: schedule feed returned 0 rows but the previous snapshot has \d+ games for this team/);

    const after = readSnapshot(res.out);
    expect(mine(after)).toEqual(mine(before));
    const row = after.sources.find((s) => s.kind === 'team-schedule' && s.scope?.team === 'cupertino');
    expect(row?.status).toBe('stale');
    expect(row?.error).toMatch(/carried forward from the previous snapshot/);
    const scval = after.leagueHealth.find((h) => h.leagueId === 'scval')!;
    expect(scval.state).toBe('partial');
    expect(scval.teamFeeds).toMatchObject({ total: 15, carried: 1, failed: 1 });
  });
});

describe('fetch-data: the previous snapshot', () => {
  it('reads a v1 previous through loadSnapshot and starts a run from it', () => {
    // A v1 previous snapshot (the Stage-0 golden, tests/golden/snapshot-2026-10-02.v1.json) is read
    // through loadSnapshot (migrated in memory); SCVAL's 09-29 feeds have fewer finals than that 10-02 copy.
    const res = runFixtureCli({
      corpus: 'scval',
      previous: path.join(REPO, 'tests', 'golden', 'snapshot-2026-10-02.v1.json'),
      extraArgs: ['--dry-run', '--leagues', 'scval'],
    });
    expect(res.output).not.toMatch(/previous snapshot .* could not be loaded/);
    // The previous run had more SCVAL finals: the regression guard sees them (frozen), and with
    // every league in the run frozen the run aborts — the systemic-outage rule, exit 1.
    expect(res.output).toMatch(/finals regression de-anza: /);
    expect(res.status).toBe(1);
    expect(res.output).toMatch(/ABORT \(previous snapshot kept\): systemic outage: every league in this run is frozen/);
  });
});
