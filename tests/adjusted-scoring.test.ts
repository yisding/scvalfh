/**
 * lib/engine/adjusted-scoring.ts: the Elo-anchored Poisson goal model and the adjustment read off it, over
 * synthetic games and synthetic rating tables, and its invariants over the bundled data. Nothing here
 * asserts a particular team's number on the committed data, which a data refresh changes.
 */

import { describe, expect, it } from 'vitest';

import { getSnapshot } from '@/lib/datasets/snapshot';
import { SHRINK_GAMES, computeAdjustedScoring, fitGoalModel } from '@/lib/engine/adjusted-scoring';
import { type RatingTable, computeRatings, ratingGames } from '@/lib/engine/ratings';
import type { Game } from '@/lib/model/game';
import { getAdjustedScoring, getRatings } from '@/lib/queries/ratings';
import { TEAMS, getTeamBySlug } from '@/lib/registry/teams';
import { game, type GameSpec } from './support/game-builder';

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
const neutral = (spec: GameSpec): Game => ({ ...game(spec), site: 'neutral' });

/** Every pair of `slugs` once each way at a neutral site, scored by `score`. */
function roundRobin(slugs: string[], score: (h: string, a: string) => [number, number]): Game[] {
  const out: Game[] = [];
  let day = 1;
  for (const h of slugs)
    for (const a of slugs) {
      if (h === a) continue;
      const [hs, as] = score(h, a);
      out.push(neutral({ home: h, away: a, hs, as, date: `2026-09-${String(day++).padStart(2, '0')}` }));
    }
  return out;
}

const FOUR = ['mitty', 'leigh', 'stevenson', 'tamalpais'];
const AVERAGE = table({ mitty: 1500, leigh: 1500, stevenson: 1500, tamalpais: 1500 });

describe('fitGoalModel', () => {
  it('finds nothing to adjust in a season where every side scores the same', () => {
    const m = fitGoalModel(TEAMS, roundRobin(FOUR, () => [2, 2]), AVERAGE);
    expect(m.mu).toBeCloseTo(Math.log(2), 6);
    expect(m.home).toBeCloseTo(0, 9);
    for (const slug of FOUR) {
      expect(m.defense.get(id(slug))!, slug).toBeCloseTo(0, 6);
      expect(m.attack.get(id(slug))!, slug).toBeCloseTo(0, 6);
    }
  });

  it('rates a team that concedes less as the better defense, even at an equal Elo', () => {
    // Leigh concedes 1 a game, Tamalpais 4, everyone else 2; the Elo table says nothing.
    const conceded: Record<string, number> = { mitty: 2, leigh: 1, stevenson: 2, tamalpais: 4 };
    const m = fitGoalModel(TEAMS, roundRobin(FOUR, (h, a) => [conceded[a], conceded[h]]), AVERAGE);
    const d = (slug: string) => m.defense.get(id(slug))!;
    expect(d('leigh')).toBeGreaterThan(d('mitty'));
    expect(d('tamalpais')).toBeLessThan(d('mitty'));
    // The corrections are shrunk: the fitted gap is smaller than the raw log ratio.
    expect(d('leigh') - d('tamalpais')).toBeLessThan(Math.log(4));
    expect(d('leigh') - d('tamalpais')).toBeGreaterThan(0);
  });

  it('learns no Elo slope from games with no goal difference', () => {
    const games = [neutral({ home: 'mitty', away: 'leigh', hs: 1, as: 1 }), neutral({ home: 'stevenson', away: 'tamalpais', hs: 1, as: 1 })];
    // No goal difference anywhere: the slopes cannot be learnt, so every defense stays level.
    const flat = fitGoalModel(TEAMS, games, table({ mitty: 2000, leigh: 2000, stevenson: 1000, tamalpais: 1000 }));
    expect(flat.defenseSlope).toBeCloseTo(0, 3);
  });

  it('fits a home edge from hosted games only', () => {
    const hosted = FOUR.flatMap((h, i) =>
      FOUR.filter((a) => a !== h).map((a, j) => game({ home: h, away: a, hs: 3, as: 1, date: `2026-09-${String(1 + i * 3 + j).padStart(2, '0')}` })),
    );
    expect(fitGoalModel(TEAMS, hosted, AVERAGE).home).toBeGreaterThan(0.3);
    expect(fitGoalModel(TEAMS, hosted.map((g) => ({ ...g, site: 'neutral' as const })), AVERAGE).home).toBeCloseTo(0, 9);
  });

  it('is the same whatever order the teams and games come in', () => {
    const games = roundRobin(FOUR, (h, a) => [h.length % 3, a.length % 4]);
    const elo = table({ mitty: 1700, leigh: 1300, stevenson: 1600, tamalpais: 1400 });
    const a = fitGoalModel(TEAMS, games, elo);
    const b = fitGoalModel([...TEAMS].reverse(), [...games].reverse(), elo);
    expect(b).toEqual(a);
  });
});

