/**
 * The JV lists' view model: a team page's "JV games" section and a day page's JV block.
 *
 * Every game comes from lib/jv/jv.ts (MaxPreps' JV schedules, supplemented by si.com under
 * lib/jv/jv-merge.ts), classified by lib/jv/jv-standings.ts: a JV league game is one whose varsity
 * counterpart counts. JV games stay apart from varsity: these views feed no varsity record, form
 * strip, margin chart or table, so a JV result is never mistaken for a varsity one.
 *
 * SERVER-ONLY: reads lib/jv/jv, which imports data/jv.json.
 */

import { byDateThenId, localDateKey, recordString, shiftDateKey, shortDate, sideOutcome } from '../../lib/format';
import {
  getJvClassification,
  getJvFetchedAt,
  getJvGames,
  getJvGamesForOutsideTeam,
  getJvGamesForTeam,
  getJvGamesOn,
  getJvSchoolSiteDiffersNote,
  getJvTeam,
} from '../../lib/jv/jv';
import { isOfficialJvContestId } from '../../lib/jv/jv-official';
import { jvSlotTeamFor } from '../../lib/jv/jv-teams';
import { getLeague, regionOf } from '../../lib/leagues';
import { getTeamBySlug, teamsInLeague } from '../../lib/teams';
import type { Game, GameSide, LeagueId, RegionId, Team, TeamSlug } from '../../lib/types';
import type { Perspective } from '../ui/describe-game';

export interface JvRowView {
  game: Game;
  /** "si.com has Santa Clara 0, Monta Vista 4; MaxPreps’ score is shown." when the two disagree. */
  differsNote: string | null;
  /** Show the league / NL chip: false for a same-division game no varsity game matched (uncounted). */
  chips: boolean;
  /** Draw the non-league rule: the game is classified non-league. */
  nonLeague: boolean;
  /**
   * The game is listed from the league's own JV schedule and no source has it yet (lib/jv/jv-official.ts):
   * the row carries a `SCHED` tag, and the footnote says what it means.
   */
  fromSchedule: boolean;
}

export interface JvListSummary {
  /** Games with a score from si.com (the † rows). */
  sbliveScores: number;
  /** Games with a score from a school's own athletics site (also †; lib/jv/jv-school-sites.ts). */
  schoolSiteScores: number;
  /** MaxPreps finals si.com reports differently. */
  differs: number;
  /** Games listed from the league's own JV schedule (the `SCHED` rows). */
  fromSchedule: number;
  /** The league whose schedule they come from ('SCVAL'), when there is exactly one; else null. */
  scheduleLeague: string | null;
}

export interface TeamJvView extends JvListSummary {
  teamName: string;
  /**
   * The team whose games these are, when it is not this school: York on Santa Catalina's page, since
   * PCAL pairs the two in one schedule slot (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS). `note` says so.
   */
  slot: { name: string; note: string } | null;
  /** Whose side the rows read from: the school, or its slot team by MaxPreps id. */
  perspective: Perspective;
  rows: JvRowView[];
  /** Finals. */
  played: number;
  /** Not final, dated today or later. */
  toCome: number;
  /**
   * Not final, dated before today: the day has passed with no score reported. With `played` and
   * `toCome` it accounts for every row, so the section header's counts add up to the list.
   */
  noScore: number;
  /**
   * The JV team's record over the finals listed: '3-1' overall and '2-0' in league games; null before its
   * first result. Counted from the rows shown, so it says nothing a reader cannot check against the list.
   */
  record: { overall: string; league: string | null } | null;
  /** The next game to come ('Mon Nov 23 at Leland'), or null when none is listed. */
  next: string | null;
  /** The MaxPreps source's status for this school in the latest run. */
  status: 'ok' | 'carried-forward' | 'error' | 'pending';
  maxprepsUrl: string | null;
  sbliveUrl: string | null;
  emptyHeading: string;
  emptyBody: string;
}

function shortName(side: GameSide): string {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return team ? team.shortName : side.name;
}

