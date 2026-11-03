/**
 * The parts of /teams/[slug] (app/teams/[slug]/page.tsx) that its view (`buildTeamPageView`,
 * components/teams/team-view.ts) leaves to the page: the meta description's words (`rosterExtras`,
 * `postseasonDescription`) and the postseason section's kicker (`postseasonKicker`), last season's row,
 * the roster, JV and player-stats views, the first league game a team with none played names, and the grid's
 * layout decisions (`leagueLogSpans`, `fixturesSpan`, `logOutweighs`: the page's docblock draws them).
 * `buildTeamPageParts` reads them in the order the page always did.
 */

import { getToday } from '../../lib/data';
import { getHistoryFor, getHistoryStandings, type HistoryRow } from '../../lib/history/history';
import { divisionHeading, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, Game, LeagueId } from '../../lib/types';
import { teamJvStanding } from '../jv/jv-standings-view';
import { buildTeamJvView, type TeamJvView } from '../jv/jv-view';
import { buildPlayerStatsView, type PlayerStatsView } from './player-stats-view';
import { buildRosterView, type RosterView } from './roster-view';
import type { TeamPageView } from './team-view';

/**
 * `player stats, roster, ` for the description, naming only what this page shows: stats when the
 * coach has entered some, the roster when it lists players. Empty for a team that has neither
 * (a coach who published nothing, or a team no update has covered yet), so its description does not
 * promise what the page lacks.
 */
export function rosterExtras(stats: PlayerStatsView | null, roster: RosterView | null): string {
  const parts: string[] = [];
  if (stats && (stats.scoring || stats.more || stats.goalies.length > 0)) parts.push('player stats');
  if (roster && roster.rows.length > 0) parts.push('roster');
  return parts.map((p) => `${p}, `).join('');
}

/**
 * `CCS picture` (SCVAL, BVAL, PCAL) | `MCAL tournament picture` | `Super Regional picture` (EAL) |
 * `San Diego Section playoffs picture` (City, North County, Metro) | `Postseason` (the Sunset and the LA
 * independents, whose postseason is the Tournament of Champions: no table place leads into it, so there is no
 * picture to draw), by `postseason.kind`.
 */
export function postseasonKicker(view: TeamPageView): string {
  const { postseasonKind, postseasonName, shortName } = view.league;
  switch (postseasonKind) {
    case 'ccs-ladder':
      return 'CCS picture';
    case 'league-tournament':
      return `${shortName} tournament picture`;
    case 'unbracketed-tournament':
    case 'section-playoffs':
      return `${postseasonName} picture`;
    case 'no-postseason':
      return 'Postseason';
  }
}

/** The meta description's last words: the kicker, except for the Sunset and the LA independents, whose postseason is the Tournament of Champions. */
export function postseasonDescription(view: TeamPageView): string {
  return view.league.postseasonKind === 'no-postseason' ? 'the Tournament of Champions' : postseasonKicker(view);
}

/**
 * Where last season's row sat: the division heading (`El Camino`), prefixed by that division's
 * league when this team plays in another league now, so no page reads as if "El Camino" were a
 * division of its own league.
 */
function lastSeasonScope(division: DivisionId, league: LeagueId): string {
  const owner = leagueOfDivision(division);
  const heading = divisionHeading(division);
  if (heading === null) return owner.shortName;
  return owner.id === league ? heading : `${owner.shortName} ${heading}`;
}

