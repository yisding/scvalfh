/**
 * The /game/[id] view model — one pure assembly step shared by the page, its `generateMetadata`
 * and its `opengraph-image`, so a link preview and the page itself can never disagree.
 *
 * Every number here comes through `describeGame()` (components/ui/game-view.ts), which is the one
 * implementation of the DESIGN §5.2 table, or straight from `renderScore()` (the season-series
 * sentence's `ended 2-2`). Nothing in this module PRINTS `game.home.score` / `game.away.score`;
 * the two null-guarded reads only decide which sentence is shown (`resultConflictNoteFor`'s level
 * check, and `isOneGoalFinal`, the MCAL shootout caveat), so a missing score cannot become `0-0`
 * in a page title, an OG card or a `<meta name="description">` any more than it can in the body
 * (DESIGN §5.3, §10.9e).
 *
 * League-aware (SPEC §10.6): the sub-line is `<record> <division heading ?? league short>`, the
 * context is `BVAL · Santa Teresa`, `MCAL`, `MCAL semifinal` (the bracket round, when
 * `getLeagueTournament` matched the contest) or `Non-league`, the points sentence and the
 * head-to-head note cite the game's own league, and a si.com score (owner decision D2) carries its
 * source line.
 *
 * This module reads the snapshot through lib/data.ts only, so it is SERVER-ONLY (lib/data does an
 * fs read at module scope). The components under components/game/ take its output as plain data and
 * stay free of it.
 */

import {
  getGameById,
  getGames,
  getLeagueTournament,
  getSbliveCrossCheck,
  getStandingFor,
  getSupersededGames,
  getTeamBySlug,
  getTeamForm,
  getTeams,
} from '../../lib/data';
import {
  dateWithYear,
  matchupJoiner,
  monthDay,
  recordString,
  renderScore,
  shortDate,
  sideOutcome,
  timeOfDayPT,
} from '../../lib/format';
import { gameHref, gameIdToParam, paramToGameId } from '../../lib/game-id';
import {
  divisionDisplay,
  divisionHeading,
  findDivision,
  findLeague,
  getLeague,
  getSection,
  leagueOfDivision,
  type LeagueConfig,
} from '../../lib/leagues';
import { SHOOTOUT_NOTE } from '../../lib/postseason';
import type {
  BackfillProvenance,
  DivisionId,
  Game,
  GameSide,
  Outcome,
  ScoreConflictRow,
  Standing,
  Team,
  TiebreakStage,
  TournamentGame,
} from '../../lib/types';
import type { FormEntry } from '../ui/FormStrip';
import { describeGame, overtimeInDoubt, type GameDisplay, type SideView } from '../ui/game-view';

// ---------------------------------------------------------------- types

export interface GameSideModel {
  /** The display name, from the snapshot. */
  name: string;
  /**
   * The name for a `<title>` and an OG card: the full name, or `shortName` when the full one is
   * too long for a link preview ("St. Ignatius College Preparatory" is 32 characters and would eat
   * a whole title on its own). The page body uses `name`, except the season-series sentence,
   * which uses the team's short name to match the meeting rows above it.
   */
  label: string;
  /** Present only for one of the teams this site follows; anyone else is a name (DESIGN §8). */
  team: Team | undefined;
  standing: Standing | undefined;
  /**
   * "4-1-0 De Anza" / "10-1-1 MCAL" — the LEAGUE record as of this contest (`recordAsOf`), not
   * today's — or the honest no-results line. `null` for a non-member.
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
  /** The league's own head-to-head citation, when this is a counted game and the league breaks ties on it. */
  tiebreakNote: string | null;
  /** The perspective the rows are oriented from: this game's home side where possible. */
  perspective: GameSideModel;
}

/** An off-site link for this contest. `accent` marks the one primary pill. */
export interface GameLink {
  href: string;
  label: string;
  accent?: boolean;
}

export interface GameConflict {
  /** The ready-to-render sentence written by the pipeline (both numbers are in it). */
  note: string;
  /** What MaxPreps published, when it published anything. */
  maxpreps: { home: number; away: number } | null;
  /** What si.com published. */
  sblive: { home: number; away: number };
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
}