/** The sentence beside a MaxPreps JV final si.com, or a school's own site, reports differently, or null. */
export function jvDiffersNote(game: Game): string | null {
  const conflict = game.provenance.scoreConflict;
  if (!conflict || game.provenance.scores === 'sblive') return getJvSchoolSiteDiffersNote(game.contestId);
  return (
    `si.com has ${shortName(game.away)} ${conflict.sblive.away}, ${shortName(game.home)} ${conflict.sblive.home}; ` +
    'MaxPreps’ score is shown.'
  );
}

function summarize(games: readonly Game[]): JvListSummary {
  const scheduled = games.filter((g) => isOfficialJvContestId(g.contestId));
  const leagues = new Set(
    scheduled.map((g) => (g.home.slug ? getTeamBySlug(g.home.slug)?.league : undefined)).filter((l): l is LeagueId => l !== undefined),
  );
  return {
    sbliveScores: games.filter((g) => g.provenance.scores === 'sblive').length,
    schoolSiteScores: games.filter((g) => g.provenance.scores === 'school-site').length,
    differs: games.filter((g) => jvDiffersNote(g) !== null).length,
    fromSchedule: scheduled.length,
    scheduleLeague: leagues.size === 1 ? getLeague([...leagues][0]).shortName : null,
  };
}

const rowsOf = (games: readonly Game[]): JvRowView[] =>
  games.map((game) => {
    const kind = getJvClassification(game.contestId)?.kind;
    return {
      game,
      differsNote: jvDiffersNote(game),
      chips: kind !== 'uncounted',
      nonLeague: kind === 'non-league',
      fromSchedule: isOfficialJvContestId(game.contestId),
    };
  });

/**
 * A team page's JV section; null only for a slug that is not a registry team. A school that fields no
 * JV team of its own but whose league slot another team plays at JV level (Santa Catalina, whose PCAL
 * JV games are York's) lists that team's games, read from its side, with a sentence saying whose they
 * are: PCAL's schedule names the slot "CAT/YOR", so the school's page is where its JV fixtures are.
 */
export function buildTeamJvView(slug: TeamSlug): TeamJvView | null {
  const team = getTeamBySlug(slug);
  const entry = getJvTeam(slug);
  if (!team || !entry) return null;
  const slot = jvSlotTeamFor(slug);
  const games = slot ? getJvGamesForOutsideTeam(slot.maxprepsTeamId) : getJvGamesForTeam(slug);
  const today = localDateKey(getJvFetchedAt());
  const status = entry.maxpreps.status === 'unavailable' ? 'ok' : entry.maxpreps.status;
  const emptyHeading = slot
    ? `${team.name} fields no JV team, and no ${slot.name} JV game is listed yet.`
    : status === 'error'
      ? `${team.name}’s JV games could not be read.`
      : status === 'pending'
        ? `${team.name}’s JV games have not been read yet.`
        : `MaxPreps lists no JV games for ${team.name}.`;
  const emptyBody = slot
    ? slot.source
    : status === 'error'
      ? 'The last update could not reach MaxPreps for them and had nothing earlier to fall back on.'
      : status === 'pending'
        ? 'No update has covered this team’s JV schedule yet.'
        : 'The school may not field a JV team this season, or no JV schedule has been entered.';
  return {
    teamName: team.name,
    slot: slot
      ? {
          name: slot.name,
          note: `${slot.source} These are ${slot.name}’s JV games, each result from ${slot.name}’s side.`,
        }
      : null,
    perspective: slot ? { teamId: slot.maxprepsTeamId } : slug,
    record: jvRecordOf(games, slot ? slot.maxprepsTeamId : team.id),
    next: nextLabel(games, slot ? slot.maxprepsTeamId : team.id, today),
    rows: rowsOf(games),
    played: games.filter((g) => g.status === 'final').length,
    toCome: games.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
    noScore: games.filter((g) => g.status !== 'final' && g.dateKey < today).length,
    status,
    maxprepsUrl: slot ? slot.maxprepsJvScheduleUrl : entry.maxprepsScheduleUrl,
    sbliveUrl: slot ? slot.sbliveJvGamesUrl : entry.sbliveUrl,
    emptyHeading,
    emptyBody,
    ...summarize(games),
  };
}

