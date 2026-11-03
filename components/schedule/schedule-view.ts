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

import type { PostseasonPlace } from './day-summary';

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
  /**
   * The day's groups: one per league, then one per postseason event no league owns ('CCS', 'San Diego Section
   * playoffs'). `leagueId` is null for an event's group; its `id` is then `postseason-<slug>`.
   */
  leagues: Array<{ id: string; leagueId: LeagueId | null; shortName: string; region: RegionId; games: Game[] }>;
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
 * `ccs`, `san-diego-section-playoffs`, `tournament-of-champions`: an event group's id tail (`postseason-<slug>`,
 * the anchor the pills link to), here and on the day page (day-summary.ts).
 */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The index's data, from plain inputs (PURE: the page passes `getGames()`, the league summaries,
 * a slug → league lookup and `getToday()`). `Recent` = the last `days` game days up to today;
 * `Next` = the first `days` game days after it. A league's games on a day are those with at least
 * one side in it, so a regular-season cross-league game is listed under each of its leagues.
 *
 * A postseason game is listed ONCE (`placeOf`, components/schedule/day-summary.ts postseasonPlace, the day
 * page's own rule): under the league that owns it, or in its event's group after the leagues ('CCS · …'),
 * so a CCS quarterfinal between an SCVAL and a BVAL team no longer appears under both (2026-11-03). The
 * league cards still count every game on each league's own schedule, as `/schedule/<league>` lists it.
 */
export function buildScheduleIndex(input: {
  games: readonly Game[];
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string; name: string; region: RegionId }>;
  leagueOf: SlugLeague;
  today: string;
  days?: number;
  placeOf?: (game: Game) => PostseasonPlace | null;
}): ScheduleIndexView {
  const n = input.days ?? 3;
  const sorted = [...input.games].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
  const placeOf = input.placeOf ?? (() => null);
  const tagged = sorted.map((game) => ({ game, leagues: sideLeagues(game, input.leagueOf), place: placeOf(game) }));
  /** The leagues a game is listed under in a day's groups: its owner's only, for a placed postseason game. */
  const listedUnder = (t: (typeof tagged)[number]): ReadonlySet<LeagueId> =>
    t.place === null ? t.leagues : t.place.kind === 'league' ? new Set([t.place.id]) : new Set();
  const dates = [...new Set(sorted.map((g) => g.dateKey))].sort();

  const regionOf = new Map(input.leagues.map((l) => [l.id, l.region]));
  const regionIds = [...new Set(input.leagues.map((l) => l.region))];
  const inRegion = (t: (typeof tagged)[number], region: RegionId) => [...t.leagues].some((id) => regionOf.get(id) === region);

  /** A day's games, every league's or (with `region`) only those with a side in that region. */
  const dayOf = (date: string, region?: RegionId): IndexDay => {
    const games = tagged.filter((t) => t.game.dateKey === date && (region === undefined || inRegion(t, region)));
    const events = new Map<string, { rank: number; games: typeof games }>();
    for (const t of games) {
      if (t.place?.kind !== 'event') continue;
      const event = events.get(t.place.name) ?? { rank: t.place.rank, games: [] };
      event.games.push(t);
      events.set(t.place.name, event);
    }
    return {
      date,
      total: games.length,
      leagues: [
        ...input.leagues
          .filter((l) => region === undefined || l.region === region)
          .map((l) => ({
            id: l.id as string,
            leagueId: l.id as LeagueId | null,
            shortName: l.shortName,
            region: l.region,
            games: games.filter((t) => listedUnder(t).has(l.id)).map((t) => t.game),
          })),
        ...[...events]
          .sort(([a, x], [b, y]) => x.rank - y.rank || a.localeCompare(b))
          .map(([name, event]) => ({
            id: `postseason-${slugOf(name)}`,
            leagueId: null,
            shortName: name,
            // The region asked for, else the region of the event's first league side.
            region: region ?? regionOf.get([...event.games[0].leagues][0]) ?? regionIds[0],
            games: event.games.map((t) => t.game),
          })),
      ].filter((l) => l.games.length > 0),
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
