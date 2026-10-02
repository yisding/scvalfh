/**
 * The read API for data/player-stats.json — each team's MaxPreps season player stats (SPEC §1.1k).
 *
 * Built by `scripts/fetch-player-stats.ts`; see lib/player-stats-schema.ts for what a number means
 * (a tracked 0 is a real zero, an untracked stat is null). Imported so the build bundles it, for
 * the reason lib/rosters.ts gives: a Worker has no project filesystem. Validated once at module
 * scope, so a bad file fails at import time rather than half-way through a render.
 * `SCVAL_PLAYER_STATS` swaps in another file through node:fs (Node only; never set it on a Worker).
 *
 * SCVAL-only (SPEC §0.2 item 12): the file holds the HISTORY_LEAGUE teams, so getTeamPlayerStats
 * returns undefined for a BVAL, PCAL or MCAL slug, and the team page shows no stats section.
 */

import { readFileSync } from 'node:fs';

import bundled from '../data/player-stats.json';
import {
  PlayerStatsFileSchema,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from './player-stats-schema';
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
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`player-stats failed validation:\n${lines.join('\n')}`);
  }
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
