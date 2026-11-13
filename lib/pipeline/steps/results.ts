/**
 * Step 11c: every final's recorded result (lib/results/result.ts `finalizeResults`), after the last step that
 * can bring evidence about a game (the cifsshome.org cross-check) and before the standings count it. Logs each
 * game whose score, winner or tally this step changed. `box` is the box-score evidence of the player-stats file on
 * disk (a live run; a corpus run has none, so its output depends on the corpus alone). The file is the previous
 * player-stats fetch, so a box score entered since reaches the stored record a run later; the site reads the
 * current one when it loads the snapshot (lib/data.ts).
 */

import type { BoxEvidence } from '../../results/box-evidence';
import { correctionProblems, finalizeResults } from '../../results/result';
import type { CifssCrossCheck, Game } from '../../types';
import type { RunContext } from '../contract';

export function stepResults(ctx: RunContext, games: readonly Game[], cifss: CifssCrossCheck | null | undefined, box?: BoxEvidence): Game[] {
  for (const problem of correctionProblems(games)) ctx.warn(problem);
  const out = finalizeResults(games, { cifssConflicts: cifss?.conflicts ?? [], box });
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
