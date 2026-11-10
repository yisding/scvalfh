/**
 * The `--leagues` and `--fetched-at` flag parsers, shared by every CLI that takes them
 * (lib/pipeline/run.ts parseRunArgs for fetch-data, and scripts/fetch-rosters.ts,
 * scripts/fetch-player-stats.ts and scripts/fetch-jv.ts), so they all read those flags by one rule.
 *
 * Pure (no fs, no network).
 */

import { LEAGUE_IDS, isLeagueId } from './leagues';
import type { LeagueId } from './types';

/** `scval,bval` → ['scval', 'bval']; an unknown id or an empty list throws. */
export function parseLeaguesFlag(value: string, flag = '--leagues'): LeagueId[] {
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`${flag} needs at least one league id`);
  for (const id of ids) {
    if (!isLeagueId(id)) throw new Error(`${flag}: unknown league ${id} (known: ${LEAGUE_IDS.join(', ')})`);
  }
  return [...new Set(ids)] as LeagueId[];
}

/** `--fetched-at <iso>`: an ISO timestamp ('2026-10-04T00:00:00.000Z'), returned as given; anything else throws. */
export function parseFetchedAtFlag(value: string, flag = '--fetched-at'): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${flag}: not an ISO timestamp: ${value}`);
  }
  return value;
}
