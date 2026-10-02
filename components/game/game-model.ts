/**
 * The /game/[id] view model — one pure assembly step shared by the page, its `generateMetadata`
 * and its `opengraph-image`, so a link preview and the page itself can never disagree.
 *
 * Every number here comes through `describeGame()` (components/ui/game-view.ts), which is the one
 * implementation of the DESIGN §5.2 table. Nothing in this module reads `game.home.score` /
 * `game.away.score`, so a missing score cannot become `0-0` in a page title, an OG card or a
 * `<meta name="description">` any more than it can in the body (DESIGN §5.3, §10.9e).
 *
 * This module reads the snapshot through lib/data.ts only, so it is SERVER-ONLY (lib/data does an
 * fs read at module scope). The components under components/game/ take its output as plain data and
 * stay free of it.
 */

import {
  getGameById,
  getGames,
  getSbliveCrossCheck,
  getStandingFor,
  getTeamBySlug,
  getTeamForm,
} from '../../lib/data';
import { dateWithYear, monthDay, recordString, shortDate, timeOfDayPT } from '../../lib/format';
import { BYLAW_CITATIONS, DIVISION_LABELS } from '../../lib/season';
import type {
  Division,
  Game,
  GameSide,
  Outcome,
  ScoreConflictRow,
  Standing,
  Team,
} from '../../lib/types';
import type { FormEntry } from '../ui/FormStrip';
import { describeGame, type GameDisplay, type SideView } from '../ui/game-view';

// ---------------------------------------------------------------- types

export interface GameSideModel {
  /** The display name, from the snapshot. */
  name: string;
  /**
   * The name for a `<title>` and an OG card: the full name, or `shortName` when the full one is
   * too long for a link preview ("St. Ignatius College Preparatory" is 32 characters and would eat
   * a whole title on its own). Everything in the page body uses `name`.
   */
  label: string;
  /** Present only for one of the 15 SCVAL schools; a non-SCVAL opponent is a name (DESIGN §8). */
  team: Team | undefined;
  standing: Standing | undefined;
  /**
   * "4-1-0 De Anza" — the LEAGUE record as of this contest (`recordAsOf`), not today's — or the
   * honest no-results line. `null` for a non-SCVAL opponent.
   */
  sub: string | null;
  /** Up to five LEAGUE results BEFORE this contest, oldest first (DESIGN §5.5). */
  formBefore: FormEntry[];
  /** How many league games this side had played before this one — the form caption's subject. */
  playedBefore: number;
  /** This game's result from this side, when it is a final. */
  outcome: Outcome | null;
  /** The side's own page on si.com, when the slug was verified upstream. */
  sbliveUrl: string | undefined;
  /** The DESIGN §5.2 view of this side: glyph, weight, chip. */
  view: SideView;
}

export interface SeriesMeeting {
  game: Game;
  isThisGame: boolean;
}

export interface SeriesModel {
  meetings: SeriesMeeting[];
  /** One sentence naming the leader, or saying they have not played (DESIGN §3.5). */
  summary: string;
  /** Article VI §3 citation — head-to-head is the first standings tiebreak in-division. */
  tiebreakNote: string | null;
  /** The perspective the rows are oriented from: this game's home side where possible. */
  perspective: GameSideModel;
}

export interface GameConflict {
  /** The ready-to-render sentence written by lib/crosscheck.ts (SPEC §5.7). */
  note: string;
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
}

/** An off-site link for this contest. `accent` marks the one primary pill. */
export interface GameLink {
  href: string;
  label: string;
  accent?: boolean;
}

export interface GameModel {
  game: Game;
  /**
   * A FINAL's result links — the MaxPreps box score (accent) and the NFHS stream — which the page
   * prints directly under the recap, the first place a reader looks for them after the score
   * (F-73/F-85). Empty for every other status. Each link has ONE home on the page: GameDetails
   * skips whatever is in this list, and GameElsewhere carries no per-game links at all.
   */
  resultLinks: GameLink[];
  display: GameDisplay;
  /** Away is first everywhere on this site, including here. */
  away: GameSideModel;
  home: GameSideModel;
  series: SeriesModel;
  conflict: GameConflict | null;
  /** The division this contest counts toward, when both sides are members of one. */
  division: Division | null;
  /** "Thu Sep 24" — the back link to /scores/[date]. */
  dayLabel: string;
  /**
   * The caption under the scoreboard that says WHEN the two `sub` records are from, because on an
   * old game they are not today's: "League records after this game" (a league final), "League
   * records as of Thu Sep 24" (a non-league final), "League records going in" (anything not yet
   * decided) or "League records to date" (postponed — no date to measure from). Singular when only
   * one side is an SCVAL school; `null` when neither is, since then there is no record to explain.
   */
  recordsCaption: string | null;
  /** "Sep 24, 2026 · 4:00 PM PT", or the date alone when the time is TBA. */
  whenLabel: string;
}

