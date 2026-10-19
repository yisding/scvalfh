/**
 * The home panel's "Teams in <league>" block (components/home/LeagueTeams.tsx): one pin tile per
 * team, grouped by division.
 */

import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { pickerName, pinLabel } from '@/lib/shared/pin-label';

import type { PinTileView } from './home-client';

export interface LeagueTeamsView {
  leagueId: LeagueId;
  shortName: string;
  /**
   * The block's heading: 'Teams in SCVAL'; for a group with no league (the LA independents)
   * 'LA teams', since no team is "in" a group of independents.
   */
  title: string;
  singleDivision: boolean;
  groups: Array<{ id: DivisionId; heading: string | null; tiles: PinTileView[] }>;
}

export function pinTileView(team: Team, leagueShort: string, heading: string | null): PinTileView {
  return {
    slug: team.slug,
    leagueId: team.league,
    name: team.name,
    pickerName: pickerName(team),
    pinLabel: pinLabel({ name: team.name, shortName: team.shortName, divisionHeading: heading, leagueShort }),
  };
}