/**
 * One day's JV games, by time; with `region`, only those with a registry side in that region (the day
 * page's `#jv` and `#jv-socal` blocks, DESIGN §24.3), and the footnote's counts over those alone. A JV
 * game with a side in each region would be listed in both blocks, each the JV schedule of that region's
 * team: data/jv.json of 2026-10-06 has none (every JV game in it is between two schools of one region), and
 * the varsity page's NorCal vs SoCal block is for varsity alone.
 */
export function buildDayJvView(dateKey: string, region?: RegionId): JvListSummary & { rows: JvRowView[] } {
  const inRegion = (side: GameSide) => {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    return team !== undefined && regionOf(team.league) === region;
  };
  const games = getJvGamesOn(dateKey).filter((g) => region === undefined || inRegion(g.home) || inRegion(g.away));
  return { rows: rowsOf(games), ...summarize(games) };
}

// ---------------------------------------------------------------- records and the /jv pages

type Tally = { w: number; l: number; t: number };

function tally(games: readonly Game[], teamId: string): Tally {
  const out = { w: 0, l: 0, t: 0 };
  for (const g of games) {
    if (g.status !== 'final') continue;
    const mine = g.home.teamId === teamId ? 'home' : g.away.teamId === teamId ? 'away' : null;
    if (mine === null) continue;
    const outcome = sideOutcome(g, mine);
    if (outcome === 'W') out.w += 1;
    else if (outcome === 'L') out.l += 1;
    else if (outcome === 'T') out.t += 1;
  }
  return out;
}

/** A JV team's record over its listed finals, overall and in its JV league games; null before the first. */
function jvRecordOf(games: readonly Game[], teamId: string): { overall: string; league: string | null } | null {
  const overall = tally(games, teamId);
  if (overall.w + overall.l + overall.t === 0) return null;
  const league = tally(games.filter((g) => g.countsFor !== null), teamId);
  return {
    overall: recordString(overall),
    league: league.w + league.l + league.t > 0 ? recordString(league) : null,
  };
}

/** 'Mon Nov 23 at Leland' / 'Wed Jan 6 vs Gunn': the team's next listed game from `today` on, or null. */
function nextLabel(games: readonly Game[], teamId: string, today: string): string | null {
  const next = games
    .filter((g) => g.status !== 'final' && g.status !== 'postponed' && g.dateKey >= today)
    .sort(byDateThenId)[0];
  if (!next) return null;
  const home = next.home.teamId === teamId;
  const other = home ? next.away : next.home;
  return `${shortDate(next.dateLocal)} ${next.site === 'neutral' ? 'vs' : home ? 'vs' : 'at'} ${shortName(other)}`;
}

/** A day's JV games under its date, for the /jv lists. */
export interface JvDayGroup {
  dateKey: string;
  /** 'Mon Nov 23'. */
  label: string;
  rows: JvRowView[];
}

