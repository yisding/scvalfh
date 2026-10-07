/**
 * lib/ratings.ts (DESIGN §20): the Elo-scale fit over synthetic games, the start from a synthetic
 * last season, and its invariants over the bundled snapshot and prior season. Nothing here asserts
 * a particular team's number on the committed data, which a data refresh changes.
 */

import { describe, expect, it } from 'vitest';

import { getSnapshot } from '../lib/data';
import { getPriorSeason } from '../lib/prior-season';
import type { PriorGame, PriorSeason } from '../lib/prior-season-schema';
import {
  ELO_BASE,
  ELO_PER_GOAL,
  MARGIN_CAP,
  computeRatings,
  getRatings,
  ratingGames,
  type RatingTable,
} from '../lib/ratings';
import { TEAMS, getTeamBySlug } from '../lib/teams';
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
    expect(computeRatings(TEAMS, [])).toEqual({
      ratings: [],
      homeEdge: 0,
      games: 0,
      through: null,
      seededFrom: null,
      priorGames: 0,
    });
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

  it('leaves out games against schools outside the five leagues', () => {
    const inside = neutral({ home: 'homestead', away: 'saratoga', hs: 2, as: 1 });
    const g = neutral({ home: 'homestead', away: 'fremont', hs: 0, as: 9 });
    const outside: Game = {
      ...g,
      away: { ...g.away, teamId: null, slug: null, name: 'Gunn' },
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

// ---------------------------------------------------------------- the start from last season

let priorSeq = 0;
/** A last-season final between two registry slugs. */
function priorGame(home: string, away: string, hs: number, as: number, site: 'home' | 'neutral' = 'neutral'): PriorGame {
  const h = getTeamBySlug(home)!;
  const a = getTeamBySlug(away)!;
  priorSeq += 1;
  return {
    contestId: `prior-${priorSeq}`,
    date: `2025-09-${String((priorSeq % 28) + 1).padStart(2, '0')}`,
    homeId: h.id,
    homeSlug: h.slug,
    awayId: a.id,
    awaySlug: a.slug,
    homeScore: hs,
    awayScore: as,
    site,
  };
}

function priorOf(games: PriorGame[]): PriorSeason {
  return {
    season: '2025-26',
    maxprepsYear: '25-26',
    sportSeasonId: 'x',
    source: 'maxpreps-api',
    fetchedAt: '2025-12-01T00:00:00.000Z',
    excluded: { deleted: 0, notFinal: 0, outsideRegistry: 0, forfeit: 0, unscored: 0, excludedByConfig: 0 },
    games,
  };
}

describe('computeRatings — the start from last season', () => {
  const last = priorOf([
    priorGame('fremont', 'saratoga', 4, 0),
    priorGame('fremont', 'homestead', 2, 0),
    priorGame('homestead', 'saratoga', 2, 0),
  ]);

  it('rates a team with no result yet this season at its rating from last season (preseason)', () => {
    const t = computeRatings(TEAMS, [], last);
    expect(t.seededFrom).toBe('2025-26');
    expect(t.priorGames).toBe(3);
    expect(t.ratings.map((r) => [r.slug, r.games, r.seeded])).toEqual([
      ['fremont', 0, true],
      ['homestead', 0, true],
      ['saratoga', 0, true],
    ]);
    // In full: the same fit over last season's games, played as this season's, gives the same numbers.
    const asThisSeason = computeRatings(
      TEAMS,
      last.games.map((g) => neutral({ home: g.homeSlug, away: g.awaySlug, hs: g.homeScore, as: g.awayScore })),
    );
    expect(t.ratings.map((r) => [r.slug, r.elo])).toEqual(asThisSeason.ratings.map((r) => [r.slug, r.elo]));
  });

  it('lets this season’s results move a team off its start, more with every game', () => {
    const start = eloOf(computeRatings(TEAMS, [], last), 'saratoga')!;
    const upset = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        neutral({ home: 'saratoga', away: 'fremont', hs: 2, as: 0, date: `2026-09-${String(i + 1).padStart(2, '0')}` }),
      );
    const once = eloOf(computeRatings(TEAMS, upset(1), last), 'saratoga')!;
    const often = eloOf(computeRatings(TEAMS, upset(6), last), 'saratoga')!;
    expect(once).toBeGreaterThan(start);
    expect(often).toBeGreaterThan(once);
    expect(eloOf(computeRatings(TEAMS, upset(6), last), 'saratoga')).toBeGreaterThan(
      eloOf(computeRatings(TEAMS, upset(6), last), 'fremont')!,
    );
  });

  it('starts a team last season never saw at average, and counts only this season’s games', () => {
    const t = computeRatings(TEAMS, [neutral({ home: 'los-gatos', away: 'fremont', hs: 1, as: 1 })], last);
    const lg = t.ratings.find((r) => r.slug === 'los-gatos')!;
    expect(lg).toMatchObject({ games: 1, seeded: false });
    expect(t.ratings.find((r) => r.slug === 'fremont')).toMatchObject({ games: 1, seeded: true });
    expect(t.games).toBe(1);
  });

  it('gives the same numbers whatever order last season’s games arrive in', () => {
    const shuffled = priorOf([...last.games].reverse());
    const games = [neutral({ home: 'saratoga', away: 'homestead', hs: 1, as: 0 })];
    expect(computeRatings(TEAMS, games, shuffled)).toEqual(computeRatings(TEAMS, games, last));
  });
});

describe('getRatings over the bundled snapshot', () => {
  const snapshot = getSnapshot();
  const table = getRatings();
  const counted = ratingGames(snapshot.teams, snapshot.games);

  it('rates every team with a counted final or a game last season, highest first, averaging 1500', () => {
    const prior = getPriorSeason();
    const played = new Set([
      ...counted.flatMap((g) => [g.home.teamId, g.away.teamId]),
      ...prior.games.flatMap((g) => [g.homeId, g.awayId]),
    ]);
    expect(new Set(table.ratings.map((r) => r.teamId))).toEqual(played);
    expect(table.seededFrom).toBe(prior.season);
    expect(table.priorGames).toBe(prior.games.length);
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
