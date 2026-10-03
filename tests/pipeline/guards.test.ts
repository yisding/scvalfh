/**
 * Abort and freeze scopes (SPEC §7.5) through the real step sequence with no-op (or stand-in)
 * official/si.com steps: one case per league-freeze trigger with and without previous data
 * (a wrong-season meta, ≥50% failed feeds, finals regression, not in the run), the systemic
 * run-abort thresholds, and the frozen league's re-classification with its previous degraded set.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { classifyGame } from '../../lib/classify';
import { divisionsOf } from '../../lib/leagues';
import { RunAbort, type OfficialStep } from '../../lib/pipeline/contract';
import { PipelineContext, SILENT_SINK, emptyRunState, type RunState, type TeamFeedInfo } from '../../lib/pipeline/ledger';
import {
  FINALS_REGRESSION_FREEZE,
  SYSTEMIC_FAILED_FEEDS_SHARE,
  SYSTEMIC_MIN_GAMES_SHARE,
  checkSystemic,
} from '../../lib/pipeline/steps/guards';
import { loadSnapshot } from '../../lib/snapshot-schema';
import { divisionGames } from '../../lib/standings';
import { teamsInLeague } from '../../lib/teams';
import type { Game, LeagueId, Snapshot } from '../../lib/types';
import { variantDir } from '../helpers';
import { REGRESSED_FINALS } from './support/finals-regression';
import { naiveBvalOfficial, noopSblive } from './support/noop-steps';
import { runCorpus, snapshotOf, writeTempVariant } from './support/run-corpus';

const EARLIER = '2026-10-02T03:00:00.000Z'; // Thu Oct 1, 8:00 PM Pacific
const NAIVE = { official: naiveBvalOfficial, sblive: noopSblive };

function intraGames(snapshot: Snapshot, leagueId: LeagueId): Game[] {
  const members = new Set(teamsInLeague(leagueId).map((t) => t.id));
  return snapshot.games.filter((g) => g.home.teamId !== null && g.away.teamId !== null && members.has(g.home.teamId) && members.has(g.away.teamId));
}
const ids = (games: readonly Game[]) => games.map((g) => g.contestId).sort();
const health = (s: Snapshot, id: LeagueId) => s.leagueHealth.find((h) => h.leagueId === id);

/** 4 of the 7 PCAL feeds answer 503. */
const PCAL_FEEDS_DOWN = writeTempVariant(
  Object.fromEntries(['carmel', 'greenfield', 'hollister', 'monterey'].map((slug) => [`maxpreps/schedule/${slug}`, 503])),
);

let previousAll: Snapshot; // all corpus, no-op steps, earlier stamp
let previousNaive: Snapshot; // all corpus, BVAL counted by the stand-in official step

beforeAll(async () => {
  previousAll = (await snapshotOf({ fetchedAt: EARLIER })).snapshot;
  previousNaive = (await snapshotOf({ fetchedAt: EARLIER, steps: NAIVE })).snapshot;
});

describe('trigger d: the league is not in args.leagues', () => {
  it('no previous data: frozen, no games, "<SHORT> was not fetched in this run."', async () => {
    const { snapshot } = await snapshotOf({ corpus: 'scval' });
    expect(snapshot.teams.length).toBe(43);
    expect(health(snapshot, 'scval')?.state).toBe('fresh');
    for (const [id, short] of [['bval', 'BVAL'], ['pcal', 'PCAL'], ['mcal', 'MCAL']] as const) {
      const h = health(snapshot, id);
      expect(h?.state, id).toBe('frozen');
      expect(h?.reasons, id).toEqual([`${short} was not fetched in this run.`]);
      expect(h?.lastFreshAt, id).toBeNull();
      expect(intraGames(snapshot, id), id).toEqual([]);
      expect(h?.divisions.every((d) => d.meta === 'skipped' && d.reportedTable === 'skipped'), id).toBe(true);
    }
  });

  it('with previous data: frozen, its league games and non-league games carried, shown as of the last fresh run', async () => {
    const { snapshot, run } = await snapshotOf({ previous: previousAll, extraArgs: ['--leagues', 'bval,pcal,mcal'] });
    const h = health(snapshot, 'scval');
    expect(h?.state).toBe('frozen');
    expect(h?.reasons).toEqual(['SCVAL was not fetched in this run, so it is shown as of Thu Oct 1, 8:00 PM.']);
    expect(h?.lastFreshAt).toBe(EARLIER);
    expect(ids(intraGames(snapshot, 'scval'))).toEqual(ids(intraGames(previousAll, 'scval')));
    // Every previous game with a SCVAL side is still published (its feeds were not read).
    const published = new Set(snapshot.games.map((g) => g.contestId));
    const scvalIds = new Set(teamsInLeague('scval').map((t) => t.id));
    for (const g of previousAll.games) {
      if ((g.home.teamId && scvalIds.has(g.home.teamId)) || (g.away.teamId && scvalIds.has(g.away.teamId))) {
        expect(published.has(g.contestId), g.contestId).toBe(true);
      }
    }
    expect(snapshot.standings.filter((s) => s.division === 'de-anza')).toEqual(previousAll.standings.filter((s) => s.division === 'de-anza'));
    for (const id of ['bval', 'pcal', 'mcal']) expect(health(snapshot, id)?.state, id).toBe('fresh');
    // 1 bootstrap + BVAL 2+2+12 + PCAL 1+1+7 + MCAL 1+1+9 = 37 MaxPreps requests.
    expect(run.result?.logLines.filter((l) => l.startsWith('maxpreps GET ')).length).toBe(37);
  });
});

