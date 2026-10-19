/**
 * The contest-id grammar (owner decision D2, rule 2). A game's `contestId` is a MaxPreps contest GUID, or
 * `sblive:<digits>` for a game that only si.com has. Import-free and client-safe: every producer, parser
 * and validator of the `sblive:` form goes through here, so the prefix is spelled once.
 *
 * Two predicates exist on purpose, because the call sites differ in what they decide:
 *  - isSbliveContestId is the FULL grammar (`sblive:` then digits only): the snapshot schema and check, the
 *    game-id URL mapping and the /game/[id] stub use it, where a malformed id must be rejected.
 *  - hasSbliveContestPrefix is the PREFIX test (`startsWith('sblive:')`): the pipeline's classification of
 *    rows it already trusts (backfill, cross-checks, normalize, assemble, the stored-JV refinement) uses it,
 *    where only "is this the si.com kind" matters and a malformed tail is somebody else's error.
 *
 * Two GUID flags exist on purpose too, and are NOT unified (a unification would change which strings
 * validate): GUID_RE is lower-case only, as the league configuration's assertions (lib/config/leagues/assert.ts)
 * require of every id they check; GUID_RE_ANY_CASE is the `/i` form the snapshot schema accepts for a game's
 * contest id (lib/schema/snapshot.ts, through isContestId).
 */

export const SBLIVE_CONTEST_PREFIX = 'sblive:';

const SBLIVE_CONTEST_ID = /^sblive:(\d+)$/;

/** A MaxPreps GUID, lower-case hex only (lib/config/leagues/assert.ts). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A MaxPreps GUID in either case (a game's contest id in lib/schema/snapshot.ts). */
export const GUID_RE_ANY_CASE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The contest id of an si.com-only game: `sblive:<gameId>` (the game id is digits, never validated here). */
export function sbliveContestId(gameId: string | number): string {
  return `${SBLIVE_CONTEST_PREFIX}${gameId}`;
}

/** True for exactly `sblive:<digits>`. */
export function isSbliveContestId(id: string): boolean {
  return SBLIVE_CONTEST_ID.test(id);
}

/** True for anything that starts with `sblive:` (the prefix test; see the header). */
export function hasSbliveContestPrefix(id: string): boolean {
  return id.startsWith(SBLIVE_CONTEST_PREFIX);
}

/** The digits of an `sblive:<digits>` contest id, or null for any other string. */
export function sbliveGameIdOf(id: string): string | null {
  const m = SBLIVE_CONTEST_ID.exec(id);
  return m ? m[1] : null;
}

/** A MaxPreps contest GUID (either case) or `sblive:<digits>`. */
export function isContestId(id: string): boolean {
  return GUID_RE_ANY_CASE.test(id) || isSbliveContestId(id);
}
