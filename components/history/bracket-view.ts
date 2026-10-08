import { monthDay } from '../../lib/format';
import {
  bracketSides,
  historySchoolName,
  type HistoryBracketDivision,
  type HistoryBracketGame,
  type HistoryBracketRound,
  type HistoryBracketSide,
} from '../../lib/history';

/**
 * The words of a 2025 section bracket on /history/2025-26 (components/history/HistoryBracket.tsx):
 * pure, so tests/ui/history-bracket-view.test.ts can read every sentence the page prints.
 *
 * Schools print by their registry name (historySchoolName), as everywhere else on the page: the file
 * keeps the source's "Mt. Carmel HS" and "The Bishop's School" as provenance only.
 */

export const sideName = (side: HistoryBracketSide): string => historySchoolName(side.slug, side.name);

/** "3-0", winner first: how a result reads after "beat". */
function winnerFirst(game: HistoryBracketGame): string | null {
  if (!game.score) return null;
  const [top, bottom] = game.score;
  return game.winner === 'top' ? `${top}-${bottom}` : `${bottom}-${top}`;
}

function shootoutWinnerFirst(game: HistoryBracketGame): string | null {
  if (!game.shootout) return null;
  const [top, bottom] = game.shootout;
  return game.winner === 'top' ? `${top}-${bottom}` : `${bottom}-${top}`;
}

const AFTER: Record<'overtime' | 'double-overtime', string> = {
  overtime: 'in overtime',
  'double-overtime': 'in double overtime',
};

/**
 * One game as a sentence, for a screen reader and the champion line: "Los Gatos beat Saint Francis
 * 3-0.", "Mt. Carmel beat Fallbrook 2-1 in overtime.", "Willow Glen and Stevenson drew 1-1; Willow
 * Glen won the shootout 2-1.", "Eastlake beat Del Norte; no score was posted."
 */
export function gameSentence(game: HistoryBracketGame): string {
  const { winner, loser } = bracketSides(game);
  const w = sideName(winner);
  const l = sideName(loser);
  const score = winnerFirst(game);
  if (score === null) return `${w} beat ${l}; no score was posted.`;
  if (game.decidedBy === 'shootout') {
    const so = shootoutWinnerFirst(game);
    return `${w} and ${l} drew ${score}; ${w} won the shootout${so ? ` ${so}` : ''}.`;
  }
  return `${w} beat ${l} ${score}${game.decidedBy ? ` ${AFTER[game.decidedBy]}` : ''}.`;
}

/**
 * The small line under a bracket card, or null: how the game was decided ("Overtime", "Shootout
 * 2-1"), a date that is not its round's ("Played Nov 6"), the site of a final ("At La Jolla HS") and
 * a missing score ("No score posted"), joined with a middle dot.
 */
export function gameNote(game: HistoryBracketGame, round: HistoryBracketRound): string | null {
  const parts: string[] = [];
  if (game.decidedBy === 'overtime') parts.push('Overtime');
  if (game.decidedBy === 'double-overtime') parts.push('Double overtime');
  if (game.decidedBy === 'shootout') {
    // In the card's top-then-bottom order, like the goals beside the names.
    const so = game.shootout ? `${game.shootout[0]}-${game.shootout[1]}` : null;
    parts.push(so ? `Shootout ${so}` : 'Shootout');
  }
  if (!game.score) parts.push('No score posted');
  parts.push(...whenWhere(game, round));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * What a screen reader hears after gameSentence, which already says how the game was decided and
 * whether a score was posted: only a moved date and the site ("Played Nov 6.", "At La Jolla HS.").
 */
export function gameSentenceTail(game: HistoryBracketGame, round: HistoryBracketRound): string {
  return whenWhere(game, round)
    .map((p) => ` ${p}.`)
    .join('');
}

function whenWhere(game: HistoryBracketGame, round: HistoryBracketRound): string[] {
  const parts: string[] = [];
  if (game.date && game.date !== round.date) parts.push(`Played ${monthDay(game.date)}`);
  if (game.site) parts.push(`At ${game.site}`);
  return parts;
}

/**
 * The teams with a bye in a round: those in the next round that did not play this one. A play-in
 * round has none (the other seeds did not skip it, they were never in it).
 */
export function roundByes(division: HistoryBracketDivision, roundIndex: number): HistoryBracketSide[] {
  const round = division.rounds[roundIndex];
  const next = division.rounds[roundIndex + 1];
  if (!next || round.playIn) return [];
  const played = new Set(round.games.flatMap((g) => [g.top.slug, g.bottom.slug]));
  return next.games
    .flatMap((g) => [g.top, g.bottom])
    .filter((s) => !played.has(s.slug))
    .sort((a, b) => a.seed - b.seed);
}

/** The final and its winner, for the champion card. */
export function divisionChampion(division: HistoryBracketDivision): {
  champion: HistoryBracketSide;
  final: HistoryBracketGame;
} {
  const final = division.rounds[division.rounds.length - 1].games[0];
  return { champion: bracketSides(final).winner, final };
}

/**
 * The champion card's line under the school: "Beat Saint Francis 3-0 in the final", "Drew 2-2 with
 * La Costa Canyon in the final and won the shootout 3-2", "Beat Del Norte in the final; no score was
 * posted".
 */
export function finalLine(final: HistoryBracketGame): string {
  const { loser } = bracketSides(final);
  const l = sideName(loser);
  const score = winnerFirst(final);
  if (score === null) return `Beat ${l} in the final; no score was posted`;
  if (final.decidedBy === 'shootout') {
    const so = shootoutWinnerFirst(final);
    return `Drew ${score} with ${l} in the final and won the shootout${so ? ` ${so}` : ''}`;
  }
  return `Beat ${l} ${score} in the final${final.decidedBy ? ` ${AFTER[final.decidedBy]}` : ''}`;
}

/** A round's heading date: "Nov 5". */
export const roundDate = (round: HistoryBracketRound): string => monthDay(round.date);
