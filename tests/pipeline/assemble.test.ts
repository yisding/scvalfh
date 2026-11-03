/**
 * lib/pipeline/steps/assemble.ts — `supersededGamesOf` (snapshot refinement 10): the map from a si.com fill's
 * `sblive:` id to the MaxPreps contest that later matched the same official fixture, carried while both ends
 * hold. The fills themselves are lib/crosscheck/backfill.ts's (tests/backfill.test.ts, rule 10).
 */

import { describe, expect, it } from 'vitest';

import { supersededGamesOf } from '../../lib/pipeline/steps/assemble';
import type { Game, Snapshot } from '../../lib/types';
import { game } from '../game-builder';

/** A snapshot carrying only what supersededGamesOf reads (games, supersededGames). */
function previousWith(games: Game[], supersededGames: Record<string, string> = {}): Snapshot {
  return { games, supersededGames } as unknown as Snapshot;
}

describe('supersededGamesOf (backfill rule 10: supersede and carry-forward)', () => {
  // The si.com fill of PCAL's Greenfield @ Santa Catalina fixture (Sep 4), as applyBackfill writes it: the
  // si.com game's id, stamped with the fixture it filled.
  const filled = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, contestId: 'sblive:6541425' });

  it('a MaxPreps contest that now matches the filled fixture wins; the sblive: id maps to it', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, official: { fixtureId: filled.official!.fixtureId } });
    expect(supersededGamesOf([contest], previousWith([filled]))).toEqual({ 'sblive:6541425': contest.contestId });
  });

  it('carries the previous map while both ends hold', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0 });
    const prev = previousWith([], { 'sblive:6541425': contest.contestId, 'sblive:1': 'gone' });
    expect(supersededGamesOf([contest], prev)).toEqual({ 'sblive:6541425': contest.contestId });
  });
});
