/**
 * Everything `/` renders, assembled once on the server (DESIGN §3.1).
 *
 * This is the only module the home page reads data through, and it reads the snapshot ONLY through
 * `lib/data.ts`. "Today" is always `lib/data`'s `getToday()` — derived from `snapshot.fetchedAt` in
 * America/Los_Angeles, never `Date.now()` — so the build is reproducible and the "as of" stamp in
 * the header is honest (BUILD-BRIEF).
 */

import {
  getGameDates,
  getGames,
  getGoalDiffDomain,
  getLastLeagueResultDate,
  getLatestResultsDate,
  getOfficialFixtures,
  getPlayoffProjection,
  getPlayoffs,
  getSeasonPhase,
  getStandingFor,
  getStandings,
  getTeamById,
  getTeams,
  getToday,
  getUpcoming,
} from '../../lib/data';
import { EM_DASH, dateTimeAttr, monthDay, ordinal, recordString, shortDate, timeOfDayPT } from '../../lib/format';
import { DIVISIONS, DIVISION_LABELS, SOURCE_LINKS, leagueStandingsUrl } from '../../lib/season';
import { outcomesFor, playoffOutcomeLabel } from '../../lib/standings';
import { getTeamBySlug } from '../../lib/teams';
import type { Division, Game, Playoffs, SeasonPhase, Team, TeamSlug } from '../../lib/types';
import type { FormEntry } from '../ui/FormStrip';
import type { StandingsRowData } from '../ui/StandingsTable';
import { describeGame, type GameDisplay } from '../ui/game-view';

import type { HomeLastGame, HomeNextGame, HomeOfficialFixture, HomeTeamView } from './home-types';

/** Kickoff order, then away name, so a four-game slate is stable between builds. */
function byKickoff(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name);
}

export interface HomeDay {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Every contest that day, in kickoff order — a slate, not just the finals. */
  games: Game[];
  total: number;
  isToday: boolean;
}

export interface HomeDivision {
  division: Division;
  label: string;
  rows: StandingsRowData[];
  gdDomain: number;
  sourceUrl: string;
  /** How many teams the division has, so "top 4 of 8" can be printed. */
  total: number;
  /**
   * The last day THIS division produced a league result, or null. Per division, exactly as
   * app/standings/standings-data.ts computes it: the two divisions play on different days, so one
   * "latest scores" date across both of them captioned the De Anza table "through Sep 29" on a day
   * when every Sep 29 final was El Camino's.
   */
  throughDate: string | null;
}

export interface HomeData {
  today: string;
  phase: SeasonPhase;
  /** 'YYYY-MM-DD' of the first contest and of the first LEAGUE contest. */
  firstGame: string | null;
  firstLeagueGame: string | null;
  /** Non-league finals played so far — the number the Aug 21 – Sep 8 banner needs. */
  nonLeagueFinals: number;
  /** The most recent day with at least one reported result. */
  latest: HomeDay | null;
  /**
   * A day whose contests have all come and gone with no reported score at all (DESIGN §8). Only
   * ever a day STRICTLY before today: a game scheduled for later today has not failed to report
   * anything yet.
   */
  unreported: HomeDay | null;
  /** Today's remaining slate, or the next day that has one. */
  slate: HomeDay | null;
  divisions: HomeDivision[];
  playoffs: Playoffs;
  crossover: { date: string; pairings: string[] };
  teamViews: HomeTeamView[];
}

function day(date: string, today: string): HomeDay {
  const games = getGames({ date }).sort(byKickoff);
  return { date, games, total: games.length, isToday: date === today };
}

/** The same day, minus anything already played — what "today's slate" means after 4pm. */
function playableDay(date: string, today: string): HomeDay {
  const games = getGames({ date })
    .filter((g) => g.status !== 'final')
    .sort(byKickoff);
  return { date, games, total: games.length, isToday: date === today };
}

function firstDateOf(filter: Parameters<typeof getGames>[0]): string | null {
  const keys = getGames(filter)
    .map((g) => g.dateKey)
    .sort();
  return keys[0] ?? null;
}

/** The most recent played day with nothing reported, or null (the common case). */
function unreportedDay(today: string, latestResults: string | null): string | null {
  const candidates = getGameDates().filter((d) => d < today && (!latestResults || d > latestResults));
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const games = getGames({ date: candidates[i] });
    if (games.length > 0 && games.every((g) => g.status !== 'final')) return candidates[i];
  }
  return null;
}

