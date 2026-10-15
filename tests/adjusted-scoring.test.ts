/**
 * lib/adjusted-scoring.ts: goals weighed by the opponent's Elo rating, over synthetic games and a
 * synthetic rating table (so every number is exact), and its invariants over the bundled data.
 */

import { describe, expect, it } from 'vitest';

import {
  GOALS_TENFOLD,
  computeAdjustedScoring,
  getAdjustedScoring,
  opponentGoalShare,
} from '../lib/adjusted-scoring';
import { getSnapshot } from '../lib/data';
import { ELO_BASE, getRatings, ratingGames, type RatingTable } from '../lib/ratings';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import { game } from './game-builder';

/** A rating table that rates each slug as given. */
function table(elos: Record<string, number>): RatingTable {
  return {
    ratings: Object.entries(elos).map(([slug, elo]) => ({
      teamId: getTeamBySlug(slug)!.id,
      slug,
      elo,
      games: 1,
      seeded: false,
    })),
    homeEdge: 0,
    games: 0,
    through: null,
    seededFrom: null,
    priorGames: 0,
  };
}

const id = (slug: string) => getTeamBySlug(slug)!.id;

describe('opponentGoalShare', () => {
  it(`is 1 against an average team and falls tenfold every ${GOALS_TENFOLD} points`, () => {
    expect(opponentGoalShare(ELO_BASE)).toBe(1);
    expect(opponentGoalShare(ELO_BASE + GOALS_TENFOLD)).toBeCloseTo(0.1, 12);
    expect(opponentGoalShare(ELO_BASE - GOALS_TENFOLD)).toBeCloseTo(10, 12);
    expect(opponentGoalShare(ELO_BASE + GOALS_TENFOLD / 2)).toBeCloseTo(Math.sqrt(0.1), 12);
  });
});

describe('computeAdjustedScoring', () => {
  const ratings = table({ mitty: 1500, leigh: 2500, stevenson: 500 });
  const games = [
    game({ home: 'mitty', away: 'leigh', hs: 1, as: 3, date: '2026-09-01' }),
    game({ home: 'mitty', away: 'stevenson', hs: 4, as: 0, date: '2026-09-02' }),
  ];
  const adjusted = computeAdjustedScoring(TEAMS, games, ratings);

  it('counts each game as what it is worth against an average team, by the opponent’s rating', () => {
    const mitty = adjusted.get(id('mitty'))!;
    // A game against a team 1000 above average is a tenth of one; 1000 below, ten.
    expect(mitty).toMatchObject({ slug: 'mitty', games: 2, goals: 5 });
    expect(mitty.averageGames).toBeCloseTo(10.1, 12);
    expect(mitty.perGame).toBeCloseTo(5 / 10.1, 12);
    expect(mitty.factor).toBeCloseTo(2 / 10.1, 12);
    // Leigh's one game was against an average team: adjusted is raw, the factor 1.
    expect(adjusted.get(id('leigh'))).toMatchObject({ games: 1, goals: 3, averageGames: 1, perGame: 3, factor: 1 });
    // A scoreless game still counts, as the games it is worth.
    const stevenson = adjusted.get(id('stevenson'))!;
    expect(stevenson).toMatchObject({ games: 1, goals: 0, perGame: 0, factor: 1 });
  });

  it('rewards the same goals more against a harder schedule', () => {
    const hard = computeAdjustedScoring(TEAMS, [game({ home: 'mitty', away: 'leigh', hs: 2, as: 2 })], ratings);
    const soft = computeAdjustedScoring(TEAMS, [game({ home: 'mitty', away: 'stevenson', hs: 2, as: 2 })], ratings);
    expect(hard.get(id('mitty'))!.perGame).toBeCloseTo(20, 12);
    expect(soft.get(id('mitty'))!.perGame).toBeCloseTo(0.2, 12);
  });

  it('counts only the finals the Elo fit counts: no forfeit, no unscored game, no outside school', () => {
    const more = [
      ...games,
      game({ home: 'mitty', away: 'leigh', hs: 1, as: 0, forfeit: true, date: '2026-09-03' }),
      game({ home: 'mitty', away: 'leigh', status: 'scheduled', date: '2026-10-30' }),
    ];
    expect(computeAdjustedScoring(TEAMS, more, ratings)).toEqual(adjusted);
    expect([...computeAdjustedScoring(TEAMS, [], ratings)]).toEqual([]);
  });
});

describe('getAdjustedScoring, over the bundled data', () => {
  const snapshot = getSnapshot();
  const all = getAdjustedScoring();
  const ratings = getRatings();

  it('covers every team the Elo fit counts a game for, with the same count', () => {
    const counted = ratings.ratings.filter((r) => r.games > 0);
    expect([...all.keys()].sort()).toEqual(counted.map((r) => r.teamId).sort());
    for (const r of counted) expect(all.get(r.teamId)!.games, r.slug).toBe(r.games);
    const goals = ratingGames(snapshot.teams, snapshot.games).reduce((n, g) => n + g.home.score! + g.away.score!, 0);
    expect([...all.values()].reduce((n, a) => n + a.goals, 0)).toBe(goals);
  });

  it('keeps its own arithmetic: rate and factor are goals and games over the weighted games', () => {
    for (const a of all.values()) {
      expect(a.averageGames, a.slug).toBeGreaterThan(0);
      expect(a.perGame, a.slug).toBeCloseTo(a.goals / a.averageGames, 9);
      expect(a.factor, a.slug).toBeCloseTo(a.games / a.averageGames, 9);
    }
  });
});
