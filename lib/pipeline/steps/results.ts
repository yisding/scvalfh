/**
 * Step 11c: every final's recorded result (lib/results/result.ts `finalizeResults`), after the last step that
 * can bring evidence about a game (the cifsshome.org cross-check) and before the standings count it. Logs each
 * game whose score, winner or tally this step changed. `box` is the box-score evidence of the player-stats file on
 * disk (a live run; a corpus run has none, so its output depends on the corpus alone). The file is the previous
 * player-stats fetch, so a box score entered since reaches the stored record a run later; the site reads the
 * current one when it loads the snapshot (lib/data.ts).
 *
 * The run hands in each game's cifss and box evidence from the claims that hold it (lib/claims/sources/cifss.ts,
 * box.ts); without it, the evidence is read off the report and the file as given.
 */

import { ledgerProblems } from '../../fixtures/ledger';
import type { BoxEvidence } from '../../results/box-evidence';
import { correctionProblems, finalizeResult, withAddedGames } from '../../results/result';
import type { CifssConflictRow, CifssCrossCheck, ContestId, Game } from '../../types';
import type { RunContext } from '../contract';

/** Each game's evidence from the sources that only bear on a result (lib/claims/sources/cifss.ts, box.ts). */
export interface ResultEvidence {
  cifss: (contestId: ContestId) => Pick<CifssConflictRow, 'cifss' | 'cifssUrl'> | undefined;
  box: (contestId: ContestId) => BoxEvidence | undefined;
}

/** The evidence of a cifss report and a box-score file as they are, game by game. */
export function evidenceOf(cifss: CifssCrossCheck | null | undefined, box: BoxEvidence | undefined): ResultEvidence {
  const rows = new Map((cifss?.conflicts ?? []).map((r) => [r.contestId, r]));
  return { cifss: (id) => rows.get(id), box: () => box };
}

export function stepResults(
  ctx: RunContext,
  games: readonly Game[],
  cifss: CifssCrossCheck | null | undefined,
  box?: BoxEvidence,
  evidence: ResultEvidence = evidenceOf(cifss, box),
): Game[] {
  // A fixture of the ledger whose linked contest is not the game it states is reported, never applied.
  for (const problem of [...ledgerProblems(games), ...correctionProblems(games)]) ctx.warn(problem);
  // The ledger's fixtures no feed lists join the list first.
  const listed = withAddedGames(games, ctx.fetchedAt);
  for (const g of listed) if (!games.includes(g)) ctx.log(`  results: added ${g.contestId} (${g.away.name} at ${g.home.name}, ${g.dateKey}) from an official source`);
  const before = new Map(games.map((g) => [g.contestId, g]));
  const out = listed.map((g) => finalizeResult(g, { cifss: evidence.cifss(g.contestId), box: evidence.box(g.contestId) }));
  const tally = { confirmed: 0, reported: 0, inferred: 0, disputed: 0 };
  for (const [i, g] of out.entries()) {
    if (!g.result) continue;
    tally[g.result.certainty] += 1;
    void i;
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
  return out;
}
