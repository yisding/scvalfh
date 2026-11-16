/**
 * Each varsity player's anchor on their team page: the `id` of their roster row, so a link can open
 * the team page on that one player (`/teams/mitty#player-jane-doe`). /leaders links a player's row
 * to it, and the team page's own stats tables link each name to it.
 *
 * The id is the player's name, not MaxPreps' athleteId, which MaxPreps reissues every season: a
 * link someone shares keeps working across a roster refresh as long as the name does. Two varsity
 * players of one team with the same name (a roster MaxPreps lists twice) take `-2`, `-3` in the
 * roster file's order, which does not move when the page's display order does. The ids the team
 * page already uses for its sections are never handed out.
 *
 * Keyed by athleteId, which a stat line carries for its player's roster row; a JV player has no row
 * on the varsity roster, so no anchor.
 */

import type { MergedPlayer } from '../../lib/players/rosters';

export type AnchorPlayer = Pick<MergedPlayer, 'athleteId' | 'fullName' | 'level'>;

/** The team page's own `player-…` ids, which no player's anchor may take. */
const RESERVED = ['player-stats', 'player-stats-heading'];

/** "Chloé (CJ) O'Neil" → "chloe-cj-o-neil": ASCII letters and digits, runs of anything else one hyphen. */
function nameSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** athleteId → the roster row's `id`, for every varsity player of one team. */
export function playerAnchors(players: readonly AnchorPlayer[]): ReadonlyMap<string, string> {
  const used = new Set(RESERVED);
  const anchors = new Map<string, string>();
  for (const p of players) {
    if (p.level === 'jv' || p.athleteId === null || anchors.has(p.athleteId)) continue;
    const base = `player-${nameSlug(p.fullName) || 'unnamed'}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    anchors.set(p.athleteId, id);
  }
  return anchors;
}
