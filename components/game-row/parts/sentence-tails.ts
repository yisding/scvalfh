import { recordWords } from '@/lib/format/numbers';
import type { Game } from '@/lib/model/game';
import type { GameDisplay } from '@/views/shared/game-display-client';
import type { GameRecords } from '@/views/shared/game-records';

/**
 * The sr-only tails GameRow and GameCard append to the row's own sentence (describeGame's
 * sentence is shared with the game page and the OG card, so it is not changed), and the gate on
 * the records they print.
 */

/**
 * The records a row prints, or null: a league game (one that counts for a league table,
 * SPEC §10.4 — never MaxPreps' own league flag) with nothing on the scoreboard yet, given the
 * records at all (`GameViewProps.records`). Both sides of a counted game are in that league, so
 * neither record is a cross-league one.
 */
export function printedRecords(
  game: Game,
  display: GameDisplay,
  records: GameRecords | null | undefined,
): GameRecords | null {
  return records && game.countsFor !== null && !display.showScores ? records : null;
}

/**
 * The game's chips in words, for a row whose visible chips sit in an aria-hidden column: " SCVAL
 * league game." / " Non-league." / " SCVAL crossover." The same gate as the chips themselves, so
 * a bracket (showChips false) does not repeat them per row.
 */
export function chipsSentence(display: GameDisplay, showChips: boolean): string {
  if (!showChips) return '';
  const kind = display.isNonLeague
    ? ' Non-league.'
    : display.leagueTag
      ? ` ${display.leagueTag} league game.`
      : '';
  return `${kind}${display.postseasonTag ? ` ${display.postseasonTag}.` : ''}`;
}

/**
 * The sr-only tail for the records: " Homestead 1 win, 4 losses, 0 ties in league, Los Altos
 * 3 wins, 1 loss, 0 ties in league." In words, as the standings row labels are: the visible team
 * rows are aria-hidden, so this is the only record a screen reader gets, and "1-4-0" is read as a
 * subtraction or a date. A side with no record is left out rather than read as zero.
 */
export function recordsSentence(display: GameDisplay, records: GameRecords): string {
  const parts = ([
    [display.away, records.away],
    [display.home, records.home],
  ] as const).flatMap(([side, computed]) =>
    computed ? [`${side.name} ${recordWords(computed)} in league`] : [],
  );
  return parts.length ? ` ${parts.join(', ')}.` : '';
}
