/**
 * The pipeline (SPEC §7.4): `runPipeline(ctx, steps)` runs the thirteen steps in order. The CLI
 * plumbing `scripts/fetch-data.ts` needs (§7.12: argument parsing, the transport for the run, the
 * previous snapshot, the two output files) is lib/pipeline/cli.ts.
 *
 *   01 window      out of season → log, write nothing, exit 0 (unless --force)
 *   02 bootstrap   season ids ≠ config → RUN ABORT
 *   03 metas       wrong season/year/section → LEAGUE FREEZE (a)
 *   04 reported    unreadable table → SOURCE STALE (carried)
 *   05 schedules   failed feed → carried; ≥50% of a league's feeds → LEAGUE FREEZE (b)
 *   06 normalize   + exclusions, phantom dedupe, carry-forward
 *   07 official    the official step (steps/official.ts), injectable
 *   08 sblive      the si.com step (steps/sblive.ts), injectable
 *   09 secondary   VNN, CCS
 *   10 classify    classifyGames with the official step's degraded divisions
 *   11 guards      finals regression (c), frozen-league substitution, systemic RUN ABORT
 *   11b cifss      the cifsshome.org score cross-check (report only; never changes a game)
 *   12 standings   tables, cross-check, LeagueHealth
 *   13 assemble    parseSnapshot (failure → RUN ABORT), budgets, meta, summary
 */

import { ALL_DIVISIONS, LEAGUES } from '@/lib/config/leagues';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game } from '@/lib/model/game';
import { RunAbort } from './abort';
import type {
  OfficialStepResult,
  PipelineResult,
  PipelineSteps,
  SbliveStepResult,
  Transport,
} from './contract';
import type { PipelineContext } from './context';
import { carryCrossCheck } from './reconcile/sblive-crosscheck';
import { stepAssemble } from './steps/assemble';
import { stepBootstrap } from './steps/bootstrap';
import { stepCifss } from './steps/cifss';
import { stepClassify } from './steps/classify';
import { markLeaguesNotInRun, stepGuards } from './steps/guards';
import { stepLeagueMeta } from './steps/league-meta';
import { stepNormalize } from './steps/normalize';
import { notAppliedReason } from './steps/official';
import { stepReported } from './steps/reported';
import { stepSchedules } from './steps/schedules';
import { stepSecondary } from './steps/secondary';
import { stepStandings } from './steps/standings';
import { stepWindow } from './steps/window';
import { emptyRunState } from './state';
import { MeteredTransport, type RequestCounts } from './transport';

function requestCounts(transport: Transport): RequestCounts {
  return transport instanceof MeteredTransport
    ? { ...transport.counts }
    : { maxpreps: 0, sblive: 0, official: 0, other: 0 };
}

// ---------------------------------------------------------------- the step sequence

/**
 * Steps 07 and 08 never abort the run (§7.4). A step that THROWS (a bug, not an upstream failure:
 * the steps record those themselves) is logged, and the run goes on without its contribution:
 * every official-fixtures division falls back to contest-type classification (never membership
 * alone) and its league is degraded with a reason; si.com contributes nothing this run.
 */
async function runOfficial(ctx: PipelineContext, steps: PipelineSteps, games: Game[]): Promise<OfficialStepResult> {
  try {
    return await steps.official(ctx, games);
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`official step failed: ${(err as Error).message}`);
    const degraded = new Set<string>();
    for (const league of LEAGUES) {
      if (league.rules.classification !== 'official-fixtures' || !ctx.leaguesInRun().includes(league.id)) continue;
      for (const d of league.divisions) degraded.add(d.id);
      ctx.leagues.degrade(league.id, 'degraded', notAppliedReason(league), 'official schedule not applied');
    }
    return { games, unmatched: [], degradedDivisions: degraded, revisedUpstream: new Set(), carriedDivisions: new Set() };
  }
}

async function runSblive(
  ctx: PipelineContext,
  steps: PipelineSteps,
  games: Game[],
  unmatched: OfficialFixture[],
): Promise<SbliveStepResult> {
  try {
    return await steps.sblive(ctx, { games, unmatched });
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`si.com step failed: ${(err as Error).message}`);
    // The previous report, keeping only rows still true of these games (no stale conflict rows).
    const prior = ctx.previous?.sbliveCrossCheck;
    return { games, unmatched, sbliveCrossCheck: prior ? carryCrossCheck(prior, games, []) : undefined };
  }
}

/** Runs §7.4 steps 01-13. Returns null when the season-window guard stops the run (nothing to write). */
export async function runPipeline(ctx: PipelineContext, steps: PipelineSteps): Promise<PipelineResult | null> {
  // 01
  if (!stepWindow(ctx)) return null;
  ctx.log(
    `fetch-data: ${ctx.transport.mode}${ctx.args.fixtures ? ` (${ctx.args.fixtures})` : ''} · ` +
      `fetchedAt ${ctx.fetchedAt} · leagues ${ctx.leaguesInRun().join(',') || '(none)'}`,
  );

  const state = emptyRunState();
  for (const d of ALL_DIVISIONS) state.divisions.set(d.id, { meta: 'skipped', reportedTable: 'skipped', reportedRows: null });
  markLeaguesNotInRun(ctx); // §7.5 trigger d

  await stepBootstrap(ctx); // 02
  await stepLeagueMeta(ctx, state); // 03
  await stepReported(ctx, state); // 04
  await stepSchedules(ctx, state); // 05
  stepNormalize(ctx, state); // 06

  // 07 official (the injectable official step)
  const { games: officialGames, unmatched, ...officialFlags } = await runOfficial(ctx, steps, state.games);
  state.games = officialGames;
  state.unmatched = unmatched;
  state.official = officialFlags;

  // 08 sblive (the injectable si.com step)
  const sblive = await runSblive(ctx, steps, state.games, state.unmatched);
  state.games = sblive.games;
  state.unmatched = sblive.unmatched;
  state.sbliveCrossCheck = sblive.sbliveCrossCheck;

  // 09 secondary
  const { games: secondaryGames, ...ccs } = await stepSecondary(ctx, state.games);
  state.games = secondaryGames;
  state.secondary = ccs;

  // 10 classify
  state.games = stepClassify(ctx, state.games, state.official.degradedDivisions);

  // 11 guards (may throw RunAbort)
  stepGuards(ctx, state);

  // 11b cifsshome.org cross-check (over the games the snapshot will publish)
  state.cifssCrossCheck = await stepCifss(ctx, state);

  // 12 standings + health
  const table = stepStandings(ctx, state);

  // 13 assemble (may throw RunAbort)
  const { snapshot, meta } = stepAssemble(ctx, { state, table, requests: requestCounts(ctx.transport) });
  return { snapshot, meta, logLines: [...ctx.logLines] };
}
