/**
 * What `/scores/[date]` renders, resolved once (`buildScoresDayView`): the day's games, its summary and
 * description, the previous / next day with games, the games by region (NorCal vs SoCal between them),
 * each region's unreported official fixtures, the day's JV blocks, the header badges and the sentence
 * an empty region prints. `generateMetadata` and the page both read it, so a link preview can never
 * disagree with the page. The components in components/scores/ take these slices as props and read no
 * snapshot data; the page keeps only its docblock, metadata and composition.
 *
 * Server-only: it reads lib/queries, like views/scores/scores-route.ts. The grouping itself is the pure
 * module beside it (day-summary.ts).
 */

import { REGIONS, regionIdSuffix, regionOf } from '@/lib/config/leagues';
import { getToday } from '@/lib/datasets/snapshot';
import { longDate, monthDay, shortDate } from '@/lib/format/dates';
import { gameWord, plural } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { RegionId } from '@/lib/model/ids';
import { getGameDates, getGames, getOfficialFixtures } from '@/lib/queries/games';
import { getLeagueSummaries } from '@/lib/queries/leagues';
import { getTeamBySlug } from '@/lib/registry/teams';
import { parseLocal } from '@/lib/shared/dates';
import { countGames } from '@/views/schedule/filters-client';
import { type RecordsByGame, recordsByGame } from '@/views/shared/game-records';
import { buildDayJvView } from '@/views/teams/jv';

import { type DayRegion, type DaySummary, dayDescription, dayRegions, daySummary, leaguesInvolved } from './day-summary';
import { scoresParam } from './scores-route';

/** One league's unreported official fixtures of the day. */
export interface FixtureBlock {
  league: ReturnType<typeof getLeagueSummaries>[number];
  rows: ReturnType<typeof getOfficialFixtures>;
}

/** A game whose official date differs from its actual date, with both sides already named. */
export interface MovedGame {
  awayName: string;
  homeName: string;
  /** The date on the league's official schedule (the day itself when the game has none). */
  scheduledDate: string;
}

/** One header badge: the day's whole count, or one region's (`region` scopes it). */
export interface DayBadge {
  key: string;
  text: string;
  region?: RegionId;
}

/** One region's block of the day page, everything its component prints. */
export interface RegionBlockData {
  region: DayRegion;
  first: boolean;
  /** The day's NorCal vs SoCal games, for the empty sentence. */
  betweenCount: number;
  /** The region's games that moved off their official date. */
  moved: MovedGame[];
  /** The region's leagues' unreported official fixtures. */
  fixtureLeagues: FixtureBlock[];
  /** The one sentence an empty region prints (`regionEmptySentence`). */
  empty: string;
}

export interface JvBlock {
  region: RegionId;
  shortName: string;
  idSuffix: '' | '-socal';
  view: ReturnType<typeof buildDayJvView>;
}

export interface ScoresDayView {
  date: string;
  /** The date of the day page's `<title>`s: `Field hockey scores — Thu Sep 24, 2026`. */
  title: string;
  /** The meta (and og) description. */
  description: string;
  year: number;
  today: string;
  /** Every date with a contest, for the SeasonCalendar. */
  dates: string[];
  games: Game[];
  summary: DaySummary;
  previous: string | null;
  next: string | null;
  /** The leagues whose /schedule/<league> lists this date, config order. */
  seasonLeagues: ReturnType<typeof getLeagueSummaries>;
  regions: DayRegion[];
  /** Both regions have a game: the header counts and the "Full season" links go per region. */
  twoRegions: boolean;
  between: Game[];
  /** The NorCal vs SoCal games that moved. */
  betweenMoved: MovedGame[];
  regionBlocks: RegionBlockData[];
  /** The current league records the day's upcoming league games print (GameList `records`). */
  records: RecordsByGame;
  jvBlocks: JvBlock[];
  /** The day has arrived and not one score has been published. */
  nothingReportedYet: boolean;
  badges: DayBadge[];
  /** "Wednesday, Sep 30" on a phone. */
  shortTitle: string;
  /** "Wednesday, September 30, 2026", the full date. */
  longTitle: string;
}

