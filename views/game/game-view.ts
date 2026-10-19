/**
 * The /game/[id] view model — one pure assembly step shared by the page, its `generateMetadata`
 * and its `opengraph-image`, so a link preview and the page itself can never disagree.
 *
 * Every number here comes through `describeGame()` (views/shared/describe-game.ts), which is the one
 * implementation of the DESIGN §5.2 table, or straight from `renderScore()` (the season-series
 * sentence's `ended 2-2`). Nothing in this module or the topic modules beside it (series, postseason,
 * notes, links, titles) PRINTS `game.home.score` / `game.away.score`; the two null-guarded reads
 * only decide which sentence is shown (`resultConflictNoteFor`'s level check, and postseason.ts's
 * `isOneGoalFinal`, the MCAL shootout caveat), so a missing score cannot become `0-0`
 * in a page title, an OG card or a `<meta name="description">` any more than it can in the body
 * (DESIGN §5.3, §10.9e).
 *
 * League-aware (SPEC §10.6): the sub-line is `<record> <division heading ?? league short>`, the
 * context is `BVAL · Santa Teresa`, `MCAL`, `MCAL semifinal` (the bracket round, when
 * `getLeagueTournament` matched the contest) or `Non-league`, the points sentence and the
 * head-to-head note cite the game's own league, and a si.com score (owner decision D2) carries its
 * source line.
 *
 * This module reads the snapshot through lib/queries/ only, so it is SERVER-ONLY (lib/datasets/snapshot.ts does an
 * fs read at module scope). The components under components/game/ take its output as plain data and
 * stay free of it.
 */