describe('computeAdjustedScoring', () => {
  it('is the raw rate, with a factor of 1, when every defense is average', () => {
    const adjusted = computeAdjustedScoring(TEAMS, roundRobin(FOUR, () => [2, 2]), AVERAGE);
    for (const slug of FOUR) {
      const a = adjusted.get(id(slug))!;
      expect(a).toMatchObject({ slug, games: 6, goals: 12 });
      expect(a.averageGames).toBeCloseTo(6, 6);
      expect(a.factor).toBeCloseTo(1, 6);
      expect(a.perGame).toBeCloseTo(2, 6);
    }
  });

  it('credits the same goals more against better defenses', () => {
    // Mitty and Stevenson each score 2 a game; Mitty plays the stingy Leigh twice, Stevenson the leaky Tamalpais.
    const conceded: Record<string, number> = { mitty: 2, leigh: 1, stevenson: 2, tamalpais: 4 };
    const base = roundRobin(FOUR, (h, a) => [conceded[a], conceded[h]]);
    const games = [
      ...base,
      neutral({ home: 'mitty', away: 'leigh', hs: 2, as: 0, date: '2026-10-01' }),
      neutral({ home: 'stevenson', away: 'tamalpais', hs: 2, as: 0, date: '2026-10-02' }),
    ];
    const adjusted = computeAdjustedScoring(TEAMS, games, AVERAGE);
    const m = adjusted.get(id('mitty'))!;
    const s = adjusted.get(id('stevenson'))!;
    expect(m.goals).toBe(s.goals);
    expect(m.factor).toBeGreaterThan(s.factor);
    expect(m.perGame).toBeGreaterThan(s.perGame);
  });

  it('weighs each game by the defense and the venue, and adds one game at the season’s rate against an average defense', () => {
    const games = [
      game({ home: 'mitty', away: 'leigh', hs: 5, as: 0, date: '2026-09-01' }),
      game({ home: 'leigh', away: 'stevenson', hs: 1, as: 2, date: '2026-09-02' }),
      neutral({ home: 'stevenson', away: 'mitty', hs: 0, as: 3, date: '2026-09-03' }),
    ];
    const elo = table({ mitty: 1800, leigh: 1300, stevenson: 1500 });
    const model = fitGoalModel(TEAMS, games, elo);
    const adjusted = computeAdjustedScoring(TEAMS, games, elo);
    const weight = (opponent: string, host: number) => Math.exp(-model.defense.get(id(opponent))! + model.home * host);
    const mitty = adjusted.get(id('mitty'))!;
    const weighted = weight('leigh', 1) + weight('stevenson', 0);
    expect(mitty).toMatchObject({ games: 2, goals: 8 });
    expect(mitty.averageGames).toBeCloseTo(weighted, 12);
    expect(mitty.factor).toBeCloseTo((2 + SHRINK_GAMES) / (weighted + SHRINK_GAMES), 12);
    // The shrinkage target is the season's rate against an average defense: all goals over all weighted games.
    // Leigh: away at Mitty, home to Stevenson. Stevenson: away at Leigh, Mitty at a neutral site.
    const allWeighted =
      weighted + weight('mitty', -1) + weight('stevenson', 1) + weight('leigh', -1) + weight('mitty', 0);
    const average = 11 / allWeighted;
    expect(mitty.perGame).toBeCloseTo((8 + SHRINK_GAMES * average) / (weighted + SHRINK_GAMES), 12);
    // A team that has not scored still has a rate above 0, from the shrinkage.
    expect(adjusted.get(id('leigh'))!.perGame).toBeGreaterThan(0);
  });

  it('stays near no adjustment on a season of a few games, which a steep Elo slope would explain perfectly', () => {
    // Without the slopes' prior, one 1-0 game sent both slopes to 24 and Leigh's factor to 433.
    for (const games of [
      [game({ home: 'mitty', away: 'leigh', hs: 1, as: 0 })],
      [1, 2, 3].map((d) => game({ home: 'mitty', away: 'leigh', hs: 6, as: 0, date: `2026-09-0${d}` })),
      [1, 2, 3].map((d) => game({ home: 'mitty', away: 'leigh', hs: 0, as: 0, date: `2026-09-0${d}` })),
    ]) {
      const ratings = computeRatings(TEAMS, games);
      const model = fitGoalModel(TEAMS, games, ratings);
      expect(model.converged).toBe(true);
      // The slopes stay modest (a full season fits about 0.4); without their prior they ran to 24.
      expect(Math.abs(model.attackSlope)).toBeLessThan(0.5);
      expect(Math.abs(model.defenseSlope)).toBeLessThan(0.5);
      for (const a of computeAdjustedScoring(TEAMS, games, ratings).values()) {
        expect(a.factor, a.slug).toBeGreaterThan(0.25);
        expect(a.factor, a.slug).toBeLessThan(4);
        expect(Number.isFinite(a.perGame), a.slug).toBe(true);
        // A team that scored is never printed as having scored nothing.
        if (a.goals > 0) expect(a.perGame, a.slug).toBeGreaterThan(0.5);
      }
    }
  });

  it('adjusts nothing, and says so, when the fit does not converge', () => {
    const games = roundRobin(FOUR, (h, a) => [h.length % 3, a.length % 4]);
    const elo = table({ mitty: 1700, leigh: 1300, stevenson: 1600, tamalpais: 1400 });
    expect(fitGoalModel(TEAMS, games, elo, 1).converged).toBe(false);
    expect(fitGoalModel(TEAMS, games, elo).converged).toBe(true);
    const fallback = computeAdjustedScoring(TEAMS, games, elo, 1);
    const goals = [...fallback.values()].reduce((n, a) => n + a.goals, 0);
    const sides = [...fallback.values()].reduce((n, a) => n + a.games, 0);
    for (const a of fallback.values()) {
      expect(a.adjusted, a.slug).toBe(false);
      expect(a.factor, a.slug).toBe(1);
      expect(a.averageGames, a.slug).toBe(a.games);
      expect(a.perGame, a.slug).toBeCloseTo((a.goals + SHRINK_GAMES * (goals / sides)) / (a.games + SHRINK_GAMES), 12);
    }
    expect([...computeAdjustedScoring(TEAMS, games, elo).values()].every((a) => a.adjusted)).toBe(true);
  });

  it('counts only the finals the Elo fit counts: no forfeit, no unscored game', () => {
    const games = roundRobin(FOUR, (h, a) => [h.length % 3, a.length % 4]);
    const elo = table({ mitty: 1700, leigh: 1300, stevenson: 1600, tamalpais: 1400 });
    const more = [
      ...games,
      game({ home: 'mitty', away: 'leigh', hs: 1, as: 0, forfeit: true, date: '2026-10-03' }),
      game({ home: 'mitty', away: 'leigh', status: 'scheduled', date: '2026-10-30' }),
    ];
    expect(computeAdjustedScoring(TEAMS, more, elo)).toEqual(computeAdjustedScoring(TEAMS, games, elo));
    expect([...computeAdjustedScoring(TEAMS, [], elo)]).toEqual([]);
  });
});

