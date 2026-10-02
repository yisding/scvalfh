/**
 * Step 11 (SPEC §7.4, §7.5, §7.10): league freeze guards and the systemic run abort.
 *
 *  (d) a league not in `args.leagues` is frozen before anything is fetched (markLeaguesNotInRun);
 *  (a) a mismatched division meta and (b) ≥50% failed team feeds were recorded by steps 03 and 05;
 *  (c) finals regression, here: counted finals in a division dropped by ≥3 against
 *      `previous.leagueHealth` → frozen (1-2 → published, each vanished contestId named in a warning
 *      and in the reasons), unless the league is in `--accept-regression`.
 *
 * A frozen league WITH previous data gets its intra-league games (both sides in the league) and its
 * unmatched official fixtures from the previous snapshot — the games re-run through classifyGames
 * with THAT league's previous degraded set, and its DivisionHealth.classification copied from the
 * previous health, so the snapshot's countsFor refinement holds per league. With NO previous data:
 * (a)/(d) publish no intra-league games for it; (b)/(c) were recorded as 'degraded' instead and
 * publish the fresh rows.
 *
 * Systemic outage (run abort, nothing written): published games < 80% of the previous snapshot's,
 * OR ≥60% of the feeds attempted this run failed, OR every league in the run ended frozen.
 */

import { classifyGames } from '../../classify';
import { LEAGUES, getLeague } from '../../leagues';
import { divisionGames } from '../../standings';
import { teamsInLeague } from '../../teams';
import type { DivisionHealth, DivisionId, Game, LeagueId } from '../../types';
import { RunAbort } from '../contract';
import {
  asOfStamp,
  hasPreviousData,
  previousDivisionHealth,
  previousLeagueHealth,
  type PipelineContext,
  type RunState,
} from '../ledger';
import { byDateThenId } from './normalize';

/** §7.5 (c): a division whose counted finals dropped by this many freezes its league. */
export const FINALS_REGRESSION_FREEZE = 3;
/** §7.5 (4): published games below this share of the previous snapshot's abort the run. */
export const SYSTEMIC_MIN_GAMES_SHARE = 0.8;
/** §7.5 (4): this share (or more) of the feeds attempted this run failing aborts the run. */
export const SYSTEMIC_FAILED_FEEDS_SHARE = 0.6;

/** §7.5 trigger d. */
export function notInRunReason(previous: PipelineContext['previous'], leagueId: LeagueId): string {
  const short = getLeague(leagueId).shortName;
  const lastFresh = previousLeagueHealth(previous, leagueId)?.lastFreshAt ?? null;
  return hasPreviousData(previous, leagueId) && lastFresh
    ? `${short} was not fetched in this run, so it is shown as of ${asOfStamp(lastFresh)}.`
    : `${short} was not fetched in this run.`;
}

/** Freeze every configured league that is not in this run (§7.5 trigger d). */
export function markLeaguesNotInRun(ctx: PipelineContext): void {
  const inRun = new Set(ctx.leaguesInRun());
  for (const league of LEAGUES) {
    if (inRun.has(league.id)) continue;
    ctx.leagues.degrade(league.id, 'frozen', notInRunReason(ctx.previous, league.id), 'not fetched');
  }
}

/** §7.5 trigger c reason (n ≥ 3). */
export function finalsRegressionReason(previous: PipelineContext['previous'], leagueId: LeagueId, n: number): string {
  const short = getLeague(leagueId).shortName;
  const head = `${n} ${short} ${n === 1 ? 'result that was' : 'results that were'} final in the last update ${n === 1 ? 'is' : 'are'} missing from MaxPreps now`;
  const lastFresh = previousLeagueHealth(previous, leagueId)?.lastFreshAt ?? null;
  return hasPreviousData(previous, leagueId) && lastFresh
    ? `${head}, so ${short} is shown as of ${asOfStamp(lastFresh)} until someone checks.`
    : `${head}; ${short} is shown without ${n === 1 ? 'it' : 'them'} until someone checks.`;
}

function vanishedFinals(ctx: PipelineContext, games: readonly Game[], division: DivisionId): Game[] {
  const now = new Set(divisionGames(games, division).map((g) => g.contestId));
  return (ctx.previous?.games ?? []).filter(
    (g) => g.countsFor === division && g.status === 'final' && !now.has(g.contestId),
  );
}

function describe(g: Game): string {
  return `${g.contestId} (${g.dateKey} ${g.away.name} at ${g.home.name})`;
}

/** §7.5 trigger c, per league in the run that is not already frozen. */
export function checkFinalsRegression(ctx: PipelineContext, state: RunState): void {
  for (const leagueId of ctx.leaguesInRun()) {
    if (ctx.leagues.state(leagueId) === 'frozen') continue;
    const league = getLeague(leagueId);
    const accepted = ctx.args.acceptRegression.includes(leagueId);
    let freezeDrop = 0;
    let smallDrop = 0;
    const smallIds: string[] = [];
    for (const division of league.divisions) {
      const prev = previousDivisionHealth(ctx.previous, division.id)?.countedFinals;
      if (prev === undefined || prev === null) continue;
      const now = divisionGames(state.games, division.id).length;
      const drop = prev - now;
      if (drop <= 0) continue;
      const vanished = vanishedFinals(ctx, state.games, division.id);
      for (const g of vanished) {
        ctx.warn(`finals regression ${division.id}: ${describe(g)} was final in the last update and is not counted now`, {
          league: leagueId,
          division: division.id,
        });
      }
      if (accepted) {
        ctx.log(`  finals regression accepted for ${league.shortName} ${division.id} (--accept-regression): ${prev} → ${now}`);
        continue;
      }
      if (drop >= FINALS_REGRESSION_FREEZE) {
        freezeDrop += drop;
      } else {
        smallDrop += drop;
        smallIds.push(...vanished.map((g) => g.contestId));
      }
    }
    if (freezeDrop > 0) {
      const frozen = hasPreviousData(ctx.previous, leagueId);
      ctx.leagues.degrade(
        leagueId,
        frozen ? 'frozen' : 'degraded',
        finalsRegressionReason(ctx.previous, leagueId, freezeDrop),
        'finals regression',
      );
    } else if (smallDrop > 0) {
      const n = smallDrop;
      const ids = smallIds.length > 0 ? ` (${smallIds.join(', ')})` : '';
      ctx.leagues.degrade(
        leagueId,
        'partial',
        `${n} ${league.shortName} ${n === 1 ? 'result that was' : 'results that were'} final in the last update ${n === 1 ? 'is' : 'are'} missing from MaxPreps now${ids}; the table is computed without ${n === 1 ? 'it' : 'them'}.`,
        'finals missing',
      );
    }
  }
}

