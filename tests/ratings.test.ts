/**
 * lib/ratings.ts (DESIGN §20): the Elo-scale fit over synthetic games, and its invariants over the
 * bundled snapshot. Nothing here asserts a particular team's number on the committed data, which a
 * data refresh changes.
 */

import { describe, expect, it } from 'vitest';

import { getSnapshot } from '../lib/data';
import {
  ELO_BASE,
  ELO_PER_GOAL,
  MARGIN_CAP,
  computeRatings,
  getRatings,
  ratingGames,
  type RatingTable,
} from '../lib/ratings';
import { TEAMS } from '../lib/teams';
import type { Game } from '../lib/types';
import { game, type GameSpec } from './game-builder';

const neutral = (spec: GameSpec): Game => ({ ...game(spec), site: 'neutral' });
const eloOf = (table: RatingTable, slug: string) => table.ratings.find((r) => r.slug === slug)?.elo;

describe('computeRatings', () => {
  it('rates the winner above the loser, symmetrically about 1500', () => {
    const t = computeRatings(TEAMS, [neutral({ home: 'homestead', away: 'saratoga', hs: 2, as: 0 })]);
    const a = eloOf(t, 'homestead')!;
    const b = eloOf(t, 'saratoga')!;
    expect(a).toBeGreaterThan(ELO_BASE);
    expect(b).toBeLessThan(ELO_BASE);
    expect(Math.abs(a + b - 2 * ELO_BASE)).toBeLessThanOrEqual(1);
    expect(t.ratings.map((r) => r.slug)).toEqual(['homestead', 'saratoga']);
  });

  it('rates only teams with a counted final', () => {
    const t = computeRatings(TEAMS, [neutral({ home: 'homestead', away: 'saratoga', hs: 1, as: 1 })]);
    expect(t.ratings).toHaveLength(2);
    expect(t.games).toBe(1);
    expect(t.through).toBe('2026-09-09');
    expect(computeRatings(TEAMS, [])).toEqual({ ratings: [], homeEdge: 0, games: 0, through: null });
  });

  it(`counts a margin up to ${MARGIN_CAP} goals, so running up a score earns nothing more`, () => {
    const capped = computeRatings(TEAMS, [neutral({ home: 'homestead', away: 'saratoga', hs: MARGIN_CAP, as: 0 })]);
    const blowout = computeRatings(TEAMS, [neutral({ home: 'homestead', away: 'saratoga', hs: 16, as: 0 })]);
    expect(blowout.ratings).toEqual(capped.ratings);
    const closer = computeRatings(TEAMS, [neutral({ home: 'homestead', away: 'saratoga', hs: 2, as: 0 })]);
    expect(eloOf(closer, 'homestead')!).toBeLessThan(eloOf(capped, 'homestead')!);
  });

  it('fits a home edge from hosted games and none from neutral ones', () => {
    // A home-and-home pair that each host wins by one: equal teams, and the edge takes the goal.
    const hosted = computeRatings(TEAMS, [
      game({ home: 'homestead', away: 'saratoga', hs: 1, as: 0, date: '2026-09-02' }),
      game({ home: 'saratoga', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' }),
    ]);
    expect(eloOf(hosted, 'homestead')).toBe(ELO_BASE);
    expect(eloOf(hosted, 'saratoga')).toBe(ELO_BASE);
    expect(hosted.homeEdge).toBeGreaterThan(0);
    expect(hosted.homeEdge).toBeLessThan(ELO_PER_GOAL);

    const atNeutral = computeRatings(TEAMS, [
      neutral({ home: 'homestead', away: 'saratoga', hs: 1, as: 0, date: '2026-09-02' }),
      neutral({ home: 'saratoga', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' }),
    ]);
    expect(atNeutral.homeEdge).toBe(0);
  });

  it('credits a win over a strong team more than the same win over a weak one', () => {
    // Fremont beat Saratoga 3-0, so Fremont is the stronger of the two. Los Gatos then beat
    // Fremont 1-0 and Homestead beat Saratoga 1-0: the same score, against the stronger team.
    const t = computeRatings(TEAMS, [
      neutral({ home: 'fremont', away: 'saratoga', hs: 3, as: 0, date: '2026-09-01' }),
      neutral({ home: 'los-gatos', away: 'fremont', hs: 1, as: 0, date: '2026-09-02' }),
      neutral({ home: 'homestead', away: 'saratoga', hs: 1, as: 0, date: '2026-09-03' }),
    ]);
    expect(eloOf(t, 'los-gatos')!).toBeGreaterThan(eloOf(t, 'homestead')!);
  });

  it('leaves out forfeits, unplayed games and finals without a score', () => {
    const base = [neutral({ home: 'homestead', away: 'saratoga', hs: 2, as: 1 })];
    const noise = [
      neutral({ home: 'homestead', away: 'saratoga', hs: 1, as: 0, forfeit: true }),
      neutral({ home: 'homestead', away: 'saratoga' }),
      neutral({ home: 'homestead', away: 'saratoga', status: 'score-pending' }),
      { ...neutral({ home: 'homestead', away: 'saratoga', hs: 9, as: 0 }), home: { ...base[0].home, score: null } },
    ];
    expect(computeRatings(TEAMS, [...base, ...noise])).toEqual(computeRatings(TEAMS, base));
  });

  it('leaves out games against schools outside the four leagues', () => {
    const inside = neutral({ home: 'homestead', away: 'saratoga', hs: 2, as: 1 });
    const g = neutral({ home: 'homestead', away: 'fremont', hs: 0, as: 9 });
    const outside: Game = {
      ...g,
      away: { ...g.away, teamId: null, slug: null, name: 'Chico' },
    };
    const t = computeRatings(TEAMS, [inside, outside]);
    expect(t).toEqual(computeRatings(TEAMS, [inside]));
    expect(eloOf(t, 'fremont')).toBeUndefined();
  });

  it('gives the same numbers whatever order the games and teams arrive in', () => {
    const games = [
      neutral({ home: 'fremont', away: 'saratoga', hs: 3, as: 0, date: '2026-09-01' }),
      game({ home: 'los-gatos', away: 'fremont', hs: 1, as: 1, date: '2026-09-02' }),
      game({ home: 'homestead', away: 'saratoga', hs: 1, as: 0, date: '2026-09-03' }),
      game({ home: 'saratoga', away: 'los-gatos', hs: 0, as: 4, date: '2026-09-04' }),
    ];
    expect(computeRatings(TEAMS, [...games].reverse())).toEqual(computeRatings(TEAMS, games));
    expect(computeRatings([...TEAMS].reverse(), games)).toEqual(computeRatings(TEAMS, games));
  });
});

describe('getRatings over the bundled snapshot', () => {
  const snapshot = getSnapshot();
  const table = getRatings();
  const counted = ratingGames(snapshot.teams, snapshot.games);

  it('rates exactly the teams with a counted final, highest first, averaging 1500', () => {
    const played = new Set(counted.flatMap((g) => [g.home.teamId, g.away.teamId]));
    expect(new Set(table.ratings.map((r) => r.teamId))).toEqual(played);
    expect(table.games).toBe(counted.length);
    for (let i = 1; i < table.ratings.length; i++) {
      expect(table.ratings[i - 1].elo).toBeGreaterThanOrEqual(table.ratings[i].elo);
    }
    if (table.ratings.length > 0) {
      const mean = table.ratings.reduce((s, r) => s + r.elo, 0) / table.ratings.length;
      expect(Math.abs(mean - ELO_BASE)).toBeLessThanOrEqual(1);
    }
  });

  it('counts each team’s games from the same finals', () => {
    for (const r of table.ratings) {
      const n = counted.filter((g) => g.home.teamId === r.teamId || g.away.teamId === r.teamId).length;
      expect(r.games, r.slug).toBe(n);
    }
  });

  it('counts only finals between two registry teams, never a forfeit', () => {
    const ids = new Set(snapshot.teams.map((t) => t.id));
    for (const g of counted) {
      expect(g.status).toBe('final');
      expect(g.isForfeit).toBe(false);
      expect(ids.has(g.home.teamId!) && ids.has(g.away.teamId!)).toBe(true);
    }
  });
});
