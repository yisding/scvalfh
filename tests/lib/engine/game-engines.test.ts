import { describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import { teamForm } from '@/lib/engine/form';
import { headToHead } from '@/lib/engine/head-to-head';
import { PHASE_RANK, combinedPhase, seasonPhase } from '@/lib/engine/phase';
import type { Game, Outcome } from '@/lib/model/game';
import type { SeasonPhase } from '@/lib/model/season';
import { getTeamBySlug } from '@/lib/registry/teams';
import { bumpRecord, byDateLocal, byDateThenId, involvesTeam, sideView } from '@/lib/shared/game';
import { game } from '@/tests/support/game-builder';

const team = (slug: string) => getTeamBySlug(slug)!;

describe('sideView: a game from one team’s side', () => {
  it('reads goals, outcome and site from either side, and is null for a stranger', () => {
    const g = game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 2 });
    const home = sideView(g, team('saint-francis').id);
    expect(home).toEqual({ for: 7, against: 2, outcome: 'W', site: 'home' });
    expect(sideView(g, team('homestead').id)).toEqual({ for: 2, against: 7, outcome: 'L', site: 'away' });
    expect(sideView(g, team('chico').id)).toBeNull();
    expect(sideView({ ...g, site: 'neutral' }, team('homestead').id)?.site).toBe('neutral');
  });

  it('is null unless the game is final with both scores', () => {
    for (const status of ['scheduled', 'live', 'postponed'] as const) {
      expect(sideView(game({ home: 'chico', away: 'davis', status }), team('chico').id)).toBeNull();
    }
  });

  it('gives a 1 v 1 win to the flagged side while the goals stay level', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'L', away: 'W' } });
    expect(sideView(g, team('davis').id)).toMatchObject({ for: 1, against: 1, outcome: 'W' });
    expect(sideView(g, team('chico').id)).toMatchObject({ for: 1, against: 1, outcome: 'L' });
  });

  it('keeps a forfeit’s W/L and its recorded goals (callers leave the goals out, DESIGN §11.6)', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, forfeit: true });
    expect(sideView(g, team('cupertino').id)).toMatchObject({ for: 1, against: 0, outcome: 'W' });
  });
});

describe('bumpRecord, byDateLocal, involvesTeam', () => {
  it('counts each outcome into its own column', () => {
    const rec = { w: 0, l: 0, t: 0 };
    for (const o of ['W', 'W', 'L', 'T'] as Outcome[]) bumpRecord(rec, o);
    expect(rec).toEqual({ w: 2, l: 1, t: 1 });
  });

  it('byDateLocal ignores the contest id; byDateThenId does not', () => {
    const early = game({ home: 'chico', away: 'davis', hs: 1, as: 0, date: '2026-09-01', contestId: 'ffffffff-0000-4000-8000-000000000001' });
    const lateA = game({ home: 'chico', away: 'davis', hs: 1, as: 0, date: '2026-09-02', contestId: 'ffffffff-0000-4000-8000-000000000002' });
    const lateB = game({ home: 'chico', away: 'davis', hs: 1, as: 0, date: '2026-09-02', contestId: '00000000-0000-4000-8000-0000000000aa' });
    expect(byDateLocal(lateA, lateB)).toBe(0);
    expect([lateA, lateB, early].sort(byDateLocal)).toEqual([early, lateA, lateB]);
    expect([lateA, lateB, early].sort(byDateThenId)).toEqual([early, lateB, lateA]);
  });

  it('involvesTeam matches by id or slug', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 1, as: 0 });
    expect(involvesTeam(g, team('davis'))).toBe(true);
    expect(involvesTeam(g, team('homestead'))).toBe(false);
    expect(involvesTeam({ ...g, away: { ...g.away, teamId: null } }, team('davis'))).toBe(true);
  });
});