// ---------------------------------------------------------------- helpers

/** A stable key for one side of a contest: our slug, or the opponent's name. */
function sideKey(side: GameSide): string {
  return side.slug ?? `name:${side.name.trim().toLowerCase()}`;
}

/** Longer than this and a school name crowds out everything else in a link preview. */
const TITLE_NAME_LIMIT = 24;

function labelFor(name: string, team: Team | undefined): string {
  return team && name.length > TITLE_NAME_LIMIT ? team.shortName : name;
}

/** 'a' or 'an', so "an El Camino Division league game" reads like English. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

/** A W-L-T record as `recordString` prints it, plus the game count the no-results rule keys on. */
export interface RecordAsOf {
  gp: number;
  w: number;
  l: number;
  t: number;
}

/**
 * A side's LEAGUE record at this contest's point in the season (G-1).
 *
 * The scoreboard used to print TODAY's standing under both names, so a September final read
 * "7-0-0" for a team that was 2-0-0 that afternoon. The cut is made the way `formBefore` makes
 * it — by position in the team's own league list, so a same-day doubleheader cannot leak — but it
 * is INCLUSIVE of this contest when it is a final: the scoreboard shows the result, so the record
 * beside it already contains it. Anything not yet decided cuts before it ("going in"). A
 * non-league contest is not in that list, so it falls back to the league games dated strictly
 * before it. A postponed game has no date to measure from and keeps the current standing.
 *
 * Only results with an outcome count (a played game with no published score is neither a W nor an
 * L) — the rule `lib/standings.ts` tallies `computed` by — so for a team's latest league final this
 * equals `standing.computed` (tests/ui/game-model-asof.test.ts holds that).
 *
 * `undefined` for a non-SCVAL side.
 */
export function recordAsOf(game: Game, side: GameSide): RecordAsOf | undefined {
  if (!side.slug) return undefined;
  if (game.status === 'postponed') {
    const computed = getStandingFor(side.slug)?.computed;
    return computed ? { gp: computed.gp, w: computed.w, l: computed.l, t: computed.t } : undefined;
  }
  const form = getTeamForm(side.slug);
  if (!form) return undefined;
  const index = form.leagueGames.findIndex((g) => g.contestId === game.contestId);
  const upTo =
    index >= 0
      ? form.leagueGames.slice(0, game.status === 'final' ? index + 1 : index)
      : form.leagueGames.filter((g) => g.date < game.dateKey);
  const record: RecordAsOf = { gp: 0, w: 0, l: 0, t: 0 };
  for (const g of upTo) {
    if (g.outcome === null) continue;
    record.gp += 1;
    if (g.outcome === 'W') record.w += 1;
    else if (g.outcome === 'L') record.l += 1;
    else record.t += 1;
  }
  return record;
}

function subFor(record: RecordAsOf | undefined, team: Team | undefined): string | null {
  if (!team) return null;
  const division = DIVISION_LABELS[team.division];
  if (!record || record.gp === 0) {
    // Never 0-0-0 for a team the sources have no results for (DESIGN §8) — including, as of an
    // early-season game, a team that had not played a league game yet.
    return `No league results reported · ${division}`;
  }
  return `${recordString(record)} ${division}`;
}

/** The scoreboard caption — see `GameModel.recordsCaption`. */
function recordsCaptionFor(
  game: Game,
  display: GameDisplay,
  away: GameSideModel,
  home: GameSideModel,
): string | null {
  const members = [away, home].filter((side) => side.team).length;
  if (members === 0) return null;
  const subject = members === 1 ? 'League record' : 'League records';
  if (game.status === 'postponed') return `${subject} to date`;
  if (display.kind === 'final') {
    return game.isLeague
      ? `${subject} after this game`
      : `${subject} as of ${shortDate(game.dateLocal)}`;
  }
  return `${subject} going in`;
}

/**
 * The last five LEAGUE results a side carried into this contest.
 *
 * League games are found by position in the team's own league list, so a same-day doubleheader
 * cannot leak the result of the game being viewed into the form that preceded it. A non-league
 * contest is not in that list, so it falls back to a strict date comparison.
 */
