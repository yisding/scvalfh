/** Classification (SPEC §5.1): postseason tags, then countsFor, decided once and persisted. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  classifyGame,
  classifyGames,
  isLeagueGame,
  leaguesOf,
  postseasonTag,
} from '../lib/classify';
import type { Game } from '../lib/types';
import { game } from './game-builder';

/** A contest MCAL has declared a league game despite its Oct 23 postseason window. */
const { OVERRIDE_ID } = vi.hoisted(() => ({ OVERRIDE_ID: '00000000-0000-4000-8000-0000000c0de1' }));

// Adds one leagueGameOverrides entry to MCAL; every other value is the real config.
vi.mock('../lib/leagues', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/leagues')>();
  return {
    ...actual,
    LEAGUES: actual.LEAGUES.map((l) =>
      l.id === 'mcal'
        ? { ...l, rules: { ...l.rules, leagueGameOverrides: [...l.rules.leagueGameOverrides, OVERRIDE_ID] } }
        : l,
    ),
  };
});

describe('classify: official-fixtures leagues (BVAL, PCAL, MCAL)', () => {
  it('counts a stamped Live Oak–Prospect final for Santa Teresa even when MaxPreps types it non-league', () => {
    const g = game({
      home: 'live-oak', away: 'prospect', hs: 2, as: 1, date: '2026-09-29',
      league: false, contestTypes: { home: 1, away: 1 },
    });
    expect(g.official?.division).toBe('santa-teresa');
    expect(g.postseason).toBeNull();
    expect(g.countsFor).toBe('santa-teresa');
    expect(classifyGame(g)).toBe('santa-teresa');
  });

  it('never counts by membership alone', () => {
    const g = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, official: null });
    expect(g.leagueDivision).toBe('mt-hamilton');
    expect(g.isLeague).toBe(true);
    expect(g.countsFor).toBeNull();
  });

  it.each([
    ['bval', 'leigh', 'leland'],
    ['pcal', 'carmel', 'salinas'],
    ['mcal', 'tamalpais', 'redwood'],
  ])('never counts contestType 2 or 4 for %s', (_league, home, away) => {
    for (const ct of [2, 4]) {
      const one = game({ home, away, hs: 1, as: 0, contestTypes: { home: 0, away: ct } });
      expect(one.countsFor, `contestType ${ct}`).toBeNull();
    }
  });

  it('tags a contestType 4 game: MCAL tournament inside MCAL, CCS elsewhere', () => {
    const mcal = game({ home: 'tamalpais', away: 'redwood', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    expect(mcal.postseason).toEqual({ kind: 'mcal-tournament', leagueId: 'mcal', via: 'contest-type-4' });
    const bval = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, contestTypes: { home: 4, away: 0 } });
    expect(bval.postseason).toEqual({ kind: 'ccs', leagueId: 'bval', via: 'contest-type-4' });
    const cross = game({ home: 'leigh', away: 'cupertino', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    expect(cross.postseason).toEqual({ kind: 'ccs', leagueId: null, via: 'contest-type-4' });
  });

  it('treats an MCAL pair on or after Oct 23 as the MCAL tournament, not a league game', () => {
    const g = game({ home: 'tamalpais', away: 'redwood', hs: 2, as: 1, date: '2026-10-24' });
    expect(g.postseason).toEqual({ kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' });
    expect(g.countsFor).toBeNull();
    const before = game({ home: 'tamalpais', away: 'redwood', hs: 2, as: 1, date: '2026-10-22' });
    expect(before.postseason).toBeNull();
    expect(before.countsFor).toBe('marin-county');
  });

  it('counts a late MCAL game listed in leagueGameOverrides', () => {
    const g = game({ home: 'tamalpais', away: 'redwood', hs: 2, as: 1, date: '2026-10-24', contestId: OVERRIDE_ID });
    expect(g.postseason).toBeNull();
    expect(g.countsFor).toBe('marin-county');
  });

  it('a degraded division falls back to contest-type, never to membership', () => {
    const degradedDivisions = new Set(['mt-hamilton']);
    const typed = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, official: null, league: true });
    const untyped = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, official: null, league: false });
    expect(classifyGame(typed, { degradedDivisions })).toBe('mt-hamilton');
    expect(classifyGame(untyped, { degradedDivisions })).toBeNull();
    expect(classifyGame(typed)).toBeNull();
    // A degraded division still never counts a postseason or excluded contest.
    const ct2 = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, official: null, contestTypes: { home: 2, away: 0 } });
    expect(classifyGame(ct2, { degradedDivisions })).toBeNull();
  });
});

