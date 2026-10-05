/**
 * si.com JV team pages → the scored JV finals data/jv.json keeps (lib/jv-schema.ts JvSbliveRow).
 *
 * The page is the same `teams/Games` payload as a varsity team's (lib/sources/sblive.ts
 * TeamGamesPropsSchema); what differs is identity. A JV side is ours only when its si.com team id
 * is one of the registry schools' JV ids (JV_SLUG_BY_SBLIVE_ID), never by name and never by the
 * varsity ids resolveSbliveSide knows: si.com names a JV team exactly as it names the varsity one.
 *
 * Kept: rows si.com marks final (statusId 3) with two integer scores, on a
 * `/california/field-hockey/games/` page (D2 rule 7's junk-row guard). The page's own team must be
 * the JV team asked for, or the whole page is refused — the routing guard MaxPreps feeds get too.
 *
 * Pure: no I/O.
 */

import { localDateKey } from '../format';
import { JV_SLUG_BY_SBLIVE_ID } from '../jv-teams';
import type { JvSbliveRow } from '../jv-schema';
import type { TeamSlug } from '../types';
import {
  SbliveError,
  TeamGamesPropsSchema,
  extractReactProps,
  isCaliforniaGameRow,
  sbliveGameIdOf,
  sbliveGameUrl,
  sbliveIdsFrom,
} from './sblive';

/** One page's view of one game, before the copies from both teams' pages are combined. */
export type JvSbliveCopy = Omit<JvSbliveRow, 'pages' | 'copiesDisagree'> & { page: TeamSlug };

function toScore(text: string | null | undefined): number | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Parse one JV team's si.com games page. `expectedTeamId` is that JV team's si.com id; `page` is
 * the registry school it belongs to. Throws SbliveError when the payload is missing or names
 * another team.
 */
export function parseJvTeamGamesPage(
  html: string,
  opts: { url: string; expectedTeamId: string; page: TeamSlug },
): JvSbliveCopy[] {
  const blocks = extractReactProps(html, 'teams/Games');
  if (blocks.length === 0) throw new SbliveError('no data-react-props for "teams/Games"', opts.url);
  const team = TeamGamesPropsSchema.parse(blocks[0].props).query.team;
  const pageTeamId = sbliveIdsFrom({ name: team.name ?? null, webPath: team.webPath, rawId: team.id, image: team.image }).teamId;
  if (pageTeamId !== opts.expectedTeamId) {
    throw new SbliveError(`page is si.com team ${pageTeamId ?? '(none)'}, expected JV team ${opts.expectedTeamId}`, opts.url);
  }
  const out: JvSbliveCopy[] = [];
  for (const node of team.games.nodes) {
    if (node.statusId !== 3) continue;
    const gameId = sbliveGameIdOf(node.id);
    const url = sbliveGameUrl(node.webPath);
    if (!gameId || !isCaliforniaGameRow({ url })) continue;
    const mineScore = toScore(node.featured.scoreText);
    const theirScore = toScore(node.opponent.scoreText);
    if (mineScore === null || theirScore === null) continue;
    const opponentId = sbliveIdsFrom({
      name: node.opponent.team.name,
      webPath: node.opponent.team.webPath,
      rawId: node.opponent.team.id,
      image: node.opponent.team.image,
    }).teamId;
    const opponentSlug = opponentId ? (JV_SLUG_BY_SBLIVE_ID.get(opponentId) ?? null) : null;
    if (opponentSlug === opts.page) continue;
    out.push({
      sbliveGameId: gameId,
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      url,
      sides: [
        {
          slug: opts.page,
          sbliveTeamId: opts.expectedTeamId,
          name: node.featured.team?.name ?? team.name ?? node.opponent.team.name,
          score: mineScore,
          isHome: node.featured.isHome ?? null,
        },
        {
          slug: opponentSlug,
          sbliveTeamId: opponentId && /^\d+$/.test(opponentId) ? opponentId : null,
          name: node.opponent.team.name,
          score: theirScore,
          isHome: node.opponent.isHome ?? null,
        },
      ],
      page: opts.page,
    });
  }
  return out;
}

/**
 * Combine the copies of each game (one per registry JV page that lists it) into one row per si.com
 * game id: sides in slug order (a non-registry side last), the pages that listed it, and whether
 * two copies disagree on the score, in which case the merge never uses the row. Sorted by date,
 * then id.
 */
export function combineJvCopies(copies: readonly JvSbliveCopy[]): JvSbliveRow[] {
  const byId = new Map<string, JvSbliveCopy[]>();
  for (const c of copies) byId.set(c.sbliveGameId, [...(byId.get(c.sbliveGameId) ?? []), c]);
  const rows: JvSbliveRow[] = [];
  for (const [id, list] of byId) {
    const scores = (c: JvSbliveCopy) =>
      c.sides
        .map((s) => `${s.slug ?? s.name}:${s.score}`)
        .sort()
        .join('|');
    const first = list[0];
    const sides = [...first.sides].sort((a, b) =>
      a.slug && b.slug ? a.slug.localeCompare(b.slug) : a.slug ? -1 : b.slug ? 1 : 0,
    ) as JvSbliveRow['sides'];
    rows.push({
      sbliveGameId: id,
      dateIso: first.dateIso,
      dateKey: first.dateKey,
      url: first.url,
      sides,
      pages: [...new Set(list.map((c) => c.page))].sort(),
      copiesDisagree: list.some((c) => scores(c) !== scores(first) || c.dateKey !== first.dateKey),
    });
  }
  return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.sbliveGameId.localeCompare(b.sbliveGameId));
}