function formBefore(game: Game, side: GameSide): { entries: FormEntry[]; playedBefore: number } {
  if (!side.slug) return { entries: [], playedBefore: 0 };
  const form = getTeamForm(side.slug);
  if (!form) return { entries: [], playedBefore: 0 };
  const index = form.leagueGames.findIndex((g) => g.contestId === game.contestId);
  const before =
    index >= 0
      ? form.leagueGames.slice(0, index)
      : form.leagueGames.filter((g) => g.date < game.dateKey);
  const decided = before.filter((g) => g.outcome !== null);
  const entries: FormEntry[] = decided.slice(-5).map((g) => ({
    outcome: g.outcome as Outcome,
    contestId: g.contestId,
    opponent: g.opponent,
    date: monthDay(g.date),
  }));
  return { entries, playedBefore: decided.length };
}

function sideModel(game: Game, side: GameSide, view: SideView, display: GameDisplay): GameSideModel {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const standing = side.slug ? getStandingFor(side.slug) : undefined;
  const { entries, playedBefore } = formBefore(game, side);
  const outcome: Outcome | null =
    display.kind !== 'final'
      ? null
      : view.weight === 'level'
        ? 'T'
        : view.weight === 'winner'
          ? 'W'
          : 'L';
  const name = team ? team.name : side.name;
  return {
    name,
    label: labelFor(name, team),
    team,
    standing,
    sub: subFor(recordAsOf(game, side), team),
    formBefore: entries,
    playedBefore,
    outcome,
    sbliveUrl: team?.external.sbliveGamesUrl,
    view,
  };
}

/** Every contest between these two schools this season, in date order. */
function seriesGames(game: Game): Game[] {
  const anchor = game.home.slug ?? game.away.slug;
  if (!anchor) return [game];
  const keyHome = sideKey(game.home);
  const keyAway = sideKey(game.away);
  return getGames({ teamId: anchor })
    .filter((g) => {
      const keys = [sideKey(g.home), sideKey(g.away)];
      return keys.includes(keyHome) && keys.includes(keyAway);
    })
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
}

function seriesSummary(game: Game, games: Game[], homeName: string, awayName: string): string {
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let played = 0;
  let pending = 0;
  const keyHome = sideKey(game.home);
  for (const g of games) {
    const display = describeGame(g);
    if (display.kind === 'unreported') {
      // Played, but no score published. It is neither a result nor a fixture (DESIGN §5.2).
      pending += 1;
      continue;
    }
    if (display.kind !== 'final') continue;
    played += 1;
    // The legs are home-and-away, so align every row on THIS game's home side.
    const thisGameHomeIsRowHome = sideKey(g.home) === keyHome;
    const rowHome = display.home.weight;
    if (rowHome === 'level') {
      ties += 1;
    } else if ((rowHome === 'winner') === thisGameHomeIsRowHome) {
      homeWins += 1;
    } else {
      awayWins += 1;
    }
  }
  // The contest being viewed is in this list. Its own RESULT belongs in the series record, but it
  // is not news to the reader that it is scheduled, so the "still to play" count excludes it.
  const selfKind = describeGame(game).kind;
  const selfIsUpcoming = selfKind !== 'final' && selfKind !== 'unreported';
  const upcoming = games.length - played - pending - (selfIsUpcoming ? 1 : 0);
  const pendingOthers = pending - (selfKind === 'unreported' ? 1 : 0);

  const sentences: string[] = [];
  if (played === 0) {
    sentences.push(
      pending > 0
        ? `${awayName} and ${homeName} have met ${
            pending === 1 ? 'once' : `${pending} times`
          } this season with no score published.`
        : `${awayName} and ${homeName} have not played yet this season.`,
    );
  } else if (homeWins > awayWins) {
    sentences.push(
      `${homeName} leads the season series ${record(homeWins, awayWins, ties)}.`,
    );
  } else if (awayWins > homeWins) {
    sentences.push(
      `${awayName} leads the season series ${record(awayWins, homeWins, ties)}.`,
    );
  } else if (ties === played) {
    // "level at 0-0-1" is true but unreadable; say what happened instead.
    sentences.push(
      played === 1
        ? 'Their only meeting this season was a draw.'
        : `All ${played} meetings this season were drawn.`,
    );
  } else {
    sentences.push(`The season series is level at ${record(homeWins, awayWins, ties)}.`);
  }

  if (upcoming > 0) {
    sentences.push(
      upcoming === 1
        ? 'One other meeting is still to play.'
        : `${upcoming} other meetings are still to play.`,
    );
  }
  if (pendingOthers > 0 && played > 0) {
    sentences.push(
      pendingOthers === 1
        ? 'One other meeting has no published score.'
        : `${pendingOthers} other meetings have no published score.`,
    );
  }
  return sentences.join(' ');
}