function previousClassification(ctx: PipelineContext, division: DivisionId): DivisionHealth['classification'] | null {
  return previousDivisionHealth(ctx.previous, division)?.classification ?? null;
}

/** Replace (or, with no previous data, remove) every frozen league's intra-league games and fixtures. */
export function applyFrozenLeagues(ctx: PipelineContext, state: RunState): void {
  for (const league of LEAGUES) {
    if (ctx.leagues.state(league.id) !== 'frozen') continue;
    const members = new Set(teamsInLeague(league.id).map((t) => t.id));
    const intra = (g: Game) =>
      g.home.teamId !== null && g.away.teamId !== null && members.has(g.home.teamId) && members.has(g.away.teamId);
    const kept = state.games.filter((g) => !intra(g));
    const keptFixtures = state.unmatched.filter((f) => f.league !== league.id);
    // Reported rows from this run are not published for a frozen league.
    for (const id of members) state.reported.delete(id);

    if (ctx.previous && hasPreviousData(ctx.previous, league.id)) {
      const degraded = new Set<DivisionId>(
        league.divisions.filter((d) => previousClassification(ctx, d.id) === 'fallback-contest-type').map((d) => d.id),
      );
      const previousGames = classifyGames(ctx.previous.games.filter(intra), { degradedDivisions: degraded });
      state.games = [...kept, ...previousGames].sort(byDateThenId);
      state.unmatched = [...keptFixtures, ...(ctx.previous.officialFixtures ?? []).filter((f) => f.league === league.id)];
      for (const s of ctx.previous.standings) {
        if (members.has(s.teamId) && s.reported) state.reported.set(s.teamId, s.reported);
      }
      for (const d of league.divisions) {
        const prev = previousClassification(ctx, d.id);
        if (prev) state.classification.set(d.id, prev);
        const info = state.divisions.get(d.id);
        if (info) {
          const rows = ctx.previous.standings.filter((s) => s.division === d.id && s.reported).length;
          info.reportedTable = rows > 0 ? 'carried' : 'missing';
          info.reportedRows = rows > 0 ? rows : null;
        }
      }
      state.frozenFromPrevious.add(league.id);
      ctx.log(`  ${league.shortName} frozen: ${previousGames.length} league ${previousGames.length === 1 ? 'game' : 'games'} carried from the previous snapshot`);
    } else {
      state.games = kept;
      state.unmatched = keptFixtures;
      for (const d of league.divisions) {
        const info = state.divisions.get(d.id);
        if (info && info.reportedTable !== 'skipped') {
          info.reportedTable = 'missing';
          info.reportedRows = null;
        }
      }
      ctx.log(`  ${league.shortName} frozen with no previous data: none of its league games are published`);
    }
  }
}

/** Run-abort trigger 4 (systemic outage). */
export function checkSystemic(ctx: PipelineContext, state: RunState): void {
  const previousGames = ctx.previous?.games.length ?? 0;
  if (previousGames > 0 && state.games.length < SYSTEMIC_MIN_GAMES_SHARE * previousGames) {
    throw new RunAbort(
      `systemic outage: ${state.games.length} games would be published against ${previousGames} in the previous snapshot (below ${SYSTEMIC_MIN_GAMES_SHARE * 100}%)`,
    );
  }
  const attempted = [...state.feeds.values()].filter((f) => f.status === 'ok' || f.status === 'failed');
  const failed = attempted.filter((f) => f.status === 'failed').length;
  if (attempted.length > 0 && failed / attempted.length >= SYSTEMIC_FAILED_FEEDS_SHARE) {
    throw new RunAbort(`systemic outage: ${failed} of ${attempted.length} team schedule feeds failed this run`);
  }
  const inRun = ctx.leaguesInRun();
  if (inRun.length > 0 && inRun.every((id) => ctx.leagues.state(id) === 'frozen')) {
    throw new RunAbort(`systemic outage: every league in this run is frozen (${inRun.join(', ')})`);
  }
}

/** DivisionHealth.classification for every division not copied from a frozen league's previous health. */
export function fillClassification(state: RunState): void {
  for (const league of LEAGUES) {
    for (const d of league.divisions) {
      if (state.classification.has(d.id)) continue;
      state.classification.set(
        d.id,
        league.rules.classification === 'contest-type'
          ? 'contest-type'
          : state.official.degradedDivisions.has(d.id)
            ? 'fallback-contest-type'
            : 'official-fixtures',
      );
    }
  }
}

export function stepGuards(ctx: PipelineContext, state: RunState): void {
  checkFinalsRegression(ctx, state);
  applyFrozenLeagues(ctx, state);
  fillClassification(state);
  checkSystemic(ctx, state);
}