/** A registry team renders by its short name; anyone else is a name and nothing else. */
function sideName(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.shortName : fallback;
}

/**
 * `game.official.scheduledDate` is the date on the league's official schedule. When it differs from the
 * date the game is actually on, the game moved. One list per block, over that block's games, so a
 * region's note never names the other region's games.
 */
export function movedGames(games: readonly Game[], date: string): MovedGame[] {
  return games
    .filter((game) => game.official && game.official.scheduledDate !== date)
    .map((game) => ({
      awayName: sideName(game.away.slug, game.away.name),
      homeName: sideName(game.home.slug, game.home.name),
      scheduledDate: game.official?.scheduledDate ?? date,
    }));
}

/**
 * The sentence a region with no game that day prints, so a reader in that region sees what is true
 * rather than an empty page: "No Southern California games on this day." When the day's only games
 * with a side in the region are NorCal vs SoCal it adds "besides the NorCal vs SoCal game above", and
 * when the region has JV games that day it says "varsity" and points at them, because "no games" above
 * a list of that region's JV games would not be true. For the same reason a region whose leagues'
 * official schedules list a game no source has says "No source lists …" and points at it.
 */
export function regionEmptySentence({
  regionName,
  betweenCount,
  betweenBelow,
  jvCount,
  fixtureCount,
}: {
  regionName: string;
  betweenCount: number;
  /** Where the NorCal vs SoCal block sits from this region: below NorCal's, above SoCal's. */
  betweenBelow: boolean;
  /** The region's JV games that day (its `#jv` block below). */
  jvCount: number;
  /** The region's leagues' unreported official fixtures. */
  fixtureCount: number;
}): string {
  const besides =
    betweenCount === 0 ? '' : ` besides the NorCal vs SoCal ${gameWord(betweenCount)} ${betweenBelow ? 'below' : 'above'}`;
  const jvNote = jvCount === 0 ? '' : `; the JV ${gameWord(jvCount)} ${jvCount === 1 ? 'is' : 'are'} below`;
  const varsity = jvCount === 0 ? '' : 'varsity ';
  // A league's official fixture with no source behind it (the blocks at the end of the region) is still a
  // game on that day, so a region with one never reads "No … games"; none such on 2026-10-06's data.
  return fixtureCount === 0
    ? `No ${regionName} ${varsity}games on this day${besides}${jvNote}.`
    : `No source lists a ${regionName} ${varsity}game on this day${besides}; ${
        fixtureCount === 1 ? 'one on a league’s official schedule is' : `${fixtureCount} on league official schedules are`
      } below${jvNote}.`;
}

/** One run of badges: "6 games", "4 final scores", "2 to come", "1 not reported", each led by `lead`. */
function countBadges(counts: ReturnType<typeof countGames>, lead: string): string[] {
  const out = [`${lead}${counts.total} ${gameWord(counts.total)}`];
  if (counts.final > 0) out.push(plural(counts.final, 'final score'));
  if (counts.upcoming > 0) out.push(`${counts.upcoming} to come`);
  if (counts.pending > 0) out.push(`${counts.pending} not reported`);
  return out;
}

/** The title shared by `<title>` and og:title: the sport first, "Scores for Thu Sep 24" alone could be any sport's. */
function metaTitle(date: string, year: number): string {
  return `Field hockey scores — ${shortDate(date)}, ${year}`;
}

