/**
 * lib/engine/standings/ladder.ts: places to statuses, legends and badges for every league: SCVAL's Article VII
 * projections and the Southern California ladders (SPEC §5.6-§5.7).
 */

import { describe, expect, it } from 'vitest';

import {
  computeStandings, leaguePairings, outcomesFor, playoffOutcomeLabel, playoffStatusFor, statusBadge, statusLegend,
  playoffOutcomes,
} from '@/lib/engine/standings';
import type { Game } from '@/lib/model/game';
import { game } from '@/tests/support/game-builder';
import { finals, row } from '@/tests/support/standings';
import { live, liveStandings } from '@/tests/support/scval-standings';

describe('standings: Article VII projections', () => {
  it('maps place to a qualification status', () => {
    for (const division of ['de-anza', 'el-camino']) {
      expect(playoffStatusFor(division, 1)).toBe('aq');
      expect(playoffStatusFor(division, 3)).toBe('aq');
      expect(playoffStatusFor(division, 4)).toBe('play-in');
      expect(playoffStatusFor(division, 5)).toBe('at-large');
      expect(playoffStatusFor(division, 6)).toBe('out');
      expect(playoffStatusFor(division, 8)).toBe('out');
    }
  });

  it('attaches the status to every standings row', () => {
    for (const s of liveStandings) {
      expect(s.playoffStatus).toBe(playoffStatusFor(s.division, s.computed.place));
    }
  });

  it('pairs the crossover by seed and marks the #4 play-in', () => {
    const pairings = leaguePairings(liveStandings, live, 'scval');
    expect(pairings.map((p) => p.id)).toEqual([
      'scval-crossover-1', 'scval-crossover-2', 'scval-crossover-3', 'scval-crossover-4',
    ]);
    expect(pairings.filter((p) => p.isPlayIn).length).toBe(1);
    expect(pairings[3].isPlayIn).toBe(true);
    expect(pairings[0].seats[0]).toHaveLength(1);
    expect(pairings[0].seats[1]).toHaveLength(1);
    expect(pairings[0].seatLabels).toEqual(['De Anza #1', 'El Camino #1']);
    expect(pairings[0].date).toBe('2026-10-30');
    expect(pairings[0].game).toBeNull();
    expect(pairings[3].label).toMatch(/7th automatic qualifier/);
  });

  it('spreads a level place across every slot it occupies', () => {
    expect(playoffOutcomes('de-anza', 1)).toEqual(['aq']);
    expect(playoffOutcomes('de-anza', 3, 2)).toEqual(['aq', 'play-in']);
    expect(playoffOutcomes('de-anza', 4, 2)).toEqual(['play-in', 'at-large']);
    expect(playoffOutcomes('de-anza', 5, 2)).toEqual(['at-large', 'out']);
    expect(playoffOutcomes('de-anza', 2, 3)).toEqual(['aq', 'play-in']);
    expect(playoffOutcomeLabel('de-anza', ['aq'])).toBe('Automatic qualifier');
    expect(playoffOutcomeLabel('de-anza', ['aq', 'play-in'])).toMatch(
      /^Automatic qualifier or the Oct 30 play-in — Article VI §7/,
    );
  });

  /**
   * Standard competition ranking means a two-way tie for 3rd produces places 1,2,3,3,5 — nobody
   * carries place 4. Reading the raw place would label both tied teams "AQ", drop the play-in
   * status from the division entirely and leave the Oct 30 play-in pairing empty.
   */
  it('keeps the play-in slot alive when a tie straddles the 3rd/4th boundary', () => {
    // De Anza: 9, 6, then Fremont and Cupertino level on 3 with no head-to-head between them,
    // so Article VI §3-6 cannot separate them and §7's coin flip leaves them sharing 3rd.
    const games: Game[] = [
      game({ home: 'st-ignatius', away: 'los-altos', hs: 1, as: 0, date: '2026-09-01' }),
      game({ home: 'st-ignatius', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-02' }),
      game({ home: 'st-ignatius', away: 'homestead', hs: 1, as: 0, date: '2026-09-03' }),
      game({ home: 'saint-francis', away: 'los-altos', hs: 1, as: 0, date: '2026-09-04' }),
      game({ home: 'saint-francis', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-05' }),
      game({ home: 'fremont', away: 'homestead', hs: 1, as: 0, date: '2026-09-06' }),
      game({ home: 'cupertino', away: 'homestead', hs: 1, as: 0, date: '2026-09-07' }),
    ];
    const rows = computeStandings(games);
    const fremont = row(rows, 'fremont');
    const cupertino = row(rows, 'cupertino');
    expect(fremont.computed.place).toBe(3);
    expect(cupertino.computed.place).toBe(3);
    expect(fremont.tiebreak.shared).toBe(true);

    // Nobody carries place 4, so the raw place says 'aq' for both. The union keeps the
    // 4th-place play-in spot — and the Oct 30 pairing built from it — on the table.
    expect(fremont.playoffStatus).toBe('aq');
    expect(outcomesFor(fremont)).toEqual(['aq', 'play-in']);
    expect(outcomesFor(cupertino)).toEqual(['aq', 'play-in']);

    const playIn = leaguePairings(rows, games, 'scval').find((p) => p.isPlayIn)!;
    expect(playIn.seats[0].map((seat) => seat.slug).sort()).toEqual(['cupertino', 'fremont']);
  });

  it('keeps the at-large slot alive when a tie straddles the 4th/5th boundary', () => {
    const games: Game[] = [
      game({ home: 'st-ignatius', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-01' }),
      game({ home: 'st-ignatius', away: 'los-altos', hs: 1, as: 0, date: '2026-09-02' }),
      game({ home: 'st-ignatius', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-03' }),
      game({ home: 'st-ignatius', away: 'homestead', hs: 1, as: 0, date: '2026-09-04' }),
      game({ home: 'saint-francis', away: 'los-altos', hs: 1, as: 0, date: '2026-09-05' }),
      game({ home: 'saint-francis', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-06' }),
      game({ home: 'saint-francis', away: 'homestead', hs: 1, as: 0, date: '2026-09-07' }),
      game({ home: 'los-altos', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-08' }),
      game({ home: 'los-altos', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 1, as: 0, date: '2026-09-10' }),
      game({ home: 'cupertino', away: 'valley-christian', hs: 1, as: 0, date: '2026-09-11' }),
    ];
    const rows = computeStandings(games);
    const fremont = row(rows, 'fremont');
    const cupertino = row(rows, 'cupertino');
    expect(fremont.computed.place).toBe(4);
    expect(cupertino.computed.place).toBe(4);
    expect(outcomesFor(fremont)).toEqual(['play-in', 'at-large']);
    expect(outcomesFor(cupertino)).toEqual(['play-in', 'at-large']);
  });
});

describe('ladders and pairings by league', () => {
  it('maps places to each league’s statuses', () => {
    expect(playoffStatusFor('mt-hamilton', 3)).toBe('aq');
    expect(playoffStatusFor('mt-hamilton', 4)).toBe('play-in');
    expect(playoffStatusFor('mt-hamilton', 5)).toBe('no-aq-route');
    expect(playoffStatusFor('santa-teresa', 1)).toBe('play-in');
    expect(playoffStatusFor('santa-teresa', 2)).toBe('no-aq-route');
    expect(playoffStatusFor('pcal', 2)).toBe('aq');
    expect(playoffStatusFor('pcal', 3)).toBe('no-aq-route');
    expect(playoffStatusFor('marin-county', 2)).toBe('bye');
    expect(playoffStatusFor('marin-county', 6)).toBe('tournament');
    expect(playoffStatusFor('marin-county', 7)).toBe('below-line');
  });

  it('resolves legends with the league’s first pairing date, and badges', () => {
    expect(statusLegend('mt-hamilton', 'play-in')).toBe(
      '4th place — plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(statusLegend('santa-teresa', 'play-in')).toBe(
      'Champion — hosts Mt. Hamilton #4 Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(statusLegend('marin-county', 'bye')).toBe('Places 1-2 — bye to the semifinals, Wed Oct 28');
    expect(statusBadge('santa-teresa', 'play-in')).toBe('Play-in host');
    expect(statusBadge('pcal', 'no-aq-route')).toBe('No AQ route');
    expect(playoffOutcomeLabel('pcal', [])).toBe('No automatic-berth route');
  });
});

describe('Southern California: ladders, the cross-check skip, uneven games (DESIGN-socal §2.1.7)', () => {
  it('maps every Sunset place to no-postseason, and San Diego 1st to tournament, 2nd and below to selection', () => {
    for (const place of [1, 5, 10, 99]) expect(playoffStatusFor('sunset', place)).toBe('no-postseason');
    for (const d of ['city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay']) {
      expect(playoffStatusFor(d, 1), d).toBe('tournament');
      expect(playoffStatusFor(d, 2), d).toBe('selection');
      expect(playoffStatusFor(d, 7), d).toBe('selection');
    }
    expect(statusBadge('sunset', 'no-postseason')).toBe('No playoffs');
    expect(statusBadge('palomar', 'selection')).toBe('Selection only');
    expect(playoffOutcomeLabel('valley', ['tournament', 'selection'])).toBe(
      '1st: at least a play-in if named league champion or no league route into the playoffs',
    );
    expect(statusLegend('sunset', 'no-postseason')).toBe('The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)');
  });

  it('places a Sunset or San Diego table on site points, and never says the rules require it', () => {
    const games = finals([['la-jolla', 'scripps-ranch', 2, 0], ['bonita', 'marina', 1, 0]]);
    const rows = computeStandings(games);
    const lj = rows.find((r) => r.slug === 'la-jolla')!;
    expect(lj.tiebreak.note).toBe(
      '3 points (3 per win, 1 per tie) — placed on points alone, no league document orders the table; this site orders it by its own 3-1-0 points.',
    );
    const idle = rows.find((r) => r.slug === 'mission-bay')!;
    expect(idle.tiebreak.note).toBe(
      'No division games counted for Mission Bay yet, so it is listed last; City Western order is the order of team points (no league document orders the table; this site orders it by its own 3-1-0 points).',
    );
    expect(rows.find((r) => r.slug === 'edison')!.tiebreak.note).toMatch(/^No league games counted for Edison yet, /);
    for (const r of rows.filter((x) => ['sunset', 'city-western'].includes(x.division))) {
      expect(r.tiebreak.note).not.toMatch(/rules require|results reported/);
    }
  });
});
