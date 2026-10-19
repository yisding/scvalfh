/**
 * The MaxPreps API endpoint URLs (SPEC §1.1), as free functions: the pipeline's LiveTransport and the
 * scripts build a URL without holding a client, and MaxPrepsClient's endpoint methods delegate here.
 */

import { SPORT_SEASON_ID } from '@/lib/config/season';
import { MAXPREPS_API } from '@/lib/config/source-urls';

/** GET /leagues/{leagueId}/v1 — the season-key assertion (SPEC §1.1f). */
export function leagueMetaUrl(leagueId: string): string {
  return `${MAXPREPS_API}/leagues/${leagueId}/v1`;
}

/** GET /leagues/{leagueId}/standings/v1?sportseasonid= (SPEC §1.1a). */
export function standingsUrl(leagueId: string, sportSeasonId = SPORT_SEASON_ID): string {
  // Lowercase `sportseasonid` is the spelling the bundle uses and the one that is verified.
  return `${MAXPREPS_API}/leagues/${leagueId}/standings/v1?sportseasonid=${sportSeasonId}`;
}

/** GET /gatewayweb/react/schedule-calculated/v1?teamId=&sportSeasonId= (SPEC §1.1b). */
export function scheduleUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
  return `${MAXPREPS_API}/gatewayweb/react/schedule-calculated/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
}

/** GET /gatewayweb/react/team-context/v1?teamId=&sportSeasonId= (SPEC §1.1e). */
export function teamContextUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
  return `${MAXPREPS_API}/gatewayweb/react/team-context/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
}