function inLeague(game: Game, league: LeagueId): boolean {
  const of = (side: GameSide) => (side.slug ? getTeamBySlug(side.slug)?.league : undefined);
  return of(game.home) === league || of(game.away) === league;
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

/** How far back "latest" and how far ahead "next" look on the /jv hub, in days, and the most rows each shows. */
export const JV_HUB_WINDOW_DAYS = 7;
export const JV_HUB_MAX_ROWS = 12;

export interface LeagueJvHubView extends JvListSummary {
  /** Finals of the last week, newest day first; when the week has none, the latest day with a final. */
  latest: JvDayGroup[];
  /** Games of the coming week, soonest first; when the week has none, the next day with a game. */
  next: JvDayGroup[];
  /** Listed games in all, and how many are final: the link to the league's full JV list says both. */
  games: number;
  finals: number;
  /** `/jv/<league>`: every JV game of the league, by date. */
  scheduleHref: string;
}

/** Whole days, newest (or soonest) first, until adding the next day would pass the cap; always at least one day. */
function capped(days: JvDayGroup[]): JvDayGroup[] {
  const out: JvDayGroup[] = [];
  let rows = 0;
  for (const day of days) {
    if (out.length > 0 && rows + day.rows.length > JV_HUB_MAX_ROWS) break;
    out.push(day);
    rows += day.rows.length;
  }
  return out;
}

/** One league's part of the /jv hub: its latest JV results and its next JV games. */
export function buildLeagueJvHubView(league: LeagueId): LeagueJvHubView {
  const today = localDateKey(getJvFetchedAt());
  const all = getJvGames().filter((g) => inLeague(g, league));
  const finals = all.filter((g) => g.status === 'final');
  const upcoming = all.filter(
    (g) => g.status !== 'final' && g.status !== 'postponed' && g.dateKey >= today,
  );
  const since = shiftDateKey(today, -JV_HUB_WINDOW_DAYS);
  const until = shiftDateKey(today, JV_HUB_WINDOW_DAYS);
  const recentFinals = finals.filter((g) => g.dateKey > since);
  const latestDay = finals.at(-1)?.dateKey;
  const latestGames = recentFinals.length > 0 ? recentFinals : finals.filter((g) => g.dateKey === latestDay);
  const soon = upcoming.filter((g) => g.dateKey < until);
  const nextDay = upcoming[0]?.dateKey;
  const nextGames = soon.length > 0 ? soon : upcoming.filter((g) => g.dateKey === nextDay);
  const latest = capped(groupByDay(latestGames).reverse());
  const next = capped(groupByDay(nextGames));
  return {
    latest,
    next,
    games: all.length,
    finals: finals.length,
    scheduleHref: `/jv/${league}`,
    ...summarize([...latest, ...next].flatMap((d) => d.rows.map((r) => r.game))),
  };
}

export interface JvTeamCardView {
  team: Team;
  /** `/teams/<slug>#jv`. */
  href: string;
  /** '3-1' once the JV team has a result, else null. */
  record: string | null;
  /** 'Mon Nov 23 at Leland', or null. */
  next: string | null;
  /** Listed JV games, and how many are final. */
  games: number;
  finals: number;
  /** A varsity-only school whose JV slot another team plays (Santa Catalina / York): that team's name. */
  slotName: string | null;
}

/** Every school of a league with its JV team's record, next game and page: the /jv hub's team index. */
export function buildLeagueJvTeams(league: LeagueId): JvTeamCardView[] {
  return teamsInLeague(league).map((team) => {
    const view = buildTeamJvView(team.slug);
    return {
      team,
      href: `/teams/${team.slug}#jv`,
      record: view?.record?.overall ?? null,
      next: view?.next ?? null,
      games: view?.rows.length ?? 0,
      finals: view?.played ?? 0,
      slotName: view?.slot?.name ?? null,
    };
  });
}

export interface LeagueJvScheduleView extends JvListSummary {
  /** Every JV game with a side in the league, by date, oldest first. */
  days: JvDayGroup[];
  games: number;
  finals: number;
  /** Not final, dated before today: played or not, no score has been reported. */
  noScore: number;
  toCome: number;
  /** The first date from today on with a game: the page's "jump to today" target, or null after the last. */
  nextDateKey: string | null;
}

/** `/jv/<league>`: the league's whole JV season, by date. */
export function buildLeagueJvScheduleView(league: LeagueId): LeagueJvScheduleView {
  const today = localDateKey(getJvFetchedAt());
  const all = getJvGames().filter((g) => inLeague(g, league));
  const days = groupByDay(all);
  return {
    days,
    games: all.length,
    finals: all.filter((g) => g.status === 'final').length,
    noScore: all.filter((g) => g.status !== 'final' && g.dateKey < today).length,
    toCome: all.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
    nextDateKey: days.find((d) => d.dateKey >= today)?.dateKey ?? null,
    ...summarize(all),
  };
}