/** 'W-L' or 'W-L-T' — ties are only printed when there are some. */
function record(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function conflictFor(game: Game): GameConflict | null {
  const onGame = game.provenance.scoreConflict;
  if (!onGame) return null;
  const row: ScoreConflictRow | undefined = getSbliveCrossCheck()?.conflicts.find(
    (c) => c.contestId === game.contestId,
  );
  return {
    note: onGame.note,
    sbliveUrl: row?.sbliveUrl ?? null,
    maxprepsUrl: row?.maxprepsUrl ?? game.urls.maxpreps,
  };
}

// ---------------------------------------------------------------- the model

/** `undefined` for an id that is not in the snapshot — the page turns that into a 404. */
export function buildGameModel(contestId: string): GameModel | undefined {
  const game = getGameById(contestId);
  if (!game) return undefined;
  const display = describeGame(game);
  const away = sideModel(game, game.away, display.away, display);
  const home = sideModel(game, game.home, display.home, display);

  const games = seriesGames(game);
  const perspective = home.team ? home : away;
  const sameDivision =
    home.team && away.team && home.team.division === away.team.division ? home.team.division : null;

  const resultLinks: GameLink[] = [];
  if (game.status === 'final') {
    if (game.urls.maxpreps) {
      resultLinks.push({ href: game.urls.maxpreps, label: 'MaxPreps box score', accent: true });
    }
    if (game.urls.nfhsStream) resultLinks.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  }

  return {
    game,
    resultLinks,
    display,
    away,
    home,
    division: game.leagueDivision,
    dayLabel: shortDate(game.dateLocal),
    recordsCaption: recordsCaptionFor(game, display, away, home),
    whenLabel: game.isTimeTba
      ? `${dateWithYear(game.dateLocal)} · time TBA`
      : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`,
    series: {
      meetings: games.map((g) => ({ game: g, isThisGame: g.contestId === game.contestId })),
      summary: seriesSummary(game, games, home.name, away.name),
      tiebreakNote:
        sameDivision && game.isLeague
          ? `Head-to-head record is the first tiebreak when two teams finish level on points — ${BYLAW_CITATIONS.headToHead}.`
          : null,
      perspective,
    },
    conflict: conflictFor(game),
  };
}

// ---------------------------------------------------------------- shared strings

/**
 * The page title, the OG title and the `<h1>` — one composer, so they cannot drift.
 *
 * A final names the WINNER first, because that is the headline a reader pastes into a group chat;
 * every other state keeps the site's away-then-home order. The numbers are `SideView.glyph`, so an
 * unreported game reads `—` and never `0`.
 */
export function gameTitle(model: GameModel): string {
  const { display, game, away, home } = model;
  const date = dateWithYear(game.dateLocal);
  if (display.kind === 'final') {
    // Winner first on a decided game; a draw keeps the site's away-then-home order.
    const [first, second] = home.view.weight === 'winner' ? [home, away] : [away, home];
    const decider = display.deciderTag ? ` (${display.deciderTag})` : '';
    return `${first.label} ${first.view.glyph}, ${second.label} ${second.view.glyph}${decider} — ${date}`;
  }
  const joiner = game.site === 'neutral' ? 'vs' : 'at';
  const suffix =
    display.kind === 'scheduled'
      ? game.isTimeTba
        ? 'time TBA'
        : timeOfDayPT(game.dateLocal)
      : display.statusLabel.toLowerCase();
  return `${away.label} ${joiner} ${home.label} — ${date}, ${suffix}`;
}

/** The `<meta name="description">` and the OG description. */
export function gameDescription(model: GameModel): string {
  const { game, display, away, home, division } = model;
  const context = game.isLeague
    ? `${division ? `${DIVISION_LABELS[division]} Division ` : ''}league game`
    : 'non-league game';
  if (game.recap) {
    const lead = article(context) === 'an' ? 'An' : 'A';
    return `${game.recap} ${lead} ${context} in SCVAL girls varsity field hockey, Fall 2026 — unofficial, rebuilt nightly from MaxPreps.`;
  }
  const joiner = game.site === 'neutral' ? 'vs' : 'at';
  return `${away.name} ${joiner} ${home.name}, ${model.whenLabel} — ${article(
    context,
  )} ${context} in SCVAL girls varsity field hockey. ${
    display.kind === 'unreported'
      ? 'Played; no score reported yet.'
      : 'Scores and standings rebuilt nightly from MaxPreps. Unofficial.'
  }`;
}

/** The kicker line on the OG card and above the scoreboard: `FINAL · LEAGUE · DE ANZA`. */
export function gameKicker(model: GameModel): string {
  const parts = [model.display.statusLabel];
  if (model.display.deciderTag) parts.push(model.display.deciderTag);
  parts.push(model.game.isLeague ? 'league' : 'non-league');
  if (model.division) parts.push(`${DIVISION_LABELS[model.division]} Division`);
  return parts.join(' · ');
}