describe('classify: SCVAL (contest-type evidence)', () => {
  it('a Fremont–Cupertino final MaxPreps types non-league counts for nothing', () => {
    const g = game({ home: 'fremont', away: 'cupertino', hs: 2, as: 2, date: '2026-08-28', league: false });
    expect(g.official).toBeUndefined();
    expect(g.countsFor).toBeNull();
  });

  it('tags an Oct 30 De Anza–El Camino game as the crossover', () => {
    const g = game({ home: 'saint-francis', away: 'mitty', hs: 1, as: 0, date: '2026-10-30', league: false });
    expect(g.postseason).toEqual({ kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' });
    expect(g.countsFor).toBeNull();
  });

  it('tags an Oct 31 Santa Teresa–Mt. Hamilton game as the BVAL play-in', () => {
    const g = game({ home: 'live-oak', away: 'gilroy', hs: 1, as: 0, date: '2026-10-31' });
    expect(g.postseason).toEqual({ kind: 'bval-play-in', leagueId: 'bval', via: 'config-pairing' });
  });

  it('tags a De Anza pair on or after Nov 7 as CCS and does not count it', () => {
    for (const date of ['2026-11-07', '2026-11-14']) {
      const g = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, date });
      expect(g.postseason).toEqual({ kind: 'ccs', leagueId: 'scval', via: 'ccs-window' });
      expect(g.countsFor).toBeNull();
    }
    const before = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, date: '2026-11-06' });
    expect(before.countsFor).toBe('de-anza');
  });

  it('reduces to isLeague && leagueDivision on every committed v1 game', () => {
    const raw = JSON.parse(
      readFileSync(path.join(import.meta.dirname, 'golden', 'snapshot-2026-10-02.v1.json'), 'utf8'),
    ) as { games: Game[] };
    const v1Games = raw.games.map((g) => ({
      ...g,
      contestTypes: { home: null, away: null },
      postseason: null,
      countsFor: null,
    }));
    const classified = classifyGames(v1Games);
    expect(classified).toHaveLength(v1Games.length);
    for (const g of classified) {
      expect(g.postseason, g.contestId).toBeNull();
      expect(g.countsFor, g.contestId).toBe(g.isLeague ? g.leagueDivision : null);
    }
  });
});

describe('classify: helpers', () => {
  it('lists the leagues of the registry sides', () => {
    expect(leaguesOf(game({ home: 'leigh', away: 'cupertino' }))).toEqual(['bval', 'scval']);
    expect(leaguesOf(game({ home: 'tamalpais', away: 'redwood' }))).toEqual(['mcal']);
    const g = game({ home: 'leigh', away: 'cupertino' });
    expect(leaguesOf({ ...g, away: { ...g.away, teamId: null, slug: null, name: 'Scripps Ranch' } })).toEqual(['bval']);
  });

  it('keeps an existing postseason tag and computes a missing one', () => {
    const g = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, date: '2026-10-01' });
    const tagged = classifyGames([{ ...g, postseason: { kind: 'other', leagueId: null, via: 'contest-type-4' } }]);
    expect(tagged[0].postseason?.kind).toBe('other');
    expect(postseasonTag(g)).toBeNull();
  });

  it('isLeagueGame reads countsFor only', () => {
    expect(isLeagueGame({ countsFor: 'de-anza' })).toBe(true);
    expect(isLeagueGame({ countsFor: null })).toBe(false);
  });
});