describe('trigger a: a division meta with the wrong season', () => {
  it('no previous data: frozen, no BVAL league games, rows of the mismatched season never published', async () => {
    const { snapshot } = await snapshotOf({ variants: ['bval-meta-wrong-season'] });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('frozen');
    expect(h?.reasons).toEqual([
      'MaxPreps moved the Santa Teresa table to another season this run, so BVAL has no results to show until it is fixed.',
    ]);
    expect(h?.divisions.map((d) => [d.divisionId, d.meta, d.reportedTable])).toEqual([
      ['mt-hamilton', 'ok', 'missing'],
      ['santa-teresa', 'mismatch', 'missing'],
    ]);
    expect(intraGames(snapshot, 'bval')).toEqual([]);
    expect(snapshot.standings.filter((s) => s.division === 'santa-teresa').every((s) => s.reported === null)).toBe(true);
    for (const id of ['scval', 'pcal', 'mcal']) expect(health(snapshot, id)?.state, id).toBe('fresh');
  });

  it('with previous data: frozen, BVAL league games and table from the previous snapshot', async () => {
    const { snapshot } = await snapshotOf({ variants: ['bval-meta-wrong-season'], previous: previousNaive, steps: NAIVE });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('frozen');
    expect(h?.reasons).toEqual([
      'MaxPreps moved the Santa Teresa table to another season this run, so BVAL is shown as of Thu Oct 1, 8:00 PM.',
    ]);
    expect(h?.lastFreshAt).toBe(EARLIER);
    expect(ids(intraGames(snapshot, 'bval'))).toEqual(ids(intraGames(previousNaive, 'bval')));
    for (const d of divisionsOf('bval')) {
      expect(divisionGames(snapshot.games, d.id).length).toBeGreaterThan(0);
      expect(snapshot.standings.filter((s) => s.division === d.id).map((s) => [s.slug, s.computed])).toEqual(
        previousNaive.standings.filter((s) => s.division === d.id).map((s) => [s.slug, s.computed]),
      );
    }
    expect(h?.divisions.every((d) => d.reportedTable === 'carried')).toBe(true);
  });
});

describe('trigger b: ≥50% of a league’s team feeds failed', () => {
  it('no previous data: degraded, the fresh rows published', async () => {
    const { snapshot } = await snapshotOf({ variants: [PCAL_FEEDS_DOWN] });
    const h = health(snapshot, 'pcal');
    expect(h?.state).toBe('degraded');
    expect(h?.reasons).toContain('MaxPreps did not answer for 4 of 7 PCAL team schedules this run; PCAL is shown from the schedules that did answer.');
    expect(h?.teamFeeds).toEqual({ total: 7, ok: 3, carried: 0, failed: 4 });
    // Games between a failed team and an answering one still come from the answering feed.
    expect(intraGames(snapshot, 'pcal').length).toBeGreaterThan(0);
    const carmel = snapshot.sources.find((s) => s.label === 'carmel schedule');
    expect(carmel).toMatchObject({ status: 'error', httpStatus: 503 });
  });

  it('with previous data: frozen, PCAL league games from the previous snapshot', async () => {
    const { snapshot } = await snapshotOf({ variants: [PCAL_FEEDS_DOWN], previous: previousAll });
    const h = health(snapshot, 'pcal');
    expect(h?.state).toBe('frozen');
    expect(h?.reasons).toContain('MaxPreps did not answer for 4 of 7 PCAL team schedules this run, so PCAL is shown as of Thu Oct 1, 8:00 PM.');
    expect(ids(intraGames(snapshot, 'pcal'))).toEqual(ids(intraGames(previousAll, 'pcal')));
    expect(h?.teamFeeds.carried).toBe(4);
    expect(snapshot.sources.find((s) => s.label === 'carmel schedule')).toMatchObject({ status: 'stale', carriedFrom: EARLIER });
  });

  it('one failed feed: that team’s games carried, the league partial', async () => {
    const { snapshot } = await snapshotOf({ variants: ['leland-feed-503'], previous: previousAll });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('partial');
    expect(h?.reasons).toEqual(["MaxPreps did not answer for Leland's schedule this run; its games are carried from Thu Oct 1, 8:00 PM."]);
    expect(h?.teamFeeds).toEqual({ total: 12, ok: 11, carried: 1, failed: 1 });
    const leland = teamsInLeague('bval').find((t) => t.slug === 'leland')?.id;
    const had = previousAll.games.filter((g) => g.home.teamId === leland || g.away.teamId === leland);
    const has = snapshot.games.filter((g) => g.home.teamId === leland || g.away.teamId === leland);
    expect(ids(has)).toEqual(ids(had));
  });
});

