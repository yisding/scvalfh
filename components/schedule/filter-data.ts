/**
 * The filter index that makes `/schedule` filterable with ZERO network and zero re-render.
 *
 * The complete, unfiltered season list is server-rendered into the HTML (DESIGN §3.3, decision 7:
 * no `searchParams` in any page signature). `ScheduleFilters` then toggles the `hidden` attribute
 * on `[data-game]` rows and `[data-dategroup]` sections. This module is the single place the
 * contract between the two halves lives: the server writes these attributes, the client reads
 * exactly these names, and nothing else is shared.
 *
 * Every value is padded with a leading and trailing space so a client match can be an exact
 * `includes(' slug ')` test rather than a substring that would let `los-altos` match `altos`.
 */

import { getTeamBySlug } from '../../lib/teams';
import type { Division, Game, TeamSlug } from '../../lib/types';

/** What the `state` filter groups games into. */
export type ScheduleState = 'final' | 'upcoming' | 'pending';

export type FilterTeam = string | 'all';
export type FilterDivision = Division | 'all';
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

/** The SCVAL divisions a contest touches. A cross-division non-league game touches both. */
export function gameDivisions(game: Game): Division[] {
  const out: Division[] = [];
  for (const side of [game.away, game.home]) {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    if (team && !out.includes(team.division)) out.push(team.division);
  }
  return out;
}

export interface GameFilterAttrs {
  'data-game': string;
  'data-slugs': string;
  'data-divisions': string;
  'data-league': '1' | '0';
  'data-state': ScheduleState;
}

/** The `data-*` attributes to spread onto a game's list item. */
export function gameFilterAttrs(game: Game): GameFilterAttrs {
  const slugs = [game.away.slug, game.home.slug].filter((s): s is TeamSlug => s !== null);
  return {
    'data-game': game.contestId,
    'data-slugs': ` ${slugs.join(' ')} `,
    'data-divisions': ` ${gameDivisions(game).join(' ')} `,
    'data-league': game.isLeague ? '1' : '0',
    'data-state': scheduleState(game),
  };
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
 * the two can never disagree: `158 contests · 86 final · 71 to come · 1 not reported`.
 */
export function unfilteredCountLine(counts: ScheduleCounts): string {
  return [
    `${counts.total} ${contestWord(counts.total)}`,
    `${counts.final} final`,
    `${counts.upcoming} to come`,
    ...(counts.pending > 0 ? [`${counts.pending} not reported`] : []),
  ].join(' · ');
}

/** 'contest' / 'contests' — the word the count line uses, so it is never "1 contests". */
export function contestWord(n: number): string {
  return n === 1 ? 'contest' : 'contests';
}

export function gameWord(n: number): string {
  return n === 1 ? 'game' : 'games';
}
