/**
 * The `/schedule` index's view (SPEC §8.1, §10.4): the league cards, the Recent and Next game days
 * and the every-game-day rows that `ScheduleIndex.tsx` renders. Pure: `app/schedule/page.tsx`
 * passes it the games, the league summaries, a slug → league lookup and `getToday()`, so
 * tests/ui/schedule-view.test.ts can run it over any snapshot.
 */

import type { Game, LeagueId } from '../../lib/types';

export interface LeagueCardData {
  id: LeagueId;
  shortName: string;
  name: string;
  games: number;
  results: number;
  /** The next date with a game to come, or null when none is left. */
  next: string | null;
}

export interface IndexDay {
  date: string;
  total: number;
  leagues: Array<{ id: LeagueId; shortName: string; games: Game[] }>;
}

export interface ScheduleIndexView {
  cards: LeagueCardData[];
  recent: IndexDay[];
  next: IndexDay[];
  /** Every game day, ascending. */
  days: Array<{ date: string; total: number; byLeague: Array<{ shortName: string; games: number }> }>;
}

/** What the index needs to know about a team: its slug's league. */
type SlugLeague = (slug: string) => LeagueId | undefined;

/** The leagues with ≥1 side in a game (config order is the caller's `leagues` order). */
function sideLeagues(game: Game, leagueOf: SlugLeague): Set<LeagueId> {
  const out = new Set<LeagueId>();
  for (const side of [game.away, game.home]) {
    const id = side.slug ? leagueOf(side.slug) : undefined;
    if (id) out.add(id);
  }
  return out;
}

/**
 * The index's data, from plain inputs (PURE: the page passes `getGames()`, the league summaries,
 * a slug → league lookup and `getToday()`). `Recent` = the last `days` game days up to today;
 * `Next` = the first `days` game days after it. A league's games on a day are those with at least
 * one side in it, so a cross-league game is listed once under each of its leagues.
 */
export function buildScheduleIndex(input: {
  games: readonly Game[];
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string; name: string }>;
  leagueOf: SlugLeague;
  today: string;
  days?: number;
}): ScheduleIndexView {
  const n = input.days ?? 3;
  const sorted = [...input.games].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
  const tagged = sorted.map((game) => ({ game, leagues: sideLeagues(game, input.leagueOf) }));
  const dates = [...new Set(sorted.map((g) => g.dateKey))].sort();

  const dayOf = (date: string): IndexDay => {
    const games = tagged.filter((t) => t.game.dateKey === date);
    return {
      date,
      total: games.length,
      leagues: input.leagues
        .map((l) => ({ id: l.id, shortName: l.shortName, games: games.filter((t) => t.leagues.has(l.id)).map((t) => t.game) }))
        .filter((l) => l.games.length > 0),
    };
  };

  const cards: LeagueCardData[] = input.leagues.map((l) => {
    const mine = tagged.filter((t) => t.leagues.has(l.id)).map((t) => t.game);
    const upcoming = mine.find(
      (g) => g.dateKey >= input.today && (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed'),
    );
    return {
      id: l.id,
      shortName: l.shortName,
      name: l.name,
      games: mine.length,
      results: mine.filter((g) => g.status === 'final').length,
      next: upcoming ? upcoming.dateKey : null,
    };
  });

  return {
    cards,
    recent: dates.filter((d) => d <= input.today).slice(-n).map(dayOf),
    next: dates.filter((d) => d > input.today).slice(0, n).map(dayOf),
    days: dates.map((date) => {
      const day = dayOf(date);
      return {
        date,
        total: day.total,
        byLeague: day.leagues.map((l) => ({ shortName: l.shortName, games: l.games.length })),
      };
    }),
  };
}
