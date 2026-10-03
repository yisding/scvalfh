/**
 * Everything /teams and /teams/[slug] need, derived once per page.
 *
 * The page reads the snapshot ONLY through lib/data.ts and every score goes through
 * lib/format's renderScore / components/ui/game-view's describeGame — nothing here reads
 * `game.home.score` to decide what to print. The only arithmetic in this file is counting
 * fixtures and finding the games either side of "today", and "today" is always
 * `localDateKey(snapshot.fetchedAt)` (getToday()), never Date.now(), so the build is
 * reproducible (BUILD-BRIEF).
 */

import {
  getGames,
  getHeadToHead,
  getOfficialFixtures,
  getStandingFor,
  getTeamBySlug,
  getTeamForm,
  getTeams,
  getToday,
  type FormGame,
} from '../../lib/data';
import { gameWhen, monthDay, ordinal, recordString, shortDate } from '../../lib/format';
import { DIVISION_LABELS } from '../../lib/season';
import type {
  Division,
  Game,
  OfficialFixture,
  Outcome,
  Record3,
  Standing,
  Team,
  TeamSlug,
} from '../../lib/types';
import type { FormEntry } from '../ui/FormStrip';
import { describeGame } from '../ui/game-view';

/** One division opponent this team has not beaten yet (DESIGN §3.7). */
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
  /** Official SCVAL fixtures against them with no MaxPreps contest (never published). */
  unreportedFixtures: number;
}

export interface TeamPageView {
  team: Team;
  standing: Standing | undefined;
  division: Division;
  divisionLabel: string;
  divisionSize: number;
  /** false ⇒ every number renders as an em dash, never 0-0-0 (DESIGN §8). */
  hasResults: boolean;
  /** League contests in date order, played and scheduled. */
  leagueLog: Game[];
  /** Non-league contests in date order — never interleaved with the league log (DESIGN §5.4). */
  nonLeagueLog: Game[];
  /** getTeamForm().leagueGames — what MarginStrip takes. */
  marginEntries: FormGame[];
  /** The most recent game at or before today that has been played — final OR score-pending. */
  last: Game | null;
  /** The next scheduled, live or postponed contest at or after today. */
  next: Game | null;
  /** Official SCVAL fixtures with no MaxPreps contest (SPEC §1.3). */
  officialFixtures: OfficialFixture[];
  leaguePlayed: number;
  /** Feed contests + official fixtures we never got a contest for = the 14-game slate. */
  leagueScheduled: number;
  unbeaten: UnbeatenOpponent[];
  /** Last five league finals, oldest first, each linking to its game page. */
  formEntries: FormEntry[];
  /** Everything the NEXT card prints, derived here so TeamNextGame stays presentational. */
  nextCard: NextCard;
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
  /** The registry team when the opponent is one of the 15; it draws the 32px monogram. */
  opponent: Team | undefined;
  /** `shortName` for one of the 15, the source name for anyone else. */
  opponentName: string;
  /** '3-3-1 · 4th in El Camino' — SCVAL opponents only, null for everyone else. */
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
       * An official SCVAL fixture dated BEFORE this game, which no source has published as a
       * contest. The fixture list marks it Upcoming, so the card names it rather than let the
       * page contradict itself; it does not take Next's place (a contest has a time and a page).
       */
      officialBefore: { dateLabel: string; versus: 'vs' | 'at'; opponentName: string } | null;
    })
  | (NextOpponent & { kind: 'official'; fixture: OfficialFixture })
  | { kind: 'none' };

/**
 * The PLACE tile's sub-line. The tile's own value is the ordinal ('6th'), so this one completes
 * that sentence: 'of 8 in De Anza', with '(tied)' appended when the team is level on points.
 *
 * Appended, not prefixed: leading with 'tied · ' put the qualifier where the noun belongs and the
 * tile read '6th / PLACE / tied · of 8 in De Anza' — a sentence with its subject deleted. The
 * team's own OG card and `TeamIdentity` both already say '6th of 8 (tied)'.
 */
export function placeSub(view: TeamPageView): string {
  const shared = view.standing?.tiebreak.shared ? ' (tied)' : '';
  return `of ${view.divisionSize} in ${view.divisionLabel}${shared}`;
}

function byDate(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal);
}

function outcomeFor(game: Game, teamId: string): Outcome | null {
  if (game.status !== 'final') return null;
  const mine = game.home.teamId === teamId ? game.home : game.away;
  const theirs = game.home.teamId === teamId ? game.away : game.home;
  if (mine.score === null || theirs.score === null) return null;
  return mine.score > theirs.score ? 'W' : mine.score < theirs.score ? 'L' : 'T';
}

