/**
 * The filter index that makes `/schedule` filterable with ZERO network and zero re-render.
 *
 * The complete, unfiltered season list is server-rendered into the HTML (DESIGN §3.3, decision 7:
 * no search params in any page signature). `ScheduleFilters` then toggles the `hidden` attribute
 * on `[data-game]` rows and `[data-dategroup]` sections. This module is the single place the
 * contract between the two halves lives: the server writes these attributes, the client reads
 * exactly these names, and nothing else is shared.
 *
 * Every value is padded with a leading and trailing space so a client match can be an exact
 * `includes(' slug ')` test rather than a substring that would let `los-altos` match `altos`.
 *
 * CLIENT BOUNDARY (SPEC §0.4, §10.4): the client `ScheduleFilters` imports this module, so it
 * keeps only client-safe code — types, constants and pure functions over a `Game` — and NEVER
 * imports lib/teams or any other server module. The registry-dependent writers of the attributes
 * (`gameDivisions`, `gameFilterAttrs`) live in `filter-data-server.ts`.
 */

import { plural } from '../../lib/format';
import type { Game } from '../../lib/types';

/** What the `state` filter groups games into. */
export type ScheduleState = 'final' | 'upcoming' | 'pending';

export type FilterTeam = string | 'all';
/** A division id, or every division. */
export type FilterDivision = string | 'all';
export type FilterType = 'all' | 'league' | 'non-league';
export type FilterStateValue = 'all' | ScheduleState;

export interface FilterState {
  team: FilterTeam;
  division: FilterDivision;
  type: FilterType;
  state: FilterStateValue;
}

export const DEFAULT_FILTERS: FilterState = {
  team: 'all',
  division: 'all',
  type: 'all',
  state: 'all',
};

export function isDefaultFilters(f: FilterState): boolean {
  return (
    f.team === DEFAULT_FILTERS.team &&
    f.division === DEFAULT_FILTERS.division &&
    f.type === DEFAULT_FILTERS.type &&
    f.state === DEFAULT_FILTERS.state
  );
}

/**
 * A played game with no published score is neither `final` nor `upcoming` — it is its own state,
 * and it is the one the reader is most likely to be confused by (DESIGN §5.2 row 8), so it gets
 * its own filter value rather than being folded into either neighbour.
 */
export function scheduleState(game: Game): ScheduleState {
  if (game.status === 'final') return 'final';
  if (game.status === 'score-pending') return 'pending';
  return 'upcoming';
}

/** The `data-*` attributes on a game's list item (written by `filter-data-server.ts`). */
export interface GameFilterAttrs {
  'data-game': string;
  'data-slugs': string;
  'data-divisions': string;
  /** '1' when the game counts for a division table (`countsFor`), else '0'. */
  'data-league': '1' | '0';
  'data-state': ScheduleState;
}

export interface ScheduleCounts {
  total: number;
  final: number;
  upcoming: number;
  pending: number;
}

export function countGames(games: readonly Game[]): ScheduleCounts {
  let final = 0;
  let upcoming = 0;
  let pending = 0;
  for (const game of games) {
    const state = scheduleState(game);
    if (state === 'final') final += 1;
    else if (state === 'pending') pending += 1;
    else upcoming += 1;
  }
  return { total: games.length, final, upcoming, pending };
}

/**
 * The unfiltered count line, shared by the server-rendered fallback and the client component so
 * the two can never disagree: `158 contests · 86 final scores · 71 to come · 1 not reported`.
 */
export function unfilteredCountLine(counts: ScheduleCounts): string {
  return [
    `${counts.total} ${contestWord(counts.total)}`,
    plural(counts.final, 'final score'),
    `${counts.upcoming} to come`,
    ...(counts.pending > 0 ? [`${counts.pending} not reported`] : []),
  ].join(' · ');
}

/** 'contest' / 'contests' — the word the count line uses, so it is never "1 contests". */
export function contestWord(n: number): string {
  return n === 1 ? 'contest' : 'contests';
}