/** The team page's own reads and layout decisions; see the module comment. */
export interface TeamPageParts {
  /** Last season's varsity row, or undefined for a team whose league has no 2025-26 standings. */
  history: { division: DivisionId; row: HistoryRow } | undefined;
  /** The size of that division as it was then. */
  historySize: number;
  /** Where that row sat (`lastSeasonScope`): '' with no row. */
  historyScope: string;
  /** The team's si.com games page. */
  sblive: string | undefined;
  roster: RosterView | null;
  jv: TeamJvView | null;
  jvStanding: { line: string | null; href: string } | null;
  playerStats: PlayerStatsView | null;
  /** The roster's players, 0 for an errored roster. */
  rosterCount: number;
  /** A team whose every league game is still to come: its first, which its empty state names. */
  firstLeagueGame: Game | null;
  hasPlayedLeagueGames: boolean;
  /** The League log spans two rows at 1024px+ (the official-only fixtures card exists and there are results). */
  leagueLogSpans: boolean;
  /** The official-only fixtures take both columns (more than six, beside a short log). */
  fixturesSpan: boolean;
  /** The League log outweighs Non-league by four rows or more, so Elsewhere moves up beside it. */
  logOutweighs: boolean;
  /** The empty states' 'Check MaxPreps' action, when the team has a MaxPreps schedule. */
  maxprepsAction: { href: string; label: string; external: boolean } | undefined;
}

export function buildTeamPageParts(view: TeamPageView): TeamPageParts {
  const { team, leagueLog, nonLeagueLog, marginEntries, officialFixtures } = view;
  // Last season's varsity row from the league's own 2025-26 standings (SCVAL's PDF, BVAL's sheet;
  // PCAL, MCAL and the EAL are unavailable, so their slugs have no rows), and the size of that
  // division as it was then (the alignment can change between seasons: Leland played in Santa
  // Teresa in 2025-26 and is in Mt. Hamilton now).
  const history = getHistoryFor(team.slug).find((entry) => entry.level === 'varsity');
  const historySize = history ? getHistoryStandings(history.division).length : 0;
  const historyScope = history ? lastSeasonScope(history.division, team.league) : '';
  const sblive = team.external.sbliveGamesUrl;
  // Both exist for every registry team; an empty or pending team gets a stated empty state.
  const roster = buildRosterView(team.slug);
  // The school's JV games (MaxPreps, supplemented by si.com): listed apart from every varsity count.
  const jv = buildTeamJvView(team.slug);
  // Its JV place, when its division's JV table is shown (lib/jv/jv-standings.ts), and that table's anchor.
  const jvStanding = teamJvStanding(team.slug);
  const playerStats = buildPlayerStatsView(team.slug, [...leagueLog, ...nonLeagueLog]);
  const rosterCount = roster && roster.status !== 'error' ? roster.rows.length : 0;
  // A team whose every league game is still to come (Metro South Bay before Oct 7, Newport Harbor before
  // Oct 13) has no league result for MaxPreps to have either, so its empty state names the first game
  // instead of "MaxPreps may have results we have not picked up yet" (review 2026-10-06). That hedge stays
  // for a league game dated on or before the snapshot's Pacific day that has no score.
  const today = getToday();
  const earliestLeague = leagueLog.reduce<(typeof leagueLog)[number] | null>(
    (first, g) => (first === null || g.dateLocal < first.dateLocal ? g : first),
    null,
  );
  const firstLeagueGame = earliestLeague !== null && earliestLeague.dateKey > today ? earliestLeague : null;
  const hasPlayedLeagueGames = marginEntries.some(
    (entry) => entry.margin !== null && !entry.excludedFromMargin,
  );

  const leagueLogSpans = hasPlayedLeagueGames && officialFixtures.length > 0;
  const fixturesSpan = !leagueLogSpans && officialFixtures.length > 6;
  const logOutweighs =
    hasPlayedLeagueGames &&
    officialFixtures.length === 0 &&
    leagueLog.length - nonLeagueLog.length >= 4;

  const maxprepsAction = team.external.maxprepsScheduleUrl
    ? { href: team.external.maxprepsScheduleUrl, label: 'Check MaxPreps', external: true }
    : undefined;

  return {
    history,
    historySize,
    historyScope,
    sblive,
    roster,
    jv,
    jvStanding,
    playerStats,
    rosterCount,
    firstLeagueGame,
    hasPlayedLeagueGames,
    leagueLogSpans,
    fixturesSpan,
    logOutweighs,
    maxprepsAction,
  };
}