// ---------------------------------------------------------------- my-team views

function formEntries(teamSlug: TeamSlug, division: Division, canonical: readonly string[]): FormEntry[] {
  // The same filter lib/standings.ts tallies on (league, this division, final), so these entries
  // line up 1:1 with `standing.computed.last5` and the canonical outcomes stay authoritative.
  const leagueFinals = getGames({ teamId: teamSlug, leagueOnly: true, status: 'final' })
    .filter((g) => g.leagueDivision === division)
    .sort(byKickoff)
    .slice(-5);
  return leagueFinals.map((game, i) => {
    const display = describeGame(game, teamSlug);
    const mineIsHome = game.home.slug === teamSlug;
    const mine = mineIsHome ? display.home : display.away;
    const theirs = mineIsHome ? display.away : display.home;
    const opponent = (theirs.slug ? getTeamBySlug(theirs.slug)?.shortName : null) ?? theirs.name;
    const outcome =
      canonical.length === leagueFinals.length
        ? (canonical[i] as FormEntry['outcome'])
        : (display.perspectiveOutcome ?? 'T');
    return {
      outcome,
      contestId: game.contestId,
      opponent,
      score: `${mine.glyph}–${theirs.glyph}`,
      date: monthDay(game.dateLocal),
    };
  });
}

/**
 * The registry's short name, so a 358px card line reads "St Ignatius" instead of
 * "St. Ignatius College Preparatory". A non-SCVAL opponent keeps the source spelling, and the
 * screen-reader sentence keeps the full names either way.
 */
function withShortNames(display: GameDisplay): GameDisplay {
  const rename = (side: GameDisplay['home']): GameDisplay['home'] => {
    const short = side.slug ? getTeamBySlug(side.slug)?.shortName : undefined;
    return short ? { ...side, name: short } : side;
  };
  return { ...display, home: rename(display.home), away: rename(display.away) };
}

function lastGameView(game: Game, slug: TeamSlug): HomeLastGame {
  return {
    display: withShortNames(describeGame(game, slug)),
    mineIsHome: game.home.slug === slug,
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    recap: game.recap,
    href: `/game/${game.contestId}`,
  };
}

