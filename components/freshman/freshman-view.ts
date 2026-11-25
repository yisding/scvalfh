/**
 * The freshman level's view models: a team page's "Freshman games" section, a day page's freshman block, the
 * `/freshman` hub, each league's freshman calendar (`/freshman/<league>`) and one freshman game's page
 * (`/freshman/game/<slug>`).
 *
 * Every game comes from lib/freshman/freshman.ts (MaxPreps' freshman schedules, read alone). The level is kept apart
 * from varsity and the JV exactly as the JV is kept apart from varsity: these views feed no record, form strip,
 * table or rating of either, and the site keeps no freshman tables (owner decision, 2026-11-25), so a row carries no
 * league or non-league chip. The lists reuse the JV lists' rows (components/jv/), each a link to the freshman game's
 * own page.
 *
 * SERVER-ONLY: reads lib/freshman/freshman, which imports data/<sport>/freshman.json.
 */

import { crossLevelNote, crossLevelOpponentOf, crossLevelSides, isCrossLevelGame } from '../../lib/cross-level';
import { getGameDates } from '../../lib/data';
import {
  byDateThenId,
  dateWithYear,
  localDateKey,
  matchupJoiner,
  recordString,
  shiftDateKey,
  shortDate,
  sideOutcome,
  timeOfDayPT,
} from '../../lib/format';
import {
  freshmanGameHref,
  getFreshmanFetchedAt,
  getFreshmanGameBySlug,
  getFreshmanGameSlug,
  getFreshmanGameSlugs,
  getFreshmanGames,
  getFreshmanGamesForTeam,
  getFreshmanGamesOn,
  getFreshmanTeam,
  hasFreshmanLevel,
} from '../../lib/freshman/freshman';
import { getLeague } from '../../lib/leagues';
import { SPORT } from '../../lib/sports/current';
import { getTeamBySlug, teamsInLeague } from '../../lib/teams';
import type { Game, GameSide, LeagueId, Outcome, Team, TeamSlug } from '../../lib/types';
import { describeGame, type GameDisplay, type SideView } from '../ui/describe-game';
import type { JvDayGroup, JvListSummary, JvRowView } from '../jv/jv-view';
import { FRESHMAN_LEVEL } from '../words/level-words';

/** A freshman list carries none of the JV lists' marks: no si.com or school-site score, no league schedule. */
const NO_MARKS: JvListSummary = { sbliveScores: 0, schoolSiteScores: 0, differs: 0, fromSchedule: 0, scheduleLeague: null };

/** "Today" for every freshman list: the freshman file's own Pacific date, never the wall clock. */
function today(): string {
  const at = getFreshmanFetchedAt();
  return at === null ? '' : localDateKey(at);
}

/** A freshman game as a row of the JV lists: no chip (no freshman tables), no note, its own page. */
const rowsOf = (games: readonly Game[]): JvRowView[] =>
  games.map((game) => ({
    game,
    differsNote: null,
    chips: false,
    nonLeague: false,
    fromSchedule: false,
    href: freshmanGameHref(game) as string,
  }));

function shortName(side: GameSide): string {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return team ? team.shortName : side.name;
}

function inLeague(game: Game, league: LeagueId): boolean {
  const of = (side: GameSide) => (side.slug ? getTeamBySlug(side.slug)?.league : undefined);
  return of(game.home) === league || of(game.away) === league;
}

/** A team's record over its listed freshman finals ('3-1', '2-0-1'); null before the first. */
function recordOf(games: readonly Game[], teamId: string): string | null {
  const t = { w: 0, l: 0, t: 0 };
  for (const g of games) {
    if (g.status !== 'final') continue;
    const mine = g.home.teamId === teamId ? 'home' : g.away.teamId === teamId ? 'away' : null;
    if (mine === null) continue;
    const outcome = sideOutcome(g, mine);
    if (outcome === 'W') t.w += 1;
    else if (outcome === 'L') t.l += 1;
    else if (outcome === 'T') t.t += 1;
  }
  return t.w + t.l + t.t === 0 ? null : recordString(t);
}

/** 'Sat Dec 5 at Redwood': the team's next listed game from today on, or null. */
function nextLabel(games: readonly Game[], teamId: string, from: string): string | null {
  const next = games.filter((g) => g.status !== 'final' && g.status !== 'postponed' && g.dateKey >= from).sort(byDateThenId)[0];
  if (!next) return null;
  const home = next.home.teamId === teamId;
  const other = home ? next.away : next.home;
  return `${shortDate(next.dateLocal)} ${next.site === 'neutral' || home ? 'vs' : 'at'} ${shortName(other)}`;
}

