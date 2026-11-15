/**
 * The shadow harness's check (pipeline inversion §10.0, §4.3): with SCVAL_CLAIMS_SHADOW=1 the pipeline records,
 * after each legacy stage, the games the legacy steps left and the view the claims resolve at the same stage
 * (lib/pipeline/run.ts, PipelineContext.shadow). The two must agree game for game and in order.
 *
 * Phase P1 records the `maxpreps` stage. A game the legacy step carried from the previous snapshot is that
 * snapshot's merged game (si.com fill, sheet score, result and all), while the claim is the contest MaxPreps last
 * listed: P2 moves the carry onto claims and closes the gap (§0.3). Until then a carried game is checked for its
 * identity (contest, day, sides) and its place in the order, and every other game for deep equality.
 */

import { expect } from 'vitest';

import { GUID_RE } from '../../../lib/game-id';
import type { PipelineContext } from '../../../lib/pipeline/ledger';
import type { ShadowStage, Stage } from '../../../lib/claims/types';
import type { Game } from '../../../lib/types';

const identity = (g: Game) => ({
  contestId: g.contestId,
  dateKey: g.dateKey,
  home: [g.home.teamId, g.home.slug, g.home.name],
  away: [g.away.teamId, g.away.slug, g.away.name],
});

export function shadowStage(ctx: PipelineContext, stage: Stage): ShadowStage {
  const found = ctx.shadow?.find((s) => s.stage === stage);
  if (!found) throw new Error(`no shadow record for stage ${stage}: is SCVAL_CLAIMS_SHADOW=1 set?`);
  return found;
}

/** The claims' view at `stage` agrees with the legacy games (see the module comment for carried games). Returns the stage. */
export function expectShadowAgrees(ctx: PipelineContext, stage: Stage, label: string): ShadowStage {
  const s = shadowStage(ctx, stage);
  // Every MaxPreps contest the legacy list holds is published by a fixture of the view.
  expect(s.claims.unplaced.filter((id) => GUID_RE.test(id)), `${label}: MaxPreps contests no fixture publishes`).toEqual([]);
  // The view's games are the legacy list, in its order, less what no claim publishes yet.
  const unplaced = new Set(s.claims.unplaced);
  const legacy = s.legacy.games.filter((g) => !unplaced.has(g.contestId));
  expect(s.claims.games.map((g) => g.contestId), `${label}: order`).toEqual(legacy.map((g) => g.contestId));
  expect(s.claims.view, `${label}: one fixture per game`).toHaveLength(new Set(s.claims.view).size);
  const carried = new Set(s.carried);
  legacy.forEach((g, i) => {
    const mine = s.claims.games[i];
    if (carried.has(g.contestId)) expect(identity(mine), `${label}: carried ${g.contestId}`).toEqual(identity(g));
    else expect(mine, `${label}: ${g.contestId}`).toEqual(g);
  });
  return s;
}
