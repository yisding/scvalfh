/**
 * The words of a 2025-26 bracket read whole from MaxPreps (lib/history/history-brackets-schema.ts
 * PublishedBracketsSchema) that the shared bracket view does not already print: each division's champion and how
 * its final went, for the champion rows of components/history/PublishedBracketsBlock.tsx. Pure.
 */

import { getTeamById } from '../../lib/teams';
import type { TournamentBracket, TournamentBracketSide } from '../../lib/types';

/** A registry school by its registry name, any other by MaxPreps'. */
export function publishedSideName(side: TournamentBracketSide): string {
  return (side.teamId ? getTeamById(side.teamId)?.name : undefined) ?? side.name ?? 'TBD';
}

/**
 * The champion of a bracket and the line under it: "Beat Saint Francis 3-1 in the final"; "Drew 1-1 with Gunn in
 * the final and won the tiebreak" (a level final the page marks a winner of, as a soccer final settled on penalty
 * kicks reads there); "Beat Gunn in the final; no score was posted". Null when the last game has no winner.
 */
export function publishedChampion(bracket: TournamentBracket): { teamId: string | null; name: string; detail: string } | null {
  const final = bracket.matchups.find((m) => m.next === null);
  if (!final || final.winner === null) return null;
  const w = final.sides[final.winner];
  const l = final.sides[final.winner === 0 ? 1 : 0];
  const loser = publishedSideName(l);
  const detail =
    w.score === null || l.score === null
      ? `Beat ${loser} in the final; no score was posted`
      : w.score === l.score
        ? `Drew ${w.score}-${l.score} with ${loser} in the final and won the tiebreak`
        : `Beat ${loser} ${w.score}-${l.score} in the final`;
  return { teamId: w.teamId, name: publishedSideName(w), detail };
}
