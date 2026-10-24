/**
 * MaxPreps team BOX SCORE — `GET /gatewayweb/react/team-contest-player-stats/v1?teamId=&contestId=`
 * on the ghost API (SPEC §1.1k): one team's player stats for one game, as the coach entered them.
 *
 * Shape [V] 2026-10-24 (Davis, Palo Alto, Homestead): the season rollup's (lib/sources/
 * maxpreps-player-stats.ts) `data.groups[]` → `subgroups[]` → `stats.columns[]` / `stats.rows[]`
 * tables, with no GamesPlayed column, listing only players the coach entered something for. A
 * column's `overallValue` is the team's total for the game. So parsePlayerStats reads it unchanged,
 * with the same rules: a stat is tracked when the game's team total is above zero and some player
 * holds it, per-game and percentage columns are dropped, and drift throws. A game the coach entered
 * nothing for answers the rollup's 400 "No data was found" envelope.
 *
 * MaxPreps' own game pages carry no box score; this is the call its team stats page makes for one
 * game. scripts/fetch-player-stats.ts reads it for each final whose row in the team's per-game
 * table (lib/sources/maxpreps-game-stats.ts) has a count above zero, and again only when that row
 * changes.
 */

import { MaxPrepsError, type MaxPrepsClient } from './maxpreps';
import {
  joinToRoster,
  parsePlayerStats,
  type PlayerStatsPage,
  type RosterJoinPlayer,
} from './maxpreps-player-stats';
import type { BoxScore, BoxScoreLine } from '../player-stats-schema';
import { MAXPREPS_API } from '../season';

export function boxScoreUrl(teamId: string, contestId: string): string {
  return `${MAXPREPS_API}/gatewayweb/react/team-contest-player-stats/v1?teamId=${teamId}&contestId=${contestId}`;
}

/**
 * A parsed box score → what data/player-stats.json keeps: each line joined to the roster for its
 * name, and only the numbers the player has (a stat with no number for the player is left out
 * rather than stored as null). The game's team totals are not kept (lib/player-stats-schema.ts says
 * why).
 */
export function toBoxScore(
  page: PlayerStatsPage,
  roster: readonly RosterJoinPlayer[],
  contestId: string,
  rowKey: string,
): BoxScore | null {
  const { lines, warnings } = joinToRoster(page, roster);
  const compact = (stats: Record<string, number | null> | null) =>
    stats ? Object.fromEntries(Object.entries(stats).filter(([, v]) => v !== null)) : null;
  const players: BoxScoreLine[] = lines.map((l) => ({
    name: l.fullName,
    jersey: l.jersey,
    field: compact(l.field) as BoxScoreLine['field'],
    goalkeeping: compact(l.goalkeeping) as BoxScoreLine['goalkeeping'],
  }));
  if (!players.length) return null;
  return {
    contestId,
    rowKey,
    tracked: page.tracked,
    players,
    warnings: [...page.warnings, ...warnings],
  };
}

/**
 * Fetch one team's box score for one game: null when MaxPreps has none (the "No data was found"
 * envelope). `onRaw` sees the body as received, before it is decoded, as for the rollup.
 */
export async function fetchBoxScore(
  client: MaxPrepsClient,
  teamId: string,
  contestId: string,
  onRaw?: (body: string) => void,
): Promise<PlayerStatsPage | null> {
  const url = boxScoreUrl(teamId, contestId);
  let body: string;
  try {
    body = (await client.text(url, 'application/json')).data;
  } catch (err) {
    if (!(err instanceof MaxPrepsError) || err.httpStatus !== 400 || !err.body) throw err;
    body = err.body;
  }
  onRaw?.(body);
  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch (err) {
    throw new MaxPrepsError(`box score: invalid JSON: ${(err as Error).message}`, { url });
  }
  return parsePlayerStats(raw, { expectedTeamId: teamId, url });
}
