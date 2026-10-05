/**
 * Everything /teams and /teams/[slug] need, derived once per page.
 *
 * The page reads the snapshot ONLY through lib/data.ts and every printed score comes from
 * lib/format's renderScore (the form chips' `0–7`) or components/ui/game-view's describeGame —
 * nothing here PRINTS `game.home.score`. The only arithmetic in this file is counting
 * fixtures and finding the games either side of "today", and "today" is always
 * `localDateKey(snapshot.fetchedAt)` (getToday()), never Date.now(), so the build is
 * reproducible (BUILD-BRIEF).
 */

import {
  getGames,
  getHeadToHead,
  getLastLeagueResultDate,
  getOfficialFixtures,
  getStandingContext,
  getStandingFor,
  getStandings,
  getTeamBySlug,
  getTeamForm,
  getTeamPostseasonLine,
  getTeams,
  getTeamsGrouped,
  getToday,
  type FormGame,
  type LeagueSummary,
  type StandingContext,
  type TeamPostseasonLine,
} from '../../lib/data';
import {
  dateSpan,
  gameWhen,
  monthDay,
  ordinal,
  plural,
  recordString,
  renderScore,
  shortDate,
  sideOutcome,
  timeOfDayPT,
} from '../../lib/format';
import { divisionHeading, getDivision, getLeague, leaguePlayEnds } from '../../lib/leagues';
import { pinLabel } from '../../lib/pin-label';
import { outcomesFor } from '../../lib/standings';
import type {
  DivisionId,
  Game,
  LeagueId,
  OfficialFixture,
  Outcome,
  Record3,
  SectionId,
  Standing,
  Team,
  TeamSlug,
} from '../../lib/types';
import { getEloBoard } from '../leaders/leaders-view';
import { buildOverviewDivision, type OverviewDivision } from '../standings/standings-view';
import type { FormEntry } from '../ui/FormStrip';
import { describeGame } from '../ui/game-view';

/** One opponent in this team's table that it has not beaten yet (DESIGN §3.7). */
export interface UnbeatenOpponent {
  slug: TeamSlug;
  name: string;
  shortName: string;
  /** League record against this opponent, from our point of view. */
  record: Record3;
  /** Games already played against them. */
  played: number;
  /** Remaining league meetings that are in the feed. */
  remaining: number;
  /** The next meeting's date key, when one is scheduled. */
  nextDate: string | null;
  /** Official fixtures against them with no published contest (never a result). */
  unreportedFixtures: number;
}

/**
 * The team page's Elo card (DESIGN §20): this team's rating from lib/ratings.ts, and its place on
 * /leaders' Elo board when the board lists it, read off that board so the two cannot disagree.
 */
export interface TeamEloView {
  /** Whole Elo points; null when the team has neither a final this season nor a start from last. */
  elo: number | null;
  /** This season's finals its rating counts: every final against one of the five leagues' teams. */
  games: number;
  /** Rated from last season alone: no counted final yet this season. */
  preseason: boolean;
  /** Played this season, but fewer games than the Elo board's minimum, so not on the board yet. */
  provisional: boolean;
  /** The season the ratings start from ("2025-26"); null when every team starts at average. */
  seededFrom: string | null;
  /**
   * Whether THIS team started from its rating in `seededFrom`. False for a team with no counted
   * final last season against the five leagues' teams (a program new to the registry, or one
   * whose games then were all forfeits or unscored): it started at average, even when every other
   * team was seeded.
   */
  seeded: boolean;
  /** The Elo board's minimum games. */
  minGames: number;
  /** Its place in the board's top 10, as the board prints it; null when the board does not list it. */
  boardPlace: { rank: number; tied: boolean } | null;
}

