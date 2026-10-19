/**
 * The `/game/[id]` params (SPEC §8.1, §10.6; contract: views/site/route-contract.ts): which ids the
 * route prerenders, and the game one of them names. The page AND its opengraph-image both return
 * exactly these params, so the OG URL a page points at always exists.
 */

import type { Game } from '@/lib/model/game';
import { getGameById, getGames } from '@/lib/queries/games';
import { getSupersededGames } from '@/lib/queries/provenance';
import { gameIdToParam, paramToGameId } from '@/lib/shared/game-id';
import type { StaticParams } from '@/views/site/route-contract';

/**
 * The /game/[id] params: every game (`gameIdToParam`, so `sblive:123` → `sblive-123`) plus every
 * superseded si.com id (stub pages).
 */
export function gameStaticParams(): StaticParams<'id'> {
  const ids = [
    ...getGames().map((g) => gameIdToParam(g.contestId)),
    ...Object.keys(getSupersededGames()).map((id) => gameIdToParam(id)),
  ];
  return [...new Set(ids)].map((id) => ({ id }));
}

/**
 * The game a URL segment names, or null for one that is not a game in the snapshot (a superseded
 * stub's id is not one: `buildSupersededStub` answers for it). `paramToGameId` runs FIRST, so
 * `sblive-123` finds `sblive:123`, and no accessor that can throw runs for an unknown id.
 */
export function gameParam(raw: string): Game | null {
  return getGameById(paramToGameId(raw)) ?? null;
}
