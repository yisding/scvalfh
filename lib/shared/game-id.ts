/**
 * Game ids in URLs (SPEC §13.3). Pure and client-safe: no runtime imports.
 *
 * A MaxPreps contest id is a GUID and is its own URL param. A game that only si.com has (owner
 * decision D2, rule 2) carries the contest id `sblive:<digits>`; ':' is not a friendly path
 * character, so its param is `sblive-<digits>`. A GUID never starts with `sblive-`, so the map is
 * a bijection.
 */

const SBLIVE_ID = /^sblive:(\d+)$/;
const SBLIVE_PARAM = /^sblive-(\d+)$/;

/** 'sblive:123' → 'sblive-123'; a GUID is returned unchanged. */
export function gameIdToParam(contestId: string): string {
  const m = SBLIVE_ID.exec(contestId);
  return m ? `sblive-${m[1]}` : contestId;
}

/** The inverse of gameIdToParam: 'sblive-123' → 'sblive:123'; anything else unchanged. */
export function paramToGameId(param: string): string {
  const m = SBLIVE_PARAM.exec(param);
  return m ? `sblive:${m[1]}` : param;
}

/** `/game/<param>` — the only way app/ and components/ build a game link. */
export function gameHref(contestId: string): string {
  return `/game/${gameIdToParam(contestId)}`;
}
