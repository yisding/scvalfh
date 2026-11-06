/**
 * Game ids in URLs (SPEC §13.3). Pure and client-safe: no runtime imports.
 *
 * A MaxPreps contest id is a GUID and is its own URL param. A game that only si.com has (owner
 * decision D2, rule 2) carries the contest id `sblive:<digits>`, and a San Diego Section playoff game that
 * only the Section's bracket sheet has carries `cifsds:<away>-at-<home>` (lib/postseason/sds-sheet-results.ts).
 * ':' is not a friendly path character, so their params are `sblive-<digits>` and `cifsds-<away>-at-<home>`.
 * A GUID never starts with `sblive-` or `cifsds-`, so the map is a bijection.
 */

const PREFIXED_ID = /^(sblive:\d+|cifsds:[a-z0-9-]+-at-[a-z0-9-]+)$/;
const PREFIXED_PARAM = /^(sblive-\d+|cifsds-[a-z0-9-]+-at-[a-z0-9-]+)$/;

/** 'sblive:123' → 'sblive-123', 'cifsds:a-at-b' → 'cifsds-a-at-b'; a GUID is returned unchanged. */
export function gameIdToParam(contestId: string): string {
  return PREFIXED_ID.test(contestId) ? contestId.replace(':', '-') : contestId;
}

/** The inverse of gameIdToParam: 'sblive-123' → 'sblive:123', 'cifsds-a-at-b' → 'cifsds:a-at-b'; anything else unchanged. */
export function paramToGameId(param: string): string {
  return PREFIXED_PARAM.test(param) ? param.replace('-', ':') : param;
}

/** `/game/<param>` — the only way app/ and components/ build a game link. */
export function gameHref(contestId: string): string {
  return `/game/${gameIdToParam(contestId)}`;
}
