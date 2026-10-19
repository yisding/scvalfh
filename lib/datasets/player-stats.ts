/**
 * The dataset loader for data/player-stats.json — each team's MaxPreps season player stats (SPEC §1.1k);
 * the stats with the coaches' game notes added are lib/queries/player-stats.ts.
 *
 * Built by `scripts/fetch-player-stats.ts`; see lib/schema/player-stats.ts for what a number means
 * (a tracked 0 is a real zero, an untracked stat is null). Imported so the build bundles it, for
 * the reason lib/datasets/rosters.ts gives: a Worker has no project filesystem. Validated once at module
 * scope, so a bad file fails at import time rather than half-way through a render.
 * `SCVAL_PLAYER_STATS` swaps in another file through node:fs (Node only; never set it on a Worker).
 *
 * The file holds one entry per registry team (102: all nine leagues and the five independents), so getTeamPlayerStats
 * returns undefined only for a string that is not a registry slug. A team no run has covered yet is
 * status 'pending'; one whose coach entered nothing is status 'none'.
 */

import bundled from '@/data/player-stats.json';
import type { TeamSlug } from '@/lib/model/ids';
import { type PlayerStatsFile, PlayerStatsFileSchema, type TeamPlayerStats } from '@/lib/schema/player-stats';
import { readDataset } from './read';

export type {
  FieldStatKey,
  FieldStats,
  GoalieStatKey,
  GoalieStats,
  PlayerStatLine,
  PlayerStatsFile,
  TeamPlayerStats,
} from '@/lib/schema/player-stats';

const file = readDataset({
  env: 'SCVAL_PLAYER_STATS',
  bundled,
  owner: 'lib/datasets/player-stats.ts',
  malformedOverride: 'cannot-read',
  label: 'player-stats',
  schema: PlayerStatsFileSchema,
});
const BY_SLUG = new Map<string, TeamPlayerStats>(file.teams.map((t) => [t.slug, t]));

export function getPlayerStats(): PlayerStatsFile {
  return file;
}

export function getTeamPlayerStats(slug: TeamSlug): TeamPlayerStats | undefined {
  return BY_SLUG.get(slug);
}