/** The chip label's score, from this team's side: '0–7'. */
function scorePair(game: Game, teamId: string): string | undefined {
  const mine = game.home.teamId === teamId ? game.home : game.away;
  const theirs = game.home.teamId === teamId ? game.away : game.home;
  if (mine.score === null || theirs.score === null) return undefined;
  return `${mine.score}–${theirs.score}`;
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

/** The next official SCVAL fixture we have no contest for, at or after `today`. */
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
 * when the place is shared, 'no league results yet' before they have one. Only one of the 15 has
 * a standing; a non-SCVAL opponent gets null and the card prints no line at all.
 */
export function opponentRecordLine(opponent: Team | undefined): string | null {
  if (!opponent) return null;
  const standing = getStandingFor(opponent.slug);
  if (!standing || !standing.hasReportedResults) return 'no league results yet';
  const place = `${standing.tiebreak.shared ? 'tied ' : ''}${ordinal(standing.computed.place)}`;
  return `${recordString(standing.computed)} \u00b7 ${place} in ${DIVISION_LABELS[opponent.division]}`;
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
    display.deciderTag === 'F' ? ' by forfeit' : display.deciderTag ? ` in ${display.deciderTag}` : '';
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
 * say what we know: a neutral site is 'Neutral site'; an away game at one of the 15 is played at
 * that school, so its city ('Santa Clara, CA') is honest. When the official grid names the other
 * school as host (`hostConflict`) the sources disagree on WHERE, so we print nothing rather than
 * pick one; a home game needs no line, and a non-SCVAL host's city is not in the registry.
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

function chipsFor(game: Game): NextChip[] {
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

/** The NEXT card: the next contest, else the next official-only fixture, else nothing left. */
export function buildNextCard(
  team: Team,
  next: Game | null,
  officialFixtures: readonly OfficialFixture[],
  today: string,
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
      record: opponentRecordLine(opponent),
      place: placeLine(next, team),
      earlier: earlierMeeting(team, opponent, next.dateLocal),
      chips: chipsFor(next),
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
      record: opponentRecordLine(opponent),
    };
  }
  return { kind: 'none' };
}

/** 'vs' / 'at' and the opponent of an official fixture, seen from `team`'s side. */
function fixtureOpponent(
  fixture: OfficialFixture,
  team: Team,
): { versus: 'vs' | 'at'; opponent: Team | undefined; opponentName: string } {
  const mineIsHome = fixture.homeSlug === team.slug;
  const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
  return {
    versus: mineIsHome ? 'vs' : 'at',
    opponent,
    opponentName: opponent
      ? opponent.shortName
      : mineIsHome
        ? fixture.awayName
        : fixture.homeName,
  };
}

export function buildTeamPageView(slug: string): TeamPageView | undefined {
  const team = getTeamBySlug(slug);
  if (!team) return undefined;

  const today = getToday();
  const all = getGames({ teamId: team.slug }).sort(byDate);
  const leagueLog = all.filter((g) => g.isLeague);
  const nonLeagueLog = all.filter((g) => !g.isLeague);
  const standing = getStandingFor(team.slug);
  const form = getTeamForm(team.slug);

  const finals = all.filter((g) => g.status === 'final' && g.dateKey <= today);
  const leagueFinals = finals.filter((g) => g.isLeague);
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

  return {
    team,
    standing,
    division: team.division,
    divisionLabel: DIVISION_LABELS[team.division],
    divisionSize: getTeams(team.division).length,
    hasResults: standing?.hasReportedResults ?? false,
    leagueLog,
    nonLeagueLog,
    marginEntries: form?.leagueGames ?? [],
    last: played.length > 0 ? played[played.length - 1] : null,
    next,
    officialFixtures,
    leaguePlayed: leagueFinals.length,
    leagueScheduled: leagueLog.length + officialFixtures.length,
    unbeaten: buildUnbeaten(team, leagueLog, today),
    formEntries,
    nextCard: buildNextCard(team, next, officialFixtures, today),
    today,
  };
}

/** The /teams index: both divisions, in the standings order. */
export interface TeamTileData {
  team: Team;
  standing: Standing | undefined;
  hasResults: boolean;
}

export function buildTeamsIndex(division: Division): TeamTileData[] {
  // Sorted by the name the tile actually SHOWS, so the grid reads alphabetically to a reader
  // looking for their school ("Mitty", not "Archbishop Mitty" filed under A).
  return [...getTeams(division)]
    .sort((a, b) => a.shortName.localeCompare(b.shortName))
    .map((team) => {
      const standing = getStandingFor(team.slug);
      return { team, standing, hasResults: standing?.hasReportedResults ?? false };
    });
}

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
    return `${letter} ${mine.glyph}\u2013${theirs.glyph} ${where}${tag}`;
  }
  if (display.kind === 'scheduled') {
    return `${where} \u00b7 ${gameWhen(game)}`;
  }
  return `${display.statusLabel} \u00b7 ${where}`;
}

/**
 * The same one-line shape as `gameHeadline`, for a fixture that exists only in the official SCVAL
 * grid. It is labelled as such: there is no contest, no start time and no game page, so it must
 * never read like a scheduled game we have details for (SPEC §1.3).
 */
export function officialFixtureHeadline(fixture: OfficialFixture, team: Team): string {
  const mineIsHome = fixture.homeSlug === team.slug;
  const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const opponentName = mineIsHome ? fixture.awayName : fixture.homeName;
  const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
  const name = opponent ? opponent.shortName : opponentName;
  return `${mineIsHome ? 'vs' : 'at'} ${name} \u00b7 ${shortDate(fixture.dateKey)} (SCVAL schedule)`;
}
