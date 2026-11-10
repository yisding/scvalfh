/**
 * The /teams index (SPEC §10.5, DESIGN §18): region → section → league → division → standings table, in config
 * order, and the sentence that says where each league's membership comes from. Server-only: it reads the
 * snapshot through lib/data.
 */

import {
  getLastLeagueResultDate,
  getStandings,
  getTeams,
  getTeamsGrouped,
  type LeagueSummary,
} from '../../lib/data';
import { listWords, plural } from '../../lib/format';
import { REGIONS } from '../../lib/league-config/sections';
import { getLeague, leagueHeading, leaguesInRegion, standingsLabel } from '../../lib/leagues';
import { IS_FIELD_HOCKEY } from '../../lib/sports/current';
import type { RegionId, SectionId } from '../../lib/types';
import { buildOverviewDivision, type OverviewDivision } from '../standings/standings-view';

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

/** One region's half of /teams (DESIGN-socal §2.4): its sections, in a `<div id="<region>">` wrapper. */
export interface TeamsRegionGroup {
  id: RegionId;
  name: string;
  sections: TeamsSectionGroup[];
}

/** /teams: region → section → league → division → standings table, config order (NorCal, then SoCal). */
export function buildTeamsByRegion(): TeamsRegionGroup[] {
  return REGIONS.map((region) => ({
    id: region.id,
    name: region.name,
    sections: buildTeamsByLeague(region.id),
  }));
}

/**
 * The sentence that says where each league's membership comes from (DESIGN-socal §2.1.7,
 * `LeagueConfig.alignmentSource`), grouped. NorCal's half is today's sentence word for word: its four
 * leagues' official schedules, and the EAL, which publishes none (its six are MaxPreps' EAL table less
 * Red Bluff). The SoCal half names each source with the leagues that use it, in config order.
 */
export function alignmentSentence(): string {
  // The EAL clause is field hockey's (the soccer build covers SCVAL, whose official schedules give the alignment).
  const norcal = IS_FIELD_HOCKEY
    ? 'League and division alignment comes from each league’s official schedule; the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026.'
    : 'League and division alignment comes from each league’s official schedule.';
  const groups: Array<{ source: string; leagues: string[] }> = [];
  for (const league of leaguesInRegion('socal')) {
    const group = groups.find((g) => g.source === league.alignmentSource);
    // 'the Sunset' reads as a league name; the San Diego conferences read as names already; a group of
    // independents is named in full ('the LA independents'): its short name is an adjective.
    const name =
      league.independents
        ? `the ${league.name}`
        : league.divisions.length === 1
          ? `the ${league.shortName}`
          : league.shortName;
    if (group) group.leagues.push(name);
    else groups.push({ source: league.alignmentSource, leagues: [name] });
  }
  if (groups.length === 0) return norcal;
  const socal = groups.map((g) => `from ${g.source} for ${listWords(g.leagues)}`);
  return `${norcal} In Southern California it comes ${listWords(socal)}.`;
}

/** /teams: section → league → division → standings table, config order (SPEC §10.5, DESIGN §18); `region` keeps one region's. */
export function buildTeamsByLeague(region?: RegionId): TeamsSectionGroup[] {
  const teams = getTeams();
  return getTeamsGrouped(region).map(({ section, leagues }) => ({
    id: section.id,
    name: section.name,
    leagues: leagues.map(({ league, divisions }) => {
      return {
        league,
        title: leagueHeading(league.id),
        meta: plural(league.teamCount, 'team'),
        membershipNote: getLeague(league.id).membershipNote,
        standingsHref: `/standings/${league.id}`,
        standingsLabel: standingsLabel(league.id),
        divisions: divisions.map((d) =>
          buildOverviewDivision({
            division: d.id,
            standings: getStandings(d.id),
            teams,
            throughDate: getLastLeagueResultDate({ division: d.id }),
          }),
        ),
      };
    }),
  }));
}
