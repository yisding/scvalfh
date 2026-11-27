/**
 * A team's MaxPreps box scores, read the way scripts/fetch-player-stats.ts reads a varsity team's and
 * scripts/fetch-jv.ts a JV team's: the team's per-game table (lib/sources/maxpreps-game-stats.ts) says which
 * games the coach entered stats for, and each such final gets the team's box score for that game
 * (lib/sources/maxpreps-box-score.ts), read again only when its row's digest (`rowKey`) changed.
 *
 * Offline (`fixtures`), the per-game table is `<prefix>game-stats-<slug>.json` and a box score
 * `<prefix>box-<slug>-<contest id>.json`; live, `capture` saves each body under the same names. The varsity
 * prefix is '' and the JV's 'jv-'.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { BoxScore } from '../../lib/players/player-stats-schema';
import type { MaxPrepsClient } from '../../lib/sources/maxpreps';
import { boxScoreUrl, fetchBoxScore, toBoxScore } from '../../lib/sources/maxpreps-box-score';
import { fetchGameRows, gameStatsUrl, parseGameRows, type GameRow } from '../../lib/sources/maxpreps-game-stats';
import { parsePlayerStats, type PlayerStatsPage, type RosterJoinPlayer } from '../../lib/sources/maxpreps-player-stats';
import { SPORT_SEASON_ID } from '../../lib/season';
import { saveCapture } from './team-file';

export interface BoxScoreSource {
  client: MaxPrepsClient;
  /** Read captures from here instead of MaxPreps. */
  fixtures: string | null;
  /** Save each live body here. */
  capture: string | null;
  /** Read every box score again, whatever its row says (`--all-box-scores`). */
  all: boolean;
  /** The capture and fixture names' prefix: '' (varsity) or 'jv-'. */
  prefix: string;
  /** The season the table and box scores are for: this season's varsity unless given. */
  sportSeasonId?: string;
}

/**
 * The team's per-game table, or the reason it could not be had. Offline, a team with no capture has none
 * (`missing`): the captures cover a few teams, so that is not a failure.
 */
export async function readGameRows(
  src: BoxScoreSource,
  slug: string,
  maxprepsTeamId: string,
): Promise<{ rows: GameRow[] } | { error: string; missing?: boolean }> {
  const seasonId = src.sportSeasonId ?? SPORT_SEASON_ID;
  const name = `${src.prefix}game-stats-${slug}.json`;
  try {
    if (src.fixtures) {
      const file = path.join(src.fixtures, name);
      if (!existsSync(file)) return { error: `no per-game capture ${name}`, missing: true };
      return {
        rows: parseGameRows(JSON.parse(readFileSync(file, 'utf8')) as unknown, {
          expectedTeamId: maxprepsTeamId,
          expectedSeasonId: seasonId,
          url: gameStatsUrl(maxprepsTeamId, seasonId),
        }),
      };
    }
    const capture = src.capture;
    return {
      rows: await fetchGameRows(src.client, maxprepsTeamId, capture ? (body) => saveCapture(capture, name, body) : undefined, seasonId),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The team's box scores for its finals (`finals`, contest ids) whose per-game row has a count above zero. A
 * stored box score whose row has not changed is kept without a call; any other is read. A box score that
 * cannot be read keeps the stored one, if any, with a warning (its old `rowKey` no longer matches the row, so
 * the next run reads it again), and its contest id is in `failed`.
 */
export async function readBoxScores(
  src: BoxScoreSource,
  slug: string,
  maxprepsTeamId: string,
  rows: readonly GameRow[],
  finals: ReadonlySet<string>,
  roster: readonly RosterJoinPlayer[],
  previous: readonly BoxScore[],
  warnings: string[],
): Promise<{ games: BoxScore[]; read: number; failed: string[] }> {
  const seasonId = src.sportSeasonId ?? SPORT_SEASON_ID;
  const stored = new Map(previous.map((b) => [b.contestId, b]));
  let read = 0;
  // Each game's warning comes back with it and is added in row order, not in the order the calls
  // finish: warnings are part of the file's content key, so a run over unchanged data must word and
  // order them the same.
  const results = await Promise.all(
    rows
      .filter((r) => r.entered && finals.has(r.total.contestId))
      .map(async (row): Promise<{ contestId: string; box: BoxScore | null; warning?: string; failed?: true }> => {
        const { contestId } = row.total;
        const prior = stored.get(contestId) ?? null;
        if (prior && prior.rowKey === row.rowKey && !src.all) return { contestId, box: prior };
        const name = `${src.prefix}box-${slug}-${contestId}.json`;
        try {
          let page: PlayerStatsPage | null;
          if (src.fixtures) {
            const file = path.join(src.fixtures, name);
            // The captures hold a few box scores, not every one: the rest are simply not read.
            if (!existsSync(file)) return { contestId, box: prior };
            page = parsePlayerStats(JSON.parse(readFileSync(file, 'utf8')) as unknown, {
              expectedTeamId: maxprepsTeamId,
              expectedSeasonId: seasonId,
              url: boxScoreUrl(maxprepsTeamId, contestId),
            });
          } else {
            const capture = src.capture;
            page = await fetchBoxScore(
              src.client,
              maxprepsTeamId,
              contestId,
              capture ? (body) => saveCapture(capture, name, body) : undefined,
              seasonId,
            );
          }
          read += 1;
          const box = page ? toBoxScore(page, roster, contestId, row.rowKey) : null;
          return box
            ? { contestId, box }
            : { contestId, box: null, warning: `box score ${contestId}: its per-game row has stats but MaxPreps lists no player for the game` };
        } catch (err) {
          return {
            contestId,
            box: prior,
            failed: true,
            warning:
              `box score ${contestId} not read (${err instanceof Error ? err.message : String(err)})` +
              (prior ? '; the previous one is kept' : ''),
          };
        }
      }),
  );
  for (const r of results) if (r.warning) warnings.push(r.warning);
  return {
    games: results
      .flatMap((r) => (r.box ? [r.box] : []))
      .sort((a, b) => a.contestId.localeCompare(b.contestId)),
    read,
    failed: results.filter((r) => r.failed).map((r) => r.contestId).sort(),
  };
}
