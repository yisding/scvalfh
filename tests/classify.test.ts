/** Classification (SPEC §5.1): postseason tags, then countsFor, decided once and persisted. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { postseasonTagOf } from '../components/ui/describe-game';
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

  it('never tags an NCS (MCAL) team’s contestType 4 game outside the MCAL tournament as CCS', () => {
    // An MCAL team against a non-registry opponent (a showcase, an out-of-section event): 'other'.
    const base = game({ home: 'tamalpais', away: 'redwood', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    const outside: Game = {
      ...base,
      away: { ...base.away, teamId: '11111111-2222-4333-8444-555555555555', slug: null, name: 'Outside Prep' },
      leagueDivision: null,
      postseason: null,
    };
    const tag = postseasonTag(outside);
    expect(tag).toEqual({ kind: 'other', leagueId: null, via: 'contest-type-4' });
    expect(postseasonTagOf({ postseason: tag })).toBeNull();
    // An MCAL team against a CCS team: not a CCS game either.
    const vsCcs = game({ home: 'tamalpais', away: 'leigh', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    expect(vsCcs.postseason).toEqual({ kind: 'other', leagueId: null, via: 'contest-type-4' });
    expect(postseasonTagOf(vsCcs)).toBeNull();
    // A CCS team against a non-registry opponent is still CCS.
    const ccsBase = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    const ccsOutside: Game = {
      ...ccsBase,
      away: { ...ccsBase.away, teamId: '11111111-2222-4333-8444-555555555555', slug: null, name: 'Outside Prep' },
      leagueDivision: null,
      postseason: null,
    };
    expect(postseasonTag(ccsOutside)).toEqual({ kind: 'ccs', leagueId: null, via: 'contest-type-4' });
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

describe('classify: EAL (contest-type evidence, no official schedule)', () => {
  it('counts a game MaxPreps marks a league game between two EAL teams, with no official stamp', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 2, as: 1, date: '2026-09-21' });
    expect(g.official).toBeUndefined();
    expect(g.postseason).toBeNull();
    expect(g.countsFor).toBe('eal');
    // The last scheduled league day still counts.
    expect(game({ home: 'davis', away: 'pleasant-valley', hs: 0, as: 1, date: '2026-10-28' }).countsFor).toBe('eal');
  });

  it('counts a 1 v 1 win like any other league game', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } });
    expect(g.decider).toBe('SO');
    expect(g.countsFor).toBe('eal');
  });

  it('never counts a game MaxPreps does not mark as a league game', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 2, as: 1, league: false });
    expect(g.leagueDivision).toBe('eal');
    expect(g.countsFor).toBeNull();
  });

  it('never counts a contestType 2, 4 or 5 row (tournament, postseason, 2025’s EAL tournament code)', () => {
    for (const ct of [2, 4, 5]) {
      const one = game({ home: 'lassen', away: 'corning', hs: 3, as: 0, date: '2026-09-15', contestTypes: { home: 0, away: ct } });
      expect(one.isLeague, `contestType ${ct}`).toBe(true);
      expect(one.countsFor, `contestType ${ct}`).toBeNull();
    }
  });

  it('tags a contestType 4 game between two EAL teams as the league’s postseason', () => {
    const g = game({ home: 'chico', away: 'pleasant-valley', hs: 1, as: 0, date: '2026-10-20', contestTypes: { home: 4, away: 4 } });
    expect(g.postseason).toEqual({ kind: 'league-postseason', leagueId: 'eal', via: 'contest-type-4' });
    expect(g.countsFor).toBeNull();
  });

  it('tags a game between two EAL teams on or after Oct 30 as the Super Regional, not a league game', () => {
    for (const date of ['2026-10-30', '2026-10-31']) {
      const g = game({ home: 'chico', away: 'pleasant-valley', hs: 2, as: 1, date });
      expect(g.postseason).toEqual({ kind: 'league-postseason', leagueId: 'eal', via: 'league-postseason-window' });
      expect(g.countsFor).toBeNull();
    }
    const before = game({ home: 'chico', away: 'pleasant-valley', hs: 2, as: 1, date: '2026-10-29' });
    expect(before.postseason).toBeNull();
    expect(before.countsFor).toBe('eal');
  });

  it('tags an EAL team’s contestType 4 game against a CCS team as other, never CCS or the EAL postseason', () => {
    const g = game({ home: 'chico', away: 'cupertino', hs: 1, as: 0, contestTypes: { home: 4, away: 4 } });
    expect(g.postseason).toEqual({ kind: 'other', leagueId: null, via: 'contest-type-4' });
    expect(g.countsFor).toBeNull();
    const mcal = game({ home: 'davis', away: 'tamalpais', hs: 1, as: 0, date: '2026-10-31' });
    expect(mcal.postseason).toBeNull();
    expect(mcal.countsFor).toBeNull();
  });

  it('never gives SCVAL the league-postseason tag', () => {
    const late = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, date: '2026-10-31' });
    expect(late.postseason).toBeNull();
    expect(late.countsFor).toBe('de-anza');
    const ct4 = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, contestTypes: { home: 4, away: 0 } });
    expect(ct4.postseason).toEqual({ kind: 'ccs', leagueId: 'scval', via: 'contest-type-4' });
    expect(ct4.countsFor).toBeNull();
    // SCVAL excludes no contest type: a contestType 2 row MaxPreps also flags 0 still counts.
    const ct2 = game({ home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, contestTypes: { home: 0, away: 2 } });
    expect(ct2.countsFor).toBe('de-anza');
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
