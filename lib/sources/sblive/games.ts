/**
 * SECONDARY source: SBLive / Scorebook Live, now hosted at si.com/high-school/stats (SPEC §1.2).
 *
 * Role: a SCORE CROSS-CHECK against MaxPreps (lib/pipeline/reconcile/sblive-crosscheck.ts) and, under owner decision D2's
 * mechanical rules only, a BACKFILL for a missing or clearly wrong MaxPreps score (lib/pipeline/reconcile/backfill.ts,
 * SPEC §7.9). Three things are never taken from here, because they are demonstrably wrong for 2026-27:
 *   - division membership (its "De Anza" bucket holds 5 teams, two of them El Camino)
 *   - `standing.leagueRecord`
 *   - `gameTypeLabel` (league vs non-league)
 *
 * Identity is ID-FIRST (SPEC §7.9, `resolveSbliveSide` in ./identity.ts): a si.com side resolves by its si.com team id
 * (web path, raw id or team-logo URL), then by its si.com school id (school-logo URL), and only then by
 * name — and never by name for the statewide namesakes (University, Los Altos, Santa Clara).
 *
 * Extraction facts, all corrected against the live payloads (SPEC §1.2):
 *   - scorebooklive.com 301s to si.com. Redirects MUST be followed or a ~200-byte stub is parsed
 *     as if it were the page.
 *   - the props live in `data-react-props="…"`, HTML-entity-escaped.
 *   - the decoded object's top level is `{query, variables, application}` — there is NO `props` key.
 *   - the statewide scoreboard path is `query.scoreboardDate.games.nodes[]`, one level deeper than
 *     the original claim.
 *   - a Chrome-like User-Agent is required; the polite UA gets 403.
 *
 * This module holds the normalized game shape, the two game-page parsers and the junk-row guards.
 * Beside it: urls.ts (URLs, game ids, the request options), props.ts (the payload extraction),
 * schemas.ts (the payload schemas), identity.ts (id-first resolution), harvest.ts (the manual
 * web-path harvest) and jv.ts (the JV team pages).
 */

import type { TeamSlug } from '@/lib/model/ids';
import { isWithdrawnSchool, sideJoinKey } from '@/lib/registry/resolve';
import { localDateKey } from '@/lib/shared/dates';

import { type SbliveResolution, type SbliveSideRef, resolveSbliveSide, sbliveIdsFrom } from './identity';
import { requireBlock } from './props';
import { ScoreboardPropsSchema, TeamGamesPropsSchema } from './schemas';
import { SBLIVE_HOST, sbliveGameUrl, sbliveRawGameId, sbliveScoresUrl, sbliveTeamGamesUrl } from './urls';

/** Called once per payload row a parser had to drop (a non-numeric game id). */
export type SbliveParseWarn = (message: string) => void;

// ---------------------------------------------------------------- normalized shape

export interface SbliveSide {
  /** si.com's display name, verbatim. */
  name: string;
  /** Numeric si.com TEAM id when the payload exposes one (web path, raw id or team-logo URL). */
  sbliveTeamId: string | null;
  /** Numeric si.com SCHOOL id from a school-logo URL, when present. */
  sbliveSchoolId?: string | null;
  /** Our slug (resolveSbliveSide); null for a school that is not one of our teams or cannot be told apart. */
  slug: TeamSlug | null;
  /** How `slug` was resolved. D2 backfill accepts only 'team-id' and 'school-id' (SPEC §7.9). */
  via: SbliveResolution['via'];
  /** Why the side did not resolve, when it did not. */
  refused?: SbliveResolution['refused'];
  score: number | null;
}

export interface SbliveGame {
  sbliveGameId: string;
  /** ISO with offset, exactly as si.com published it. */
  dateIso: string;
  /** YYYY-MM-DD in America/Los_Angeles. */
  dateKey: string;
  /** UNORDERED pair, sorted so the join key is stable; home/away is never taken from here. */
  sides: [SbliveSide, SbliveSide];
  /** statusId 3 === final (`shortStatusText` "F"). */
  isFinal: boolean;
  /** true only when BOTH sides carry a number. */
  isScored: boolean;
  url: string | null;
  /** Kept for the log only. NEVER used to decide isLeague (SPEC §1.2 caveat 2). */
  gameTypeLabel: string | null;
  origin: 'team-games' | 'scoreboard';
}

