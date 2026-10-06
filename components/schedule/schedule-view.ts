/**
 * The `/schedule` index's view (SPEC §8.1, §10.4): the league cards, the Recent and Next game days
 * and the every-game-day rows that `ScheduleIndex.tsx` renders. Pure: `app/schedule/page.tsx`
 * passes it the games, the league summaries, a slug → league lookup and `getToday()`, so
 * tests/ui/schedule-view.test.ts can run it over any snapshot.
 *
 * Regions (DESIGN-socal §2.4): every card and every league group carries its league's region, and the
 * Recent and Next blocks are built once per region (`regions`): a region's last and next game days are
 * ITS OWN, so a SoCal reader never meets a day block with no SoCal game in it. The every-game-day
 * index stays ONE list (one `id="YYYY-MM-DD"` per day, so old links keep landing), and each row
 * carries one count line per region (`byRegion`), which the page scopes.
 */

import type { Game, LeagueId, RegionId } from '../../lib/types';

export interface LeagueCardData {
  id: LeagueId;
  region: RegionId;
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
  leagues: Array<{ id: LeagueId; shortName: string; region: RegionId; games: Game[] }>;
}

/** One region's Recent and Next (its own last and next game days), with the id suffix for its blocks. */
export interface IndexRegion {
  id: RegionId;
  /** '' for NorCal (today's ids), '-socal' for SoCal (DESIGN-socal §2.4 id rule). */
  idSuffix: '' | '-socal';
  recent: IndexDay[];
  next: IndexDay[];
}

export interface ScheduleIndexView {
  cards: LeagueCardData[];
  /** Every league's, across regions (the first regions' days; kept for callers that want one list). */
  recent: IndexDay[];
  next: IndexDay[];
  /** One per region present in `leagues`, config order. */
  regions: IndexRegion[];
  /** Every game day, ascending. */
  days: Array<{
    date: string;
    total: number;
    byLeague: Array<{ shortName: string; games: number }>;
    /** The same day per region: the games with a side in the region, and its leagues' counts. */
    byRegion: Array<{ region: RegionId; total: number; byLeague: Array<{ shortName: string; games: number }> }>;
  }>;
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
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string; name: string; region: RegionId }>;
  leagueOf: SlugLeague;
  today: string;
  days?: number;
}): ScheduleIndexView {
  const n = input.days ?? 3;
  const sorted = [...input.games].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
  const tagged = sorted.map((game) => ({ game, leagues: sideLeagues(game, input.leagueOf) }));
  const dates = [...new Set(sorted.map((g) => g.dateKey))].sort();

  const regionOf = new Map(input.leagues.map((l) => [l.id, l.region]));
  const regionIds = [...new Set(input.leagues.map((l) => l.region))];
  const inRegion = (t: (typeof tagged)[number], region: RegionId) => [...t.leagues].some((id) => regionOf.get(id) === region);

  /** A day's games, every league's or (with `region`) only those with a side in that region. */
  const dayOf = (date: string, region?: RegionId): IndexDay => {
    const games = tagged.filter((t) => t.game.dateKey === date && (region === undefined || inRegion(t, region)));
    return {
      date,
      total: games.length,
      leagues: input.leagues
        .filter((l) => region === undefined || l.region === region)
        .map((l) => ({
          id: l.id,
          shortName: l.shortName,
          region: l.region,
          games: games.filter((t) => t.leagues.has(l.id)).map((t) => t.game),
        }))
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
      region: l.region,
      shortName: l.shortName,
      name: l.name,
      games: mine.length,
      results: mine.filter((g) => g.status === 'final').length,
      next: upcoming ? upcoming.dateKey : null,
    };
  });

  return {
    cards,
    recent: dates.filter((d) => d <= input.today).slice(-n).map((d) => dayOf(d)),
    next: dates.filter((d) => d > input.today).slice(0, n).map((d) => dayOf(d)),
    regions: regionIds.map((region) => {
      const mine = [...new Set(tagged.filter((t) => inRegion(t, region)).map((t) => t.game.dateKey))].sort();
      return {
        id: region,
        idSuffix: region === 'norcal' ? ('' as const) : ('-socal' as const),
        recent: mine.filter((d) => d <= input.today).slice(-n).map((d) => dayOf(d, region)),
        next: mine.filter((d) => d > input.today).slice(0, n).map((d) => dayOf(d, region)),
      };
    }),
    days: dates.map((date) => {
      const day = dayOf(date);
      return {
        date,
        total: day.total,
        byLeague: day.leagues.map((l) => ({ shortName: l.shortName, games: l.games.length })),
        byRegion: regionIds.map((region) => {
          const mine = dayOf(date, region);
          return {
            region,
            total: mine.total,
            byLeague: mine.leagues.map((l) => ({ shortName: l.shortName, games: l.games.length })),
          };
        }),
      };
    }),
  };
}
