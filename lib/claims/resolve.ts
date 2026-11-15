/**
 * RESOLVE (§4.2, §7): a fixture's published game, folded from its claims and the run's cross-game decisions, stage
 * by stage. Each stage applies its rule module's per-game function (`applyX`) to the game the stage before left,
 * with that stage's decision and explicit editor slices (never the ledger's defaults):
 *
 *   maxpreps   the MaxPreps claim on the editor's day and at the editor's host, or the game the fixture enters with
 *              (FixtureDecisions.enters: a contest carried for a feed the run did not read, as last published)
 *   official   the official step's stamps and notes             (lib/official/match.ts applyOfficialDecision)
 *   sblive     si.com's fill, then its disagreement             (lib/crosscheck/backfill.ts, crosscheck.ts)
 *   vnn        the school calendars' venue and start time       (lib/sources/vnn-ics.ts applyVnnStageDecision)
 *   sdsSheet   the bracket sheet's score or time                (lib/postseason/sds-sheet-results.ts)
 *   classify   classifyGames with the run's degraded divisions, then settleLevelFinal
 *   guards     a frozen league's game as last published          (FixtureDecisions.frozen)
 *   results    finalizeResult with the cifss and box evidence and the editor's result corrections
 *
 * A fixture that first appears at a later stage (an si.com rule-2 game, a sheet game, a frozen league's passthrough,
 * an editor listing) starts from the game it enters with and is folded from that stage on. `resolveView` over the
 * view's order is what the run publishes after each stage (lib/pipeline/run.ts), and what the legacy step chain
 * published there (§4.3; tests/claims/shadow.test.ts checks it stage by stage). Pure.
 */

import { classifyGames } from '../classify';
import { applyBackfillDecision } from '../crosscheck/backfill';
import { applyReconcile } from '../crosscheck/crosscheck';
import { applyOfficialDecision } from '../official/match';
import { applyDateCorrection } from '../pipeline/normalize';
import { settleLevelFinal } from '../postseason/level-final';
import { applySdsSheetDecision } from '../postseason/sds-sheet-results';
import { applyHostCorrection } from '../results/host-correction';
import { finalizeResult } from '../results/result';
import { applyVnnStageDecision } from '../sources/vnn-ics';
import type { Game } from '../types';
import type { EditorView } from './editor';
import type { ClaimStore } from './store';
import { STAGES, type Fixture, type FixtureDecisions, type FixtureId, type MaxprepsClaim, type RunFacts, type Stage } from './types';

/** The game a MaxPreps claim holds, on the editor's day and at the editor's host (lib/pipeline/normalize.ts normalizeGames' order). */
export function resolveMaxprepsClaim(claim: MaxprepsClaim, editor: Pick<EditorView, 'dates' | 'hosts'>): Game {
  return applyHostCorrection(applyDateCorrection(claim.game as Game, editor.dates[claim.ref]), editor.hosts);
}

/** The decisions of a fixture no stage decided anything for: a MaxPreps contest from stage `maxpreps` on. */
export const NO_DECISIONS: FixtureDecisions = { from: 'maxpreps' };

/** The game a fixture enters the view with at its first stage, or null when it has none. */
function enteringGame(f: Fixture, d: FixtureDecisions, editor: EditorView): Game | null {
  if (d.enters) return d.enters;
  return d.from === 'maxpreps' && f.claims.maxpreps ? resolveMaxprepsClaim(f.claims.maxpreps, editor) : null;
}

/**
 * Stage `stage` applied to `game`, the fixture's game after the stage before (null: none yet). The one place each
 * stage's per-game rule is applied, by resolveFixture and by the view's stage-by-stage resolve alike.
 */
export function applyStage(stage: Stage, game: Game | null, f: Fixture, d: FixtureDecisions, facts: RunFacts, editor: EditorView): Game | null {
  const g = stage === d.from ? enteringGame(f, d, editor) : game;
  if (stage === 'guards') return d.frozen ?? g;
  if (g === null) return null;
  switch (stage) {
    case 'maxpreps':
      return g;
    case 'official':
      return (d.official ?? []).reduce((x, o) => applyOfficialDecision(x, o), g);
    case 'sblive':
      return applyReconcile(applyBackfillDecision(g, d.backfill), d.reconcile);
    case 'vnn':
      return applyVnnStageDecision(g, d.vnn);
    case 'sdsSheet':
      return d.sheet ? applySdsSheetDecision(g, d.sheet) : g;
    case 'classify':
      return settleLevelFinal(classifyGames([g], { degradedDivisions: facts.degradedDivisions })[0]);
    case 'results':
      return finalizeResult(g, { cifss: d.cifss, corrections: editor.results, box: d.box });
  }
}

/** The fixture's game through stage `through`, or null when it publishes none by then (it first appears later). */
export function resolveFixture(f: Fixture, d: FixtureDecisions, facts: RunFacts, editor: EditorView, through: Stage): Game | null {
  let game: Game | null = null;
  for (const stage of STAGES.slice(STAGES.indexOf(d.from), STAGES.indexOf(through) + 1)) game = applyStage(stage, game, f, d, facts, editor);
  return game;
}

/**
 * `resolveFixture` over the view `order`: the game list at stage `through`, in view order. A fixture the store does
 * not hold is a passthrough (one created for a game as last published, never written) and has no claims. Every
 * fixture of the order publishes a game: one that does not is a bug in whatever built the order, and throws.
 */
export function resolveView(
  order: readonly FixtureId[],
  store: ClaimStore,
  decisions: ReadonlyMap<FixtureId, FixtureDecisions>,
  facts: RunFacts,
  editor: EditorView,
  through: Stage,
): Game[] {
  return order.map((id) => {
    const game = resolveFixture(store.get(id) ?? { id, claims: {} }, decisions.get(id) ?? NO_DECISIONS, facts, editor, through);
    if (game === null) throw new Error(`lib/claims/resolve.ts: the view names ${id}, which publishes no game at stage ${through}`);
    return game;
  });
}
