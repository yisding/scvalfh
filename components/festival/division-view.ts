import { FESTIVAL_GAME_MINUTES } from '../../lib/festival/festival';
import { plural } from '../../lib/format';
import {
  bracketColumns,
  byDayAndSlot,
  festivalModel,
  finalsOf,
  gameRow,
  poolTable,
  type BracketColumnModel,
  type DayModel,
  type FestivalModel,
  type GameRowModel,
  type PoolTableModel,
} from './festival-model';

/**
 * /festival/[division] (DESIGN §35 §6): one division's pools in TourneyMachine's order, its Saturday placement
 * games drawn as TourneyMachine lays them out, and its schedule by day and time slot.
 */
export interface DivisionViewModel {
  slug: string;
  /** 'U-19 Girls 11v11'. */
  name: string;
  /** 'U19'. */
  short: string;
  format: string;
  /** '11v11 · 55-minute games', '32 teams', '6 pools', '24 of 80 games final'. */
  facts: string[];
  teams: number;
  finals: number;
  games: number;
  pools: PoolTableModel[];
  /** Null for a division with no placement games (pool play is the whole event). */
  bracket: BracketColumnModel[] | null;
  bracketUrl: string | null;
  days: DayModel<GameRowModel>[];
}

export function buildDivisionView(slug: string, m: FestivalModel = festivalModel()): DivisionViewModel | null {
  const division = m.divisionBySlug.get(slug);
  if (!division) return null;
  const games = m.file.games.filter((g) => g.divisionKey === division.key);
  const teams = m.file.teams.filter((t) => t.divisionKey === division.key).length;
  const finals = finalsOf(games);
  const columns = bracketColumns(m, division.key);
  return {
    slug,
    name: division.name,
    short: division.short,
    format: division.format,
    facts: [
      `${division.format} · ${FESTIVAL_GAME_MINUTES}-minute games`,
      plural(teams, 'team'),
      plural(division.pools.length, 'pool'),
      `${finals} of ${plural(games.length, 'game')} final`,
    ],
    teams,
    finals,
    games: games.length,
    pools: division.pools.map((p) => poolTable(m, p.id)),
    bracket: columns.length > 0 ? columns : null,
    bracketUrl: division.bracketUrl,
    days: byDayAndSlot(games, (g) => gameRow(m, g)),
  };
}
