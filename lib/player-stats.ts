/**
 * The read API for data/player-stats.json — each team's MaxPreps season player stats (SPEC §1.1k).
 *
 * Built by `scripts/fetch-player-stats.ts`; see lib/player-stats-schema.ts for what a number means
 * (a tracked 0 is a real zero, an untracked stat is null). Imported so the build bundles it, for
 * the reason lib/rosters.ts gives: a Worker has no project filesystem. Validated once at module
 * scope, so a bad file fails at import time rather than half-way through a render.
 * `SCVAL_PLAYER_STATS` swaps in another file through node:fs (Node only; never set it on a Worker).
 *
 * The file holds one entry per registry team (102: all nine leagues and the three independents), so getTeamPlayerStats
 * returns undefined only for a string that is not a registry slug. A team no run has covered yet is
 * status 'pending'; one whose coach entered nothing is status 'none'.
 */

import { readFileSync } from 'node:fs';

import bundled from '../data/player-stats.json';
import {
  PlayerStatsFileSchema,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from './player-stats-schema';
import { failValidation } from './schema-primitives';
import type { TeamSlug } from './types';

export type {
  FieldStatKey,
  FieldStats,
  GoalieStatKey,
  GoalieStats,
  PlayerStatLine,
  PlayerStatsFile,
  TeamPlayerStats,
} from './player-stats-schema';

function load(): PlayerStatsFile {
  const override = process.env.SCVAL_PLAYER_STATS;
  let raw: unknown = bundled;
  if (override) {
    try {
      raw = JSON.parse(readFileSync(override, 'utf8')) as unknown;
    } catch (err) {
      throw new Error(
        `lib/player-stats.ts: cannot read SCVAL_PLAYER_STATS=${override} (${(err as Error).message})`,
      );
    }
  }
  const parsed = PlayerStatsFileSchema.safeParse(raw);
  if (!parsed.success) failValidation('player-stats', parsed.error.issues);
  return parsed.data;
}

const file = load();
const BY_SLUG = new Map<string, TeamPlayerStats>(file.teams.map((t) => [t.slug, t]));

export function getPlayerStats(): PlayerStatsFile {
  return file;
}

export function getTeamPlayerStats(slug: TeamSlug): TeamPlayerStats | undefined {
  return BY_SLUG.get(slug);
}
