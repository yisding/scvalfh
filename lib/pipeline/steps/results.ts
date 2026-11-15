/**
 * Step 11c: every final's recorded result (lib/results/result.ts `finalizeResult`), after the last step that can
 * bring evidence about a game (the cifsshome.org cross-check) and before the standings count it. Logs each game whose
 * score, winner or tally this step changed. The box-score evidence is the player-stats file's on disk (a live run; a
 * corpus run has none, so its output depends on the corpus alone). The file is the previous player-stats fetch, so a
 * box score entered since reaches the stored record a run later; the site reads the current one when it loads the
 * snapshot (lib/data.ts).
 *
 * The stage's cross-game decisions are taken here over the view through the guards: the ledger's checks against the
 * games (a fixture whose linked contest is not the game it states is reported, never applied), and the editor's
 * listings no feed lists (decideAddedGames). The run adds those to the view, re-sorted by date then id when any is
 * added, hands each fixture its cifss and box evidence from the claims that hold it (lib/claims/sources/cifss.ts,
 * box.ts), and resolves the view through stage `results`, which is finalizeResult with the editor's result
 * corrections (lib/claims/resolve.ts).
 */

import type { EditorView } from '../../claims/editor';
import { ledgerProblems } from '../../fixtures/ledger';
import { correctionProblems, decideAddedGames } from '../../results/result';
import type { ContestId, Game } from '../../types';
import type { RunContext } from '../contract';

/** The stage's checks over `games` (each problem a warning) and the editor's listings to add, in the ledger's order. */
export function decideResults(ctx: RunContext, games: readonly Game[], editor: Pick<EditorView, 'byContest' | 'results' | 'listed'>): Game[] {
  for (const problem of [...ledgerProblems(games, editor), ...correctionProblems(games, editor.results)]) ctx.warn(problem);
  return decideAddedGames(games, ctx.fetchedAt, editor.listed);
}

/**
 * The stage's log lines: each game added from a listing, in the order the stage publishes them; each game whose
 * score, decider or tally finalizeResult changed (`input` is the stage's input, `out` what it publishes); the tally.
 */
export function logResults(ctx: RunContext, input: readonly Game[], out: readonly Game[], added: ReadonlySet<ContestId>): void {
  for (const g of out) if (added.has(g.contestId)) ctx.log(`  results: added ${g.contestId} (${g.away.name} at ${g.home.name}, ${g.dateKey}) from an official source`);
  const before = new Map(input.map((g) => [g.contestId, g]));
  const tally = { confirmed: 0, reported: 0, inferred: 0, disputed: 0 };
  for (const g of out) {
    if (!g.result) continue;
    tally[g.result.certainty] += 1;
    const was = before.get(g.contestId);
    if (!was) continue;
    const moved =
      was.home.score !== g.home.score || was.away.score !== g.away.score || was.decider !== g.decider || (was.shootout === null) !== (g.shootout === null);
    if (moved) {
      const so = g.shootout ? ` (${g.shootout.home}-${g.shootout.away} tiebreak)` : '';
      ctx.log(`  results: ${g.contestId} ${g.home.name} ${g.home.score}, ${g.away.name} ${g.away.score}${so}, ${g.result.ending}, ${g.result.certainty}: ${g.result.basis ?? ''}`);
    }
  }
  ctx.log(`  results: ${tally.confirmed} confirmed · ${tally.reported} reported · ${tally.inferred} inferred · ${tally.disputed} disputed`);
}
