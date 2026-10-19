/**
 * Rule 10 of owner decision D2 (SPEC §7.9): the `supersededGames` map. One implementation, shared by
 * lib/pipeline/reconcile/backfill.ts (`applyBackfill().supersededGames`) and lib/pipeline/steps/assemble.ts
 * (the snapshot's `supersededGames`, whose key order the golden tests pin).
 */

import type { Game } from '@/lib/model/game';
import type { ContestId } from '@/lib/model/ids';
import type { Snapshot } from '@/lib/model/snapshot';
import { hasSbliveContestPrefix } from '@/lib/shared/contest-id';

/**
 * D2 rule 10: a `sblive:<id>` game an earlier run published that a MaxPreps contest now supersedes
 * (the contest matched the same official fixture) maps to that contest, and the mapping is carried
 * for the rest of the season. Only keys that are no longer games and values that are games survive
 * (snapshot refinement 10). Keys come out in insertion order (the previous map's carried keys, then the
 * newly superseded games in `previous.games` order): the order the snapshot file is written in.
 */
export function supersededGamesOf(games: readonly Game[], previous: Snapshot | null): Record<ContestId, ContestId> {
  const ids = new Set(games.map((g) => g.contestId));
  const out: Record<ContestId, ContestId> = {};
  for (const [from, to] of Object.entries(previous?.supersededGames ?? {})) {
    if (!ids.has(from) && ids.has(to)) out[from] = to;
  }
  const byFixture = new Map<string, ContestId>();
  for (const g of games) {
    if (g.official && !hasSbliveContestPrefix(g.contestId)) byFixture.set(g.official.fixtureId, g.contestId);
  }
  for (const g of previous?.games ?? []) {
    if (!hasSbliveContestPrefix(g.contestId) || ids.has(g.contestId) || !g.official) continue;
    const winner = byFixture.get(g.official.fixtureId);
    if (winner) out[g.contestId] = winner;
  }
  return out;
}