/** The Elo card for one team, read off the board /leaders prints (getEloBoard), so the two cannot disagree. */
function teamElo(slug: TeamSlug): TeamEloView {
  const board = getEloBoard();
  const rating = board.ratingBySlug.get(slug);
  const row = board.board.rows.find((r) => r.team.slug === slug);
  const minGames = board.minimum.min;
  const games = rating?.games ?? 0;
  return {
    elo: rating?.elo ?? null,
    games,
    preseason: rating !== undefined && games === 0,
    provisional: rating !== undefined && games > 0 && games < minGames,
    seededFrom: board.seededFrom,
    seeded: rating?.seeded ?? false,
    minGames,
    boardPlace: row ? { rank: row.rank, tied: row.tied } : null,
  };
}

/** The league facts a team page writes into its copy, all from config (lib/leagues.ts). */
export interface TeamLeagueCopy {
  id: LeagueId;
  /** 'SCVAL' */
  shortName: string;
  /** 'Santa Clara Valley Athletic League' */
  name: string;
  section: SectionId;
  postseasonKind: 'ccs-ladder' | 'league-tournament' | 'unbracketed-tournament';
  /**
   * The name of the league's own postseason event ('MCAL tournament' is `${short} tournament`;
   * 'Super Regional' for an unbracketed league); null for a CCS ladder, whose event is CCS's.
   */
  postseasonName: string | null;
  /** 'division' (SCVAL, BVAL) | 'league' (PCAL, MCAL): the noun for a game in this team's table. */
  gamesWord: 'division' | 'league';
  /** 'Article VI §1 (double round robin; …)' */
  doubleRoundRobin: string;
  /** The last official league date ('2026-10-28'). */
  leaguePlayEnds: string;
  /**
   * `The SCVAL league season ends Wed Oct 28 and the SCVAL crossover is Fri Oct 30.` — the end-of-season
   * sentence of TeamNextGame (SPEC §10.5).
   */
  seasonEndSentence: string;
  /**
   * `We will list a playoff game as soon as CCS publishes the bracket.` | `… as soon as MCAL posts the
   * bracket.` | `We will not guess a bracket: the Super Regional’s format and site are not published yet.`
   */
  bracketSentence: string;
}

export interface TeamPageView {
  team: Team;
  standing: Standing | undefined;
  league: TeamLeagueCopy;
  division: DivisionId;
  /** null for a single-division league (PCAL, MCAL): never rendered as a division label. */
  divisionHeading: string | null;
  /** `divisionHeading ?? league short`: what "of N in …" names. */
  scopeLabel: string;
  divisionSize: number;
  /** `Red-Tailed Hawks · MCAL · Mill Valley` | `Pirates · De Anza · SCVAL · San Jose` */
  identityLine: string;
  /** PinControl's accessible name, from lib/pin-label.ts. */
  pinLabel: string;
  /** `/standings/<league>#<division>` */
  standingsHref: string;
  /** `SCVAL standings` (SectionHeader / the link draws the arrow). */
  standingsLabel: string;
  /** The division's official schedule (config); null when the league publishes none (`official.mode` 'none'). */
  officialScheduleUrl: string | null;
  /** false ⇒ every number renders as an em dash, never 0-0-0 (DESIGN §8). */
  hasResults: boolean;
  /** GP counted / scheduled, games left and the points ceiling (lib/data.ts §5.10). */
  context: StandingContext | undefined;
  /** getTeamPostseasonLine(slug): null for a team with no results (never placed by merit). */
  postseasonLine: TeamPostseasonLine | null;
  /** The status chip is accent only for a sole automatic berth or bye. */
  postseasonAccent: boolean;
  /** Games that count for this team's table (`countsFor !== null`), date order, played and scheduled. */
  leagueLog: Game[];
  /** Every other contest (non-league and postseason), date order — never interleaved with the league log (DESIGN §5.4). */
  nonLeagueLog: Game[];
  /** How many of `nonLeagueLog` are postseason games (crossover, play-in, tournament, CCS). */
  postseasonCount: number;
  /** getTeamForm().leagueGames — what MarginStrip takes. */
  marginEntries: FormGame[];
  /** The most recent game at or before today that has been played — final OR score-pending. */
  last: Game | null;
  /** The next scheduled, live or postponed contest at or after today. */
  next: Game | null;
  /** Official fixtures with no published contest. */
  officialFixtures: OfficialFixture[];
  leaguePlayed: number;
  /** The league's scheduled count for this team (config gamesPerTeam). */
  leagueScheduled: number;
  unbeaten: UnbeatenOpponent[];
  /** Last five league finals, oldest first, each linking to its game page. */
  formEntries: FormEntry[];
  /** Everything the NEXT card prints, derived here so TeamNextGame stays presentational. */
  nextCard: NextCard;
  /** The Elo card under the stat tiles. */
  elo: TeamEloView;
  today: string;
}

