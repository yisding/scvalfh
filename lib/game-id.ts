/**
 * Game ids in URLs (SPEC §13.3). Pure and client-safe: no runtime imports.
 *
 * A MaxPreps contest id is a GUID and is its own URL param. A game that only si.com has (owner
 * decision D2, rule 2) carries the contest id `sblive:<digits>`, and a San Diego Section playoff game that
 * only the Section's bracket sheet has carries `cifsds:<away>-at-<home>` (lib/postseason/sds-sheet-results.ts).
 * ':' is not a friendly path character, so their params are `sblive-<digits>` and `cifsds-<away>-at-<home>`.
 * A GUID never starts with `sblive-` or `cifsds-`, so the map is a bijection.
 */

/** A MaxPreps contest GUID, either case (the shape of the id, not proof MaxPreps has the contest). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The contest-id prefix of a game only si.com has (`sblive:<digits>`). */
export const SBLIVE_PREFIX = 'sblive:';
/** The contest-id prefix of a San Diego Section bracket sheet game (`cifsds:<away>-at-<home>`). */
export const CIFSDS_PREFIX = 'cifsds:';

/** `sblive:<gameId>`: the contest id of the si.com game `gameId`. */
export const sbliveContestId = (gameId: string | number): string => `${SBLIVE_PREFIX}${gameId}`;
/** True for a si.com-only game's contest id (`sblive:`). */
export const isSbliveContestId = (id: string): boolean => id.startsWith(SBLIVE_PREFIX);
/** True for a San Diego Section bracket sheet game's contest id (`cifsds:`). */
export const isCifsdsContestId = (id: string): boolean => id.startsWith(CIFSDS_PREFIX);

/**
 * The contest-id prefix of a game only a league's own schedule has (`official:<date>-<away>-at-<home>`,
 * lib/results/fixture-games.ts): listed on the site until a source has the game itself.
 */
export const OFFICIAL_PREFIX = 'official:';
/** `official:2027-01-22-cupertino-at-wilcox`: the contest id of an official fixture no source lists. */
export const officialContestId = (dateKey: string, awaySlug: string, homeSlug: string): string =>
  `${OFFICIAL_PREFIX}${dateKey}-${awaySlug}-at-${homeSlug}`;
/** True for a schedule-only game's contest id (`official:`). */
export const isOfficialContestId = (id: string): boolean => id.startsWith(OFFICIAL_PREFIX);

const PREFIXED_ID = /^(sblive:\d+|cifsds:[a-z0-9-]+-at-[a-z0-9-]+|official:\d{4}-\d{2}-\d{2}-[a-z0-9-]+-at-[a-z0-9-]+)$/;
/** True for the two non-MaxPreps id families (`sblive:<n>`, `cifsds:<away>-at-<home>`): the ids a MaxPreps contest can supersede. */
export const isPrefixedContestId = (id: string): boolean => PREFIXED_ID.test(id);

const PREFIXED_PARAM = /^(sblive-\d+|cifsds-[a-z0-9-]+-at-[a-z0-9-]+|official-\d{4}-\d{2}-\d{2}-[a-z0-9-]+-at-[a-z0-9-]+)$/;

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
