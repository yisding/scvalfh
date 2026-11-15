/**
 * The decide/apply split of lib/crosscheck/backfill.ts and lib/crosscheck/crosscheck.ts (the claims
 * re-architecture, P6). `applyBackfill` and `reconcile` stay the oracle: every scenario tests/backfill.test.ts and
 * tests/crosscheck.test.ts build runs here again with both functions wrapped, and each call checks that
 *   - the cross-game decide function followed by the per-game apply function gives the composed result,
 *     deeply and in order, with the rule-2 games appended after the existing games;
 *   - a game with no decision is the same object in the result;
 *   - the decide function does not mutate its input.
 * Those files are imported, not copied, so a scenario added there is checked here too.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { BackfillInput } from '../lib/crosscheck/backfill';
import type { ReconcileOptions } from '../lib/crosscheck/crosscheck';
import type { SbliveGame } from '../lib/sources/sblive';
import type { Game } from '../lib/types';

const calls = { backfill: 0, backfillDecided: 0, backfillCreated: 0, reconcile: 0, reconcileDecided: 0 };

/** The data part of a backfill input: `consulted` is a function, so it is left out of the snapshot. */
function backfillData(input: BackfillInput) {
  return structuredClone({
    games: input.games,
    unmatched: input.unmatched,
    sblive: input.sblive,
    today: input.today,
    previous: input.previous,
    sbliveFailed: input.sbliveFailed,
    fetchedAt: input.fetchedAt,
    moves: input.moves,
  });
}

vi.mock('../lib/crosscheck/backfill', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/crosscheck/backfill')>();
  const applyBackfill: typeof real.applyBackfill = (input) => {
    const result = real.applyBackfill(input);
    calls.backfill += 1;

    const before = backfillData(input);
    const decided = real.decideBackfill(input);
    expect(backfillData(input)).toStrictEqual(before);

    const applied = input.games.map((g) => real.applyBackfillDecision(g, decided.byContestId.get(g.contestId)));
    expect([...applied, ...decided.created.map((c) => c.game)]).toStrictEqual(result.games);
    expect(decided.unmatched).toStrictEqual(result.unmatched);
    expect(decided.rows).toStrictEqual(result.rows);
    expect(decided.skipped).toStrictEqual(result.skipped);
    expect(decided.warnings).toStrictEqual(result.warnings);
    expect(decided.carried).toStrictEqual(result.carried);
    expect(decided.consumed).toStrictEqual(decided.created.map((c) => c.fixture));
    for (const f of decided.consumed) expect(result.unmatched).not.toContain(f);

    input.games.forEach((g, i) => {
      if (!decided.byContestId.has(g.contestId)) expect(result.games[i]).toBe(g);
      else expect(result.games[i]).not.toBe(g);
    });
    // A carried rule-2 game is the previous snapshot's game itself.
    decided.created.forEach((c, i) => {
      if (c.carried) expect(result.games[input.games.length + i]).toBe(c.game);
    });
    calls.backfillDecided += decided.byContestId.size;
    calls.backfillCreated += decided.created.length;
    return result;
  };
  return { ...real, applyBackfill };
});

vi.mock('../lib/crosscheck/crosscheck', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/crosscheck/crosscheck')>();
  const reconcile = (games: readonly Game[], sbliveGames: readonly SbliveGame[], opts: ReconcileOptions) => {
    const result = real.reconcile(games, sbliveGames, opts);
    calls.reconcile += 1;

    const before = structuredClone({ games, sbliveGames, opts });
    const decided = real.decideReconcile(games, sbliveGames, opts);
    expect(structuredClone({ games, sbliveGames, opts })).toStrictEqual(before);

    expect(games.map((g) => real.applyReconcile(g, decided.byContestId.get(g.contestId)))).toStrictEqual(result.games);
    expect(decided.report).toStrictEqual(result.report);
    expect(decided.unmatched).toBe(result.unmatched);
    games.forEach((g, i) => {
      if (!decided.byContestId.has(g.contestId)) expect(result.games[i]).toBe(g);
      else expect(result.games[i]).not.toBe(g);
    });
    calls.reconcileDecided += decided.byContestId.size;
    return result;
  };
  return { ...real, reconcile };
});

// Every describe block of these files runs here, through the wrapped functions above.
await import('./backfill.test');
await import('./crosscheck.test');

describe('decide/apply split coverage', () => {
  afterAll(() => {
    // The imported scenarios reached the wrappers, with decisions of every kind to compare.
    expect(calls.backfill).toBeGreaterThan(30);
    expect(calls.backfillDecided).toBeGreaterThan(10);
    expect(calls.backfillCreated).toBeGreaterThan(3);
    expect(calls.reconcile).toBeGreaterThan(5);
    expect(calls.reconcileDecided).toBeGreaterThan(3);
  });

  it('runs the composed functions through the wrappers', () => {
    expect(calls.backfill + calls.reconcile).toBeGreaterThan(0);
  });
});