function groupByDay(games: readonly Game[]): JvDayGroup[] {
  const days = new Map<string, Game[]>();
  for (const g of games) days.set(g.dateKey, [...(days.get(g.dateKey) ?? []), g]);
  return [...days.entries()].map(([dateKey, list]) => ({
    dateKey,
    label: shortDate(`${dateKey}T12:00:00`),
    rows: rowsOf([...list].sort(byDateThenId)),
  }));
}

// ---------------------------------------------------------------- a team page's section

export interface TeamFreshmanView extends JvListSummary {
  teamName: string;
  rows: JvRowView[];
  /** Finals; not final and dated today or later; not final and dated before today (no score reported). */
  played: number;
  toCome: number;
  noScore: number;
  /** The freshman team's record over the finals listed, or null before its first. */
  record: string | null;
  next: string | null;
  /** MaxPreps' freshman schedule page for the school. */
  maxprepsUrl: string | null;
}

/**
 * A team page's "Freshman games" section, or null: in a build without the level, and for a school with no listed
 * freshman game (most schools field no freshman team, so the section is left out rather than shown empty).
 */
export function buildTeamFreshmanView(slug: TeamSlug): TeamFreshmanView | null {
  const team = getTeamBySlug(slug);
  const entry = getFreshmanTeam(slug);
  if (!team || !entry) return null;
  const games = getFreshmanGamesForTeam(slug);
  if (games.length === 0) return null;
  const from = today();
  return {
    teamName: team.name,
    rows: rowsOf(games),
    played: games.filter((g) => g.status === 'final').length,
    toCome: games.filter((g) => g.status !== 'final' && g.dateKey >= from).length,
    noScore: games.filter((g) => g.status !== 'final' && g.dateKey < from).length,
    record: recordOf(games, team.id),
    next: nextLabel(games, team.id, from),
    maxprepsUrl: entry.maxprepsScheduleUrl,
    ...NO_MARKS,
  };
}

// ---------------------------------------------------------------- a day page's block

/** One day's freshman games, by time; with `league`, only those with a side in that league (a league tab's slice). */
export function buildDayFreshmanView(dateKey: string, league?: LeagueId): JvListSummary & { rows: JvRowView[] } {
  const games = getFreshmanGamesOn(dateKey).filter((g) => league === undefined || inLeague(g, league));
  return { rows: rowsOf(games), ...NO_MARKS };
}

// ---------------------------------------------------------------- the /freshman hub

/** How far back "latest" and how far ahead "next" look on the hub, in days, and the most rows each shows (the JV hub's). */
export const FRESHMAN_HUB_WINDOW_DAYS = 7;
export const FRESHMAN_HUB_MAX_ROWS = 12;

export interface LeagueFreshmanHubView extends JvListSummary {
  latest: JvDayGroup[];
  next: JvDayGroup[];
  games: number;
  finals: number;
  /** `/freshman/<league>`: every freshman game of the league, by date. */
  scheduleHref: string;
}

function capped(days: JvDayGroup[]): JvDayGroup[] {
  const out: JvDayGroup[] = [];
  let rows = 0;
  for (const day of days) {
    if (out.length > 0 && rows + day.rows.length > FRESHMAN_HUB_MAX_ROWS) break;
    out.push(day);
    rows += day.rows.length;
  }
  return out;
}

/** One league's part of the hub: its latest freshman results and its next freshman games, as the JV hub's. */
export function buildLeagueFreshmanHubView(league: LeagueId): LeagueFreshmanHubView {
  const from = today();
  const all = getFreshmanGames().filter((g) => inLeague(g, league));
  const finals = all.filter((g) => g.status === 'final');
  const upcoming = all.filter((g) => g.status !== 'final' && g.status !== 'postponed' && g.dateKey >= from);
  const since = shiftDateKey(from, -FRESHMAN_HUB_WINDOW_DAYS);
  const until = shiftDateKey(from, FRESHMAN_HUB_WINDOW_DAYS);
  const recentFinals = finals.filter((g) => g.dateKey > since);
  const latestDay = finals.at(-1)?.dateKey;
  const latestGames = recentFinals.length > 0 ? recentFinals : finals.filter((g) => g.dateKey === latestDay);
  const soon = upcoming.filter((g) => g.dateKey < until);
  const nextDay = upcoming[0]?.dateKey;
  const nextGames = soon.length > 0 ? soon : upcoming.filter((g) => g.dateKey === nextDay);
  return {
    latest: capped(groupByDay(latestGames).reverse()),
    next: capped(groupByDay(nextGames)),
    games: all.length,
    finals: finals.length,
    scheduleHref: `/freshman/${league}`,
    ...NO_MARKS,
  };
}

export interface FreshmanTeamCardView {
  team: Team;
  /** `/teams/<slug>#freshman`. */
  href: string;
  /** '3-1' once the freshman team has a result, else null. */
  record: string | null;
  next: string | null;
  games: number;
}

