/**
 * lib/engine/standings/pairings.ts: the BVAL play-in pairing, seated from the computed table (SPEC §5.7).
 */

import { describe, expect, it } from 'vitest';

import { computeStandings, leaguePairings } from '@/lib/engine/standings';
import { game } from '@/tests/support/game-builder';
import { finals } from '@/tests/support/standings';

describe('ladders and pairings by league', () => {
  it('builds the BVAL play-in pairing and attaches the contest once it exists', () => {
    const games = [
      ...finals([
        ['live-oak', 'prospect', 2, 0],
        ['branham', 'gilroy', 1, 0], ['branham', 'leigh', 1, 0], ['branham', 'leland', 1, 0],
        ['gilroy', 'leigh', 1, 0], ['gilroy', 'leland', 1, 0], ['leigh', 'willow-glen', 1, 0],
        ['christopher', 'leland', 1, 0],
      ]),
    ];
    const rows = computeStandings(games);
    const before = leaguePairings(rows, games, 'bval');
    expect(before).toHaveLength(1);
    expect(before[0].seats[0].map((s) => s.slug)).toEqual(['live-oak']);
    // Branham 9, Gilroy 6, then Leigh and Christopher level on 3: BVAL's chain seeds one 3rd, one 4th.
    expect(before[0].seats[1].map((s) => s.slug)).toHaveLength(1);
    expect(before[0].host).toBe(0);
    expect(before[0].time).toBe('11:00');
    expect(before[0].game).toBeNull();
    const fourth = before[0].seats[1][0].slug;
    expect(rows.find((r) => r.slug === fourth)?.computed.place).toBe(4);
    const playIn = game({ home: 'live-oak', away: fourth, date: '2026-10-31' });
    expect(playIn.postseason?.kind).toBe('bval-play-in');
    const after = leaguePairings(rows, [...games, playIn], 'bval');
    expect(after[0].game?.contestId).toBe(playIn.contestId);
    expect(leaguePairings(rows, games, 'pcal')).toEqual([]);
    expect(leaguePairings(rows, games, 'mcal')).toEqual([]);
  });
});