/** The day page for `date`, or null for a date with no contest (a 404, not a blank page). */
export function buildScoresDayView(date: string): ScoresDayView | null {
  if (!scoresParam(date)) return null;
  const dates = getGameDates();
  const index = dates.indexOf(date);

  const games = getGames({ date });
  const year = parseLocal(date).year;
  const longDateText = `${longDate(date)}, ${year}`;
  const summary = daySummary(games, longDateText);
  const previous = index > 0 ? dates[index - 1] : null;
  const next = index < dates.length - 1 ? dates[index + 1] : null;
  const today = getToday();
  const fixtures = getOfficialFixtures().filter((fixture) => fixture.dateKey === date);
  const fixtureLeagues = getLeagueSummaries()
    .map((league) => ({ league, rows: fixtures.filter((f) => f.league === league.id) }))
    .filter((block) => block.rows.length > 0);
  const { regions, between } = dayRegions(games);
  /* Both regions have a game (a NorCal vs SoCal game gives each one): the header counts and the
     "Full season" links go per region. A one-region day keeps the page's header as it always was. */
  const twoRegions = regions.every((region) => region.withSide.length > 0);
  // The day's JV games, after everything varsity (lib/queries/jv.ts), apart from every varsity count; one block per region.
  const jvBlocks = REGIONS.map((region) => ({
    region: region.id,
    shortName: region.shortName,
    idSuffix: regionIdSuffix(region.id),
    view: buildDayJvView(date, region.id),
  })).filter((block) => block.view.rows.length > 0);
  /* The leagues whose /schedule/<league> lists this date: every league with a side in one of the
     day's games (a cross-league game is on both leagues' lists), config order. */
  const involved = new Set(leaguesInvolved(games));
  const seasonLeagues = getLeagueSummaries().filter((league) => involved.has(league.id));
  /* The day has arrived and not one score has been published. The day still renders in full, with
     the promise attached, rather than looking like nothing happened (DESIGN §8). The wording never
     claims the games were played: at 5pm on a game day they may not have started. */
  const nothingReportedYet = date <= today && summary.total > 0 && summary.final === 0;

  /* One run of badges for the day, or, when both regions have a game, one per region, each scoped
     to its region and led by its name ("NorCal: 6 games", "4 final scores" … "SoCal: 9 games" …). Without
     JS both runs show, NorCal first. "Today" is the day's, unscoped. */
  const badges: DayBadge[] = twoRegions
    ? regions.flatMap((region) =>
        countBadges(countGames(region.withSide), `${region.shortName}: `).map((text) => ({
          key: `${region.id}:${text}`,
          text,
          region: region.id,
        })),
      )
    : countBadges(summary, '').map((text) => ({ key: text, text }));
  if (date === today) badges.push({ key: 'Today', text: 'Today' });

  const regionBlocks = regions.map((region, i): RegionBlockData => {
    const regionFixtures = fixtureLeagues.filter(({ league }) => regionOf(league.id) === region.id);
    return {
      region,
      first: i === 0,
      betweenCount: between.length,
      moved: movedGames(region.games, date),
      fixtureLeagues: regionFixtures,
      empty: regionEmptySentence({
        regionName: region.name,
        betweenCount: between.length,
        betweenBelow: i === 0,
        jvCount: jvBlocks.find((block) => block.region === region.id)?.view.rows.length ?? 0,
        fixtureCount: regionFixtures.reduce((n, block) => n + block.rows.length, 0),
      }),
    };
  });

  return {
    date,
    title: metaTitle(date, year),
    description: dayDescription(games, longDateText),
    year,
    today,
    dates,
    games,
    summary,
    previous,
    next,
    seasonLeagues,
    regions,
    twoRegions,
    between,
    betweenMoved: movedGames(between, date),
    regionBlocks,
    records: recordsByGame(games),
    jvBlocks,
    nothingReportedYet,
    badges,
    /* "Wednesday, Sep 30" on a phone: the full "Wednesday, September 30, 2026" took two lines of
       28px h1 at 390 on most days. The full date is still the h1's accessible name (the short form
       is aria-hidden), and from 768px it is what shows. */
    shortTitle: `${longDate(date).split(',')[0]}, ${monthDay(date)}`,
    longTitle: longDate(date),
  };
}
