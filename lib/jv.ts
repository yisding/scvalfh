/**
 * The read API for data/jv.json — every registry school's JV games (MaxPreps, supplemented by
 * si.com: lib/jv-merge.ts).
 *
 * Built by `scripts/fetch-jv.ts`. Imported so the build bundles it, for the reason lib/rosters.ts
 * gives: a Worker has no project filesystem. Validated and merged once at module scope, so a bad
 * file fails at import time rather than half-way through a render. `SCVAL_JV` swaps in another
 * file through node:fs (Node only; never set it on a Worker).
 *
 * "Today" for the merge is the file's own fetchedAt in America/Los_Angeles, never the wall clock,
 * so a given commit builds the same pages whenever it is built.
 *
 * JV games stay apart from varsity: nothing here feeds a varsity standings table, a leader board,
 * a rating or a postseason picture. The JV tables are their own (lib/jv-standings.ts): a JV game is
 * a league game when its varsity counterpart is, read from the snapshot (lib/data.ts), and the
 * games this module serves carry that classification as `countsFor`.
 */

import { readFileSync } from 'node:fs';

import bundled from '../data/jv.json';
import { getOfficialFixtures, getSnapshot } from './data';
import { byDateThenId, localDateKey } from './format';
import { mergeJv, type JvMergeResult } from './jv-merge';
import { JvFileSchema, type JvFile, type JvTeam } from './jv-schema';
import {
  classifyJvGames,
  computeJvStandings,
  withJvClassification,
  type JvClassification,
  type JvDivisionTable,
} from './jv-standings';
import { failValidation } from './schema-primitives';
import type { ContestId, DivisionId, Game, LeagueId, TeamSlug } from './types';

export type { JvFile, JvTeam } from './jv-schema';

function load(): JvFile {
  const override = process.env.SCVAL_JV;
  let raw: unknown = bundled;
  if (override) {
    try {
      raw = JSON.parse(readFileSync(override, 'utf8')) as unknown;
    } catch (err) {
      throw new Error(`lib/jv.ts: cannot read SCVAL_JV=${override} (${(err as Error).message})`);
    }
  }
  const parsed = JvFileSchema.safeParse(raw);
  if (!parsed.success) failValidation('jv', parsed.error.issues);
  return parsed.data;
}

const file = load();
const merged: JvMergeResult = mergeJv({
  games: file.games,
  sblive: file.sblive,
  today: localDateKey(file.fetchedAt),
  fetchedAt: file.fetchedAt,
});
const classes: ReadonlyMap<ContestId, JvClassification> = classifyJvGames(
  merged.games,
  getSnapshot().games,
  getOfficialFixtures(),
);
const games: Game[] = withJvClassification(merged.games, classes);
const tables: JvDivisionTable[] = computeJvStandings(games, classes, localDateKey(file.fetchedAt));
const TEAM_BY_SLUG = new Map<string, JvTeam>(file.teams.map((t) => [t.slug, t]));

export function getJvFile(): JvFile {
  return file;
}

/** The merge's outcome, before classification: every published JV game and what si.com changed. */
export function getJvMerge(): JvMergeResult {
  return merged;
}

/** One school's JV entry (its two sources' status and pages); undefined only for a non-registry slug. */
export function getJvTeam(slug: TeamSlug): JvTeam | undefined {
  return TEAM_BY_SLUG.get(slug);
}

/** A school's JV games, classified, oldest first. */
export function getJvGamesForTeam(slug: TeamSlug): Game[] {
  return games.filter((g) => g.home.slug === slug || g.away.slug === slug).sort(byDateThenId);
}

/** Every JV game on one date (YYYY-MM-DD), classified, by time. */
export function getJvGamesOn(dateKey: string): Game[] {
  return games.filter((g) => g.dateKey === dateKey);
}

/** How one JV game was classified (lib/jv-standings.ts). */
export function getJvClassification(contestId: ContestId): JvClassification | undefined {
  return classes.get(contestId);
}

/** One division's JV table. */
export function getJvTable(division: DivisionId): JvDivisionTable | undefined {
  return tables.find((t) => t.division === division);
}

/** A league's JV tables, in division order. */
export function getJvTables(league: LeagueId): JvDivisionTable[] {
  return tables.filter((t) => t.league === league);
}

/** When the JV file was read (ISO UTC). */
export function getJvFetchedAt(): string {
  return file.fetchedAt;
}
