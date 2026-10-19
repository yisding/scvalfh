/**
 * The JV read API over data/jv.json (lib/datasets/jv.ts): the merge of its two sources
 * (lib/engine/jv/merge.ts), each game's classification and the JV tables, computed once at module
 * scope.
 *
 * "Today" for the merge is the file's own fetchedAt in America/Los_Angeles, never the wall clock,
 * so a given commit builds the same pages whenever it is built.
 *
 * JV games stay apart from varsity: nothing here feeds a varsity standings table, a leader board,
 * a rating or a postseason picture. The JV tables are their own (lib/engine/jv/standings.ts): a JV game is
 * a league game when its varsity counterpart is, read from the snapshot (lib/datasets/snapshot.ts), and the
 * games this module serves carry that classification as `countsFor`.
 */

import { getJvFile } from '@/lib/datasets/jv';
import { getSnapshot } from '@/lib/datasets/snapshot';
import { type JvMergeResult, mergeJv } from '@/lib/engine/jv/merge';
import {
  type JvClassification, type JvDivisionTable, classifyJvGames, computeJvStandings, withJvClassification,
} from '@/lib/engine/jv/standings';
import type { Game } from '@/lib/model/game';
import type { ContestId, DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import { localDateKey } from '@/lib/shared/dates';
import { byDateThenId } from '@/lib/shared/game';
import { getOfficialFixtures } from './games';

const file = getJvFile();
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

/** The merge's outcome, before classification: every published JV game and what si.com changed. */
export function getJvMerge(): JvMergeResult {
  return merged;
}

/** A school's JV games, classified, oldest first. */
export function getJvGamesForTeam(slug: TeamSlug): Game[] {
  return games.filter((g) => g.home.slug === slug || g.away.slug === slug).sort(byDateThenId);
}

/** Every JV game on one date (YYYY-MM-DD), classified, by time. */
export function getJvGamesOn(dateKey: string): Game[] {
  return games.filter((g) => g.dateKey === dateKey);
}

/** How one JV game was classified (lib/engine/jv/standings.ts). */
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
