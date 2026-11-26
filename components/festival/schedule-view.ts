import { plural } from '../../lib/format';
import { byDayAndSlot, festivalModel, finalsOf, gameRow, type DayModel, type FestivalModel, type GameRowModel } from './festival-model';

/**
 * /festival/schedule (DESIGN §35 §6): every game of every division, by day and time slot. Each row carries the
 * slugs of its teams (`data-fest-game`), which the client "Only my teams" filter reads; without JS every game
 * shows.
 */
export interface ScheduleViewModel {
  days: DayModel<GameRowModel>[];
  games: number;
  finals: number;
  /** '295 games · 24 final'. */
  facts: string;
}

export function buildScheduleView(m: FestivalModel = festivalModel()): ScheduleViewModel {
  const finals = finalsOf(m.file.games);
  return {
    days: byDayAndSlot(m.file.games, (g) => gameRow(m, g)),
    games: m.file.games.length,
    finals,
    facts: `${plural(m.file.games.length, 'game')} · ${finals} final`,
  };
}
