/**
 * The `/schedule` index's view (SPEC §8.1, §10.4): the league cards, the Recent and Next game days
 * and the every-game-day rows that `ScheduleIndex.tsx` renders. `buildScheduleIndex` is pure:
 * `app/schedule/page.tsx` passes it the games, the league summaries, a slug → league lookup and
 * `getToday()`, so tests/ui/schedule-view.test.ts can run it over any snapshot. The
 * `/schedule/<league>` page's view, `buildLeagueSchedulePageView(id)`, reads lib/queries itself,
 * as the other per-route views do.
 *
 * Regions (DESIGN-socal §2.4): every card and every league group carries its league's region, and the
 * Recent and Next blocks are built once per region (`regions`): a region's last and next game days are
 * ITS OWN, so a SoCal reader never meets a day block with no SoCal game in it. The every-game-day
 * index stays ONE list (one `id="YYYY-MM-DD"` per day, so old links keep landing), and each row
 * carries one count line per region (`byRegion`), which the page scopes.
 */

import { isIndependentLeague, regionIdSuffix } from '@/lib/config/leagues';
import { standaloneName } from '@/lib/config/leagues/labels';
import { monthDay } from '@/lib/format/dates';
import type { Game } from '@/lib/model/game';
import type { LeagueHealth } from '@/lib/model/health';
import type { LeagueId, RegionId } from '@/lib/model/ids';
import { getGamesByDate, getScoresLandingDate } from '@/lib/queries/games';
import { getLeagueHealth, getLeagueSummary } from '@/lib/queries/leagues';
import { byDateLocal } from '@/lib/shared/game';
import { type RecordsByGame, recordsByGame } from '@/views/shared/game-records';

import { countGames, type ScheduleCounts } from './filters-client';

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
  const sorted = [...input.games].sort(byDateLocal);
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
        idSuffix: regionIdSuffix(region),
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

/**
 * What `/schedule/<league>` prints about its league outside the lists: the titles, the sentence's
 * subject, the counts and the date span, plus what its components would otherwise read themselves:
 * the league's health note and the date its list lays out around.
 */
export interface LeagueSchedulePageView {
  /** The `<title>`: the h1 plus the sport, which a search result has no other way to show. */
  title: string;
  /** The page's h1: 'SCVAL schedule and results'; for the LA independents, 'LA teams: schedule and results'. */
  h1: string;
  /** 'SCVAL teams'; the LA independents are named by their standaloneName: 'the LA independents'. */
  involving: string;
  counts: ScheduleCounts;
  /** 'Aug 28 – Nov 8' over the league's game days, or null before any game is on the schedule. */
  span: string | null;
  /** The current league records each upcoming league game of the list prints (GameList `records`). */
  records: RecordsByGame;
  /** The league's data health (LeagueHealthNote). */
  health: LeagueHealth;
  /**
   * The Scores tab's landing date within this league (lib/queries/games `getScoresLandingDate`, the
   * date BottomTabBar's league target aims at): ScheduleList lays out the days around it.
   */
  landingDate: string | null;
}

/** The league's schedule page, from its id (the page's metadata and body ask for the same facts). */
export function buildLeagueSchedulePageView(id: LeagueId): LeagueSchedulePageView {
  const summary = getLeagueSummary(id);
  if (!summary) throw new Error(`views/schedule/schedule-view.ts: unknown league ${id}`);
  const groups = getGamesByDate({ league: id });
  const h1 = isIndependentLeague(id)
    ? `${summary.shortName} teams: schedule and results`
    : `${summary.shortName} schedule and results`;
  const first = groups[0];
  const last = groups[groups.length - 1];
  return {
    // The h1 is the schedule title; the <title> adds the sport, which a search result has no other way to show.
    title: h1.replace('schedule and results', 'field hockey schedule and results'),
    h1,
    involving: isIndependentLeague(id) ? standaloneName(id) : `${summary.shortName} teams`,
    counts: countGames(groups.flatMap((group) => group.games)),
    span: first && last ? `${monthDay(first.date)} – ${monthDay(last.date)}` : null,
    records: recordsByGame(groups.flatMap((group) => group.games)),
    health: getLeagueHealth(id),
    landingDate: getScoresLandingDate({ league: id }),
  };
}