/** The latest earlier final against the next opponent, worded from this team's side. */
export interface EarlierMeeting {
  contestId: string;
  outcome: Outcome;
  /** 'Earlier: lost 0–7 at home, Sep 10' */
  text: string;
}

/** One external link pill on the NEXT card. */
export interface NextChip {
  href: string;
  label: string;
}

/** The opponent half of the NEXT card, shared by the contest and the official-fixture branches. */
interface NextOpponent {
  /** 'Today · Fri Oct 2', 'Fri Oct 2' or 'Date TBA'. */
  dateLabel: string;
  versus: 'vs' | 'at';
  /** The registry team when the opponent is one of the site's teams; it draws the 32px monogram. */
  opponent: Team | undefined;
  /** `shortName` for a registry team, the source name for anyone else. */
  opponentName: string;
  /** '3-3-1 · 4th in El Camino' — registry opponents only, null for everyone else. */
  record: string | null;
}

export type NextCard =
  | (NextOpponent & {
      kind: 'game';
      game: Game;
      /** Venue name, 'Neutral site' or '<City>, CA' — or null when we cannot say honestly. */
      place: string | null;
      earlier: EarlierMeeting | null;
      /** Directions, NFHS stream, Tickets, MaxPreps box score: only links that exist. */
      chips: NextChip[];
      /**
       * A fixture from the league's official schedule dated BEFORE this game, which no source has
       * published as a contest. The fixture list marks it Upcoming, so the card names it rather
       * than let the page contradict itself; it does not take Next's place (a contest has a time
       * and a page). `timeLabel` is the league's published start ('4:00 PM PT'), when it gives one.
       */
      officialBefore: {
        dateLabel: string;
        timeLabel: string | null;
        versus: 'vs' | 'at';
        opponentName: string;
      } | null;
    })
  | (NextOpponent & { kind: 'official'; fixture: OfficialFixture })
  | { kind: 'none' };

/** `of 8 in De Anza` | `of 9 in MCAL` — the words after the place ordinal. */
export function placeScope(divisionSize: number, scopeLabel: string): string {
  return `of ${divisionSize} in ${scopeLabel}`;
}

/**
 * The PLACE tile's sub-line. The tile's own value is the ordinal ('6th', or 'T-6th' with 'tied for
 * 6th' spoken when the team is level on points), so this one completes that sentence: 'of 8 in De
 * Anza'. The tie lives in the value, as it does on the identity card above ('T-7th of 8 in El
 * Camino'), so one page never writes a shared place two ways.
 */
export function placeSub(view: TeamPageView): string {
  return placeScope(view.divisionSize, view.scopeLabel);
}

/** `<mascot> · <division heading> · <league short> · <city>`; single-division leagues drop the heading. */
export function identityLine(team: Pick<Team, 'mascot' | 'city' | 'division'>, leagueShort: string): string {
  const heading = divisionHeading(team.division);
  return [team.mascot, heading, leagueShort, team.city].filter((p): p is string => !!p).join(' · ');
}