import { findDivision, findLeague, getLeague, leagueOfDivision } from '@/lib/config/leagues';
import { divisionDisplay, divisionHeading } from '@/lib/config/leagues/labels';
import { dateWithYear, monthDay, shortDate, timeOfDayPT } from '@/lib/format/dates';
import { recordString } from '@/lib/format/numbers';
import type { ScoreConflictRow } from '@/lib/model/crosscheck';
import type { Game, GameSide, Outcome } from '@/lib/model/game';
import type { DivisionId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { getSbliveCrossCheck, getSupersededGames } from '@/lib/queries/provenance';
import { getStandingFor } from '@/lib/queries/standings';
import { getTeamForm, getTeams } from '@/lib/queries/teams';
import { getTeamBySlug } from '@/lib/registry/teams';
import { isSbliveContestId } from '@/lib/shared/contest-id';
import { gameHref, gameIdToParam, paramToGameId } from '@/lib/shared/game-id';
import { describeGame } from '@/views/shared/describe-game';
import type { FormEntry } from '@/views/shared/form-entry';
import type { GameDisplay, SideView } from '@/views/shared/game-display-client';

import { gameParam } from './game-route';
import { resultLinksFor } from './links';
import { countsAsFor, scoreNoteFor, tiebreakNoteFor } from './notes';
import { postseasonView } from './postseason';
import { hasResultConflict, seriesGames, seriesSummary } from './series';
import type { CountsAs, GameConflict, GameLink, GameSideModel, GameSourceLine, SeriesModel } from './types';

// ---------------------------------------------------------------- types

export interface GameView {
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
   * decided) or "League records to date" (postponed — no date to measure from — and any
   * regular-season non-league game, which is in neither table). Singular when only
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
  /**
   * The short name of the league whose official schedule lists this game (`game.official.division`'s),
   * which GameDetails' "Moved — the official <SHORT> schedule …" line names; null when no official
   * schedule lists it, or its division is no longer configured (the line then says "league").
   */
  officialLeague: string | null;
  /** `BVAL · Santa Teresa` | `MCAL` | `MCAL semifinal` | `SCVAL crossover` | `CCS` | `Non-league` */
  contextLabel: string;
  countsAs: CountsAs;
  /** The postseason notes: `MCAL tournament game — it does not count in the league table.` + the shootout caveat. */
  postseasonNotes: string[];
  /**
   * How this site reads a score the feed cannot state plainly, or null: a level final decided by a
   * shootout (decider 'SO': the EAL's 1 v 1s, the San Diego Section's shootout) says who MaxPreps
   * marks the winner and that the tally is not shown; a game whose overtime count the section's
   * rules rule out (`overtimeInDoubt`) says the score is shown as MaxPreps has it.
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
  targetModel: GameView | null;
}

// ---------------------------------------------------------------- helpers

/** Longer than this and a school name crowds out everything else in a link preview. */
const TITLE_NAME_LIMIT = 24;

function labelFor(name: string, team: Team | undefined): string {
  return team && name.length > TITLE_NAME_LIMIT ? team.shortName : name;
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
 * A regular-season NON-LEAGUE contest keeps the current standing too. It is not in either side's
 * table, so there is no point in the league season it belongs to, and most of them are played
 * before league play opens: measured by date, both sides read "No league results yet" on nearly
 * every one. What a reader wants beside a non-league score is how each team is doing in its own
 * league, so the caption says "to date" (`recordsCaptionFor`).
 *
 * Only results with an outcome count (a played game with no published score is neither a W nor an
 * L) — the rule `lib/engine/standings.ts` tallies `computed` by — so for a team's latest league final this
 * equals `standing.computed` (tests/views/game/game-view-asof.test.ts holds that).
 *
 * `undefined` for a side outside the team registry.
 */
export function recordAsOf(game: Game, side: GameSide): RecordAsOf | undefined {
  if (!side.slug) return undefined;
  if (game.status === 'postponed' || isRegularNonLeague(game)) {
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

/** Not in any league table and not postseason: its scoreboard records are today's (`recordAsOf`). */
function isRegularNonLeague(game: Game): boolean {
  return game.countsFor === null && game.postseason === null;
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
  // Only here — the record line is compared to a plain-space string (game-view-asof test 1).
  const unbroken = scope.replace(/ /g, '\u00a0');
  // DESIGN §8's missing-data line is for a team the sources have NOTHING for. Never 0-0-0.
  if (!standing?.hasReportedResults) return `No league results reported · ${unbroken}`;
  // Results exist, just none by this date — a first league game still to play. Saying "not
  // reported" here read as missing data about a team that went on to post a record; FormGoingIn words the same case as "no league result before this date".
  if (!record || record.gp === 0) return `No league results yet · ${unbroken}`;
  return `${recordString(record)} ${scope}`;
}

/** The scoreboard caption — see `GameView.recordsCaption`. */
function recordsCaptionFor(
  game: Game,
  display: GameDisplay,
  away: GameSideModel,
  home: GameSideModel,
): string | null {
  const members = [away, home].filter((side) => side.team).length;
  if (members === 0) return null;
  const subject = members === 1 ? 'League record' : 'League records';
  if (game.status === 'postponed' || isRegularNonLeague(game)) return `${subject} to date`;
  if (display.kind === 'final') {
    // A counted final is in each side's league list, so its record includes it; a postseason
    // final is measured by date.
    return game.countsFor !== null
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
    sub: subFor(recordAsOf(game, side), team, standing),
    formBefore: entries,
    playedBefore,
    outcome,
    sbliveUrl: team?.external.sbliveGamesUrl,
    view,
  };
}

/**
 * The game page's sentence for `provenance.resultConflict`: the pipeline's note, then what this
 * site publishes — a level score counts as a tie (DESIGN §5.2: the score is the record).
 */
function resultConflictNoteFor(game: Game): string | null {
  if (!hasResultConflict(game)) return null;
  // The stored note (lib/pipeline/reconcile/sblive-crosscheck.ts, lib/pipeline/reconcile/cifss-crosscheck.ts) spells "MaxPreps' " with a straight
  // apostrophe; the page's copy is curly, notes already in the snapshot included.
  const note = (game.provenance.resultConflict as string)
    .trim()
    .replace(/[.\s]+$/, '')
    .replaceAll("MaxPreps' ", 'MaxPreps’ ');
  // A shootout win is level on goals and a win here: `scoreNote` says so, so no tie sentence.
  if (game.decider === 'SO') return `${note}.`;
  const level = game.home.score !== null && game.home.score === game.away.score;
  return level
    ? `${note}. The score is level, so this site counts it as a tie.`
    : `${note}. This site goes by the published score.`;
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

// ---------------------------------------------------------------- the model

/**
 * `null` for a param that is not a game in the snapshot — the page turns that into a 404 (or a
 * superseded stub). `param` is the URL segment: `gameParam` runs FIRST (`paramToGameId`, so
 * `sblive-123` finds `sblive:123`), and no accessor that can throw runs for an unknown id.
 */
export function buildGameView(param: string): GameView | null {
  const game = gameParam(param);
  if (!game) return null;
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
    officialLeague: game.official
      ? (findLeague(findDivision(game.official.division)?.leagueId ?? '')?.shortName ?? null)
      : null,
    contextLabel: post?.contextLabel ?? (division ? divisionDisplay(division) : 'Non-league'),
    countsAs: post?.countsAs ?? countsAsFor(game),
    postseasonNotes: post?.notes ?? [],
    scoreNote: scoreNoteFor(game, display, away, home),
    memberCount: getTeams().length,
    dayLabel: shortDate(game.dateLocal),
    whenLabel: game.isTimeTba
      ? `${dateWithYear(game.dateLocal)} · time TBA`
      : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`,
    series: {
      meetings: games.map((g) => ({ game: g, isThisGame: g.contestId === game.contestId })),
      // Short names, as the meeting rows above it ("at Mitty") and the team pills print them; a
      // side outside the registry has no short name and keeps its own. Not `side.label`: that
      // only shortens names over 24 characters, so "Archbishop Mitty" would survive beside
      // "Mitty".
      summary: seriesSummary(
        game,
        games,
        home.team ? home.team.shortName : home.name,
        away.team ? away.team.shortName : away.name,
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
 * Does the main column's row 2 of `/game/[id]` (recap · result links · source line · postseason
 * notes · score note · source disagreement · result-flag conflict) render anything? `recap` is
 * `gameRecap(model)` (views/game/titles.ts), passed in because the page prints it too. The DETAILS
 * rail starts in that row, so the page gives it the recap's 24px top margin when the row is there
 * and the section margin when it is not (F-27c).
 */
export function hasLeadRow(model: GameView, recap: string | null): boolean {
  return (
    Boolean(recap) ||
    model.resultLinks.length > 0 ||
    Boolean(model.source) ||
    model.postseasonNotes.length > 0 ||
    Boolean(model.scoreNote) ||
    Boolean(model.conflict) ||
    Boolean(model.resultConflictNote)
  );
}

/**
 * The stub for a superseded si.com game (`/game/sblive-<id>` whose result MaxPreps now has):
 * `<SHORT> game — this result is now on MaxPreps.`, linking and canonical to the MaxPreps game.
 * null for any other param.
 */
export function buildSupersededStub(param: string): SupersededStub | null {
  const contestId = paramToGameId(param);
  // Only an si.com id can be superseded, and the map is a plain JSON object: an own-property
  // lookup, so 'constructor' or '__proto__' never reads Object.prototype as a "target".
  if (!isSbliveContestId(contestId)) return null;
  const map = getSupersededGames();
  const target = Object.hasOwn(map, contestId) ? map[contestId] : undefined;
  if (typeof target !== 'string' || target === '') return null;
  const targetModel = buildGameView(gameIdToParam(target));
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