function toScore(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function makeSide(ref: SbliveSideRef & { name: string }, score: number | null): SbliveSide {
  const { teamId, schoolId } = sbliveIdsFrom(ref);
  const r = resolveSbliveSide(ref);
  return {
    name: ref.name,
    sbliveTeamId: teamId,
    sbliveSchoolId: schoolId,
    slug: r.slug,
    via: r.via,
    ...(r.refused ? { refused: r.refused } : {}),
    score,
  };
}

/** Sorted so `pairKey` is order-independent. */
function orderSides(a: SbliveSide, b: SbliveSide): [SbliveSide, SbliveSide] {
  const ka = a.slug ?? a.name.toLowerCase();
  const kb = b.slug ?? b.name.toLowerCase();
  return ka <= kb ? [a, b] : [b, a];
}

/** The unordered-pair half of the cross-check join key (SPEC §5.7). */
export function sblivePairKey(sides: readonly SbliveSide[]): string {
  return sides.map(sideJoinKey).sort().join('~');
}

export function sbliveGameKey(game: Pick<SbliveGame, 'dateKey' | 'sides'>): string {
  return `${game.dateKey}|${sblivePairKey(game.sides)}`;
}

// ---------------------------------------------------------------- parsers

/** Parse a team `/games` page. Featured side is the team whose page it is. */
export function parseTeamGamesPage(html: string, url = sbliveTeamGamesUrl(''), warn?: SbliveParseWarn): SbliveGame[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const team = props.query.team;
  const out: SbliveGame[] = [];
  for (const node of team.games.nodes) {
    const featuredName = node.featured.team?.name ?? team.name ?? null;
    if (!featuredName) continue;
    const gameId = sbliveRawGameId(node.id);
    if (gameId === null) {
      warn?.(`si.com row with a non-numeric game id ${JSON.stringify(String(node.id))} ignored (${url})`);
      continue;
    }
    const mine = makeSide(
      {
        name: featuredName,
        webPath: node.featured.team?.webPath ?? team.webPath ?? null,
        rawId: node.featured.team?.id ?? team.id,
        image: node.featured.team?.image ?? team.image ?? null,
      },
      toScore(node.featured.scoreText),
    );
    const theirs = makeSide(
      {
        name: node.opponent.team.name,
        webPath: node.opponent.team.webPath,
        rawId: node.opponent.team.id,
        image: node.opponent.team.image,
      },
      toScore(node.opponent.scoreText),
    );
    const sides = orderSides(mine, theirs);
    out.push({
      sbliveGameId: gameId,
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: sbliveGameUrl(node.webPath),
      gameTypeLabel: node.gameTypeLabel ?? null,
      origin: 'team-games',
    });
  }
  return out;
}

/**
 * Parse the statewide `?date=` scoreboard. Its `gameTeams[]` carry a name, a score and a logo URL
 * but no webPath and no isHome, which is exactly why the cross-check joins on an UNORDERED pair and
 * why identity comes from the logo URL's si.com team or school id (SPEC §7.9).
 */
export function parseScoresPage(html: string, url = sbliveScoresUrl(''), warn?: SbliveParseWarn): SbliveGame[] {
  const props = ScoreboardPropsSchema.parse(requireBlock(html, 'games/GenderSportIndex', url));
  const games = props.query.scoreboardDate.games;
  // Pagination (checked 2026-10-06): the page server-renders the day's first 24 games
  // (`pageInfo: { endCursor: 'MjQ', hasNextPage: true }`, totalCount 29 that day) and the browser loads
  // the rest through si.com's own GraphQL client. The URL takes no page or cursor parameter (`&after=`,
  // `&page=2` and `&cursor=` all return the same first 24), so a later page cannot be read from here.
  // With the Southern California teams a busy day passes 24, so a truncated day is said, never silently
  // taken for the whole day: it only lowers coverage (an uncovered game is planned for a team page, or
  // waits for a later run; lib/pipeline/reconcile/backfill.ts scoreboardCoverage is positive-only), never a conclusion.
  const total = games.totalCount ?? null;
  if (games.pageInfo?.hasNextPage || (total !== null && total > games.nodes.length)) {
    warn?.(
      `si.com scoreboard lists ${games.nodes.length} of ${total ?? 'more'} games; the rest load in the browser and are not read (${url})`,
    );
  }
  const out: SbliveGame[] = [];
  for (const node of games.nodes) {
    if (node.gameTeams.length !== 2) continue;
    const gameId = sbliveRawGameId(node.id);
    if (gameId === null) {
      warn?.(`si.com row with a non-numeric game id ${JSON.stringify(String(node.id))} ignored (${url})`);
      continue;
    }
    const [a, b] = node.gameTeams.map((gt) =>
      makeSide(
        { name: gt.team.name, webPath: gt.team.webPath, rawId: gt.team.id, image: gt.team.image },
        toScore(gt.scoreText),
      ),
    );
    const sides = orderSides(a, b);
    out.push({
      sbliveGameId: gameId,
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: sbliveGameUrl(node.webPath),
      gameTypeLabel: null,
      origin: 'scoreboard',
    });
  }
  return out;
}

/** Dedupe on the (date, unordered pair) key, preferring the row that actually carries scores. */
export function dedupeSbliveGames(games: readonly SbliveGame[]): SbliveGame[] {
  const best = new Map<string, SbliveGame>();
  for (const g of games) {
    const key = sbliveGameKey(g);
    const prior = best.get(key);
    const rank = (x: SbliveGame) => (x.isScored ? 2 : 0) + (x.isFinal ? 1 : 0);
    if (!prior || rank(g) > rank(prior)) best.set(key, g);
  }
  return [...best.values()].sort((a, b) =>
    a.dateKey === b.dateKey ? sblivePairKey(a.sides).localeCompare(sblivePairKey(b.sides)) : a.dateKey.localeCompare(b.dateKey),
  );
}

// ---------------------------------------------------------------- junk-row guards (D2 rule 7)

/** A real California field hockey game page. Anything else (e.g. a `/new-york/` duplicate) is junk. */
export const SBLIVE_GAME_PATH_PREFIX = '/california/field-hockey/games/';

/** True when the row links a `/california/field-hockey/games/…` page (D2 rule 7). */
export function isCaliforniaGameRow(game: Pick<SbliveGame, 'url'>): boolean {
  return game.url !== null && game.url.startsWith(`${SBLIVE_HOST}/high-school/stats${SBLIVE_GAME_PATH_PREFIX}`);
}

/** A side of a JV-only or withdrawn team (DATA_QUALITY.sbliveIgnoredTeamIds or a league's withdrawnNames). */
export function isIgnoredSbliveSide(side: Pick<SbliveSide, 'refused' | 'name'>): boolean {
  return side.refused === 'ignored-team' || isWithdrawnSchool(side.name);
}
