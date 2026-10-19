/**
 * lib/pipeline/reconcile/superseded.ts — D2 rule 10, the one `supersededGamesOf` that backfill and assemble share.
 * The snapshot writes the map in insertion order (the golden tests pin it), so the order is asserted here.
 */

import { describe, expect, it } from 'vitest';

import type { Snapshot } from '@/lib/model/snapshot';
import { supersededGamesOf } from '@/lib/pipeline/reconcile/superseded';
import { game } from '@/tests/support/game-builder';

function previousWith(games: ReturnType<typeof game>[], supersededGames: Record<string, string> = {}): Snapshot {
  return { games, supersededGames } as unknown as Snapshot;
}

describe('supersededGamesOf', () => {
  const winnerA = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, official: { fixtureId: 'fx-a' } });
  const winnerB = game({ home: 'hollister', away: 'greenfield', date: '2026-09-30', hs: 2, as: 0, official: { fixtureId: 'fx-b' } });
  const fillB = game({ home: 'hollister', away: 'greenfield', date: '2026-09-30', hs: 2, as: 0, contestId: 'sblive:900', official: { fixtureId: 'fx-b' } });
  const fillA = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, contestId: 'sblive:100', official: { fixtureId: 'fx-a' } });

  it('lists the carried keys first, then the newly superseded games in previous-game order (not sorted)', () => {
    const carriedTo = winnerA.contestId;
    const out = supersededGamesOf([winnerA, winnerB], previousWith([fillB, fillA], { 'sblive:555': carriedTo }));
    expect(Object.entries(out)).toEqual([
      ['sblive:555', carriedTo],
      ['sblive:900', winnerB.contestId],
      ['sblive:100', winnerA.contestId],
    ]);
  });

  it('drops a carried key that is a game again or whose target is gone, and a fill whose fixture has no contest', () => {
    const out = supersededGamesOf([winnerA], previousWith([fillB], { 'sblive:1': 'gone', [winnerA.contestId]: winnerA.contestId }));
    expect(out).toEqual({});
  });

  it('is empty without a previous snapshot', () => {
    expect(supersededGamesOf([winnerA], null)).toEqual({});
  });
});