/** The league copy for a team page, from config only. */
export function leagueCopy(leagueId: LeagueId): TeamLeagueCopy {
  const league = getLeague(leagueId);
  const ps = league.postseason;
  const ends = leaguePlayEnds(league.id);
  const base = {
    id: league.id,
    shortName: league.shortName,
    name: league.name,
    section: league.sectionId,
    gamesWord: league.rules.gamesWord,
    doubleRoundRobin: league.rules.citations.doubleRoundRobin,
    leaguePlayEnds: ends,
  };
  const ended = `The ${league.shortName} league season ends ${shortDate(ends)}`;
  switch (ps.kind) {
    case 'ccs-ladder': {
      const first = ps.pairings[0];
      let after = '';
      if (first?.tag === 'scval-crossover') after = ` and the ${league.shortName} crossover is ${shortDate(first.date)}`;
      else if (first?.tag === 'bval-play-in') after = ` and the ${league.shortName} play-in is ${shortDate(first.date)}`;
      return {
        ...base,
        postseasonKind: ps.kind,
        postseasonName: null,
        seasonEndSentence: `${ended}${after}.`,
        bracketSentence: 'We will list a playoff game as soon as CCS publishes the bracket.',
      };
    }
    case 'league-tournament': {
      const firstRound = [...ps.rounds].sort((a, b) => a.date.localeCompare(b.date))[0];
      const after = firstRound ? ` and the ${ps.name} starts ${shortDate(firstRound.date)}` : '';
      return {
        ...base,
        postseasonKind: ps.kind,
        postseasonName: ps.name,
        seasonEndSentence: `${ended}${after}.`,
        bracketSentence: `We will list a playoff game as soon as ${league.shortName} posts the bracket.`,
      };
    }
    case 'unbracketed-tournament':
      // No bracket will be drawn: the sentences state the published dates and say the rest is not known.
      return {
        ...base,
        postseasonKind: ps.kind,
        postseasonName: ps.name,
        seasonEndSentence: `${ended}; the ${ps.name} follows, ${dateSpan(ps.dates.first, ps.dates.last)}.`,
        bracketSentence: `We will not guess a bracket: the ${ps.name}\u2019s format and site are not published yet.`,
      };
  }
}

function byDate(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal);
}

function outcomeFor(game: Game, teamId: string): Outcome | null {
  return sideOutcome(game, game.home.teamId === teamId ? 'home' : 'away');
}

/** The chip label's score, from this team's side: '0–7'. */
function scorePair(game: Game, teamId: string): string | undefined {
  const score = renderScore(game);
  if (score.kind !== 'final') return undefined;
  return game.home.teamId === teamId ? `${score.home}–${score.away}` : `${score.away}–${score.home}`;
}

function buildUnbeaten(team: Team, leagueLog: Game[], today: string): UnbeatenOpponent[] {
  const opponents = getTeams(team.division).filter((t) => t.slug !== team.slug);
  const fixtures = getOfficialFixtures({ slug: team.slug });

  return opponents
    .map((opponent): UnbeatenOpponent => {
      const meetings = leagueLog.filter(
        (g) => g.home.slug === opponent.slug || g.away.slug === opponent.slug,
      );
      const record: Record3 = { w: 0, l: 0, t: 0 };
      let played = 0;
      let remaining = 0;
      let nextDate: string | null = null;
      for (const game of meetings) {
        const outcome = outcomeFor(game, team.id);
        if (outcome) {
          played += 1;
          if (outcome === 'W') record.w += 1;
          else if (outcome === 'L') record.l += 1;
          else record.t += 1;
        } else {
          remaining += 1;
          if (game.dateKey >= today && (nextDate === null || game.dateKey < nextDate)) {
            nextDate = game.dateKey;
          }
        }
      }
      return {
        slug: opponent.slug,
        name: opponent.name,
        shortName: opponent.shortName,
        record,
        played,
        remaining,
        nextDate,
        unreportedFixtures: fixtures.filter(
          (f) => f.awaySlug === opponent.slug || f.homeSlug === opponent.slug,
        ).length,
      };
    })
    .filter((o) => o.record.w === 0)
    // Soonest meeting first — "who is left" is a calendar question. Opponents with nothing left
    // to play sort after the ones we can still beat, then alphabetically.
    .sort((a, b) => {
      if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
      if (a.nextDate) return -1;
      if (b.nextDate) return 1;
      return a.shortName.localeCompare(b.shortName);
    });
}

