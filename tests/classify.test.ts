/** Classification (SPEC §5.1): postseason tags, then countsFor, decided once and persisted. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { postseasonTagOf } from '../components/ui/describe-game';
import {
  classifyGame,
  classifyGames,
  contradictedRecap,
  crossDivisionNote,
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

describe('classify: the LA independents (membership, DESIGN §24.10)', () => {
  it('counts a game between two independents inside the group’s span, flagged by MaxPreps or not', () => {
    // Harvard-Westlake 5, Glendora 0 on Sep 8 (MaxPreps: non-league) and Bonita 2, Chaminade 1 on Sep 29 (MaxPreps:
    // a Sunset league game): both count for the group's table.
    for (const league of [true, false]) {
      const g = game({ home: 'harvard-westlake', away: 'glendora', hs: 5, as: 0, date: '2026-09-08', league });
      expect(g.leagueDivision, `league flag ${league}`).toBe('independents');
      expect(g.countsFor, `league flag ${league}`).toBe('independents');
      expect(classifyGame(g), `league flag ${league}`).toBe('independents');
      expect(g.postseason).toBeNull();
    }
    expect(game({ home: 'chaminade', away: 'bonita', hs: 1, as: 2, date: '2026-09-29' }).countsFor).toBe('independents');
    // A tournament row never counts; nor does a game before the group's first (Sep 8).
    expect(
      game({ home: 'harvard-westlake', away: 'glendora', hs: 5, as: 0, date: '2026-09-08', contestTypes: { home: 2, away: 2 } }).countsFor,
    ).toBeNull();
    expect(game({ home: 'harvard-westlake', away: 'glendora', hs: 5, as: 0, date: '2026-09-01', league: false }).countsFor).toBeNull();
  });

  it('counts no game against a league team, flagged or not, and leaves that team’s league untouched', () => {
    const g = game({ home: 'great-oak', away: 'harvard-westlake', hs: 2, as: 4, date: '2026-08-18' });
    expect(g.countsFor).toBeNull();
    // Bonita at Great Oak, Aug 27: MaxPreps marks it a Sunset league game; Bonita is an independent here, so it
    // counts for neither table.
    const flagged = game({ home: 'great-oak', away: 'bonita', hs: 1, as: 0, date: '2026-08-27' });
    expect(flagged.leagueDivision).toBeNull();
    expect(flagged.countsFor).toBeNull();
    const sunset = game({ home: 'great-oak', away: 'chaparral', hs: 6, as: 0, date: '2026-09-11' });
    expect(sunset.countsFor).toBe('sunset');
  });
});

describe('classify: San Diego (membership, DESIGN-socal §2.1.7)', () => {
  // City Western's leaguePlay is Sep 1 – Oct 30; every pair of division-mates meets twice on MaxPreps'
  // schedules, flagged by MaxPreps or not.
  it('counts a game between two City Western teams whether or not MaxPreps flags it a league game', () => {
    const flagged = game({ home: 'la-jolla', away: 'scripps-ranch', hs: 2, as: 1, date: '2026-09-15' });
    expect(flagged.countsFor).toBe('city-western');
    const unflagged = game({
      home: 'la-jolla', away: 'scripps-ranch', hs: 2, as: 1, date: '2026-09-15',
      league: false, contestTypes: { home: 1, away: 1 },
    });
    expect(unflagged.isLeague).toBe(false);
    expect(unflagged.countsFor).toBe('city-western');
    // Patrick Henry: MaxPreps flags none of its league games (inventory read Mon Oct 5 Pacific).
    const henry = game({ home: 'patrick-henry', away: 'point-loma', hs: 0, as: 3, date: '2026-09-22', league: false });
    expect(henry.countsFor).toBe('city-eastern');
    expect(henry.official).toBeUndefined();
  });

  it('never counts a tournament (contestType 2) or postseason (4) row, on either side', () => {
    for (const types of [{ home: 2, away: 2 }, { home: 0, away: 2 }, { home: 1, away: 4 }]) {
      const g = game({ home: 'la-jolla', away: 'scripps-ranch', hs: 1, as: 0, date: '2026-09-15', contestTypes: types });
      expect(g.countsFor, JSON.stringify(types)).toBeNull();
    }
  });

  it('counts only inside the division’s leaguePlay (Metro South Bay from Oct 7, every division to Oct 30)', () => {
    expect(game({ home: 'hilltop', away: 'southwest', hs: 1, as: 0, date: '2026-10-06' }).countsFor).toBeNull();
    expect(game({ home: 'hilltop', away: 'southwest', hs: 1, as: 0, date: '2026-10-07' }).countsFor).toBe('metro-south-bay');
    expect(game({ home: 'hilltop', away: 'southwest', hs: 1, as: 0, date: '2026-10-30' }).countsFor).toBe('metro-south-bay');
    const late = game({ home: 'hilltop', away: 'southwest', hs: 1, as: 0, date: '2026-10-31' });
    expect(late.postseason).toBeNull();
    expect(late.countsFor).toBeNull();
  });

  it('counts a scheduled division game too (a missing league result is any past one without a score)', () => {
    const g = game({ home: 'escondido', away: 'vista', date: '2026-10-12', league: false });
    expect(g.status).toBe('scheduled');
    expect(g.countsFor).toBe('valley');
  });

  it('drops a MaxPreps recap that calls a membership-counted game non-conference, and never rewrites one', () => {
    // fb944ba7's shape: Westview–San Pasqual, a Valley game by the alignment, with MaxPreps' own recap.
    const recap = 'San Pasqual won their away non-conference game against Westview.';
    const valley = game({ home: 'westview', away: 'san-pasqual', hs: 0, as: 1, date: '2026-09-30', league: false });
    expect(valley.countsFor).toBe('valley');
    expect(contradictedRecap({ ...valley, recap })).toBe(true);
    const [out] = classifyGames([{ ...valley, recap }]);
    expect(out.countsFor).toBe('valley');
    expect(out.recap).toBeNull();
    // "non-league" is the same claim; the match is case-blind and whole-word.
    expect(classifyGames([{ ...valley, recap: 'Westview won their home Non-League game.' }])[0].recap).toBeNull();
    // A recap that does not contradict the count is kept word for word.
    const kept = 'San Pasqual won their away conference game against Westview by a score of 1-0.';
    expect(classifyGames([{ ...valley, recap: kept }])[0].recap).toBe(kept);
    // A game that counts nowhere keeps its recap: "non-conference" is then not a contradiction.
    const early = game({ home: 'westview', away: 'san-pasqual', hs: 0, as: 1, date: '2026-09-01', league: false });
    expect(early.countsFor).toBeNull();
    expect(classifyGames([{ ...early, recap }])[0].recap).toBe(recap);
    // A tournament row between the same pair counts nowhere either, and keeps its recap.
    const tourney = game({ home: 'westview', away: 'san-pasqual', hs: 0, as: 1, date: '2026-09-30', contestTypes: { home: 2, away: 2 } });
    expect(classifyGames([{ ...tourney, recap }])[0].recap).toBe(recap);
  });

  it('keeps the recap of a non-membership league game (BVAL’s Prospect at Live Oak, 258b9301)', () => {
    const recap = 'Prospect won their away non-conference game against Live Oak by a score of 6-0.';
    const g = game({
      home: 'live-oak', away: 'prospect', hs: 0, as: 6, date: '2026-09-29',
      league: false, contestTypes: { home: 1, away: 1 },
    });
    expect(g.countsFor).toBe('santa-teresa');
    expect(contradictedRecap({ ...g, recap })).toBe(false);
    expect(classifyGames([{ ...g, recap }])[0].recap).toBe(recap);
  });

  it('counts a game MaxPreps flags between two City divisions in neither table, and says why', () => {
    // Mission Bay (City Western) played five City Eastern teams that MaxPreps marks as league games.
    const g = game({ home: 'mission-bay', away: 'clairemont', hs: 1, as: 2, date: '2026-09-16' });
    expect(g.leagueDivision).toBeNull();
    expect(g.countsFor).toBeNull();
    const note = 'MaxPreps marks this as a league game; it is between two divisions of the City Conference, so it counts in neither table.';
    expect(g.provenance.classificationNote).toBe(note);
    expect(crossDivisionNote(g)).toBe(note);
    expect(classifyGames([{ ...g, provenance: { ...g.provenance, classificationNote: undefined } }])[0].provenance.classificationNote).toBe(note);
    // Unflagged, it is a plain non-league game: no note.
    const plain = game({ home: 'mission-bay', away: 'clairemont', hs: 1, as: 2, date: '2026-09-16', league: false });
    expect(plain.provenance.classificationNote).toBeUndefined();
    // Two conferences are two leagues: no note either.
    expect(game({ home: 'mission-bay', away: 'eastlake', hs: 1, as: 2, date: '2026-09-16' }).provenance.classificationNote).toBeUndefined();
  });

  it('never notes a cross-division game of a fixture-backed league (SCVAL: golden-gated)', () => {
    const g = game({ home: 'fremont', away: 'mitty', hs: 0, as: 3, date: '2026-09-16' });
    expect(g.countsFor).toBeNull();
    expect(g.provenance.classificationNote).toBeUndefined();
    expect(crossDivisionNote(g)).toBeNull();
  });

  it('keeps an existing classification note (the official match’s own)', () => {
    const g = game({ home: 'mission-bay', away: 'clairemont', hs: 1, as: 2, date: '2026-09-16' });
    const own = { ...g, provenance: { ...g.provenance, classificationNote: 'Not on the official schedule; not counted.' } };
    expect(classifyGames([own])[0].provenance.classificationNote).toBe('Not on the official schedule; not counted.');
  });
});

describe('classify: the San Diego Section playoffs tag (section-playoffs)', () => {
  it('tags a contestType 4 game between two San Diego teams, sharing a conference or not', () => {
    const same = game({ home: 'la-jolla', away: 'scripps-ranch', hs: 1, as: 0, date: '2026-11-04', contestTypes: { home: 4, away: 4 } });
    expect(same.postseason).toEqual({ kind: 'section-playoffs', leagueId: 'city', via: 'contest-type-4' });
    expect(same.countsFor).toBeNull();
    const across = game({ home: 'la-jolla', away: 'torrey-pines', hs: 1, as: 0, date: '2026-11-04', contestTypes: { home: 0, away: 4 } });
    expect(across.postseason).toEqual({ kind: 'section-playoffs', leagueId: null, via: 'contest-type-4' });
    expect(postseasonTagOf(across)).toBe('San Diego Section playoffs');
    expect(postseasonTagOf(same)).toBe('San Diego Section playoffs');
  });

  it('tags a game between two San Diego teams on or after Nov 2 by date, never as one league’s postseason', () => {
    const same = game({ home: 'la-jolla', away: 'scripps-ranch', hs: 3, as: 1, date: '2026-11-02' });
    expect(same.postseason).toEqual({ kind: 'section-playoffs', leagueId: 'city', via: 'section-postseason-window' });
    expect(same.countsFor).toBeNull();
    const across = game({ home: 'eastlake', away: 'torrey-pines', hs: 0, as: 0, date: '2026-11-14', results: { home: 'L', away: 'W' } });
    expect(across.postseason).toEqual({ kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' });
    expect(across.decider).toBe('SO');
    expect(game({ home: 'la-jolla', away: 'scripps-ranch', hs: 3, as: 1, date: '2026-11-01' }).postseason).toBeNull();
  });

  it('never tags a San Diego team against a team of another section as the Section playoffs', () => {
    const sunset = game({ home: 'torrey-pines', away: 'great-oak', hs: 1, as: 0, date: '2026-11-05', contestTypes: { home: 4, away: 4 } });
    expect(sunset.postseason).toEqual({ kind: 'other', leagueId: null, via: 'contest-type-4' });
    expect(game({ home: 'torrey-pines', away: 'great-oak', hs: 1, as: 0, date: '2026-11-05' }).postseason).toBeNull();
  });
});

describe('classify: Sunset (membership, no postseason; DESIGN §24.11)', () => {
  it('counts every game between two of the eight inside Aug 25 – Oct 31, flagged by MaxPreps or not, tournament rows aside', () => {
    expect(game({ home: 'fountain-valley', away: 'marina', hs: 1, as: 1, date: '2026-09-11' }).countsFor).toBe('sunset');
    // Fountain Valley 1-1 Marina, Sep 11: MaxPreps marks it non-league; it counts.
    expect(game({ home: 'fountain-valley', away: 'marina', hs: 1, as: 1, date: '2026-09-11', league: false }).countsFor).toBe('sunset');
    // Great Oak at Temecula Valley, Sep 4: non-league on MaxPreps, league on Oct 2; both count.
    expect(game({ home: 'temecula-valley', away: 'great-oak', hs: 1, as: 2, date: '2026-09-04', league: false }).countsFor).toBe('sunset');
    expect(
      game({ home: 'fountain-valley', away: 'marina', hs: 1, as: 1, date: '2026-09-11', contestTypes: { home: 0, away: 2 } }).countsFor,
    ).toBeNull();
    // Before the first game between two of the eight (Aug 25): nothing counts.
    expect(game({ home: 'edison', away: 'marina', hs: 1, as: 1, date: '2026-08-20', league: false }).countsFor).toBeNull();
    // A Sunset team against an independent: never a Sunset game, flagged or not (Bonita at Great Oak, Aug 27).
    expect(game({ home: 'great-oak', away: 'bonita', hs: 1, as: 0, date: '2026-08-27' }).countsFor).toBeNull();
  });

  it('tags a contestType 4 Sunset game other: the Southern Section holds no playoffs', () => {
    const g = game({ home: 'edison', away: 'marina', hs: 2, as: 1, date: '2026-10-20', contestTypes: { home: 4, away: 4 } });
    expect(g.postseason).toEqual({ kind: 'other', leagueId: 'sunset', via: 'contest-type-4' });
    expect(g.countsFor).toBeNull();
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