function nextGameView(game: Game, slug: TeamSlug): HomeNextGame {
  const mineIsHome = game.home.slug === slug;
  const theirs = mineIsHome ? game.away : game.home;
  const opponent = (theirs.slug ? getTeamBySlug(theirs.slug)?.shortName : null) ?? theirs.name;
  const links: HomeNextGame['links'] = [];
  const address = game.venue.address;
  if (address) {
    links.push({
      label: 'Directions',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`,
      external: true,
    });
  }
  if (game.urls.nfhsStream) links.push({ label: 'Stream', href: game.urls.nfhsStream, external: true });
  if (game.urls.goFan) links.push({ label: 'Tickets', href: game.urls.goFan, external: true });
  links.push({ label: 'Game page', href: `/game/${game.contestId}`, external: false });
  return {
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    timeLabel: game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal),
    versus: game.site === 'neutral' ? 'vs' : mineIsHome ? 'vs' : 'at',
    opponent,
    isLeague: game.isLeague,
    href: `/game/${game.contestId}`,
    // Three chips at most, so the row's height is the same for every team (no layout shift).
    links: links.slice(0, 3),
  };
}

/** 'VALLEY CHRISTIAN' → 'Valley Christian', for a grid name with no registry row behind it. */
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/**
 * The next fixture from the official SCVAL grid, for a team MaxPreps has no contest for. Wilcox is
 * in the official eight-team De Anza alignment and absent from every data source, so its schedule
 * comes from the PDF and its results stay empty — no record is ever invented (DESIGN §8, §12.1).
 */
function officialNextView(team: Team, today: string): HomeOfficialFixture | null {
  const fixture = getOfficialFixtures({ slug: team.slug })
    .filter((f) => f.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];
  if (!fixture) return null;
  const mineIsHome = fixture.homeSlug === team.slug;
  const otherSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const otherName = mineIsHome ? fixture.awayName : fixture.homeName;
  return {
    dateLabel: shortDate(fixture.dateKey),
    dateKey: fixture.dateKey,
    versus: mineIsHome ? 'vs' : 'at',
    opponent: (otherSlug ? getTeamBySlug(otherSlug)?.shortName : null) ?? titleCase(otherName),
    pdfUrl:
      fixture.division === 'de-anza'
        ? SOURCE_LINKS.scvalDeAnzaSchedule
        : SOURCE_LINKS.scvalElCaminoSchedule,
  };
}

/**
 * All 16 teams, pre-serialized (DESIGN §7.12). The pin lives in the reader's browser, so the server
 * cannot know which one is wanted; shipping all 16 compact views is the cost of the feature, and
 * each one is a handful of strings rather than a full `Game`.
 */
export function buildTeamViews(): HomeTeamView[] {
  const today = getToday();
  return getTeams().map((team) => {
    const standing = getStandingFor(team.slug);
    const games = getGames({ teamId: team.id }).sort(byKickoff);
    const finals = games.filter((g) => g.status === 'final');
    const last = finals.length > 0 ? finals[finals.length - 1] : null;
    const next =
      games.find(
        (g) =>
          g.dateKey >= today &&
          (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed'),
      ) ?? null;
    const hasResults = standing?.hasReportedResults ?? false;
    const place = standing
      ? standing.tiebreak.shared
        ? `tied ${ordinal(standing.computed.place)}`
        : ordinal(standing.computed.place)
      : null;
    return {
      team: {
        abbr: team.abbr,
        name: team.name,
        colors: team.colors,
        slug: team.slug,
        shortName: team.shortName,
        mascot: team.mascot,
        division: team.division,
        divisionLabel: DIVISION_LABELS[team.division],
      },
      meta: [team.mascot, DIVISION_LABELS[team.division], hasResults ? place : 'no results yet']
        .filter((part): part is string => !!part)
        .join(' · '),
      hasResults,
      leagueRecord: hasResults && standing ? recordString(standing.computed) : EM_DASH,
      overallRecord: standing && standing.overall.gp > 0 ? recordString(standing.overall) : EM_DASH,
      pts: hasResults && standing ? standing.computed.pts : null,
      playoffLabel:
        hasResults && standing
          ? playoffOutcomeLabel(outcomesFor(standing))
          : 'No results reported',
      form: hasResults ? formEntries(team.slug, team.division, standing?.computed.last5 ?? []) : [],
      nonLeagueCount: games.filter((g) => !g.isLeague && g.status === 'final').length,
      last: last ? lastGameView(last, team.slug) : null,
      next: next ? nextGameView(next, team.slug) : null,
      officialNext: next ? null : officialNextView(team, today),
    };
  });
}

// ---------------------------------------------------------------- the page's data

export function getHomeData(): HomeData {
  const today = getToday();
  const latestResults = getLatestResultsDate();
  const upcoming = getUpcoming(40);
  const slateDate = upcoming[0]?.dateKey ?? null;
  const unreported = unreportedDay(today, latestResults);
  const playoffs = getPlayoffs();
  const projection = getPlayoffProjection();

  return {
    today,
    phase: getSeasonPhase(),
    firstGame: firstDateOf({}),
    firstLeagueGame: firstDateOf({ leagueOnly: true }),
    // Games played SO FAR — a non-league final later in the season has not been played yet.
    nonLeagueFinals: getGames({ status: 'final' }).filter((g) => !g.isLeague && g.dateKey <= today)
      .length,
    latest: latestResults ? day(latestResults, today) : null,
    unreported: unreported ? day(unreported, today) : null,
    slate: slateDate ? playableDay(slateDate, today) : null,
    divisions: DIVISIONS.map((division) => {
      const standings = getStandings(division);
      return {
        division,
        label: DIVISION_LABELS[division],
        rows: standings.map((standing) => ({ standing, team: getTeamById(standing.teamId)! })),
        gdDomain: getGoalDiffDomain(division),
        sourceUrl: leagueStandingsUrl(division),
        total: standings.length,
        throughDate: getLastLeagueResultDate(division),
      };
    }),
    playoffs,
    crossover: {
      date: projection.crossover.date,
      pairings: projection.crossover.pairings.map((p) => p.label),
    },
    teamViews: buildTeamViews(),
  };
}
