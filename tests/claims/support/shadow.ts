/**
 * The shadow harness's check (pipeline inversion §10.0, §4.3): with SCVAL_CLAIMS_SHADOW=1 each stage moved onto
 * claims records what it read and what it published (lib/pipeline/ledger.ts PipelineContext.shadow), and the
 * harness runs the stage's legacy rule (./legacy.ts) over the same input. The two must agree game for game and in
 * order.
 *
 * Stage `maxpreps` (P2): step 06 over the MaxPreps claims, against step 06 as it was, carrying the previous
 * snapshot's games for a feed the run did not read. The claims carry the same contests, each as it was last
 * published (§11 R3's zero-deviation carry), so every game is deep-equal.
 *
 * Stage `vnn` (P3): the school calendars' per-site carry from the VNN claims, against the carry over the previous
 * snapshot's games. Stage `results` (P3): step 11c with the cifss and box evidence from their claims, against the
 * report's conflict rows and the box-score file as given.
 */

import { expect } from 'vitest';

import type { PipelineContext } from '../../../lib/pipeline/ledger';
import type { ShadowStage, Stage } from '../../../lib/claims/types';
import { legacyMaxpreps, legacyResults, legacyVnn } from './legacy';

export function shadowStage<S extends Stage>(ctx: PipelineContext, stage: S): Extract<ShadowStage, { stage: S }> {
  const found = ctx.shadow?.find((s) => s.stage === stage);
  if (!found) throw new Error(`no shadow record for stage ${stage}: is SCVAL_CLAIMS_SHADOW=1 set?`);
  return found as Extract<ShadowStage, { stage: S }>;
}

/** The maxpreps stage agrees with legacy step 06, game for game and in order. Returns the stage. */
function expectMaxprepsAgrees(ctx: PipelineContext, label: string): Extract<ShadowStage, { stage: 'maxpreps' }> {
  const s = shadowStage(ctx, 'maxpreps');
  const legacy = legacyMaxpreps(s.input, ctx.previous, ctx.fetchedAt);
  expect(s.games.map((g) => g.contestId), `${label}: order`).toEqual(legacy.games.map((g) => g.contestId));
  expect(s.view, `${label}: one fixture per game`).toHaveLength(new Set(s.view).size);
  expect([...s.carried].sort(), `${label}: carried`).toEqual([...legacy.carried].sort());
  legacy.games.forEach((g, i) => expect(s.games[i], `${label}: ${g.contestId}`).toEqual(g));
  return s;
}

/** The claims' stage agrees with the legacy rule over the same input. Returns the stage's record. */
export function expectShadowAgrees<S extends Stage>(ctx: PipelineContext, stage: S, label: string): Extract<ShadowStage, { stage: S }> {
  if (stage === 'maxpreps') return expectMaxprepsAgrees(ctx, label) as Extract<ShadowStage, { stage: S }>;
  if (stage === 'vnn') {
    const s = shadowStage(ctx, 'vnn');
    expect(s.games, `${label}: vnn`).toEqual(legacyVnn(s.input, ctx.previous));
    return s as Extract<ShadowStage, { stage: S }>;
  }
  if (stage === 'results') {
    const s = shadowStage(ctx, 'results');
    expect(s.games, `${label}: results`).toEqual(legacyResults(s.input, ctx.fetchedAt));
    return s as Extract<ShadowStage, { stage: S }>;
  }
  throw new Error(`the shadow harness has no check for stage ${stage}`);
}
