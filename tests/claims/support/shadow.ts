/**
 * The per-stage trace check: with SCVAL_STAGE_TRACE=1 each stage records what it read and what it published
 * (lib/pipeline/ledger.ts PipelineContext.trace), and this checks the record against the pre-claims rule
 * (./legacy.ts) over the same input, where the pipeline reads stored claims and that rule read the previous snapshot:
 *
 *   maxpreps   step 06 over the MaxPreps claims, a feed not read carried from them, against the previous snapshot's
 *              games carried as they were. A carried game's run history (slug, aliases, contentChangedAt) is
 *              assembly's, from the previous snapshot, so it is left out of the comparison.
 *   official   every division the official step carried from the official claims, against carryOfficialForward over
 *              the previous snapshot; and the view through the stage against the games the step returned.
 *   sblive     with no si.com data read, the disagreements carried from the si.com claims against the previous
 *              snapshot's; and the view through the stage against the games the step returned.
 *   sdsSheet   the rows of the tabs not read, or read with warnings, from the sheet's claims, against the rows read
 *              back from the previous snapshot's games.
 *   classify   the view resolved fixture by fixture against classifyGames over the game list.
 *
 * And at every stage: what the run published (the view through the stage) is the game list the stage's record holds.
 */

import { expect } from 'vitest';

import type { PipelineContext } from '../../../lib/pipeline/ledger';
import type { StageTrace, Stage } from '../../../lib/claims/types';
import type { Game } from '../../../lib/types';
import { legacyCarryConflicts, legacyClassify, legacyMaxpreps, legacyOfficialCarry, legacySheetRows } from './legacy';

export function traceOf<S extends Stage>(ctx: PipelineContext, stage: S): Extract<StageTrace, { stage: S }> {
  const found = ctx.trace?.find((s) => s.stage === stage);
  if (!found) throw new Error(`no shadow record for stage ${stage}: is SCVAL_STAGE_TRACE=1 set?`);
  return found as Extract<StageTrace, { stage: S }>;
}

/** What the run published after `through` (the view resolved through that stage) is `games`, in order. */
function expectViewIs(ctx: PipelineContext, through: Stage, games: readonly unknown[], label: string): void {
  const views = (ctx.trace ?? []).filter((r): r is Extract<StageTrace, { stage: 'view' }> => r.stage === 'view' && r.through === through);
  expect(views, `${label}: one view through ${through}`).toHaveLength(1);
  expect(views[0].games, `${label}: the view through ${through}`).toEqual(games);
}

/** A game without its run history: slug, aliases and provenance.contentChangedAt. */
function sansHistory(g: Game): Game {
  const { slug: _slug, aliases: _aliases, ...rest } = g;
  void [_slug, _aliases];
  const { contentChangedAt: _changed, ...provenance } = g.provenance;
  void _changed;
  return { ...rest, provenance };
}

/** The maxpreps stage agrees with legacy step 06, game for game and in order. Returns the stage. */
function expectMaxprepsAgrees(ctx: PipelineContext, label: string): Extract<StageTrace, { stage: 'maxpreps' }> {
  const s = traceOf(ctx, 'maxpreps');
  const legacy = legacyMaxpreps(s.input, ctx.previous, ctx.fetchedAt);
  expect(s.games.map((g) => g.contestId), `${label}: order`).toEqual(legacy.games.map((g) => g.contestId));
  expect(s.view, `${label}: one fixture per game`).toHaveLength(new Set(s.view).size);
  expect([...s.carried].sort(), `${label}: carried`).toEqual([...legacy.carried].sort());
  legacy.games.forEach((g, i) => expect(sansHistory(s.games[i]), `${label}: ${g.contestId}`).toEqual(sansHistory(g)));
  expectViewIs(ctx, 'maxpreps', s.games, label);
  return s;
}

/** The claims' stage agrees with the legacy rule over the same input. Returns the stage's record. */
export function expectTraceAgrees<S extends Stage>(ctx: PipelineContext, stage: S, label: string): Extract<StageTrace, { stage: S }> {
  if (stage === 'maxpreps') return expectMaxprepsAgrees(ctx, label) as Extract<StageTrace, { stage: S }>;
  if (stage === 'official') {
    const records = (ctx.trace ?? []).filter((r): r is Extract<StageTrace, { stage: 'official' }> => r.stage === 'official');
    for (const r of records) {
      if (r.kind !== 'carry') continue;
      const legacy = legacyOfficialCarry(r, ctx.previous);
      expect(r.fixtures, `${label}: official ${r.division} carried fixtures`).toEqual(legacy.fixtures);
      expect(r.carried, `${label}: official ${r.division} carried stamps`).toBe(legacy.carried);
      expect(r.out, `${label}: official ${r.division} carried games`).toEqual(legacy.games);
    }
    const resolved = records.filter((r) => r.kind === 'resolve');
    expect(resolved, `${label}: one official stage`).toHaveLength(1);
    const [s] = resolved as Array<Extract<StageTrace, { stage: 'official'; kind: 'resolve' }>>;
    expect(s.games, `${label}: official`).toEqual(s.stepGames);
    expectViewIs(ctx, 'official', s.games, label);
    return s as Extract<StageTrace, { stage: S }>;
  }
  if (stage === 'sblive') {
    const records = (ctx.trace ?? []).filter((r): r is Extract<StageTrace, { stage: 'sblive' }> => r.stage === 'sblive');
    const decided = records.filter((r) => r.kind === 'decide') as Array<Extract<StageTrace, { stage: 'sblive'; kind: 'decide' }>>;
    expect(decided, `${label}: one si.com step`).toHaveLength(1);
    const d = decided[0];
    if (d.input.sblive === null) {
      // The games before the carry: a disagreement a game shows with no fill, that its input did not, came from it.
      const before = d.games.map((g, i) => {
        const was = d.input.games[i];
        if (!was || was.contestId !== g.contestId || was.provenance.scoreConflict || !g.provenance.scoreConflict || g.provenance.backfill) return g;
        const { scoreConflict: _carried, ...provenance } = g.provenance;
        void _carried;
        return { ...g, provenance };
      });
      expect(d.games, `${label}: si.com disagreements carried`).toEqual(legacyCarryConflicts(before, ctx.previous));
    }
    const resolved = records.filter((r) => r.kind === 'resolve') as Array<Extract<StageTrace, { stage: 'sblive'; kind: 'resolve' }>>;
    expect(resolved, `${label}: one si.com stage`).toHaveLength(1);
    expect(resolved[0].games, `${label}: sblive`).toEqual(resolved[0].stepGames);
    expectViewIs(ctx, 'sblive', resolved[0].games, label);
    return resolved[0] as Extract<StageTrace, { stage: S }>;
  }
  if (stage === 'sdsSheet') {
    const s = traceOf(ctx, 'sdsSheet');
    const legacy = legacySheetRows(s.input, ctx.previous);
    expect(s.results, `${label}: sheet results`).toEqual(legacy.results);
    expect(s.fixtures, `${label}: sheet fixtures`).toEqual(legacy.fixtures);
    expectViewIs(ctx, 'sdsSheet', s.games, label);
    return s as Extract<StageTrace, { stage: S }>;
  }
  if (stage === 'classify') {
    const s = traceOf(ctx, 'classify');
    expect(s.games, `${label}: classify`).toEqual(legacyClassify(s.input));
    expectViewIs(ctx, 'classify', s.games, label);
    return s as Extract<StageTrace, { stage: S }>;
  }
  throw new Error(`the trace check has no check for stage ${stage}`);
}
