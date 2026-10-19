/**
 * The /standings overview (SPEC §10.3): one compact block per division, in the section → league →
 * division outline of config order (SPEC §10.0). The rows are the league's own order, never
 * re-sorted here (views/standings/division.ts).
 */

import { getDivision, getLeague, sectionOf } from '@/lib/config/leagues';
import { divisionHeading, leagueTitle } from '@/lib/config/leagues/labels';
import { shortDate } from '@/lib/format/dates';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { standingsHref } from '@/lib/shared/routes';

import type { StandingsRowData } from './types';

export interface OverviewDivision {
  division: DivisionId;
  /** Division heading (h4) — null for a single-division league, which has no sub-header. */
  heading: string | null;
  /**
   * The division block's id: the division id, unless it equals the league id (PCAL, EAL), where the
   * league's heading carries it — ONE element per id. It sits on the block, not the h4, because a
   * single-division league (MCAL: `#marin-county`) has no h4.
   */
  anchorId: string | null;
  rows: StandingsRowData[];
  /** The labelled rule in the compact table; null when the division draws none (EAL). */
  ladderLine: { after: number; label: string } | null;
  /** `Full <division heading ?? SHORT> table`; the page adds the aria-hidden arrow (components/ui/Arrow). */
  fullLabel: string;
  /** `/standings/<league>#<division>` */
  fullHref: string;
  caption: string;
}

export interface OverviewLeague {
  id: LeagueId;
  /** `SCVAL — Santa Clara Valley Athletic League` */
  title: string;
  shortName: string;
  /** `LeagueConfig.membershipNote`: printed under the league's heading when its schools are not all in its section. */
  membershipNote: string | null;
  divisions: OverviewDivision[];
}

export interface OverviewSection {
  id: string;
  /** `Central Coast Section` / `North Coast Section` / `Northern Section` */
  name: string;
  leagues: OverviewLeague[];
}

export function buildOverviewDivision(input: {
  division: DivisionId;
  standings: readonly Standing[];
  teams: readonly Team[];
  throughDate: string | null;
}): OverviewDivision {
  const config = getDivision(input.division);
  const league = getLeague(config.leagueId);
  const heading = divisionHeading(input.division);
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const rows: StandingsRowData[] = [];
  for (const standing of input.standings) {
    const team = teamById.get(standing.teamId);
    if (team) rows.push({ standing, team });
  }
  const through = input.throughDate ? `, through ${shortDate(input.throughDate)}` : '';
  return {
    division: input.division,
    heading,
    anchorId: config.id === league.id ? null : config.id,
    rows,
    ladderLine: config.ladderLine,
    fullLabel: `Full ${heading ?? league.shortName} table`,
    fullHref: standingsHref(league.id, config.id),
    caption: `${heading ? `${league.shortName} ${heading}` : league.shortName} standings, league games only${through}.`,
  };
}

/** The section → league → division outline, config order (SPEC §10.0 heading outline). */
export function overviewOutline(
  leagueIds: readonly LeagueId[],
  divisionOf: (division: DivisionId) => OverviewDivision,
): OverviewSection[] {
  const sections: OverviewSection[] = [];
  for (const id of leagueIds) {
    const league = getLeague(id);
    const section = sectionOf(id);
    let group = sections.find((s) => s.id === section.id);
    if (!group) {
      group = { id: section.id, name: section.name, leagues: [] };
      sections.push(group);
    }
    group.leagues.push({
      id,
      title: leagueTitle(id),
      shortName: league.shortName,
      membershipNote: league.membershipNote,
      divisions: league.divisions.map((d) => divisionOf(d.id)),
    });
  }
  return sections;
}
