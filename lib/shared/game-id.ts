/**
 * Game ids in URLs (SPEC §13.3). Pure and client-safe: its only import is the import-free contest-id grammar.
 *
 * A MaxPreps contest id is a GUID and is its own URL param. A game that only si.com has (owner
 * decision D2, rule 2) carries the contest id `sblive:<digits>`; ':' is not a friendly path
 * character, so its param is `sblive-<digits>`. A GUID never starts with `sblive-`, so the map is
 * a bijection.
 */

import { sbliveContestId, sbliveGameIdOf } from './contest-id';

const SBLIVE_PARAM = /^sblive-(\d+)$/;

/** 'sblive:123' → 'sblive-123'; a GUID is returned unchanged. */
export function gameIdToParam(contestId: string): string {
  const gameId = sbliveGameIdOf(contestId);
  return gameId === null ? contestId : `sblive-${gameId}`;
}

/** The inverse of gameIdToParam: 'sblive-123' → 'sblive:123'; anything else unchanged. */
export function paramToGameId(param: string): string {
  const m = SBLIVE_PARAM.exec(param);
  return m ? sbliveContestId(m[1]) : param;
}

/** `/game/<param>` — the only way app/ and components/ build a game link. */
export function gameHref(contestId: string): string {
  return `/game/${gameIdToParam(contestId)}`;
}