describe('trigger c: finals regression', () => {
  const previousFile = path.join(variantDir('finals-regression'), 'previous-snapshot.json');
  let regressed: Snapshot;
  beforeAll(() => {
    regressed = loadSnapshot(JSON.parse(readFileSync(previousFile, 'utf8')) as unknown);
  });

  it(`with previous data: a division ${FINALS_REGRESSION_FREEZE}+ finals down freezes the league`, async () => {
    const { snapshot, run } = await snapshotOf({ variants: ['finals-regression'], previous: regressed, steps: NAIVE });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('frozen');
    expect(h?.reasons).toEqual([
      '3 BVAL results that were final in the last update are missing from MaxPreps now, so BVAL is shown as of Thu Oct 1, 8:00 PM until someone checks.',
    ]);
    for (const id of Object.keys(REGRESSED_FINALS)) {
      expect(snapshot.games.find((g) => g.contestId === id)?.status, id).toBe('final');
      expect(run.result?.logLines.some((l) => l.startsWith('WARN finals regression santa-teresa: ') && l.includes(id)), id).toBe(true);
    }
    expect(run.result?.meta.commitSummary).toMatch(/BVAL frozen \(finals regression\)/);
  });

  it('--accept-regression bval publishes the fresh rows', async () => {
    const { snapshot } = await snapshotOf({ variants: ['finals-regression'], previous: regressed, steps: NAIVE, extraArgs: ['--accept-regression', 'bval'] });
    expect(health(snapshot, 'bval')?.state).toBe('fresh');
    for (const id of Object.keys(REGRESSED_FINALS)) expect(snapshot.games.find((g) => g.contestId === id)?.status, id).not.toBe('final');
  });

  it('no previous data: degraded, the fresh rows published', async () => {
    const noData: Snapshot = {
      ...regressed,
      leagueHealth: regressed.leagueHealth.map((h) => (h.leagueId === 'bval' ? { ...h, lastFreshAt: null } : h)),
    };
    const { snapshot } = await snapshotOf({ previous: noData, steps: NAIVE });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('degraded');
    expect(h?.reasons).toEqual([
      '3 BVAL results that were final in the last update are missing from MaxPreps now; BVAL is shown without them until someone checks.',
    ]);
    for (const id of Object.keys(REGRESSED_FINALS)) expect(snapshot.games.find((g) => g.contestId === id)?.status, id).not.toBe('final');
  });

  it('1-2 finals down publish, named in the reasons, league partial', async () => {
    const st = previousNaive.leagueHealth.find((h) => h.leagueId === 'bval');
    const twoMore: Snapshot = {
      ...previousNaive,
      leagueHealth: previousNaive.leagueHealth.map((h) =>
        h === st
          ? { ...h, divisions: h.divisions.map((d) => (d.divisionId === 'santa-teresa' ? { ...d, countedFinals: d.countedFinals + 2 } : d)) }
          : h,
      ),
    };
    const { snapshot } = await snapshotOf({ previous: twoMore, steps: NAIVE });
    const h = health(snapshot, 'bval');
    expect(h?.state).toBe('partial');
    expect(h?.reasons).toEqual(['2 BVAL results that were final in the last update are missing from MaxPreps now; the table is computed without them.']);
  });
});

describe('frozen-league re-classification', () => {
  /** Mt. Hamilton's official file "failed validation" in the previous run: classified by contest-type. */
  const mhDegraded: OfficialStep = async (ctx, games) => ({ ...(await naiveBvalOfficial(ctx, games)), degradedDivisions: new Set(['mt-hamilton']) });

  it('substituted games are classified with THAT league’s previous degraded set and its classification copied', async () => {
    const previous = (await snapshotOf({ fetchedAt: EARLIER, steps: { official: mhDegraded, sblive: noopSblive } })).snapshot;
    expect(health(previous, 'bval')?.divisions.map((d) => d.classification)).toEqual(['fallback-contest-type', 'official-fixtures']);

    // This run's official step degrades nothing, and BVAL freezes: the copied classification must hold.
    const { snapshot } = await snapshotOf({ variants: ['bval-meta-wrong-season'], previous, steps: NAIVE });
    expect(health(snapshot, 'bval')?.state).toBe('frozen');
    expect(health(snapshot, 'bval')?.divisions.map((d) => d.classification)).toEqual(['fallback-contest-type', 'official-fixtures']);
    const degraded = new Set(['mt-hamilton']);
    for (const g of intraGames(snapshot, 'bval')) expect(g.countsFor, g.contestId).toBe(classifyGame(g, { degradedDivisions: degraded }));
    expect(divisionGames(snapshot.games, 'mt-hamilton').length).toBe(divisionGames(previous.games, 'mt-hamilton').length);
  });
});

