/**
 * A division's leaders: the team(s) in 1st place once a league result counts, for the "Other
 * leagues" strip of the home panel (views/home/other-leagues.ts).
 */

import type { DivisionId } from '@/lib/model/ids';
import { getStandings } from '@/lib/queries/standings';
import { getTeamById } from '@/lib/registry/teams';

export interface DivisionLeaders {
  /** Short names of every team in 1st place (level places included), registry/table order. */
  names: string[];
  pts: number;
}

/** The team(s) in 1st place with at least one counted result, or null before any league result. */
export function divisionLeaders(division: DivisionId): DivisionLeaders | null {
  const top = getStandings(division).filter((s) => s.hasReportedResults && s.computed.place === 1);
  if (top.length === 0) return null;
  return {
    names: top.map((s) => getTeamById(s.teamId)?.shortName ?? s.slug),
    pts: top[0].computed.pts,
  };
}
