import { FESTIVAL_GAME_MINUTES } from '../../lib/festival/festival';
import { listWords, plural } from '../../lib/format';
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
  /**
   * What the finals are, in a sentence or two from the pairings (owner ask, 2026-11-26: make clear there is no
   * knockout bracket): "No knockout bracket: on Saturday each team plays the team that finished in the same place in
   * the paired pool (Pool R v Pool S, Pool T v Pool U). Pools P and Q have no finals."
   */
  finalsSummary: string | null;
  /** For a division with no finals: "No finals in this division: each pool’s table winner is its champion." */
  poolsOnlyNote: string | null;
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
      // TourneyMachine schedules no placement games for a division whose pools of six give every team its five
      // guaranteed games (U16, U14 Co-Ed, Adult): its result is the final pool table.
      ...(columns.length > 0 ? [] : ['Pool play only']),
      `${finals} of ${plural(games.length, 'game')} final`,
    ],
    teams,
    finals,
    games: games.length,
    pools: division.pools.map((p) => poolTable(m, p.id)),
    bracket: columns.length > 0 ? columns : null,
    finalsSummary: columns.length > 0 ? finalsSummary(columns, division.pools.map((p) => p.name)) : null,
    poolsOnlyNote:
      columns.length > 0
        ? null
        : `No finals in this division: ${division.pools.length === 1 ? 'the pool’s table winner is its champion' : 'each pool’s table winner is its champion'}.`,
    bracketUrl: division.bracketUrl,
    days: byDayAndSlot(games, (g) => gameRow(m, g)),
  };
}

/**
 * The finals in words (DivisionViewModel.finalsSummary), as USA Field Hockey runs the festival rather than as
 * TourneyMachine draws it (owner ask, 2026-11-26: check the actual rules). Its regulations call the Saturday games
 * "crossover competition" and send a tied one straight to a shoot-out (D.4); the festival awards Pool Champion medals,
 * one per pool or per pair of pools that play crossovers (its 2024 recap: "Pool E/F: TC Shore", "Pool A: Texas
 * Pride"), so a paired pools' 1st-place final decides their champion and an unpaired pool's table winner is its own
 * (DESIGN §35.5). A single pool's "1st v 2nd" game is not said to decide its champion: no source says so.
 */
export function finalsSummary(columns: readonly BracketColumnModel[], poolNames: readonly string[]): string {
  const paired = columns.filter((c) => c.pools.length > 1);
  const single = columns.filter((c) => c.pools.length === 1);
  const letters = (pools: readonly string[]) => `Pool ${pools.map((n) => n.replace(/^Pool /, '')).join('/')}`;
  const parts: string[] = ['No knockout bracket.'];
  if (paired.length > 0) {
    parts.push(
      `On Saturday paired pools play crossover finals, 1st v 1st, 2nd v 2nd and so on (${listWords(paired.map((c) => c.title))}); the 1st-place final decides the pool champion (${listWords(paired.map((c) => letters(c.pools)))}).`,
    );
  }
  for (const c of single) {
    parts.push(`On Saturday ${c.pools[0]}’s teams play by place: ${listWords(c.games.map((g) => g.label.replace(/^Final: /, '')))}.`);
  }
  parts.push('A tied final goes straight to a shoot-out.');
  const fed = new Set(columns.flatMap((c) => c.pools));
  const none = poolNames.filter((n) => !fed.has(n));
  if (none.length === 1) parts.push(`${none[0]} has no finals: its table winner is its champion.`);
  if (none.length > 1) parts.push(`Pools ${listWords(none.map((n) => n.replace(/^Pool /, '')))} have no finals: each one’s table winner is its champion.`);
  return parts.join(' ');
}
