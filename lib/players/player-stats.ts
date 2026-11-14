/**
 * The read API for data/player-stats.json — each team's MaxPreps season player stats (SPEC §1.1k).
 *
 * Built by `scripts/fetch-player-stats.ts`; see lib/players/player-stats-schema.ts for what a number means
 * (a tracked 0 is a real zero, an untracked stat is null). Imported so the build bundles it, for
 * the reason lib/players/rosters.ts gives: a Worker has no project filesystem. Validated once at module
 * scope, so a bad file fails at import time rather than half-way through a render.
 * `SCVAL_PLAYER_STATS` swaps in another file through node:fs (Node only; never set it on a Worker).
 *
 * The file holds one entry per registry team (102: all nine leagues and the five independents), so getTeamPlayerStats
 * returns undefined only for a string that is not a registry slug. A team no run has covered yet is
 * status 'pending'; one whose coach entered nothing is status 'none'.
 */

import bundledFieldHockey from '../../data/player-stats.json';
import bundledBasketball from '../../data/basketball/player-stats.json';
import bundledVolleyball from '../../data/volleyball/player-stats.json';
import bundledSoccer from '../../data/soccer/player-stats.json';
import { getSnapshot } from '../data';
import { readOverride, validateData } from '../data-file';
import {
  noteStatsFor,
  withNoteStats,
  type NoteCredit,
  type NoteSources,
  type NotedTeamPlayerStats,
} from './note-stats';
import {
  PlayerStatsFileSchema,
  type BoxScore,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from './player-stats-schema';
import { getTeamRoster } from './rosters';
import type { TeamSlug } from '../types';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

function load(): PlayerStatsFile {
  return validateData(
    'player-stats',
    PlayerStatsFileSchema,
    readOverride('lib/players/player-stats.ts', 'SCVAL_PLAYER_STATS', bundled),
  );
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
  /**
   * What the game's note credits this side's players with and the team page counts too: the
   * credits lib/players/note-stats.ts keeps after every guard (one roster only, no more goals than scored,
   * nothing the coach also entered for the game, nothing unverifiable). Empty when there are none.
   */
  credits: NoteCredit[];
}

/** Each team's note credits, by contest id, built once per team (a game page asks for two sides). */
const CREDITS = new Map<string, Map<string, NoteCredit[]>>();

function noteCreditsFor(contestId: string, slug: TeamSlug): NoteCredit[] {
  let byGame = CREDITS.get(slug);
  if (!byGame) {
    byGame = new Map();
    for (const c of getTeamPlayerStatsWithNotes(slug)?.noteCredits ?? []) {
      byGame.set(c.contestId, [...(byGame.get(c.contestId) ?? []), c]);
    }
    CREDITS.set(slug, byGame);
  }
  return byGame.get(contestId) ?? [];
}

export function getGameStatsEntry(contestId: string, slug: TeamSlug): GameStatsEntry {
  const credits = noteCreditsFor(contestId, slug);
  const box = getBoxScore(contestId, slug);
  if (box) return { box, unread: false, credits };
  const team = BY_SLUG.get(slug);
  if (!team) return { box, unread: true, credits };
  if (team.status !== 'ok' && team.status !== 'none') return { box, unread: true, credits };
  const unread = team.warnings.some(
    (w) => w.startsWith('box scores: per-game table not read') || w.startsWith(`box score ${contestId} not read`),
  );
  return { box, unread, credits };
}

/** The committed snapshot's games and rosters, for lib/players/note-stats.ts. */
function noteSources(): NoteSources {
  return { games: getSnapshot().games, roster: (slug) => getTeamRoster(slug)?.players };
}

/**
 * `slug`'s MaxPreps stats with the goals, assists and saves its coach wrote in game notes added
 * (lib/players/note-stats.ts): what the team page shows. undefined for a slug that is no team.
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
