/**
 * Step 06 (SPEC §7.4, §7.6): schedule rows → games, through A4's pure functions in order:
 * `normalizeGames` (TBA rows were already split off per feed in step 05), `applyExclusions`
 * (DATA_QUALITY ghosts and excluded contests; an exclusion that no longer matches is logged once),
 * `dedupePhantomPairs` (same-division pairs only). Every removed contest goes to the published
 * `dropped` list.
 *
 * Then the kept carry-forward: for every team whose feed failed this run — or was not fetched
 * because its league is not in the run — the previous snapshot's games involving that team that
 * this run does not have are carried forward, with three guards against counting one fixture twice:
 *  - never a si.com `sblive:` game (step 08 decides those again, carrying them only while still
 *    eligible) nor a contest another feed reported Deleted this run;
 *  - the earlier run's classification is cleared (official stamp, countsFor, postseason), so step 07
 *    and step 10 decide the carried game exactly as they decide a fresh one;
 *  - the same-division phantom dedupe runs again over this run's games plus the carried ones, always
 *    keeping this run's row (a contest MaxPreps re-keyed since the last run).
 */

import { DATA_QUALITY } from '../../leagues';
import { applyExclusions, dedupePhantomPairs, normalizeGames } from '../../normalize';
import type { Game } from '../../types';
import type { PipelineContext, RunState } from '../ledger';

export function byDateThenId(a: Game, b: Game): number {
  return a.dateLocal === b.dateLocal ? a.contestId.localeCompare(b.contestId) : a.dateLocal.localeCompare(b.dateLocal);
}

/** A carried game with the earlier run's classification cleared, so this run decides it again. */
function unclassified(g: Game): Game {
  const { official: _official, ...rest } = g;
  void _official;
  // The notes step 07 writes from its own match are written again by this run's match.
  const { classificationNote: _note, hostConflict: _host, ...provenance } = g.provenance;
  void _note;
  void _host;
  return { ...rest, countsFor: null, postseason: null, provenance };
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
    // Contests another feed reported Deleted this run (contestState 1) are gone, not missing.
    const deleted = new Set(
      state.rows.filter((r) => r.calculatedFields.contestState === 1).map((r) => r.contest.contestId),
    );
    const candidates = ctx.previous.games
      .filter(
        (g) =>
          !g.contestId.startsWith('sblive:') &&
          !have.has(g.contestId) &&
          !droppedIds.has(g.contestId) &&
          !deleted.has(g.contestId) &&
          ((g.home.teamId !== null && ids.has(g.home.teamId)) || (g.away.teamId !== null && ids.has(g.away.teamId))),
      )
      .map(unclassified);
    // A carried game the same as one of this run's (same date, same division pair) is the stale copy.
    const fresh = new Set(games.map((g) => g.contestId));
    const merged = dedupePhantomPairs([...games, ...candidates], { preferred: (g) => fresh.has(g.contestId) });
    const losers = new Set(merged.dropped.map((d) => d.contestId));
    for (const row of merged.dropped) ctx.drop(row);
    const carried = candidates.filter((g) => !losers.has(g.contestId));
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
