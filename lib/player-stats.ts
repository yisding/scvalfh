/**
 * The read API for data/player-stats.json — each team's MaxPreps season player stats (SPEC §1.1k).
 *
 * Built by `scripts/fetch-player-stats.ts`; see lib/player-stats-schema.ts for what a number means
 * (a tracked 0 is a real zero, an untracked stat is null). Imported so the build bundles it, for
 * the reason lib/rosters.ts gives: a Worker has no project filesystem. Validated once at module
 * scope, so a bad file fails at import time rather than half-way through a render.
 * `SCVAL_PLAYER_STATS` swaps in another file through node:fs (Node only; never set it on a Worker).
 *
 * The file holds one entry per registry team (102: all nine leagues and the five independents), so getTeamPlayerStats
 * returns undefined only for a string that is not a registry slug. A team no run has covered yet is
 * status 'pending'; one whose coach entered nothing is status 'none'.
 */

import { readFileSync } from 'node:fs';

import bundled from '../data/player-stats.json';
import { getSnapshot } from './data';
import { noteStatsFor, withNoteStats, type NoteSources, type NotedTeamPlayerStats } from './note-stats';
import {
  PlayerStatsFileSchema,
  type BoxScore,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from './player-stats-schema';
import { getTeamRoster } from './rosters';
import { failValidation } from './schema-primitives';
import type { TeamSlug } from './types';

export type { NotedTeamPlayerStats } from './note-stats';
export type {
  BoxScore,
  BoxScoreLine,
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
/** contest id → team slug → that team's box score for the game. */
const BOX_SCORES = new Map<string, Map<string, BoxScore>>();
for (const t of file.teams) {
  for (const box of t.games ?? []) {
    const bySlug = BOX_SCORES.get(box.contestId) ?? new Map<string, BoxScore>();
    bySlug.set(t.slug, box);
    BOX_SCORES.set(box.contestId, bySlug);
  }
}

export function getPlayerStats(): PlayerStatsFile {
  return file;
}

export function getTeamPlayerStats(slug: TeamSlug): TeamPlayerStats | undefined {
  return BY_SLUG.get(slug);
}

/**
 * `slug`'s box score for the game `contestId`, as its coach entered it on MaxPreps (the game page's
 * Game stats section), or undefined when the file has none.
 */
export function getBoxScore(contestId: string, slug: TeamSlug): BoxScore | undefined {
  return BOX_SCORES.get(contestId)?.get(slug);
}

/** What the file can say about one side of one game: its box score, or why there is none. */
export interface GameStatsEntry {
  box: BoxScore | undefined;
  /**
   * No box score, and none can be claimed absent: the team's latest read failed or has not run
   * (status carried-forward, error or pending), or its per-game table or this game's box score
   * could not be read (a warning names it). Otherwise no box score means the coach entered none.
   */
  unread: boolean;
}

export function getGameStatsEntry(contestId: string, slug: TeamSlug): GameStatsEntry {
  const box = getBoxScore(contestId, slug);
  if (box) return { box, unread: false };
  const team = BY_SLUG.get(slug);
  if (!team) return { box, unread: true };
  if (team.status !== 'ok' && team.status !== 'none') return { box, unread: true };
  const unread = team.warnings.some(
    (w) => w.startsWith('box scores: per-game table not read') || w.startsWith(`box score ${contestId} not read`),
  );
  return { box, unread };
}

/** The committed snapshot's games and rosters, for lib/note-stats.ts. */
function noteSources(): NoteSources {
  return { games: getSnapshot().games, roster: (slug) => getTeamRoster(slug)?.players };
}

/**
 * `slug`'s MaxPreps stats with the goals, assists and saves its coach wrote in game notes added
 * (lib/note-stats.ts): what the team page shows. undefined for a slug that is no team.
 */
export function getTeamPlayerStatsWithNotes(slug: TeamSlug): NotedTeamPlayerStats | undefined {
  const team = BY_SLUG.get(slug);
  return team ? withNoteStats(team, noteStatsFor(slug, noteSources())) : undefined;
}

/** Every team's stats with its game notes added, in the file's order: what /leaders ranks. */
export function getAllPlayerStatsWithNotes(): NotedTeamPlayerStats[] {
  const sources = noteSources();
  return file.teams.map((t) => withNoteStats(t, noteStatsFor(t.slug, sources)));
}