/** The next official fixture we have no contest for, at or after `today`. */
export function nextOfficialFixture(
  fixtures: readonly OfficialFixture[],
  today: string,
): OfficialFixture | null {
  const ahead = fixtures
    .filter((f) => f.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return ahead.length > 0 ? ahead[0] : null;
}

/** 'Today · Fri Oct 2' when the day is `today` (getToday(), never the clock), else 'Fri Oct 2'. */
function dateLabelFor(dateKey: string, dateLocal: string, today: string): string {
  return dateKey === today ? `Today \u00b7 ${shortDate(dateLocal)}` : shortDate(dateLocal);
}

/**
 * The opponent's league standing in one line: '3-3-1 · 4th in El Camino', 'tied 7th in El Camino'
 * when the place is shared, 'no league results yet' before they have one (never 0-0-0). Only a
 * registry team has a standing; an opponent outside the registry gets null and the card prints
 * no line at all.
 *
 * The scope is league-aware: an opponent from the page's own league is placed in its division
 * heading (or the league's short name for a one-table league: '2nd in MCAL'); one from another
 * league names that league too ('4th in SCVAL El Camino'), so a cross-league opponent's place is
 * never read as a place in this team's table. PCAL and MCAL never get a division label.
 */
export function opponentRecordLine(opponent: Team | undefined, leagueId: LeagueId): string | null {
  if (!opponent) return null;
  const standing = getStandingFor(opponent.slug);
  if (!standing || !standing.hasReportedResults) return 'no league results yet';
  const place = `${standing.tiebreak.shared ? 'tied ' : ''}${ordinal(standing.computed.place)}`;
  const heading = divisionHeading(opponent.division);
  const short = getLeague(opponent.league).shortName;
  const scope =
    opponent.league === leagueId ? (heading ?? short) : heading ? `${short} ${heading}` : short;
  return `${recordString(standing.computed)} \u00b7 ${place} in ${scope}`;
}

/**
 * The most recent FINAL against `opponent` before `before` (a dateLocal), worded through
 * describeGame so the glyphs obey the never-0-0 rule: 'Earlier: lost 0–7 at home, Sep 10'. A
 * meeting that was played and never scored, or cancelled, has no result to recall, so it is
 * skipped rather than printed as a dash.
 */
export function earlierMeeting(
  team: Team,
  opponent: Team | undefined,
  before: string,
): EarlierMeeting | null {
  if (!opponent) return null;
  const meetings = (getHeadToHead(team.slug, opponent.slug)?.games ?? []).filter(
    (g) => g.status === 'final' && g.dateLocal < before,
  );
  const game = meetings[meetings.length - 1];
  if (!game) return null;
  const display = describeGame(game, team.slug);
  const outcome = display.perspectiveOutcome;
  if (display.kind !== 'final' || !outcome) return null;
  const mineIsHome = game.home.slug === team.slug;
  const mine = mineIsHome ? display.home : display.away;
  const theirs = mineIsHome ? display.away : display.home;
  const verb = outcome === 'W' ? 'won' : outcome === 'L' ? 'lost' : 'tied';
  const decider =
    display.deciderTag === 'F'
      ? ' by forfeit'
      : display.deciderTag === 'SO'
        ? ' on 1 v 1s'
        : display.deciderTag
          ? ` in ${display.deciderTag}`
          : '';
  const where =
    game.site === 'neutral' ? 'at a neutral site' : mineIsHome ? 'at home' : 'away';
  return {
    contestId: game.contestId,
    outcome,
    text: `Earlier: ${verb} ${mine.glyph}\u2013${theirs.glyph}${decider} ${where}, ${monthDay(game.dateLocal)}`,
  };
}

/**
 * Where the next game is, in words, or nothing. A published venue name wins. Without one we only
 * say what we know: a neutral site is 'Neutral site'; an away game at a registry school is played
 * at that school, so its city ('Santa Clara, CA') is honest. When the official schedule names the
 * other school as host (`hostConflict`) the sources disagree on WHERE, so we print nothing rather
 * than pick one; a home game needs no line, and a host outside the registry has no city here.
 */
function placeLine(game: Game, team: Team): string | null {
  if (game.venue.name) return game.venue.name;
  if (game.provenance.hostConflict) return null;
  if (game.site === 'neutral') return 'Neutral site';
  const mineIsHome = game.home.slug === team.slug;
  if (mineIsHome) return null;
  const host = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  return host ? `${host.city}, CA` : null;
}

/** The NEXT card's external pills (named apart from game-view's private `chipsFor`). */
function nextChips(game: Game): NextChip[] {
  const chips: NextChip[] = [];
  const address = game.venue.address;
  if (address) {
    chips.push({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`,
      label: 'Directions',
    });
  }
  // Named for what is behind them: 'Stream' and 'MaxPreps' did not say which stream or which page.
  if (game.urls.nfhsStream) chips.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) chips.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) chips.push({ href: game.urls.maxpreps, label: 'MaxPreps box score' });
  return chips;
}

/**
 * The NEXT card: the next contest, else the next official-only fixture, else nothing left. `league`
 * is the page's league copy: an opponent's record line is scoped against it (opponentRecordLine).
 */
export function buildNextCard(
  team: Team,
  next: Game | null,
  officialFixtures: readonly OfficialFixture[],
  today: string,
  league: TeamLeagueCopy,
): NextCard {
  if (next) {
    const mineIsHome = next.home.slug === team.slug;
    const side = mineIsHome ? next.away : next.home;
    const opponent = side.slug ? getTeamBySlug(side.slug) : undefined;
    const early = nextOfficialFixture(officialFixtures, today);
    let officialBefore: Extract<NextCard, { kind: 'game' }>['officialBefore'] = null;
    if (early && !next.isDateTba && early.dateKey < next.dateKey) {
      const { versus, opponentName } = fixtureOpponent(early, team);
      officialBefore = {
        dateLabel: dateLabelFor(early.dateKey, early.dateKey, today),
        timeLabel: early.time ? timeOfDayPT(`${early.dateKey}T${early.time}`) : null,
        versus,
        opponentName,
      };
    }
    return {
      kind: 'game',
      game: next,
      dateLabel: next.isDateTba ? 'Date TBA' : dateLabelFor(next.dateKey, next.dateLocal, today),
      versus: describeGame(next, team.slug).versus ?? 'vs',
      opponent,
      opponentName: opponent ? opponent.shortName : side.name,
      record: opponentRecordLine(opponent, league.id),
      place: placeLine(next, team),
      earlier: earlierMeeting(team, opponent, next.dateLocal),
      chips: nextChips(next),
      officialBefore,
    };
  }
  const fixture = nextOfficialFixture(officialFixtures, today);
  if (fixture) {
    const { versus, opponent, opponentName } = fixtureOpponent(fixture, team);
    return {
      kind: 'official',
      fixture,
      dateLabel: dateLabelFor(fixture.dateKey, fixture.dateKey, today),
      versus,
      opponent,
      opponentName,
      record: opponentRecordLine(opponent, league.id),
    };
  }
  return { kind: 'none' };
}

/** 'VALLEY CHRISTIAN' → 'Valley Christian', for a grid name with no registry row behind it. */
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/**
 * 'vs' / 'at' and the opponent of an official fixture, seen from `team`'s side. The one place a
 * fixture's opponent is named (the team page, its OG card and home's pinned card): the registry
 * short name, or the schedule's own spelling title-cased for a school outside the registry.
 */
export function fixtureOpponent(
  fixture: OfficialFixture,
  team: Pick<Team, 'slug'>,
): { mineIsHome: boolean; versus: 'vs' | 'at'; opponent: Team | undefined; opponentName: string } {
  const mineIsHome = fixture.homeSlug === team.slug;
  const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
  return {
    mineIsHome,
    versus: mineIsHome ? 'vs' : 'at',
    opponent,
    opponentName: opponent ? opponent.shortName : titleCase(mineIsHome ? fixture.awayName : fixture.homeName),
  };
}

export function buildTeamPageView(slug: string): TeamPageView | undefined {
  const team = getTeamBySlug(slug);
  if (!team) return undefined;

  const today = getToday();
  const league = leagueCopy(team.league);
  const division = getDivision(team.division);
  const heading = divisionHeading(team.division);
  const all = getGames({ teamId: team.slug }).sort(byDate);
  const leagueLog = all.filter((g) => g.countsFor !== null);
  const nonLeagueLog = all.filter((g) => g.countsFor === null);
  const standing = getStandingFor(team.slug);
  const form = getTeamForm(team.slug);
  const hasResults = standing?.hasReportedResults ?? false;

  const finals = all.filter((g) => g.status === 'final' && g.dateKey <= today);
  const leagueFinals = finals.filter((g) => g.countsFor !== null);
  // LAST is the most recent thing that HAPPENED, which includes a game played and not yet scored:
  // that row renders SCORE NOT REPORTED with two en dashes, never 0-0 (DESIGN §5.2, §8). NEXT is
  // the next thing that has NOT happened, so a score-pending game never poses as an upcoming one.
  const played = all.filter(
    (g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= today,
  );
  const upcoming = all.filter(
    (g) =>
      (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed') &&
      g.dateKey >= today,
  );
  const officialFixtures = getOfficialFixtures({ slug: team.slug });
  const next = upcoming.length > 0 ? upcoming[0] : null;

  const formEntries: FormEntry[] = leagueFinals.slice(-5).map((game) => {
    const theirs = game.home.teamId === team.id ? game.away : game.home;
    const outcome = outcomeFor(game, team.id);
    return {
      // A final always has an outcome; the fallback keeps the type honest rather than asserting.
      outcome: outcome ?? 'T',
      contestId: game.contestId,
      opponent: theirs.slug ? (getTeamBySlug(theirs.slug)?.shortName ?? theirs.name) : theirs.name,
      score: scorePair(game, team.id),
      date: monthDay(game.dateLocal),
    };
  });

  const context = getStandingContext(team.division).get(team.id);
  const outcomes = hasResults && standing ? outcomesFor(standing) : [];
  const scopeLabel = heading ?? league.shortName;

  return {
    team,
    standing,
    league,
    division: team.division,
    divisionHeading: heading,
    scopeLabel,
    divisionSize: getTeams(team.division).length,
    identityLine: identityLine(team, league.shortName),
    pinLabel: pinLabel({
      name: team.name,
      shortName: team.shortName,
      divisionHeading: heading,
      leagueShort: league.shortName,
    }),
    standingsHref: `/standings/${league.id}#${team.division}`,
    standingsLabel: `${league.shortName} standings`,
    officialScheduleUrl: division.official.mode === 'none' ? null : division.official.scheduleUrl,
    hasResults,
    context,
    postseasonLine: getTeamPostseasonLine(team.slug),
    postseasonAccent: outcomes.length === 1 && (outcomes[0] === 'aq' || outcomes[0] === 'bye'),
    leagueLog,
    nonLeagueLog,
    postseasonCount: nonLeagueLog.filter((g) => g.postseason !== null).length,
    marginEntries: form?.leagueGames ?? [],
    last: played.length > 0 ? played[played.length - 1] : null,
    next,
    officialFixtures,
    leaguePlayed: leagueFinals.length,
    leagueScheduled: context?.scheduled ?? division.gamesPerTeam,
    unbeaten: buildUnbeaten(team, leagueLog, today),
    formEntries,
    nextCard: buildNextCard(team, next, officialFixtures, today, league),
    elo: teamElo(team.slug),
    today,
  };
}

// ---------------------------------------------------------------- /teams

export interface TeamsLeagueGroup {
  league: LeagueSummary;
  /** `SCVAL — Santa Clara Valley Athletic League` */
  title: string;
  /** `15 teams` */
  meta: string;
  /** Who the league's schools are, when that is not one section's (config `membershipNote`); null for most. */
  membershipNote: string | null;
  /** `/standings/<league>` */
  standingsHref: string;
  /** `SCVAL standings` */
  standingsLabel: string;
  /**
   * Each division's compact standings table: every team of the division in the engine's order,
   * with its anchor, h4 heading, ladder line and `Full <division> table →` link — the /standings
   * overview's own division view (components/standings/standings-view.ts), so the two pages can
   * never disagree about a place.
   */
  divisions: OverviewDivision[];
}

export interface TeamsSectionGroup {
  id: SectionId;
  /** `Central Coast Section` — the h2 kicker, sentence case as written. */
  name: string;
  leagues: TeamsLeagueGroup[];
}

/** /teams: section → league → division → standings table, config order (SPEC §10.5, DESIGN §18). */
export function buildTeamsByLeague(): TeamsSectionGroup[] {
  const teams = getTeams();
  return getTeamsGrouped().map(({ section, leagues }) => ({
    id: section.id,
    name: section.name,
    leagues: leagues.map(({ league, divisions }) => ({
      league,
      title: `${league.shortName} — ${league.name}`,
      meta: plural(league.teamCount, 'team'),
      membershipNote: getLeague(league.id).membershipNote,
      standingsHref: `/standings/${league.id}`,
      standingsLabel: `${league.shortName} standings`,
      divisions: divisions.map((d) =>
        buildOverviewDivision({
          division: d.id,
          standings: getStandings(d.id),
          teams,
          throughDate: getLastLeagueResultDate({ division: d.id }),
        }),
      ),
    })),
  }));
}

// ---------------------------------------------------------------- one-line headlines (OG card)

/**
 * One line describing a game from this team's side: `L 0–7 vs Saint Francis`, or
 * `at Los Altos · Tue Sep 29, 4:00 PM PT` when it has not been played.
 *
 * Every glyph comes from describeGame, so the never-0-0 rule holds here too: an unreported game
 * prints its written status and two en dashes, never a zero (DESIGN §5.2, §5.3).
 */
export function gameHeadline(game: Game, team: Team): string {
  const display = describeGame(game, team.slug);
  const mineIsHome = game.home.slug === team.slug;
  const mine = mineIsHome ? display.home : display.away;
  const theirs = mineIsHome ? display.away : display.home;
  const opponentTeam = theirs.slug ? getTeamBySlug(theirs.slug) : undefined;
  const opponent = opponentTeam ? opponentTeam.shortName : theirs.name;
  const where = `${display.versus ?? 'vs'} ${opponent}`;
  if (display.kind === 'final') {
    const letter = display.perspectiveOutcome ?? 'T';
    const tag = display.deciderTag ? ` ${display.deciderTag}` : '';
    return `${letter} ${mine.glyph}–${theirs.glyph} ${where}${tag}`;
  }
  if (display.kind === 'scheduled') {
    return `${where} · ${gameWhen(game)}`;
  }
  return `${display.statusLabel} · ${where}`;
}

/**
 * The same one-line shape as `gameHeadline`, for a fixture that exists only in the league's
 * official schedule. It is labelled as such — `(BVAL schedule)` — because there is no contest, no
 * start time and no game page, so it must never read like a scheduled game we have details for.
 */
export function officialFixtureHeadline(fixture: OfficialFixture, team: Team): string {
  const { versus, opponentName } = fixtureOpponent(fixture, team);
  const short = getLeague(fixture.league).shortName;
  return `${versus} ${opponentName} · ${shortDate(fixture.dateKey)} (${short} schedule)`;
}
