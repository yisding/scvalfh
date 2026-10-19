import type { ReactNode } from 'react';

import StatusLabel from '@/components/ui/StatusLabel';
import { timeOfDay, timeOfDayPT } from '@/lib/format/dates';
import type { Game } from '@/lib/model/game';
import { statusLabelIsTime } from '@/views/shared/describe-game';
import type { GameDisplay } from '@/views/shared/game-display-client';

/**
 * The clock and the status label of a game face, decided once.
 *
 * A scheduled game's status label IS its time ("4:00 PM", "TIME TBA": `statusLabelIsTime`), so a
 * face that prints the clock would only repeat it as a status ("3:30 PM … 3:30 PM"). Every face
 * therefore prints EITHER its own clock (and what goes with it) OR the status label, never both:
 * GameRow's lead (components/game-row/parts/SummaryLead.tsx), GameCard, the game-log row, the
 * game page's ScoreBoard (components/game/ScoreBoard.tsx) and the JV day list
 * (components/schedule/JvDayGames.tsx).
 *
 * How an unannounced time is worded is each face's own, so it is an explicit prop (`TbaWording`):
 * - 'TBA': a narrow clock column (GameRow's lead, GameLine, the game-log row, the JV day list);
 * - 'Time TBA': GameCard's header line, which has the room;
 * - ', time TBA': the ScoreBoard's date line, which continues the date ("Fri Oct 2, time TBA") and
 *   gives a known time with its zone ("Fri Oct 2, 3:30 PM PT").
 */
export type TbaWording = 'TBA' | 'Time TBA' | ', time TBA';

/** The clock's words: the kickoff time, or the face's TBA wording. */
export function clockWords(game: Game, tba: TbaWording): string {
  if (game.isTimeTba) return tba;
  return tba === ', time TBA' ? `, ${timeOfDayPT(game.dateLocal)}` : timeOfDay(game.dateLocal);
}

/** The clock as one span in the host's face (`className`). */
export function GameClock({ game, tba, className }: { game: Game; tba: TbaWording; className?: string }) {
  return <span className={className}>{clockWords(game, tba)}</span>;
}

/**
 * The status slot: `clock` when the status label is the game's own time, else the StatusLabel
 * (`showChips` and `className` are its props). `clock` is whatever the host prints there instead —
 * its clock, its chips alone, or nothing when the clock already has a slot of its own.
 */
export function GameClockOrStatus({
  game,
  display,
  clock,
  showChips,
  className,
}: {
  game: Game;
  display: GameDisplay;
  clock: ReactNode;
  showChips?: boolean;
  className?: string;
}) {
  return statusLabelIsTime(game, display.statusLabel) ? (
    clock
  ) : (
    <StatusLabel display={display} showChips={showChips} className={className} />
  );
}

export default GameClockOrStatus;
