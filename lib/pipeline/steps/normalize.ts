/**
 * Step 06 (SPEC §7.4, §7.6; pipeline inversion §7.1): schedule rows → games, from the MaxPreps claims.
 *
 *  - COLLECT: `normalizeGames` with no ledger fact (TBA rows were already split off per feed in step 05), one claim
 *    per contest (lib/claims/sources/maxpreps.ts collectMaxprepsClaims).
 *  - MATCH (matchMaxpreps): the claims onto the store by stored ref; the editor's day and host; `applyExclusions`
 *    (DATA_QUALITY ghost teams and the ledger's rejected and duplicate rows, through the editor's claims; one that no
 *    longer matches is logged once); `dedupePhantomPairs` (same-division pairs only). Every removed contest goes to
 *    the published `dropped` list.
 *  - The carry: for every team whose feed failed this run, or was not fetched because its league is not in the run,
 *    its stored MaxPreps claims that this run does not have are carried forward, with two guards against counting
 *    one fixture twice: never a contest another feed reported Deleted this run, and the same-division phantom
 *    dedupe runs again over this run's games plus the carried ones, always keeping this run's row (a contest
 *    MaxPreps re-keyed since the last run).
 *  - The view (lib/claims/view.ts) starts from MATCH's order and decisions; the run publishes it resolved through
 *    this stage (lib/claims/resolve.ts).
 *
 * A carried contest enters the view as the previous run published it (FixtureDecisions.enters), with that run's
 * classification cleared, and an editor-listed game last published with it is carried the same way (§11 R3's
 * zero-deviation carry): what the other sources added to it then (an si.com fill, a sheet score, a box score, a
 * school calendar's venue) stays while its feed is not read, even where that source was read this run and would now
 * decide otherwise. Rebuilding the game from the claims would re-decide those contributions, which publishes
 * otherwise in exactly that case, so the previous publication is read here. The later steps decide classification
 * again exactly as they decide a fresh game's. Whether a feed counts as carried for its source row also reads the
 * previous snapshot: it describes what that publication covered.
 */

import { collectMaxprepsClaims, matchMaxpreps } from '../../claims/sources/maxpreps';
import { attachEditorClaims } from '../../claims/editor';
import type { PipelineContext, RunState } from '../ledger';

export function stepNormalize(ctx: PipelineContext, state: RunState): void {
  const { claims: fresh, norm } = collectMaxprepsClaims(state.rows, ctx.fetchedAt);
  for (const w of norm.warnings) ctx.warn(w);

  // Contests another feed reported Deleted this run (contestState 1) are gone, not missing.
  const deletedThisRun = new Set(state.rows.filter((r) => r.calculatedFields.contestState === 1).map((r) => r.contest.contestId));
  const m = matchMaxpreps({
    store: ctx.claims,
    fresh,
    editor: ctx.editor,
    feeds: state.feeds,
    deletedThisRun,
    tbaDropped: state.tbaDropped,
    normDropped: norm.dropped,
    published: new Map((ctx.previous?.games ?? []).map((g) => [g.contestId, g])),
  });
  attachEditorClaims(ctx.claims, ctx.editorClaims);
  for (const id of m.unusedExclusions) ctx.log(`  exclusion no longer needed: ${id}`);
  for (const row of m.dropped) ctx.drop(row);

  const missing = [...state.feeds.values()].filter((f) => f.status === 'failed' || f.status === 'not-fetched');
  if (missing.length > 0 && ctx.previous) {
    // A feed counts as carried when the previous snapshot covered its team, whether its games came
    // back from the carry or from an opponent's feed this run.
    for (const f of missing) {
      if (ctx.previous.games.some((g) => g.home.teamId === f.teamId || g.away.teamId === f.teamId)) f.carried = true;
    }
    const n = m.carried.length;
    if (n > 0) ctx.log(`  carried forward ${n} ${n === 1 ? 'game' : 'games'} from the previous run's claims`);
  }

  ctx.view.start(m.view, m.decisions);
  const games = ctx.view.games('maxpreps');
  if (ctx.shadow) {
    ctx.shadow.push({
      stage: 'maxpreps',
      input: { rows: [...state.rows], feeds: [...state.feeds.values()].map((f) => ({ teamId: f.teamId, status: f.status })), tbaDropped: [...state.tbaDropped] },
      view: [...m.view],
      games,
      carried: [...m.carried],
    });
  }
  ctx.log(
    `  normalized: ${norm.stats.rows} rows → ${norm.games.length} contests · ` +
      `dropped ${m.droppedByConfig} by config/dedupe · ${games.length} games`,
  );
}
