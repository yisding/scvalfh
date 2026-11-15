/**
 * Step 10 (SPEC §7.4, §7.10): THE classification, decided once and persisted: `classifyGames`
 * (lib/classify.ts) sets `postseason` then `countsFor` on every game, with the official step's
 * degraded divisions (classified by contest-type, never by membership alone). Then, with the tags known, a level
 * final marked W and L in a game that must have a winner (a postseason game; any game of a sport with no ties)
 * becomes the marked side's win, decider 'SO' (lib/postseason/level-final.ts), before the standings step counts it.
 *
 * Both are rules of one game, so the stage takes no cross-game decision: its one input is the run-level fact of the
 * degraded divisions, and the run resolves the view through stage `classify` (lib/claims/resolve.ts applies the
 * same two rules to each fixture's game). This module logs what the stage did.
 */

import type { DivisionId, Game } from '../../types';
import type { RunContext } from '../contract';

/** The stage's log lines, `out` being `input` classified and settled game by game. */
export function logClassification(
  ctx: Pick<RunContext, 'log'>,
  input: readonly Game[],
  out: readonly Game[],
  degradedDivisions: ReadonlySet<DivisionId>,
): void {
  // Classification never sets a decider: a game that is 'SO' now and was not is one settleLevelFinal settled.
  for (const [i, g] of out.entries()) {
    if (g.decider !== 'SO' || input[i].decider === 'SO') continue;
    const winner = g.home.result === 'W' ? g.home : g.away;
    ctx.log(`  classify: ${g.contestId} level at ${g.home.score}-${g.away.score} and marked W/L, and the game needs a winner: counted as ${winner.name}'s win`);
  }
  const counted = out.filter((g) => g.countsFor !== null).length;
  const post = out.filter((g) => g.postseason !== null).length;
  ctx.log(
    `  classify: ${counted} league ${counted === 1 ? 'game' : 'games'} · ${post} postseason` +
      (degradedDivisions.size ? ` · contest-type fallback for ${[...degradedDivisions].join(', ')}` : ''),
  );
}

