/**
 * Game ids, and the game link (SPEC §13.3). Pure and client-safe: its one import is the slug leaf.
 *
 * A game's page is `/game/<slug>` (lib/game-slug.ts: `2026-10-06-santa-catalina-at-greenfield`); `gameHref` is
 * the one way to build that link. The contest id is the game's identity, not its URL: a MaxPreps contest id is a
 * GUID, a game that only si.com has (owner decision D2, rule 2) carries `sblive:<digits>`, a San Diego Section
 * playoff game that only the Section's bracket sheet has carries `cifsds:<away>-at-<home>`
 * (lib/postseason/sds-sheet-results.ts), and a game only a league's schedule or an added source has carries
 * `official:<date>-<away>-at-<home>`.
 *
 * Until slugs, the id WAS the URL segment (the "legacy param"): the GUID itself, and `sblive-<digits>`,
 * `cifsds-<away>-at-<home>`, `official-<date>-<away>-at-<home>` for the others, ':' not being a friendly path
 * character. `gameIdToParam` still gives that segment, for the aliases that redirect it (lib/game-urls.ts).
 */

import { gameSlug, type GameSlugFacts } from './game-slug';

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

/**
 * The contest-id prefix of a game a league's own TeamSideline schedule page lists (lib/pipeline/steps/teamsideline.ts),
 * in a build whose primary source is that page (the VAL): `teamsideline:<schedule id>-<away>-at-<home>` for a
 * regular-season game (one meeting a pair, so the id holds when the league moves the game to another day), and
 * `teamsideline:<schedule id>-g<n>` for the page's playoff game G<n>.
 */
export const TEAMSIDELINE_PREFIX = 'teamsideline:';
/** `teamsideline:731407-sunnyvale-ms-at-lawson`. */
export const teamsidelineContestId = (scheduleId: string, awaySlug: string, homeSlug: string): string =>
  `${TEAMSIDELINE_PREFIX}${scheduleId}-${awaySlug}-at-${homeSlug}`;
/** `teamsideline:731407-g5`. */
export const teamsidelinePlayoffContestId = (scheduleId: string, game: number): string => `${TEAMSIDELINE_PREFIX}${scheduleId}-g${game}`;
/** True for a TeamSideline game's contest id (`teamsideline:`). */
export const isTeamsidelineContestId = (id: string): boolean => id.startsWith(TEAMSIDELINE_PREFIX);
/** The shape of a TeamSideline contest id (lib/snapshot/snapshot-schema.ts holds every published id to one of the families). */
export const TEAMSIDELINE_ID_RE = /^teamsideline:\d+-(?:[a-z0-9]+(?:-[a-z0-9]+)*-at-[a-z0-9]+(?:-[a-z0-9]+)*|g\d+)$/;

const PREFIXED_ID = /^(sblive:\d+|cifsds:[a-z0-9-]+-at-[a-z0-9-]+|official:\d{4}-\d{2}-\d{2}-[a-z0-9-]+-at-[a-z0-9-]+)$/;
/** True for the two non-MaxPreps id families (`sblive:<n>`, `cifsds:<away>-at-<home>`): the ids a MaxPreps contest can supersede. */
export const isPrefixedContestId = (id: string): boolean => PREFIXED_ID.test(id);

const PREFIXED_PARAM = /^(sblive-\d+|cifsds-[a-z0-9-]+-at-[a-z0-9-]+|official-\d{4}-\d{2}-\d{2}-[a-z0-9-]+-at-[a-z0-9-]+)$/;

/** The legacy param of a contest id: 'sblive:123' → 'sblive-123', 'cifsds:a-at-b' → 'cifsds-a-at-b'; a GUID is returned unchanged. */
export function gameIdToParam(contestId: string): string {
  return PREFIXED_ID.test(contestId) || TEAMSIDELINE_ID_RE.test(contestId) ? contestId.replace(':', '-') : contestId;
}

/** The inverse of gameIdToParam: 'sblive-123' → 'sblive:123', 'cifsds-a-at-b' → 'cifsds:a-at-b'; anything else unchanged. */
export function paramToGameId(param: string): string {
  return PREFIXED_PARAM.test(param) || TEAMSIDELINE_ID_RE.test(param.replace('-', ':')) ? param.replace('-', ':') : param;
}

/** `/game/<slug>` — the only way app/ and components/ build a game link. */
export function gameHref(game: GameSlugFacts & { slug?: string }): string {
  return `/game/${gameSlug(game)}`;
}