/** The si.com source line (owner decision D2): shown whenever the published score is si.com's. */
export interface GameSourceLine {
  /** `Score via High School on SI (si.com): <rule note>.` */
  text: string;
  rule: BackfillProvenance['rule'] | null;
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
}

/** How the game counts, in words (GameDetails "Counts as"). */
export interface CountsAs {
  /** `League game · De Anza Division` | `League game · MCAL` | `MCAL semifinal` | `Non-league game` */
  label: string;
  /** The sentence under it: the points citation, the postseason sentence, or the non-league rule. */
  detail: string;
  /** The classifier's own note when a same-division game does not count (verbatim). */
  classificationNote: string | null;
}

export interface GameModel {
  game: Game;
  /** The URL param: `gameIdToParam(contestId)`. */
  param: string;
  /** `gameHref(contestId)`, the canonical path. */
  canonical: string;
  display: GameDisplay;
  /**
   * A FINAL's result links, which the page prints directly under the recap, the first place a
   * reader looks for them after the score (F-73/F-85). The accent pill is the source the score
   * came from (owner decision D2): the MaxPreps box score, or — on a si.com-scored final — the
   * si.com game page, with MaxPreps' contest page beside it as a plain pill. Then the NFHS stream.
   * Empty for every other status. Each link has ONE home on the page: GameDetails skips whatever is
   * in this list, and GameElsewhere carries no per-game links at all — except the two disagreement
   * notes under the scoreboard (SourceDisagreement cites both sources' pages, ResultFlagConflict
   * MaxPreps'), which link the pages they cite beside their sentence, so a page in this list can
   * appear there too.
   */
  resultLinks: GameLink[];
  /** Away is first everywhere on this site, including here. */
  away: GameSideModel;
  home: GameSideModel;
  series: SeriesModel;
  /**
   * The caption under the scoreboard that says WHEN the two `sub` records are from, because on an
   * old game they are not today's: "League records after this game" (a league final), "League
   * records as of Thu Sep 24" (any other final), "League records going in" (anything not yet
   * decided) or "League records to date" (postponed — no date to measure from). Singular when only
   * one side is one of the teams this site follows; `null` when neither is, since then there is no
   * record to explain.
   */
  recordsCaption: string | null;
  conflict: GameConflict | null;
  source: GameSourceLine | null;
  /**
   * MaxPreps' result flags (or its two team feeds) contradict the published score
   * (`provenance.resultConflict`), and no si.com score replaced it: the pipeline's sentence plus
   * what this site does with the score. Null otherwise (a backfilled game says so in `source`).
   */
  resultConflictNote: string | null;
  /** The division this contest counts toward (`countsFor`), or null. */
  division: DivisionId | null;
  /** The game's league: the league of `countsFor`, else of the postseason tag, else of a member side. */
  league: LeagueConfig | null;
  /** `BVAL · Santa Teresa` | `MCAL` | `MCAL semifinal` | `SCVAL crossover` | `CCS` | `Non-league` */
  contextLabel: string;
  countsAs: CountsAs;
  /** The postseason notes: `MCAL tournament game — it does not count in the league table.` + the shootout caveat. */
  postseasonNotes: string[];
  /**
   * How this site reads a score the feed cannot state plainly, or null: a level final decided on
   * 1 v 1s (decider 'SO', the EAL) says who MaxPreps marks the winner and that the tally is not
   * shown; a game whose overtime count the league's rules rule out (`overtimeInDoubt`) says the
   * score is shown as MaxPreps has it.
   */
  scoreNote: string | null;
  /** How many teams this site follows (the non-member copy names it). */
  memberCount: number;
  /** "Thu Sep 24" — the back link to /scores/[date]. */
  dayLabel: string;
  /** "Sep 24, 2026 · 4:00 PM PT", or the date alone when the time is TBA. */
  whenLabel: string;
}

