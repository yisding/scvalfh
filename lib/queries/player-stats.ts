/**
 * Player stats with the goals, assists and saves coaches wrote in game notes added
 * (lib/engine/note-stats.ts), over data/player-stats.json (lib/datasets/player-stats.ts), the
 * committed snapshot's games and the rosters.
 */

import { getPlayerStats, getTeamPlayerStats } from '@/lib/datasets/player-stats';
import { getTeamRoster } from '@/lib/datasets/rosters';
import { getSnapshot } from '@/lib/datasets/snapshot';
import {
  type NoteSources, type NotedTeamPlayerStats, noteStatsFor, withNoteStats,
} from '@/lib/engine/note-stats';
import type { TeamSlug } from '@/lib/model/ids';

export type { NotedTeamPlayerStats } from '@/lib/engine/note-stats';

/** The committed snapshot's games and rosters, for lib/engine/note-stats.ts. */
function noteSources(): NoteSources {
  return { games: getSnapshot().games, roster: (slug) => getTeamRoster(slug)?.players };
}

/**
 * `slug`'s MaxPreps stats with the goals, assists and saves its coach wrote in game notes added
 * (lib/engine/note-stats.ts): what the team page shows. undefined for a slug that is no team.
 */
export function getTeamPlayerStatsWithNotes(slug: TeamSlug): NotedTeamPlayerStats | undefined {
  const team = getTeamPlayerStats(slug);
  return team ? withNoteStats(team, noteStatsFor(slug, noteSources())) : undefined;
}

/** Every team's stats with its game notes added, in the file's order: what /leaders ranks. */
export function getAllPlayerStatsWithNotes(): NotedTeamPlayerStats[] {
  const sources = noteSources();
  return getPlayerStats().teams.map((t) => withNoteStats(t, noteStatsFor(t.slug, sources)));
}
