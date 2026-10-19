/**
 * The season phase (SPEC §5.9) of one league and of the whole site, on the day of a timestamp
 * (default: the snapshot stamp). The site's phase is `combinedPhase` (lib/engine/phase.ts) over every
 * league's phase.
 */

import { LEAGUES, getLeague } from '@/lib/config/leagues';
import { getFetchedAt, getSnapshot } from '@/lib/datasets/snapshot';
import { combinedPhase, seasonPhase } from '@/lib/engine/phase';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { SeasonPhase } from '@/lib/model/season';

const snapshot = getSnapshot();

// ---------------------------------------------------------------- season phase (§5.9)

/** A league's phase on the day of `asOf` (default: the snapshot stamp). */
export function getSeasonPhase(leagueId: LeagueId, asOf: string = getFetchedAt()): SeasonPhase {
  const window = snapshot.season.leagues.find((l) => l.id === leagueId)?.window;
  return seasonPhase(getLeague(leagueId), window, asOf);
}

/** `combinedPhase` (lib/engine/phase.ts) over the phases of `leagues` on the day of `asOf`. */
function phaseOf(leagues: readonly LeagueConfig[], asOf: string): SeasonPhase {
  return combinedPhase(leagues.map((league) => getSeasonPhase(league.id, asOf)));
}

/** The whole site's phase (`combinedPhase` over every league). */
export function getSitePhase(asOf: string = getFetchedAt()): SeasonPhase {
  return phaseOf(LEAGUES, asOf);
}