/** The league's schools with a listed freshman game, each with its record, next game and team page section. */
export function buildLeagueFreshmanTeams(league: LeagueId): FreshmanTeamCardView[] {
  return teamsInLeague(league).flatMap((team) => {
    const view = buildTeamFreshmanView(team.slug);
    if (!view) return [];
    return [{ team, href: `/teams/${team.slug}#freshman`, record: view.record, next: view.next, games: view.rows.length }];
  });
}

// ---------------------------------------------------------------- /freshman/<league>

export interface LeagueFreshmanScheduleView extends JvListSummary {
  days: JvDayGroup[];
  games: number;
  finals: number;
  noScore: number;
  toCome: number;
  /** The first date from today on with a game: the page's "Next" link target, or null after the last. */
  nextDateKey: string | null;
}

/** `/freshman/<league>`: the league's whole freshman season, by date. */
export function buildLeagueFreshmanScheduleView(league: LeagueId): LeagueFreshmanScheduleView {
  const from = today();
  const all = getFreshmanGames().filter((g) => inLeague(g, league));
  const days = groupByDay(all);
  return {
    days,
    games: all.length,
    finals: all.filter((g) => g.status === 'final').length,
    noScore: all.filter((g) => g.status !== 'final' && g.dateKey < from).length,
    toCome: all.filter((g) => g.status !== 'final' && g.dateKey >= from).length,
    nextDateKey: days.find((d) => d.dateKey >= from)?.dateKey ?? null,
    ...NO_MARKS,
  };
}

/** The leagues with at least one listed freshman game, in league order: the hub's sections and the calendars. */
export function freshmanLeagues(leagues: readonly LeagueId[]): LeagueId[] {
  if (!hasFreshmanLevel()) return [];
  const games = getFreshmanGames();
  return leagues.filter((league) => games.some((g) => inLeague(g, league)));
}

// ---------------------------------------------------------------- /freshman/game/<slug>

export interface FreshmanGameSideModel {
  name: string;
  /** The name for a `<title>`: the short name when the full one is over 24 characters. */
  label: string;
  /** `label` with "freshman" after it (`Saint Francis freshman`); a cross-level placeholder keeps its label alone. */
  levelLabel: string;
  team: Team | undefined;
  /** `2-1 freshman`, the team's record over its listed freshman finals as of this game; null for a side not ours. */
  sub: string | null;
  outcome: Outcome | null;
  view: SideView;
}

export interface FreshmanGameModel {
  game: Game;
  param: string;
  canonical: string;
  display: GameDisplay;
  away: FreshmanGameSideModel;
  home: FreshmanGameSideModel;
  /** The line over the board: the league's freshman season. */
  competition: { name: string; href: string };
  /** Sentences a reader must not miss: what a cross-level game is, and that the level counts in no table. */
  notes: string[];
  recordsCaption: string | null;
  /** Every listed freshman meeting of the two teams this season, oldest first (shown when there are two or more). */
  series: Array<{ game: Game; href: string; isThisGame: boolean }>;
  seriesPerspective: { teamId: string } | null;
  /** The day page's freshman block when the date has varsity games, else the league's freshman calendar at that date. */
  dayHref: string;
  links: Array<{ href: string; label: string }>;
  whenLabel: string;
}

const TITLE_NAME_LIMIT = 24;

const leagueOfSide = (side: GameSide): LeagueId | undefined => (side.slug ? getTeamBySlug(side.slug)?.league : undefined);

function recordAsOf(game: Game, teamId: string, all: readonly Game[]): string | null {
  const mine = all.filter((g) => g.home.teamId === teamId || g.away.teamId === teamId).sort(byDateThenId);
  const index = mine.findIndex((g) => g.contestId === game.contestId);
  return recordOf(mine.slice(0, game.status === 'final' ? index + 1 : index), teamId);
}

function sideModel(game: Game, side: GameSide, view: SideView, display: GameDisplay, all: readonly Game[]): FreshmanGameSideModel {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const name = team ? team.name : side.name;
  const label = team && name.length > TITLE_NAME_LIMIT ? team.shortName : name;
  const record = team && side.teamId ? recordAsOf(game, side.teamId, all) : null;
  return {
    name,
    label,
    levelLabel: crossLevelOpponentOf(side.teamId) ? label : `${label} ${FRESHMAN_LEVEL.long}`,
    team,
    sub: team ? (record ? `${record} ${FRESHMAN_LEVEL.long}` : `No ${FRESHMAN_LEVEL.long} results yet`) : null,
    outcome: display.kind !== 'final' ? null : view.weight === 'level' ? 'T' : view.weight === 'winner' ? 'W' : 'L',
    view,
  };
}

