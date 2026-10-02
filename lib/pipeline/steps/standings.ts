/**
 * Step 12 (SPEC §7.4, §7.10): the tables per the by-laws (`computeStandings` with MaxPreps' reported
 * rows for the cross-check), `assertFullTable`, the kept win-percentage log check, the published
 * cross-check, and one `LeagueHealth` row per configured league in config order.
 *
 * `DivisionHealth.official.missingPast` comes from `missingOfficialResults()` (lib/standings.ts) —
 * the same function lib/data.ts uses, never a second implementation.
 */

import { LEAGUES } from '../../leagues';
import type { LeagueConfig } from '../../leagues';
import {
  assertFullTable,
  buildCrossCheck,
  computeStandings,
  divisionGames,
  missingOfficialResults,
} from '../../standings';
import { teamsInLeague } from '../../teams';
import type { CrossCheckRow, DivisionHealth, LeagueHealth, Standing } from '../../types';
import { previousDivisionHealth, previousLeagueHealth, type PipelineContext, type RunState } from '../ledger';

export interface StandingsStepResult {
  standings: Standing[];
  crossCheck: CrossCheckRow[];
  leagueHealth: LeagueHealth[];
}

function officialHealth(ctx: PipelineContext, state: RunState, league: LeagueConfig, divisionId: string): DivisionHealth['official'] {
  const division = league.divisions.find((d) => d.id === divisionId);
  if (!division) return null;
  const matched = new Set(
    state.games.filter((g) => g.official?.division === divisionId).map((g) => g.official?.fixtureId as string),
  ).size;
  const unmatched = state.unmatched.filter((f) => f.division === divisionId).length;
  const carried = state.official.carriedDivisions.has(divisionId);
  const total = matched + unmatched;
  if (total === 0 && !carried) return null;
  const missingPast = missingOfficialResults(state.games, state.unmatched, divisionId, ctx.today).filter(
    (r) => r.kind === 'missing',
  ).length;
  return {
    source: division.official.source,
    total,
    matched,
    missingPast,
    carried,
    revisedUpstream: state.official.revisedUpstream.has(divisionId),
  };
}

function leagueHealthRow(ctx: PipelineContext, state: RunState, league: LeagueConfig): LeagueHealth {
  const stateNow = ctx.leagues.state(league.id);
  const previous = previousLeagueHealth(ctx.previous, league.id);
  const divisions: DivisionHealth[] = league.divisions.map((d) => {
    const info = state.divisions.get(d.id);
    const counted = divisionGames(state.games, d.id);
    return {
      divisionId: d.id,
      meta: info?.meta ?? 'skipped',
      reportedTable: info?.reportedTable ?? 'skipped',
      reportedRows: info?.reportedRows ?? null,
      classification: state.classification.get(d.id) ?? (league.rules.classification === 'contest-type' ? 'contest-type' : 'official-fixtures'),
      official: officialHealth(ctx, state, league, d.id),
      countedFinals: counted.length,
      previousCountedFinals: previousDivisionHealth(ctx.previous, d.id)?.countedFinals ?? null,
      backfilled: counted.filter((g) => g.provenance.scores === 'sblive').length,
    };
  });
  const feeds = [...state.feeds.values()].filter((f) => f.league === league.id);
  return {
    leagueId: league.id,
    state: stateNow,
    lastFreshAt: stateNow === 'fresh' || stateNow === 'partial' ? ctx.fetchedAt : (previous?.lastFreshAt ?? null),
    reasons: [...ctx.leagues.reasons(league.id)],
    divisions,
    teamFeeds: {
      total: teamsInLeague(league.id).length,
      ok: feeds.filter((f) => f.status === 'ok').length,
      carried: feeds.filter((f) => f.carried).length,
      failed: feeds.filter((f) => f.status === 'failed').length,
    },
  };
}

export function stepStandings(ctx: PipelineContext, state: RunState): StandingsStepResult {
  const standings = computeStandings(state.games, { reported: state.reported });
  assertFullTable(standings);

  // Our win-percentage formula must reproduce MaxPreps' own number (kept check, log only).
  for (const s of standings) {
    if (!s.reported || s.computed.gp === 0) continue;
    const ours = Number(s.computed.winPct.toFixed(3));
    const theirs = Number(s.reported.conferenceWinningPercentage.toFixed(3));
    if (Math.abs(ours - theirs) > 0.001) {
      ctx.log(`  pct check ${s.slug}: ours ${ours} vs MaxPreps ${theirs} (records differ, see cross-check)`);
    }
  }

  const crossCheck = buildCrossCheck(standings);
  for (const s of standings.filter((x) => x.mismatch)) ctx.log(`  mismatch ${s.slug}: ${s.mismatchDetail}`);

  const leagueHealth = LEAGUES.map((league) => leagueHealthRow(ctx, state, league));
  return { standings, crossCheck, leagueHealth };
}