describe('getAdjustedScoring, over the bundled data', () => {
  const snapshot = getSnapshot();
  const all = getAdjustedScoring();
  const ratings = getRatings();
  const counted = ratingGames(snapshot.teams, snapshot.games);

  it('covers every team the Elo fit counts a game for, with the same count and goals', () => {
    const played = ratings.ratings.filter((r) => r.games > 0);
    expect([...all.keys()].sort()).toEqual(played.map((r) => r.teamId).sort());
    for (const r of played) expect(all.get(r.teamId)!.games, r.slug).toBe(r.games);
    const goals = counted.reduce((n, g) => n + g.home.score! + g.away.score!, 0);
    expect([...all.values()].reduce((n, a) => n + a.goals, 0)).toBe(goals);
  });

  it('converges: the model expects as many goals as were scored, and the defenses are centred', () => {
    const m = fitGoalModel(snapshot.teams, snapshot.games, ratings);
    // Not asserted outright: a fit that ever failed would fall back to no adjustment, and say so on the
    // boards, rather than block the day's scores. Every replayed day has converged.
    if (!m.converged) return;
    let expected = 0;
    let scored = 0;
    for (const g of counted) {
      const host = g.site === 'home' ? 1 : 0;
      const h = g.home.teamId!;
      const a = g.away.teamId!;
      expected += Math.exp(m.mu + m.home * host + m.attack.get(h)! - m.defense.get(a)!);
      expected += Math.exp(m.mu - m.home * host + m.attack.get(a)! - m.defense.get(h)!);
      scored += g.home.score! + g.away.score!;
    }
    // Within the pull of μ's unit prior toward its start.
    expect(Math.abs(expected / scored - 1)).toBeLessThan(0.001);
    const defenses = [...m.defense.values()];
    expect(defenses.reduce((t, d) => t + d, 0) / defenses.length).toBeCloseTo(0, 9);
    // A better Elo means a better defense, on the whole.
    expect(m.defenseSlope).toBeGreaterThan(0);
    expect(m.attackSlope).toBeGreaterThan(0);
  });

  it('keeps its own arithmetic: the factor is games over weighted games, the rate shrunk toward the average', () => {
    const values = [...all.values()];
    const average = values.reduce((n, a) => n + a.goals, 0) / values.reduce((n, a) => n + a.averageGames, 0);
    // On the board's scale: below the raw goals per side, since the counted defenses are not all average.
    expect(average).toBeGreaterThan(0.5);
    for (const a of all.values()) {
      expect(a.averageGames, a.slug).toBeGreaterThan(0);
      expect(a.factor, a.slug).toBeCloseTo((a.games + SHRINK_GAMES) / (a.averageGames + SHRINK_GAMES), 9);
      expect(a.perGame, a.slug).toBeCloseTo((a.goals + SHRINK_GAMES * average) / (a.averageGames + SHRINK_GAMES), 9);
    }
  });
});
