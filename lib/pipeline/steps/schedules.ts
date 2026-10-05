/**
 * Step 05 (SPEC §7.4): one schedule feed per registry team (FETCHABLE_TEAMS, registry order) of
 * every league in the run — every game, league and non-league.
 *
 * Kept behaviour from the single-file cron:
 *  - the requests run in parallel (the MaxPreps client's gate keeps ≤3 in flight, ≥500 ms apart) but
 *    results land in per-team SLOTS, so the committed `sources` never reorder between runs;
 *  - a feed must contain its own teamId (the Presentation/Los Gatos routing bug);
 *  - an EMPTY feed for a team the previous snapshot holds games for is treated as a failure, so the
 *    carry-forward restores its rows instead of silently deleting its non-league games;
 *  - a failed feed carries that team's games from the previous snapshot (step 06 does the carry).
 * New: TBA rows are split off per feed first (§7.6), so one TBA row never rejects a whole feed;
 * ≥50% of a league's feeds failing is §7.5 trigger b (frozen with previous data, else degraded).
 */

import { getLeague } from '../../leagues';
import { ScheduleResponseSchema, splitTbaRows, type ScheduleRow } from '../../sources/maxpreps';
import { FETCHABLE_TEAMS, TEAMS } from '../../teams';
import type { LeagueId, SourceStatus, Team } from '../../types';
import {
  asOfStamp,
  carriedFromOf,
  hasPreviousData,
  lastFreshStamp,
  type PipelineContext,
  type RunState,
} from '../ledger';
import { classifyFetchError, parseJsonBody } from '../read';
import { resourceUrl } from '../transport';

/** §7.5 trigger b: this share (or more) of a league's attempted feeds failed. */
export const LEAGUE_FEED_FREEZE_SHARE = 0.5;

function previousGameCount(ctx: PipelineContext, team: Team): number {
  return (ctx.previous?.games ?? []).filter((g) => g.home.teamId === team.id || g.away.teamId === team.id).length;
}

interface FeedOutcome {
  rows: ScheduleRow[];
  source: SourceStatus;
  status: 'ok' | 'failed' | 'skipped';
}

async function readFeed(ctx: PipelineContext, state: RunState, team: Team): Promise<FeedOutcome> {
  const key = { kind: 'maxpreps-schedule', team: team.slug } as const;
  const url = resourceUrl(key);
  const base = {
    id: 'maxpreps-api' as const,
    kind: 'team-schedule' as const,
    scope: { league: team.league, division: team.division, team: team.slug },
    label: `${team.slug} schedule`,
    url,
    fetchedAt: ctx.fetchedAt,
  };
  let httpStatus: number | undefined;
  try {
    const res = await ctx.transport.get(key);
    httpStatus = res.httpStatus;
    const feed = parseJsonBody(res.body, ScheduleResponseSchema).data;
    const split = splitTbaRows(feed);
    state.tbaDropped.push(...split.dropped);
    const rows = split.rows;
    // The feed must contain its own team (an empty feed is a legitimate answer, checked below).
    if (rows.length > 0 && !rows.some((row) => row.contest.teams.some((t) => t.teamId === team.id))) {
      throw new Error(`feed for ${team.id} contains no row for that teamId`);
    }
    // A 200 with no rows for a team we ALREADY hold games for is indistinguishable from an upstream
    // blip; taking it at face value would delete that team's non-league games with no warning.
    const had = previousGameCount(ctx, team);
    if (rows.length === 0 && split.dropped.length === 0 && had > 0) {
      throw new Error(`schedule feed returned 0 rows but the previous snapshot has ${had} ${had === 1 ? 'game' : 'games'} for this team`);
    }
    return {
      rows,
      status: 'ok',
      source: { ...base, status: 'ok', httpStatus, rowCount: feed.length },
    };
  } catch (err) {
    const failed = classifyFetchError(err);
    if (failed.status === 'skipped') return { rows: [], status: 'skipped', source: { ...base, ...failed } };
    if (failed.httpStatus !== undefined) httpStatus = failed.httpStatus;
    const message = failed.error;
    ctx.warn(`${team.slug} schedule failed: ${message}`, base.scope);
    const carry = previousGameCount(ctx, team) > 0;
    const carriedFrom = carry
      ? carriedFromOf(ctx.previous, (r) => r.label === base.label || (r.kind === 'team-schedule' && r.scope?.team === team.slug))
      : undefined;
    return {
      rows: [],
      status: 'failed',
      source: {
        ...base,
        status: carry ? 'stale' : 'error',
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        ...(carriedFrom ? { carriedFrom } : {}),
        error: carry ? `${message}; its games are carried forward from the previous snapshot` : message,
      },
    };
  }
}

