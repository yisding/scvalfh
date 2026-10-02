/**
 * Step 06 (SPEC §7.4, §7.6): schedule rows → games, through A4's pure functions in order:
 * `normalizeGames` (TBA rows were already split off per feed in step 05), `applyExclusions`
 * (DATA_QUALITY ghosts and excluded contests; an exclusion that no longer matches is logged once),
 * `dedupePhantomPairs` (same-division pairs only). Every removed contest goes to the published
 * `dropped` list.
 *
 * Then the kept carry-forward: for every team whose feed failed this run — or was not fetched
 * because its league is not in the run — the previous snapshot's games involving that team that
 * this run does not have are carried forward unchanged.
 */

import { DATA_QUALITY } from '../../leagues';
import { applyExclusions, dedupePhantomPairs, normalizeGames } from '../../normalize';
import type { Game } from '../../types';
import type { PipelineContext, RunState } from '../ledger';

export function byDateThenId(a: Game, b: Game): number {
  return a.dateLocal === b.dateLocal ? a.contestId.localeCompare(b.contestId) : a.dateLocal.localeCompare(b.dateLocal);
}

export function stepNormalize(ctx: PipelineContext, state: RunState): void {
  const norm = normalizeGames(state.rows, { fetchedAt: ctx.fetchedAt });
  for (const w of norm.warnings) ctx.warn(w);

  const excluded = applyExclusions(norm.games, DATA_QUALITY);
  for (const id of excluded.unused) ctx.log(`  exclusion no longer needed: ${id}`);
  const deduped = dedupePhantomPairs(excluded.games);
  let games = deduped.games;

  // A TBA row whose contest another feed published with both sides named is not a dropped contest.
  const published = new Set(norm.games.map((g) => g.contestId));
  for (const row of [...state.tbaDropped, ...norm.dropped]) {
    if (!published.has(row.contestId)) ctx.drop(row);
  }
  for (const row of [...excluded.dropped, ...deduped.dropped]) ctx.drop(row);

  // Carry forward last-good data for every team whose feed this run did not read.
  const missing = [...state.feeds.values()].filter((f) => f.status === 'failed' || f.status === 'not-fetched');
  if (missing.length > 0 && ctx.previous) {
    const ids = new Set(missing.map((f) => f.teamId));
    const have = new Set(games.map((g) => g.contestId));
    const droppedIds = new Set([...excluded.dropped, ...deduped.dropped].map((d) => d.contestId));
    const carried = ctx.previous.games.filter(
      (g) =>
        !have.has(g.contestId) &&
        !droppedIds.has(g.contestId) &&
        ((g.home.teamId !== null && ids.has(g.home.teamId)) || (g.away.teamId !== null && ids.has(g.away.teamId))),
    );
    // A feed counts as carried when the previous snapshot covered its team, whether its games came
    // back from the carry or from an opponent's feed this run.
    for (const f of missing) {
      if (ctx.previous.games.some((g) => g.home.teamId === f.teamId || g.away.teamId === f.teamId)) f.carried = true;
    }
    if (carried.length > 0) {
      games = [...games, ...carried].sort(byDateThenId);
      ctx.log(`  carried forward ${carried.length} ${carried.length === 1 ? 'game' : 'games'} from the previous snapshot`);
    }
  }

  state.games = games;
  ctx.log(
    `  normalized: ${norm.stats.rows} rows → ${norm.games.length} contests · ` +
      `dropped ${excluded.dropped.length + deduped.dropped.length} by config/dedupe · ${games.length} games`,
  );
}