/** The sentence every freshman game page carries: what the level counts for. */
export const FRESHMAN_COUNTS_NOTE =
  'A freshman game counts in no varsity or JV record, table or rating, and the site keeps no freshman tables.';

function buildModel(game: Game): FreshmanGameModel {
  const all = getFreshmanGames();
  const display = describeGame(game);
  const away = sideModel(game, game.away, display.away, display, all);
  const home = sideModel(game, game.home, display.home, display, all);
  const league = leagueOfSide(game.home) ?? leagueOfSide(game.away);
  const competition = league
    ? { name: `${getLeague(league).shortName} ${FRESHMAN_LEVEL.long}`, href: `/freshman/${league}` }
    : { name: FRESHMAN_LEVEL.short, href: '/freshman' };
  const crossLevel = crossLevelNote(game, (crossLevelSides(game)?.which === 'home' ? away : home).name);
  const series = (isCrossLevelGame(game) ? [game] : all)
    .filter(
      (g) =>
        (g.home.teamId === game.home.teamId && g.away.teamId === game.away.teamId) ||
        (g.home.teamId === game.away.teamId && g.away.teamId === game.home.teamId),
    )
    .map((g) => ({ game: g, href: freshmanGameHref(g) as string, isThisGame: g.contestId === game.contestId }));
  const tracked = [away, home].filter((s) => s.team).length;
  const links: FreshmanGameModel['links'] = [];
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: game.status === 'final' ? 'MaxPreps box score' : 'MaxPreps game' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.hudl) links.push({ href: game.urls.hudl, label: 'Hudl TV' });
  return {
    game,
    param: getFreshmanGameSlug(game.contestId) as string,
    canonical: freshmanGameHref(game) as string,
    display,
    away,
    home,
    competition,
    notes: [...(crossLevel ? [crossLevel] : []), FRESHMAN_COUNTS_NOTE],
    recordsCaption:
      tracked === 0
        ? null
        : `${tracked === 1 ? `${FRESHMAN_LEVEL.longTitle} record` : `${FRESHMAN_LEVEL.longTitle} records`} over the games listed here, ${display.kind === 'final' ? 'after this game' : 'going in'}`,
    series,
    seriesPerspective: game.home.teamId ? { teamId: game.home.teamId } : null,
    dayHref: VARSITY_DATES().has(game.dateKey)
      ? `/scores/${game.dateKey}#freshman`
      : league
        ? `/freshman/${league}#d-${game.dateKey}`
        : '/freshman',
    links,
    whenLabel: game.isTimeTba ? dateWithYear(game.dateLocal) : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`,
  };
}

let varsityDates: ReadonlySet<string> | null = null;
function VARSITY_DATES(): ReadonlySet<string> {
  varsityDates ??= new Set(getGameDates());
  return varsityDates;
}

/** The game page's params: every listed freshman game's slug (none in a build without the level). */
export function freshmanGameStaticParams(): Array<{ id: string }> {
  return getFreshmanGameSlugs().map((id) => ({ id }));
}

/** The model for a slug; undefined for a segment that is no freshman game's. */
export function buildFreshmanGameView(param: string): FreshmanGameModel | undefined {
  const game = getFreshmanGameBySlug(param);
  return game ? buildModel(game) : undefined;
}

/**
 * The `<title>`, as the JV page's words a game with the level after each name: `Saint Francis freshman 2, Carlmont
 * freshman 1 — soccer, Dec 10, 2026`, winner first on a decided final; `Carlmont freshman at Saint Francis freshman
 * soccer — Dec 10, 2026, 5:30 PM`.
 */
export function freshmanGameTitle(model: FreshmanGameModel): string {
  const { display, game, away, home } = model;
  const date = dateWithYear(game.dateLocal);
  if (display.kind === 'final') {
    const [first, second] = home.view.weight === 'winner' ? [home, away] : [away, home];
    const decider = display.deciderTag ? ` (${display.deciderTag})` : '';
    return `${first.levelLabel} ${first.view.glyph}, ${second.levelLabel} ${second.view.glyph}${decider} — ${SPORT.noun}, ${date}`;
  }
  const suffix =
    display.kind === 'scheduled' ? (game.isTimeTba ? 'time TBA' : timeOfDayPT(game.dateLocal)) : display.statusLabel.toLowerCase();
  return `${away.levelLabel} ${matchupJoiner(game)} ${home.levelLabel} ${SPORT.noun} — ${date}, ${suffix}`;
}

/** The meta description: the game's sentence and its competition. */
export function freshmanGameDescription(model: FreshmanGameModel): string {
  return `${FRESHMAN_LEVEL.longTitle}: ${model.display.sentence} ${model.competition.name}, ${model.whenLabel}. ${FRESHMAN_COUNTS_NOTE}`;
}