function teamFailedReason(team: Team, carriedFrom: string | undefined): string {
  return carriedFrom
    ? `MaxPreps did not answer for ${team.name}'s schedule this run; its games are carried from ${asOfStamp(carriedFrom)}.`
    : `MaxPreps did not answer for ${team.name}'s schedule this run, so its games may be incomplete.`;
}

/** §7.5 trigger b reason. */
export function feedsFailedReason(
  previous: PipelineContext['previous'],
  leagueId: LeagueId,
  failed: number,
  attempted: number,
): string {
  const short = getLeague(leagueId).shortName;
  const head = `MaxPreps did not answer for ${failed} of ${attempted} ${short} team schedules this run`;
  const stamp = lastFreshStamp(previous, leagueId);
  return stamp
    ? `${head}, so ${short} is shown as of ${stamp}.`
    : `${head}; ${short} is shown from the schedules that did answer.`;
}

export async function stepSchedules(ctx: PipelineContext, state: RunState): Promise<void> {
  const inRun = new Set(ctx.leaguesInRun());

  for (const team of TEAMS) {
    state.feeds.set(team.slug, {
      slug: team.slug,
      teamId: team.id,
      league: team.league,
      status: inRun.has(team.league) ? 'skipped' : 'not-fetched',
      carried: false,
    });
  }

  const teams = FETCHABLE_TEAMS.filter((t) => inRun.has(t.league));
  const outcomes = await Promise.all(teams.map((team) => readFeed(ctx, state, team)));

  for (const [i, team] of teams.entries()) {
    const out = outcomes[i];
    state.rows.push(...out.rows);
    ctx.source(out.source);
    const feed = state.feeds.get(team.slug);
    if (feed) feed.status = out.status;
    if (out.status === 'failed') {
      ctx.leagues.degrade(team.league, 'partial', teamFailedReason(team, out.source.carriedFrom), 'team feed carried');
    }
  }

  // Teams in a league's official alignment that no data source carries (none today).
  for (const team of TEAMS) {
    if (!inRun.has(team.league) || team.dataCoverage !== 'none') continue;
    ctx.source({
      id: 'maxpreps-api',
      kind: 'team-schedule',
      scope: { league: team.league, division: team.division, team: team.slug },
      label: `${team.slug} schedule`,
      url: team.external.maxprepsScheduleUrl ?? resourceUrl({ kind: 'maxpreps-schedule', team: team.slug }),
      status: 'skipped',
      fetchedAt: ctx.fetchedAt,
      error: `in the official ${getLeague(team.league).shortName} grid but absent from every data source`,
    });
  }

  // §7.5 trigger b, per league: ≥50% of the feeds attempted this run failed.
  for (const leagueId of inRun) {
    const attempted = teams.filter((t, i) => t.league === leagueId && outcomes[i].status !== 'skipped');
    const failed = attempted.filter((t) => state.feeds.get(t.slug)?.status === 'failed').length;
    if (attempted.length === 0 || failed / attempted.length < LEAGUE_FEED_FREEZE_SHARE) continue;
    const frozen = hasPreviousData(ctx.previous, leagueId);
    ctx.leagues.degrade(
      leagueId,
      frozen ? 'frozen' : 'degraded',
      feedsFailedReason(ctx.previous, leagueId, failed, attempted.length),
      'team feeds failed',
    );
  }

  const ok = outcomes.filter((o) => o.status === 'ok').length;
  ctx.log(`  schedules: ${ok}/${teams.length} feeds read · ${state.rows.length} rows`);
}
