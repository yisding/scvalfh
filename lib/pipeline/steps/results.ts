/**
 * Step 11c: every final's recorded result (lib/results/result.ts `finalizeResults`), after the last step that
 * can bring evidence about a game (the cifsshome.org cross-check) and before the standings count it. Logs each
 * game whose score, winner or tally this step changed, and every result that is not a plain single-source one.
 */

import { correctionProblems, finalizeResults } from '../../results/result';
import type { CifssCrossCheck, Game } from '../../types';
import type { RunContext } from '../contract';

export function stepResults(ctx: RunContext, games: readonly Game[], cifss: CifssCrossCheck | null | undefined): Game[] {
  for (const problem of correctionProblems(games)) ctx.warn(problem);
  const out = finalizeResults(games, { cifssConflicts: cifss?.conflicts ?? [] });
  const tally = { confirmed: 0, reported: 0, inferred: 0, disputed: 0 };
  for (const [i, g] of out.entries()) {
    if (!g.result) continue;
    tally[g.result.certainty] += 1;
    const before = games[i];
    const moved =
      before.home.score !== g.home.score || before.away.score !== g.away.score || before.decider !== g.decider || (before.shootout === null) !== (g.shootout === null);
    if (moved) {
      const so = g.shootout ? ` (${g.shootout.home}-${g.shootout.away} tiebreak)` : '';
      ctx.log(`  results: ${g.contestId} ${g.home.name} ${g.home.score}, ${g.away.name} ${g.away.score}${so}, ${g.result.ending}, ${g.result.certainty}: ${g.result.basis ?? ''}`);
    }
  }
  ctx.log(`  results: ${tally.confirmed} confirmed · ${tally.reported} reported · ${tally.inferred} inferred · ${tally.disputed} disputed`);
  return out;
}
