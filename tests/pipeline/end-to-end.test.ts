/**
 * The end-to-end suite (SPEC §12.2 `tests/pipeline/*`): the variant overlays end to end through the
 * real cron script with the real official (steps/official.ts) and si.com (steps/sblive.ts) steps. Each variant names one defect;
 * the run must keep the other leagues fresh and never abort. Where a case needs "the last update",
 * it starts from the corpus's own snapshot (corpusSnapshotPath) copied to --out.
 *
 * Assertion messages name the module that produces the value, so a failure is routed to its owner.
 * The corpus's manifest names four leagues, so the EAL (added later) is frozen "not fetched in this
 * run" in every case here. The finals-regression previous snapshot is a four-league file (frozen): it
 * loads through loadSnapshot's league-added upgrade.
 */

import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadSnapshot, parseSnapshot } from '../../lib/snapshot-schema';
import type { Game, LeagueHealth, LeagueId, Snapshot } from '../../lib/types';
import { corpusSnapshotPath, runFixtureCli, type BuildOptions, type CliRun } from '../helpers';
import { REGRESSED_FINALS } from './support/finals-regression';

const CORPUS = 'all-2026-10-02' as const;

let corpusFile: string;
let corpus: Snapshot;

beforeAll(() => {
  corpusFile = corpusSnapshotPath(CORPUS);
  corpus = read(corpusFile);
});

function read(file: string): Snapshot {
  return loadSnapshot(JSON.parse(readFileSync(file, 'utf8')) as unknown);
}

function run(opts: BuildOptions): { cli: CliRun; snapshot: Snapshot } {
  const cli = runFixtureCli({ corpus: CORPUS, ...opts });
  if (cli.status !== 0) throw new Error(`scripts/fetch-data.ts exited ${cli.status}\n${cli.output}`);
  return { cli, snapshot: read(cli.out) };
}

function health(s: Snapshot, id: LeagueId): LeagueHealth {
  const h = s.leagueHealth.find((x) => x.leagueId === id);
  if (!h) throw new Error(`lib/pipeline/steps/standings.ts: no LeagueHealth row for ${id}`);
  return h;
}

function states(s: Snapshot): string[] {
  return s.leagueHealth.map((h) => `${h.leagueId}:${h.state}`);
}

/** Contest ids of the games whose two sides are both teams of `league`. */
function intraLeague(s: Snapshot, league: LeagueId): string[] {
  const ids = new Set(s.teams.filter((t) => t.league === league).map((t) => t.id));
  const both = (g: Game) => ids.has(g.home.teamId ?? '') && ids.has(g.away.teamId ?? '');
  return s.games.filter(both).map((g) => g.contestId).sort();
}

describe('corpusSnapshotPath (tests/helpers.ts)', () => {
  it('returns a parseable v2 snapshot in os.tmpdir(), with its meta file beside it', () => {
    expect(path.dirname(corpusFile), 'tests/helpers.ts: cache location').toBe(tmpdir());
    const parsed = parseSnapshot(JSON.parse(readFileSync(corpusFile, 'utf8')) as unknown);
    expect(parsed.schemaVersion, 'tests/helpers.ts: snapshot version').toBe(2);
    expect(parsed.fetchedAt, 'tests/helpers.ts: the corpus stamp').toBe('2026-10-02T15:00:00.000Z');
    expect(parsed.teams.length).toBe(49);
    const meta = JSON.parse(readFileSync(corpusFile.replace(/\.json$/, '.meta.json'), 'utf8')) as { fetchedAt: string };
    expect(meta.fetchedAt, 'tests/helpers.ts: meta beside the snapshot').toBe(parsed.fetchedAt);
  });

  it('a second call reuses the built file instead of running the pipeline again', () => {
    const before = statSync(corpusFile).mtimeMs;
    const t0 = performance.now();
    const again = corpusSnapshotPath(CORPUS);
    const elapsed = performance.now() - t0;
    expect(again, 'tests/helpers.ts: same path').toBe(corpusFile);
    expect(statSync(again).mtimeMs, 'tests/helpers.ts: not rebuilt').toBe(before);
    expect(elapsed, 'tests/helpers.ts: a cache hit does not shell out').toBeLessThan(500);
    // Different flags are a different cache entry.
    expect(corpusSnapshotPath(CORPUS, { extraArgs: ['--no-sblive'] }), 'tests/helpers.ts: keyed by flags').not.toBe(corpusFile);
  });
});