describe('systemic run abort', () => {
  function ctxWith(previousGames: number, leagues: LeagueId[] | null = null): PipelineContext {
    const previous = previousGames > 0 ? ({ games: new Array(previousGames).fill({}), leagueHealth: [] } as unknown as Snapshot) : null;
    return new PipelineContext({
      args: {
        fixtures: null, variants: [], capture: null, out: '/dev/null', dryRun: true, fetchedAt: '2026-10-02T15:00:00.000Z',
        force: false, leagues, acceptRegression: [], sblive: true, sbliveFull: false, official: true, ccs: true, vnn: true,
      },
      transport: { mode: 'fixture', get: async () => ({ url: '', httpStatus: 200, body: '' }) },
      previous,
      sink: SILENT_SINK,
    });
  }
  function stateWith(games: number, feeds: { ok: number; failed: number; skipped?: number }): RunState {
    const state = emptyRunState();
    state.games = new Array(games).fill({}) as Game[];
    const add = (n: number, status: TeamFeedInfo['status']) => {
      for (let i = 0; i < n; i += 1) {
        const slug = `${status}-${i}`;
        state.feeds.set(slug, { slug, teamId: slug, league: 'scval', status, carried: false });
      }
    };
    add(feeds.ok, 'ok');
    add(feeds.failed, 'failed');
    add(feeds.skipped ?? 0, 'skipped');
    return state;
  }

  it(`aborts when published games fall below ${SYSTEMIC_MIN_GAMES_SHARE * 100}% of the previous snapshot's`, () => {
    expect(() => checkSystemic(ctxWith(100), stateWith(79, { ok: 10, failed: 0 }))).toThrow(RunAbort);
    expect(() => checkSystemic(ctxWith(100), stateWith(79, { ok: 10, failed: 0 }))).toThrow(/79 games would be published against 100/);
    expect(() => checkSystemic(ctxWith(100), stateWith(80, { ok: 10, failed: 0 }))).not.toThrow();
    expect(() => checkSystemic(ctxWith(0), stateWith(0, { ok: 10, failed: 0 }))).not.toThrow();
  });

  it(`aborts when ≥${SYSTEMIC_FAILED_FEEDS_SHARE * 100}% of the feeds attempted this run failed (skipped feeds are not attempts)`, () => {
    expect(() => checkSystemic(ctxWith(0), stateWith(10, { ok: 4, failed: 6 }))).toThrow(/6 of 10 team schedule feeds failed/);
    expect(() => checkSystemic(ctxWith(0), stateWith(10, { ok: 5, failed: 5, skipped: 30 }))).not.toThrow();
  });

  it('aborts when every league in the run ended frozen', () => {
    const ctx = ctxWith(0, ['bval']);
    ctx.leagues.degrade('bval', 'frozen', 'x');
    expect(() => checkSystemic(ctx, stateWith(10, { ok: 10, failed: 0 }))).toThrow(/every league in this run is frozen \(bval\)/);
    const all = ctxWith(0);
    all.leagues.degrade('bval', 'frozen', 'x');
    expect(() => checkSystemic(all, stateWith(10, { ok: 10, failed: 0 }))).not.toThrow();
  });

  it('end to end: 26 of 43 feeds down aborts the run; 25 does not', async () => {
    const slugs = teamsInLeague('scval').map((t) => t.slug).concat(teamsInLeague('bval').map((t) => t.slug));
    const down = (n: number) => writeTempVariant(Object.fromEntries(slugs.slice(0, n).map((s) => [`maxpreps/schedule/${s}`, 503])));
    await expect(runCorpus({ variants: [down(26)] })).rejects.toThrow(/systemic outage: 26 of 43 team schedule feeds failed/);
    await expect(runCorpus({ variants: [down(25)] })).resolves.toBeTruthy();
  });

  it('end to end: the only league in the run frozen aborts the run', async () => {
    await expect(runCorpus({ variants: ['bval-meta-wrong-season'], extraArgs: ['--leagues', 'bval'] })).rejects.toThrow(
      /every league in this run is frozen/,
    );
  });
});
