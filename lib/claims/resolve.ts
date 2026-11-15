/**
 * RESOLVE (§4.2, §7): a fixture's published game, folded from its claims and the run's cross-game decisions,
 * through a given stage. Each stage applies the existing rule function with explicit arguments (the editor's
 * slices, never the ledger's defaults), so `resolveView(view, store, …, k)` equals the game list the legacy
 * steps leave after stage k (§4.3; tests/claims/shadow.test.ts checks it).
 *
 * The `maxpreps` stage is the one resolved here so far: the contest as normalize builds it, on the editor's day and
 * at the editor's host, or, for a contest carried for a feed the run did not read, the game as the previous run
 * published it (FixtureDecisions.published). Every later stage throws until it moves here.
 */

import { applyDateCorrection } from '../pipeline/normalize';
import { applyHostCorrection } from '../results/host-correction';
import type { Game } from '../types';
import type { EditorView } from './editor';
import type { ClaimStore } from './store';
import { STAGES, type Fixture, type FixtureDecisions, type FixtureId, type MaxprepsClaim, type RunFacts, type Stage } from './types';

/** The game a MaxPreps claim holds, on the editor's day and at the editor's host (lib/pipeline/normalize.ts normalizeGames' order). */
export function resolveMaxprepsClaim(claim: MaxprepsClaim, editor: Pick<EditorView, 'dates' | 'hosts'>): Game {
  return applyHostCorrection(applyDateCorrection(claim.game as Game, editor.dates[claim.ref]), editor.hosts);
}

/**
 * The fixture's game through stage `through` (default: the last stage migrated), or null when it publishes none
 * at that stage (no contest id, or it first appears at a later stage).
 */
export function resolveFixture(f: Fixture, d: FixtureDecisions, facts: RunFacts, editor: EditorView, through: Stage = 'maxpreps'): Game | null {
  void facts;
  if (through !== 'maxpreps') throw new Error(`lib/claims/resolve.ts: stage ${through} is not migrated to claims yet`);
  if (d.contestId === null || STAGES.indexOf(d.from) > STAGES.indexOf(through)) return null;
  if (d.published) return d.published;
  const claim = f.claims.maxpreps;
  if (!claim || claim.ref !== d.contestId) return null;
  return resolveMaxprepsClaim(claim, editor);
}

/** The decisions of a fixture whose only stage so far is MaxPreps': its contest's own id. */
export function maxprepsDecisions(f: Fixture): FixtureDecisions {
  return { contestId: f.claims.maxpreps?.ref ?? null, from: 'maxpreps' };
}

/** `resolveFixture` over the view `order`: the game list at stage `through`, in view order, fixtures that publish nothing left out. */
export function resolveView(
  order: readonly FixtureId[],
  store: ClaimStore,
  decisions: ReadonlyMap<FixtureId, FixtureDecisions>,
  facts: RunFacts,
  editor: EditorView,
  through: Stage,
): Game[] {
  const out: Game[] = [];
  for (const id of order) {
    const f = store.get(id);
    if (!f) throw new Error(`lib/claims/resolve.ts: the view names ${id}, which the store does not hold`);
    const game = resolveFixture(f, decisions.get(id) ?? maxprepsDecisions(f), facts, editor, through);
    if (game) out.push(game);
  }
  return out;
}