describe('headToHead', () => {
  const chico = team('chico');
  const davis = team('davis');
  const games: Game[] = [
    game({ home: 'davis', away: 'chico', hs: 0, as: 2, date: '2026-10-05' }),
    game({ home: 'chico', away: 'davis', hs: 3, as: 1, date: '2026-09-01' }),
    game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } }),
    game({ home: 'chico', away: 'davis', hs: 0, as: 4, date: '2026-10-12', forfeit: true }),
    game({ home: 'chico', away: 'davis', date: '2026-10-20' }),
    game({ home: 'chico', away: 'homestead', hs: 9, as: 0, date: '2026-09-15' }),
  ];

  it('lists the meetings oldest first and sums the finals from A’s side, forfeit goals excluded', () => {
    const h = headToHead(games, chico, davis);
    expect(h.games.map((g) => g.dateKey)).toEqual(['2026-09-01', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-20']);
    expect(h.aRecord).toEqual({ w: 3, l: 1, t: 0 });
    expect(h.bRecord).toEqual({ w: 1, l: 3, t: 0 });
    expect([h.aGoals, h.bGoals]).toEqual([3 + 1 + 2, 1 + 1 + 0]);
    expect(h.summary).toBe(`${chico.shortName} 3-1-0 vs ${davis.shortName}`);
  });

  it('is symmetric: swapping the teams swaps the records and goals', () => {
    const ab = headToHead(games, chico, davis);
    const ba = headToHead(games, davis, chico);
    expect(ba.aRecord).toEqual(ab.bRecord);
    expect(ba.bRecord).toEqual(ab.aRecord);
    expect([ba.aGoals, ba.bGoals]).toEqual([ab.bGoals, ab.aGoals]);
  });

  it('counts a level final with no flags as a tie for both', () => {
    const h = headToHead([game({ home: 'chico', away: 'davis', hs: 0, as: 0, results: { home: 'T', away: 'T' } })], chico, davis);
    expect(h.aRecord).toEqual({ w: 0, l: 0, t: 1 });
    expect(h.bRecord).toEqual({ w: 0, l: 0, t: 1 });
  });
});

describe('teamForm', () => {
  const chico = team('chico');
  it('keeps the counted-division games in date order with margin, outcome and site', () => {
    const games: Game[] = [
      game({ home: 'davis', away: 'chico', hs: 0, as: 2, date: '2026-10-05' }),
      game({ home: 'chico', away: 'davis', hs: 3, as: 1, date: '2026-09-01' }),
      game({ home: 'chico', away: 'davis', date: '2026-10-20' }),
      game({ home: 'chico', away: 'davis', hs: 0, as: 4, date: '2026-10-12', forfeit: true }),
      game({ home: 'homestead', away: 'cupertino', hs: 1, as: 0 }),
    ];
    const { leagueGames } = teamForm(games, chico);
    const counted = leagueGames.map((g) => [g.date, g.site, g.margin, g.outcome, g.excludedFromMargin]);
    expect(counted).toEqual([
      ['2026-09-01', 'home', 2, 'W', false],
      ['2026-10-05', 'away', 2, 'W', false],
      ['2026-10-12', 'home', null, 'L', true],
      ['2026-10-20', 'home', null, null, false],
    ]);
  });
});

describe('seasonPhase and combinedPhase', () => {
  it('a league with no window, or before its first game, is in preseason', () => {
    const scval = getLeague('scval');
    expect(seasonPhase(scval, undefined, '2026-10-01T19:00:00.000Z')).toBe('preseason');
    expect(seasonPhase(scval, { firstGame: null, lastGame: null, lastLeagueGame: null }, '2026-10-01T19:00:00.000Z')).toBe('preseason');
    const window = { firstGame: '2026-09-02T16:00:00', lastGame: '2026-10-01T16:00:00', lastLeagueGame: '2026-10-01T16:00:00' };
    expect(seasonPhase(scval, window, '2026-08-01T19:00:00.000Z')).toBe('preseason');
    expect(seasonPhase(scval, window, '2026-09-20T19:00:00.000Z')).toBe('regular');
  });

  it('combines per the rule: all preseason, all complete, else the least advanced started phase', () => {
    const c = (...p: SeasonPhase[]) => combinedPhase(p);
    expect(c('preseason', 'preseason')).toBe('preseason');
    expect(c('complete', 'complete')).toBe('complete');
    expect(c('complete', 'preseason')).toBe('preseason');
    expect(c('playoffs', 'regular', 'preseason')).toBe('regular');
    expect(c('playoffs', 'tournament', 'complete')).toBe('tournament');
    expect(c('tournament', 'crossover')).toBe('tournament');
    expect(PHASE_RANK.preseason).toBeLessThan(PHASE_RANK.complete);
  });
});