/** A `/game/sblive-<id>` page whose si.com game a MaxPreps contest has since superseded (SPEC §8.1). */
export interface SupersededStub {
  param: string;
  /** The si.com contest id (`sblive:<n>`). */
  contestId: string;
  /** The MaxPreps contest that replaced it. */
  target: string;
  /** `gameHref(target)`: the link AND the canonical. */
  targetHref: string;
  /** `<SHORT> game — this result is now on MaxPreps.` */
  sentence: string;
  /** The target game's model (the OG card renders it), when the target is in the snapshot. */
  targetModel: GameModel | undefined;
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

/** 'a' or 'an', so "an MCAL tournament game" reads like English (acronyms by their letter name). */
function article(noun: string): string {
  return /^([aeiou]|MCAL|SCVAL)/i.test(noun) ? 'an' : 'a';
}

/** `De Anza` | `MCAL`: the division heading, or the league short name for a single-division league. */
function scopeOf(division: DivisionId): string {
  return divisionHeading(division) ?? leagueOfDivision(division).shortName;
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
 * beside it already contains it. Anything not yet decided cuts before it ("going in"). A contest
 * that does not count for the side's table (non-league or postseason) is not in that list, so it
 * falls back to the league games dated strictly before it. A postponed game has no date to measure
 * from and keeps the current standing.
 *
 * Only results with an outcome count (a played game with no published score is neither a W nor an
 * L) — the rule `lib/standings.ts` tallies `computed` by — so for a team's latest league final this
 * equals `standing.computed` (tests/ui/game-model-asof.test.ts holds that).
 *
 * `undefined` for a side outside the team registry.
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

function subFor(
  record: RecordAsOf | undefined,
  team: Team | undefined,
  standing: Standing | undefined,
): string | null {
  if (!team) return null;
  const scope = scopeOf(team.division);
  // The two no-record lines are longer than any record, so at phone widths they wrap: no-break
  // spaces inside the scope keep "El Camino" / "Mt. Hamilton" whole and move the break to the "·".
  // Only here — the record line is compared to a plain-space string (game-model-asof test 1).
  const unbroken = scope.replace(/ /g, '\u00a0');
  // DESIGN §8's missing-data line is for a team the sources have NOTHING for. Never 0-0-0.
  if (!standing?.hasReportedResults) return `No league results reported · ${unbroken}`;
  // Results exist, just none by this date — an early-season non-league final, or a first league
  // game still to play. Saying "not reported" here read as missing data about a team that went on
  // to post a record; FormGoingIn words the same case as "no league result before this date".
  if (!record || record.gp === 0) return `No league results yet · ${unbroken}`;
  return `${recordString(record)} ${scope}`;
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
    // A counted final is in each side's league list, so its record includes it; anything else
    // (non-league, postseason) is measured by date.
    return game.countsFor !== null
      ? `${subject} after this game`
      : `${subject} as of ${shortDate(game.dateLocal)}`;
  }
  return `${subject} going in`;
}

/**
 * A final's result links (`GameModel.resultLinks`). The accent pill is the source the score came
 * from: si.com's game page when the published score is si.com's (D2), else the MaxPreps box score.
 */
function resultLinksFor(game: Game): GameLink[] {
  if (game.status !== 'final') return [];
  const links: GameLink[] = [];
  const sbliveScored = game.provenance.scores === 'sblive';
  if (sbliveScored && game.urls.sblive) {
    links.push({ href: game.urls.sblive, label: 'si.com game', accent: true });
  }
  if (game.urls.maxpreps) {
    // Beside a si.com score, MaxPreps' contest page may carry no score (or a wrong one): it is the
    // contest page, not "the box score", and never the accent pill.
    links.push(
      sbliveScored
        ? { href: game.urls.maxpreps, label: 'MaxPreps game' }
        : { href: game.urls.maxpreps, label: 'MaxPreps box score', accent: true },
    );
  }
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  return links;
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
    sub: subFor(recordAsOf(game, side), team, standing),
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

/** A final whose published score MaxPreps' own result flags contradict, with no si.com score over it. */
function hasResultConflict(g: Game): boolean {
  return !!g.provenance.resultConflict && !g.provenance.backfill;
}

/**
 * The game page's sentence for `provenance.resultConflict`: the pipeline's note, then what this
 * site publishes — a level score counts as a tie (DESIGN §5.2: the score is the record).
 */
function resultConflictNoteFor(game: Game): string | null {
  if (!hasResultConflict(game)) return null;
  const note = (game.provenance.resultConflict as string).trim().replace(/[.\s]+$/, '');
  // A 1 v 1 win is level on goals and a win here: `scoreNote` says so, so no tie sentence.
  if (game.decider === 'SO') return `${note}.`;
  const level = game.home.score !== null && game.home.score === game.away.score;
  return level
    ? `${note}. The score is level, so this site counts it as a tie.`
    : `${note}. This site goes by the published score.`;
}

function seriesSummary(game: Game, games: Game[], homeName: string, awayName: string): string {
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let played = 0;
  let pending = 0;
  /** Level finals MaxPreps flags with a winner (a shootout, most likely): counted as ties, said so. */
  const flaggedTies: Game[] = [];
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
    // The legs are home-and-away, so align every row on THIS game's home side. `sideOutcome`
    // is the one W/L/T rule, so a 1 v 1 win is a win here, not a tie.
    const outcome = sideOutcome(g, sideKey(g.home) === keyHome ? 'home' : 'away');
    if (outcome === 'T') {
      ties += 1;
      if (hasResultConflict(g)) flaggedTies.push(g);
    } else if (outcome === 'W') {
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
  } else if (ties === played && flaggedTies.length > 0) {
    // MaxPreps marks a winner on a level score: "a draw" alone would contradict the recap.
    if (played === 1) {
      const g = flaggedTies[0];
      const flagged = g.home.result === 'W' ? g.home : g.away.result === 'W' ? g.away : null;
      const winner = flagged ? (sideKey(flagged) === keyHome ? homeName : awayName) : null;
      // A flagged tie is a final with both scores (sideOutcome read 'T' off them), so the view is
      // always 'final' here; the fallback only keeps the type honest.
      const meeting = renderScore(g);
      const ended = meeting.kind === 'final' ? `${meeting.home}-${meeting.away}` : 'level';
      sentences.push(
        `Their only meeting this season ended ${ended}, which this site counts as a draw; ${
          winner ? `MaxPreps lists ${winner} as the winner.` : 'MaxPreps’ result flags for it disagree.'
        }`,
      );
    } else {
      sentences.push(
        `All ${played} meetings this season ended level, which this site counts as draws; MaxPreps lists a winner for ${
          flaggedTies.length === 1 ? 'one of them' : `${flaggedTies.length} of them`
        }.`,
      );
    }
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
  // Rule 5 (plain disagreement): the cross-check row holds both values and MaxPreps' stands. Rule 4
  // (si.com published over a clearly wrong MaxPreps row): MaxPreps' value is in the backfill record.
  const maxpreps = row?.maxpreps ?? game.provenance.backfill?.maxpreps ?? null;
  return {
    note: onGame.note,
    maxpreps,
    sblive: row?.sblive ?? onGame.sblive,
    sbliveUrl: row?.sbliveUrl ?? game.urls.sblive ?? null,
    maxprepsUrl: row?.maxprepsUrl ?? game.urls.maxpreps,
  };
}

/** `Score via High School on SI (si.com): <rule note>.` — only when the published score is si.com's. */
function sourceFor(game: Game): GameSourceLine | null {
  if (game.provenance.scores !== 'sblive') return null;
  const note = game.provenance.backfill?.note?.trim().replace(/[.\s]+$/, '');
  return {
    text: note
      ? `Score via High School on SI (si.com): ${note}.`
      : 'Score via High School on SI (si.com).',
    rule: game.provenance.backfill?.rule ?? null,
    sbliveUrl: game.urls.sblive ?? null,
    maxprepsUrl: game.urls.maxpreps,
  };
}

/** The game's league: `countsFor`'s, else the postseason tag's, else the first member side's. */
function leagueOfGame(game: Game, away: Team | undefined, home: Team | undefined): LeagueConfig | null {
  if (game.countsFor !== null) {
    const d = findDivision(game.countsFor);
    if (d) return getLeague(d.leagueId);
  }
  if (game.postseason?.leagueId) {
    const l = findLeague(game.postseason.leagueId);
    if (l) return l;
  }
  const member = home ?? away;
  return member ? (findLeague(member.league) ?? null) : null;
}

const ROUND_WORD: Readonly<Record<TournamentGame['round'], string>> = {
  'play-in': 'play-in',
  quarterfinal: 'quarterfinal',
  semifinal: 'semifinal',
  final: 'final',
};

/** The MCAL bracket slot this contest filled, when `getLeagueTournament` matched it. */
function tournamentSlot(game: Game, league: LeagueConfig): TournamentGame | null {
  if (league.postseason.kind !== 'league-tournament') return null;
  const t = getLeagueTournament(league.id);
  const all = [...(t.playIn ? [t.playIn] : []), ...t.games];
  return all.find((tg) => tg.game?.contestId === game.contestId) ?? null;
}

/** A one-goal final: a tournament shootout may be hiding in it (SPEC §6.2). */
function isOneGoalFinal(game: Game): boolean {
  return (
    game.status === 'final' &&
    game.home.score !== null &&
    game.away.score !== null &&
    Math.abs(game.home.score - game.away.score) === 1
  );
}

interface PostseasonView {
  contextLabel: string;
  countsAs: CountsAs;
  notes: string[];
}

function postseasonView(game: Game, league: LeagueConfig | null): PostseasonView | null {
  const tag = game.postseason;
  if (!tag) return null;
  if (tag.kind === 'mcal-tournament' && league && league.postseason.kind === 'league-tournament') {
    const slot = tournamentSlot(game, league);
    const label = slot ? `${league.shortName} ${ROUND_WORD[slot.round]}` : league.postseason.name;
    const sentence = `${league.postseason.name} game — it does not count in the league table.`;
    const notes = [sentence];
    const shootout = slot?.note ?? (isOneGoalFinal(game) ? SHOOTOUT_NOTE : null);
    if (shootout) notes.push(shootout);
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes,
    };
  }
  if (tag.kind === 'league-postseason' && league && league.postseason.kind === 'unbracketed-tournament') {
    // The EAL Super Regional: a counted-nowhere game with no bracket slot to name.
    const sentence = `${league.postseason.name} game — it does not count in the league table.`;
    const label = `${league.shortName} ${league.postseason.name}`;
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  if ((tag.kind === 'scval-crossover' || tag.kind === 'bval-play-in') && league) {
    const label = `${league.shortName} ${tag.kind === 'scval-crossover' ? 'crossover' : 'play-in'}`;
    const sentence = `${league.shortName} postseason game — it does not count in the league table.`;
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  if (tag.kind === 'ccs') {
    const sentence = 'CCS playoff game — it does not count in any league table.';
    return {
      contextLabel: 'CCS',
      countsAs: { label: 'CCS playoff game', detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  const sentence = 'Postseason game — it does not count in any league table.';
  return {
    contextLabel: 'Postseason',
    countsAs: { label: 'Postseason game', detail: sentence, classificationNote: null },
    notes: [sentence],
  };
}

/**
 * `scoreNote` (D7): what this site does with a score the feed cannot state plainly. The rule it
 * cites is the one a 1 v 1 league's Guidelines give (only the EAL's has `leagueOvertime`
 * 'shootout' today): a 10-minute sudden-victory period, then 1 v 1s. Goals come from the view's
 * glyphs, never from the score fields.
 */
function scoreNoteFor(
  game: Game,
  display: GameDisplay,
  league: LeagueConfig | null,
  away: GameSideModel,
  home: GameSideModel,
): string | null {
  if (!league || league.rules.leagueOvertime !== 'shootout') return null;
  const rule = `${getSection(league.sectionId).name} Field Hockey Guidelines §VII.E.4`;
  const notes: string[] = [];
  if (display.kind === 'final' && game.decider === 'SO' && game.shootout === null) {
    const outcome = sideOutcome(game, 'home');
    if (outcome === 'W' || outcome === 'L') {
      const winner = outcome === 'W' ? home.name : away.name;
      notes.push(
        `Level at ${display.home.glyph}\u2013${display.away.glyph}; MaxPreps marks ${winner} the winner, which under the ${league.shortName}\u2019s rules means 1 v 1s decided it (a level varsity game goes to a 10-minute sudden-victory period, then 1 v 1s: ${rule}). This site counts it as ${winner}\u2019s win and does not show the 1 v 1 tally.`,
      );
    }
  }
  if (overtimeInDoubt(game)) {
    notes.push(
      `MaxPreps records ${game.otPeriods} overtime periods for this game, but the ${league.shortName} plays one 10-minute overtime period and then 1 v 1s (${rule}), so MaxPreps may have recorded a 1 v 1 win as a goal. The score is shown as MaxPreps has it.`,
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

const H2H_STAGES: readonly TiebreakStage[] = ['head-to-head', 'h2h-win-pct'];

/**
 * The head-to-head note for a counted game, citing THIS league's stage: SCVAL Article VI §3, BVAL
 * §6b, MCAL's head-to-head winning percentage, PCAL §23.3 (which applies to its top two places
 * only). null when the league's chains have no head-to-head stage.
 */
function tiebreakNoteFor(division: DivisionId): string | null {
  const league = leagueOfDivision(division);
  const { tiebreaks, citations } = league.rules;
  const first = tiebreaks.default.find((s) => s !== 'points');
  if (first && H2H_STAGES.includes(first) && citations.stages[first]) {
    return `Head-to-head is the first tiebreak when two teams finish level on points — ${citations.stages[first]}.`;
  }
  for (const chain of Object.values(tiebreaks.byBucketStart ?? {})) {
    const stage = chain?.find((s) => H2H_STAGES.includes(s));
    if (stage && citations.stages[stage]) {
      return `Head-to-head breaks a tie for the top places — ${citations.stages[stage]}.`;
    }
  }
  return null;
}

function countsAsFor(game: Game): CountsAs {
  if (game.countsFor !== null) {
    const league = leagueOfDivision(game.countsFor);
    const heading = divisionHeading(game.countsFor);
    return {
      label: heading ? `League game · ${heading} Division` : `League game · ${league.shortName}`,
      detail: `Counts toward the ${heading ?? league.shortName} standings — ${league.rules.citations.points}.`,
      classificationNote: null,
    };
  }
  return {
    label: 'Non-league game',
    detail: 'Counts in the overall record only, never in a league table.',
    classificationNote: game.provenance.classificationNote ?? null,
  };
}

// ---------------------------------------------------------------- params

/**
 * The /game/[id] params: every game (`gameIdToParam`, so `sblive:123` → `sblive-123`) plus every
 * superseded si.com id (stub pages). The page AND its opengraph-image both return exactly this
 * (SPEC §8.1, §10.6), so the OG URL a page points at always exists.
 */
export function gameStaticParams(): Array<{ id: string }> {
  const ids = [
    ...getGames().map((g) => gameIdToParam(g.contestId)),
    ...Object.keys(getSupersededGames()).map((id) => gameIdToParam(id)),
  ];
  return [...new Set(ids)].map((id) => ({ id }));
}

// ---------------------------------------------------------------- the model

/**
 * `undefined` for a param that is not a game in the snapshot — the page turns that into a 404 (or a
 * superseded stub). `param` is the URL segment: `paramToGameId` runs FIRST, so `sblive-123` finds
 * `sblive:123`, and no accessor that can throw runs for an unknown id.
 */
export function buildGameModel(param: string): GameModel | undefined {
  const contestId = paramToGameId(param);
  const game = getGameById(contestId);
  if (!game) return undefined;
  const display = describeGame(game);
  const away = sideModel(game, game.away, display.away, display);
  const home = sideModel(game, game.home, display.home, display);

  const games = seriesGames(game);
  const perspective = home.team ? home : away;
  const league = leagueOfGame(game, away.team, home.team);
  const post = postseasonView(game, league);
  const division = game.countsFor;

  return {
    game,
    param: gameIdToParam(game.contestId),
    canonical: gameHref(game.contestId),
    display,
    resultLinks: resultLinksFor(game),
    away,
    home,
    recordsCaption: recordsCaptionFor(game, display, away, home),
    division,
    league,
    contextLabel: post?.contextLabel ?? (division ? divisionDisplay(division) : 'Non-league'),
    countsAs: post?.countsAs ?? countsAsFor(game),
    postseasonNotes: post?.notes ?? [],
    scoreNote: scoreNoteFor(game, display, league, away, home),
    memberCount: getTeams().length,
    dayLabel: shortDate(game.dateLocal),
    whenLabel: game.isTimeTba
      ? `${dateWithYear(game.dateLocal)} · time TBA`
      : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`,
    series: {
      meetings: games.map((g) => ({ game: g, isThisGame: g.contestId === game.contestId })),
      // Short names, as the meeting rows above it ("at St Ignatius") and the team pills print
      // them; a side outside the registry has no short name and keeps its own. Not `side.label`:
      // that only shortens names over 24 characters, so "Saint Francis" would survive beside
      // "St Francis". An abbreviated short name ("Lick-Wilm.", "Valley Chr.") gives way to the
      // full name: its period reads as a sentence break, and a screen reader spells it out.
      summary: seriesSummary(
        game,
        games,
        home.team && !home.team.shortName.endsWith('.') ? home.team.shortName : home.name,
        away.team && !away.team.shortName.endsWith('.') ? away.team.shortName : away.name,
      ),
      tiebreakNote: division ? tiebreakNoteFor(division) : null,
      perspective,
    },
    conflict: conflictFor(game),
    source: sourceFor(game),
    resultConflictNote: resultConflictNoteFor(game),
  };
}

/**
 * The stub for a superseded si.com game (`/game/sblive-<id>` whose result MaxPreps now has):
 * `<SHORT> game — this result is now on MaxPreps.`, linking and canonical to the MaxPreps game.
 * undefined for any other param.
 */
export function buildSupersededStub(param: string): SupersededStub | undefined {
  const contestId = paramToGameId(param);
  // Only an si.com id can be superseded, and the map is a plain JSON object: an own-property
  // lookup, so 'constructor' or '__proto__' never reads Object.prototype as a "target".
  if (!/^sblive:\d+$/.test(contestId)) return undefined;
  const map = getSupersededGames();
  const target = Object.hasOwn(map, contestId) ? map[contestId] : undefined;
  if (typeof target !== 'string' || target === '') return undefined;
  const targetModel = buildGameModel(gameIdToParam(target));
  const short = targetModel?.league?.shortName;
  return {
    param: gameIdToParam(contestId),
    contestId,
    target,
    targetHref: gameHref(target),
    sentence: `${short ? `${short} game` : 'Game'} — this result is now on MaxPreps.`,
    targetModel,
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
  const joiner = matchupJoiner(game);
  const suffix =
    display.kind === 'scheduled'
      ? game.isTimeTba
        ? 'time TBA'
        : timeOfDayPT(game.dateLocal)
      : display.statusLabel.toLowerCase();
  return `${away.label} ${joiner} ${home.label} — ${date}, ${suffix}`;
}

/** `De Anza Division league game` | `MCAL league game` | `MCAL semifinal` | `non-league game`. */
function contextNoun(model: GameModel): string {
  if (model.game.postseason) {
    return model.contextLabel === 'CCS' ? 'CCS playoff game' : `${model.contextLabel} game`;
  }
  if (model.division) {
    const heading = divisionHeading(model.division);
    return heading ? `${heading} Division league game` : `${scopeOf(model.division)} league game`;
  }
  return 'non-league game';
}

/** The `<meta name="description">` and the OG description: `… in <League name> girls varsity field hockey, Fall 2026`. */
export function gameDescription(model: GameModel): string {
  const { game, display, away, home, league } = model;
  const context = contextNoun(model);
  const where = league ? `${league.name} girls varsity field hockey, Fall 2026` : 'girls varsity field hockey, Fall 2026';
  if (game.recap) {
    const lead = article(context) === 'an' ? 'An' : 'A';
    return `${game.recap} ${lead} ${context} in ${where} — unofficial, rebuilt nightly from MaxPreps.`;
  }
  const joiner = matchupJoiner(game);
  return `${away.name} ${joiner} ${home.name}, ${model.whenLabel} — ${article(
    context,
  )} ${context} in ${where}. ${
    display.kind === 'unreported'
      ? 'Played; no score reported yet.'
      : model.source
        ? 'Score via High School on SI (si.com); standings rebuilt nightly. Unofficial.'
        : 'Scores and standings rebuilt nightly from MaxPreps. Unofficial.'
  }`;
}

/** The kicker line on the OG card: `FINAL · BVAL · Santa Teresa`, `FINAL · Non-league`, `FINAL · MCAL semifinal`. */
export function gameKicker(model: GameModel): string {
  const parts = [model.display.statusLabel];
  if (model.display.deciderTag) parts.push(model.display.deciderTag);
  parts.push(model.contextLabel);
  return parts.join(' · ');
}