describe('the corpus run', () => {
  it('publishes the Del Norte ghost duplicate and 5cf5e3df in dropped', () => {
    const byId = new Map(corpus.dropped.map((d) => [d.contestId, d]));
    const ghost = byId.get('5b9ff911-a640-4947-b9fd-8a629e775b33');
    expect(ghost?.reason, 'lib/normalize.ts applyExclusions: Del Norte ghost').toBe('ghost-team');
    expect(ghost?.teams, 'lib/normalize.ts applyExclusions: Del Norte ghost teams').toEqual(['Tamalpais', 'Del Norte']);
    expect(byId.get('5cf5e3df-6e72-4f44-9b8d-e69da30b85c5')?.reason, 'lib/normalize.ts applyExclusions: 5cf5e3df').toBe('excluded-by-config');
    expect(corpus.games.some((g) => byId.has(g.contestId)), 'lib/pipeline/steps/normalize.ts: dropped contests never published').toBe(false);
  });

  it('every fetched league fresh, the EAL frozen (not fetched), no abort', () => {
    expect(states(corpus), 'lib/pipeline/steps/guards.ts').toEqual(['scval:fresh', 'bval:fresh', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
  });
});

describe('pcal-standings-empty: MaxPreps answers the PCAL table with zero rows', () => {
  it('with a previous copy: the run publishes, the table is carried, PCAL partial, the others fresh', () => {
    const { snapshot } = run({ variants: ['pcal-standings-empty'], previous: corpusFile });
    expect(states(snapshot), 'lib/pipeline/steps/reported.ts').toEqual(['scval:fresh', 'bval:fresh', 'pcal:partial', 'mcal:fresh', 'eal:frozen']);
    const pcal = health(snapshot, 'pcal');
    expect(pcal.divisions[0].reportedTable, 'lib/pipeline/steps/reported.ts: reportedTable').toBe('carried');
    expect(pcal.reasons, 'lib/pipeline/steps/reported.ts: reason').toEqual([
      "MaxPreps' PCAL table could not be read this run; the cross-check uses the copy from Fri Oct 2. Scores and our computed table are current.",
    ]);
    const row = snapshot.sources.find((s) => s.kind === 'reported-standings' && s.scope?.division === 'pcal');
    expect(row?.status, 'lib/pipeline/steps/reported.ts: source row').toBe('stale');
    expect(row?.carriedFrom, 'lib/pipeline/steps/reported.ts: carriedFrom').toBe(corpus.fetchedAt);
    // Scores and the computed table stay current; the carried reported rows feed the cross-check.
    const pcalRows = (s: Snapshot) => s.standings.filter((r) => r.division === 'pcal');
    expect(pcalRows(snapshot).map((r) => r.computed), 'lib/standings.ts: PCAL computed rows').toEqual(pcalRows(corpus).map((r) => r.computed));
    expect(pcalRows(snapshot).map((r) => r.reported), 'lib/pipeline/steps/reported.ts: carried reported rows').toEqual(
      pcalRows(corpus).map((r) => r.reported),
    );
  });

  it('with no previous copy: still publishes; reportedTable missing', () => {
    const { snapshot } = run({ variants: ['pcal-standings-empty'] });
    expect(health(snapshot, 'pcal').state, 'lib/pipeline/steps/reported.ts').toBe('partial');
    expect(health(snapshot, 'pcal').divisions[0].reportedTable, 'lib/pipeline/steps/reported.ts').toBe('missing');
    expect(snapshot.standings.filter((r) => r.division === 'pcal').every((r) => r.reported === null), 'lib/pipeline/steps/reported.ts').toBe(
      true,
    );
  });
});

describe('bval-meta-wrong-season: the Santa Teresa meta names the 2025-26 season', () => {
  it('no previous data: BVAL frozen with no league games; SCVAL, PCAL, MCAL fresh', () => {
    const { snapshot } = run({ variants: ['bval-meta-wrong-season'] });
    expect(states(snapshot), 'lib/pipeline/steps/league-meta.ts').toEqual(['scval:fresh', 'bval:frozen', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
    const bval = health(snapshot, 'bval');
    expect(bval.reasons, 'lib/pipeline/steps/league-meta.ts: reason').toEqual([
      'MaxPreps moved the Santa Teresa table to another season this run, so BVAL has no results to show until it is fixed.',
    ]);
    expect(bval.lastFreshAt, 'lib/pipeline/steps/standings.ts: lastFreshAt').toBeNull();
    expect(intraLeague(snapshot, 'bval'), 'lib/pipeline/steps/guards.ts: BVAL league games').toEqual([]);
    expect(snapshot.counts.byLeague.bval.leagueGames, 'lib/pipeline/steps/assemble.ts').toBe(0);
    // The other leagues publish exactly what the clean corpus run publishes.
    for (const id of ['scval', 'pcal', 'mcal'] as const) {
      expect(intraLeague(snapshot, id), `lib/pipeline/steps/guards.ts: ${id} untouched`).toEqual(intraLeague(corpus, id));
    }
  });

  it('with previous data: BVAL frozen at the last update, its league games carried', () => {
    const { snapshot } = run({ variants: ['bval-meta-wrong-season'], previous: corpusFile });
    const bval = health(snapshot, 'bval');
    expect(bval.state, 'lib/pipeline/steps/league-meta.ts').toBe('frozen');
    expect(bval.reasons, 'lib/pipeline/steps/league-meta.ts: reason').toEqual([
      'MaxPreps moved the Santa Teresa table to another season this run, so BVAL is shown as of Fri Oct 2, 8:00 AM.',
    ]);
    expect(bval.lastFreshAt, 'lib/pipeline/steps/standings.ts: lastFreshAt').toBe(corpus.fetchedAt);
    expect(intraLeague(snapshot, 'bval'), 'lib/pipeline/steps/guards.ts: BVAL carried games').toEqual(intraLeague(corpus, 'bval'));
    expect(states(snapshot).filter((s) => !s.startsWith('bval')), 'lib/pipeline/steps/guards.ts').toEqual([
      'scval:fresh',
      'pcal:fresh',
      'mcal:fresh',
      'eal:frozen',
    ]);
  });
});

describe('leland-feed-503: MaxPreps answers Leland’s schedule with HTTP 503', () => {
  it('carries Leland’s games from the previous snapshot; BVAL partial; the others fresh', () => {
    const { snapshot, cli } = run({ variants: ['leland-feed-503'], previous: corpusFile });
    expect(cli.output, 'lib/pipeline/steps/schedules.ts: warning').toMatch(/WARN leland schedule failed: HTTP 503/);
    expect(states(snapshot), 'lib/pipeline/steps/schedules.ts').toEqual(['scval:fresh', 'bval:partial', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
    const bval = health(snapshot, 'bval');
    expect(bval.teamFeeds, 'lib/pipeline/steps/schedules.ts: teamFeeds').toEqual({ total: 12, ok: 11, carried: 1, failed: 1 });
    expect(bval.reasons, 'lib/pipeline/steps/schedules.ts: reason').toEqual([
      "MaxPreps did not answer for Leland's schedule this run; its games are carried from Fri Oct 2, 8:00 AM.",
    ]);
    const row = snapshot.sources.find((s) => s.kind === 'team-schedule' && s.scope?.team === 'leland');
    expect(row?.status, 'lib/pipeline/steps/schedules.ts: source row').toBe('stale');
    expect(row?.httpStatus, 'lib/pipeline/steps/schedules.ts: source row').toBe(503);
    const leland = snapshot.teams.find((t) => t.slug === 'leland')!;
    const lelandGames = (s: Snapshot) =>
      s.games.filter((g) => g.home.teamId === leland.id || g.away.teamId === leland.id).map((g) => g.contestId).sort();
    expect(lelandGames(snapshot).length, 'lib/pipeline/steps/schedules.ts: Leland games').toBeGreaterThan(0);
    expect(lelandGames(snapshot), 'lib/pipeline/steps/schedules.ts: Leland games carried').toEqual(lelandGames(corpus));
  });
});

describe('finals-regression: the previous snapshot had three more Santa Teresa finals', () => {
  it('freezes BVAL at the previous update, naming each vanished contest; the others fresh', () => {
    const { snapshot, cli } = run({ variants: ['finals-regression'] });
    for (const id of Object.keys(REGRESSED_FINALS)) {
      expect(cli.output, `lib/pipeline/steps/guards.ts: warning names ${id}`).toContain(`finals regression santa-teresa: ${id}`);
    }
    expect(states(snapshot), 'lib/pipeline/steps/guards.ts').toEqual(['scval:fresh', 'bval:frozen', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
    const bval = health(snapshot, 'bval');
    expect(bval.reasons, 'lib/pipeline/steps/guards.ts: reason').toEqual([
      '3 BVAL results that were final in the last update are missing from MaxPreps now, so BVAL is shown as of Thu Oct 1, 8:00 PM until someone checks.',
    ]);
    expect(bval.lastFreshAt, 'lib/pipeline/steps/standings.ts: lastFreshAt').toBe('2026-10-02T03:00:00.000Z');
    for (const id of Object.keys(REGRESSED_FINALS)) {
      const g = snapshot.games.find((x) => x.contestId === id);
      expect(g?.status, `lib/pipeline/steps/guards.ts: ${id} carried as final`).toBe('final');
      expect(g?.countsFor, `lib/pipeline/steps/guards.ts: ${id} counted`).toBe('santa-teresa');
    }
  });

  it('--accept-regression bval publishes the fresh rows', () => {
    const { snapshot, cli } = run({ variants: ['finals-regression'], extraArgs: ['--accept-regression', 'bval'] });
    expect(cli.output, 'lib/pipeline/steps/guards.ts').toMatch(/finals regression accepted for BVAL santa-teresa/);
    expect(states(snapshot), 'lib/pipeline/steps/guards.ts').toEqual(['scval:fresh', 'bval:fresh', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
    const st = health(snapshot, 'bval').divisions.find((d) => d.divisionId === 'santa-teresa');
    expect(st?.countedFinals, 'lib/pipeline/steps/standings.ts: countedFinals').toBe(5);
    expect(st?.previousCountedFinals, 'lib/pipeline/steps/standings.ts: previousCountedFinals').toBe(8);
    for (const id of Object.keys(REGRESSED_FINALS)) {
      expect(snapshot.games.find((x) => x.contestId === id)?.status, `lib/pipeline/steps/guards.ts: ${id} fresh`).not.toBe('final');
    }
  });
});

describe('mcal-postseason: tournament games after Oct 22 and a league game MaxPreps moved to Oct 23', () => {
  const MOVED = 'dad1ea0d-8dd3-4c55-ba33-368d449b9de6';
  const FIXTURE = 'marin-county:2026-10-22:university-sf@redwood';

  function mcalSbliveGames(s: Snapshot): string[] {
    const mcal = new Set(s.teams.filter((t) => t.league === 'mcal').map((t) => t.id));
    return s.games
      .filter((g) => g.contestId.startsWith('sblive:') && (mcal.has(g.home.teamId ?? '') || mcal.has(g.away.teamId ?? '')))
      .map((g) => g.contestId);
  }

  function universityRedwood(s: Snapshot): Game[] {
    const slugs = new Set(['university-sf', 'redwood']);
    return s.games.filter(
      (g) => slugs.has(g.home.slug ?? '') && slugs.has(g.away.slug ?? '') && g.dateKey >= '2026-10-15' && g.dateKey <= '2026-10-29',
    );
  }

  it('on the corpus date: no si.com MCAL game; the late games are tournament play; the moved game is reported once', () => {
    const { snapshot } = run({ variants: ['mcal-postseason'] });
    expect(mcalSbliveGames(snapshot), 'lib/backfill.ts: MCAL sblive: games').toEqual([]);
    // The only si.com games anywhere are the two accepted PCAL fills (§7.9).
    expect(snapshot.games.filter((g) => g.contestId.startsWith('sblive:')).map((g) => g.contestId).sort(), 'lib/backfill.ts').toEqual([
      'sblive:6541425',
      'sblive:6543072',
    ]);
    const moved = universityRedwood(snapshot);
    expect(moved.map((g) => `${g.contestId} ${g.dateKey} ${g.postseason?.kind} ${g.countsFor}`), 'lib/classify.ts: moved game').toEqual([
      `${MOVED} 2026-10-23 mcal-tournament null`,
    ]);
    expect(
      (snapshot.officialFixtures ?? []).filter((f) => f.division === 'marin-county').map((f) => f.id),
      'lib/official/match.ts: the Oct 22 fixture stays unmatched',
    ).toEqual([FIXTURE]);
    const mcal = health(snapshot, 'mcal');
    expect(mcal.state, 'lib/official/match.ts: MCAL late-game warning').toBe('partial');
    expect(mcal.reasons, 'lib/official/match.ts: MCAL late-game warning').toEqual([
      "An MCAL contest between San Francisco University and Redwood on Fri Oct 23 is after the league's Oct 22 cut-off, so it is treated as tournament play. If it is the rescheduled league game from Thu Oct 22, add its contest id to LEAGUES.mcal.rules.leagueGameOverrides.",
    ]);
    expect(states(snapshot).filter((s) => !s.startsWith('mcal')), 'lib/pipeline/steps/guards.ts').toEqual([
      'scval:fresh',
      'bval:fresh',
      'pcal:fresh',
      'eal:frozen',
    ]);
  });

  it('after Oct 22, with si.com carrying the moved game as a Final: still no fill (MaxPreps has the contest)', () => {
    const { snapshot } = run({ variants: ['mcal-postseason'], fetchedAt: '2026-10-24T15:00:00.000Z' });
    expect(mcalSbliveGames(snapshot), 'lib/backfill.ts: D2 rule 2 never fills when a MaxPreps contest of the pair exists').toEqual([]);
    expect(universityRedwood(snapshot).map((g) => g.contestId), 'lib/backfill.ts: not duplicated').toEqual([MOVED]);
    const read = snapshot.sources.find((s) => s.kind === 'sblive-scoreboard' && s.url.endsWith('date=2026-10-23'));
    expect(read?.status, 'lib/pipeline/steps/sblive.ts: the Oct 23 scoreboard was read').toBe('ok');
    const row = snapshot.sbliveCrossCheck?.sbliveOnlyScored.find((r) => r.contestId === MOVED);
    expect(row?.note, 'lib/backfill.ts: the "MaxPreps has this game" row').toMatch(
      new RegExp(`^MaxPreps has this game \\(${MOVED}\\) but it is not counted: `),
    );
    expect(
      (snapshot.sbliveCrossCheck?.backfilled ?? []).filter((b) => b.dateKey >= '2026-10-15'),
      'lib/backfill.ts: no late fill',
    ).toEqual([]);
  });
});

describe('bval-revised: BVAL revised the Mt. Hamilton schedule after our copy', () => {
  it('keeps the bundled fixtures, marks the check stale and BVAL partial', () => {
    const { snapshot } = run({ variants: ['bval-revised'] });
    expect(states(snapshot), 'lib/pipeline/steps/official.ts').toEqual(['scval:fresh', 'bval:partial', 'pcal:fresh', 'mcal:fresh', 'eal:frozen']);
    const bval = health(snapshot, 'bval');
    expect(bval.reasons, 'lib/pipeline/steps/official.ts: reason').toEqual([
      'BVAL revised the Mt. Hamilton schedule after our copy (revised 9/20/26); official dates may be out of date.',
    ]);
    expect(
      bval.divisions.map((d) => `${d.divisionId} revised ${d.official?.revisedUpstream} matched ${d.official?.matched}`),
      'lib/pipeline/steps/official.ts: DivisionHealth.official',
    ).toEqual(['mt-hamilton revised true matched 30', 'santa-teresa revised false matched 30']);
    expect(intraLeague(snapshot, 'bval'), 'lib/official/match.ts: same BVAL games').toEqual(intraLeague(corpus, 'bval'));
  });
});
