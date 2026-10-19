/** lib/shared/game.ts: sideOutcome, the one W/L/T derivation. */

import { describe, expect, it } from 'vitest';

import { renderScore, scoreSentence } from '@/lib/format/score';
import { sideOutcome } from '@/lib/shared/game';
import { game } from '@/tests/support/game-builder';

describe('sideOutcome, the one W/L/T derivation', () => {
  // Chico 1, Davis 1 on 2026-09-28, flagged Chico W / Davis L: a 1 v 1 win (decider 'SO', no tally).
  const oneVOne = game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } });

  it('reads a decided final off the score, and a level one as a tie', () => {
    const g = game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 });
    expect([sideOutcome(g, 'home'), sideOutcome(g, 'away')]).toEqual(['W', 'L']);
    const level = game({ home: 'cupertino', away: 'fremont', hs: 0, as: 0 });
    expect([sideOutcome(level, 'home'), sideOutcome(level, 'away')]).toEqual(['T', 'T']);
  });

  it('gives a 1 v 1 win to the flagged side, level goals and all', () => {
    expect(oneVOne.decider).toBe('SO');
    expect(oneVOne.shootout).toBeNull();
    expect([sideOutcome(oneVOne, 'home'), sideOutcome(oneVOne, 'away')]).toEqual(['W', 'L']);
    const awayWin = game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'L', away: 'W' } });
    expect([sideOutcome(awayWin, 'home'), sideOutcome(awayWin, 'away')]).toEqual(['L', 'W']);
  });

  it('lets a stored tally decide, and reads an SO decider without complementary flags off the score', () => {
    const tally = { ...oneVOne, shootout: { home: 2, away: 4 } };
    expect([sideOutcome(tally, 'home'), sideOutcome(tally, 'away')]).toEqual(['L', 'W']);
    const unflagged = { ...oneVOne, home: { ...oneVOne.home, result: 'T' as const }, away: { ...oneVOne.away, result: 'T' as const } };
    expect([sideOutcome(unflagged, 'home'), sideOutcome(unflagged, 'away')]).toEqual(['T', 'T']);
  });

  it('never reads flags without the SO decider: an MCAL 1-1 flagged W/L is a tie', () => {
    const mcal = game({ home: 'redwood', away: 'tamalpais', hs: 1, as: 1, results: { home: 'W', away: 'L' } });
    expect(mcal.decider).toBe('REG');
    expect([sideOutcome(mcal, 'home'), sideOutcome(mcal, 'away')]).toEqual(['T', 'T']);
  });

  it('is null unless the game is final with two scores', () => {
    for (const status of ['scheduled', 'score-pending', 'live', 'postponed'] as const) {
      expect(sideOutcome(game({ home: 'chico', away: 'davis', status }), 'home')).toBeNull();
    }
  });

  it('renders a 1 v 1 win as a level final the home side won, and says who won on 1 v 1s', () => {
    // The section's words come from the caller (views/shared/describe-game.ts passes SectionConfig.shootout.words).
    expect(renderScore(oneVOne)).toEqual({ kind: 'final', home: 1, away: 1, outcome: 'W', decider: 'SO', shootout: null });
    expect(scoreSentence(oneVOne, { shootoutWords: '1 v 1s' })).toBe('Chico 1, Davis 1, final; Chico won on 1 v 1s.');
    const awayWin = game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'L', away: 'W' } });
    expect(renderScore(awayWin)).toMatchObject({ kind: 'final', outcome: 'L', decider: 'SO' });
    expect(scoreSentence(awayWin, { shootoutWords: '1 v 1s' })).toBe('Chico 1, Davis 1, final; Davis won on 1 v 1s.');
    // A caller that names no section gets the generic words, true of every 'SO' game.
    expect(scoreSentence(oneVOne)).toBe('Chico 1, Davis 1, final; Chico won in a shootout.');
  });

  it('says a San Diego shootout win in the San Diego Section’s words (a cross-conference 0-0 flagged W/L)', () => {
    const sds = game({ home: 'clairemont', away: 'eastlake', hs: 0, as: 0, date: '2026-09-01', results: { home: 'L', away: 'W' } });
    expect(sds.decider).toBe('SO');
    expect([sideOutcome(sds, 'home'), sideOutcome(sds, 'away')]).toEqual(['L', 'W']);
    expect(scoreSentence(sds, { shootoutWords: 'a shootout' })).toBe('Clairemont 0, Eastlake 0, final; Eastlake won in a shootout.');
  });

  it('drops “after overtime” when asked (an overtime count that cannot be right)', () => {
    // 2026-09-02 PV @ Chico: 1-0 with MaxPreps’ 3 overtime periods.
    const g = game({ home: 'chico', away: 'pleasant-valley', hs: 0, as: 1, ot: 3 });
    expect(scoreSentence(g)).toBe('Chico 0, Pleasant Valley 1, final after overtime.');
    expect(scoreSentence(g, { quietOvertime: true })).toBe('Chico 0, Pleasant Valley 1, final.');
    const forfeit = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, forfeit: true });
    expect(scoreSentence(forfeit, { quietOvertime: true })).toBe('Cupertino 1, Fremont 0, final by forfeit.');
  });
});
