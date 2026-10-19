/**
 * views/playoffs/key-dates.ts (SPEC §10.7): the key dates of the CCS page.  League-specific values are asserted on
 * the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through useCorpusModules (tests/support/playoffs-view.ts),
 * so live fetch #2 cannot break them. On that snapshot De Anza's 3rd place is shared (Los Altos, Valley Christian),
 * El Camino's 4th straddles the play-in and at-large places, Santa Teresa's champions are level (Prospect, Westmont)
 * and Mt. Hamilton's 4th is shared: every by-law consequence of an uncomputable tiebreak shows up at once. Every
 * assertion message names the module that produced the value.
 */

import { describe, expect, it } from 'vitest';

import { KEY_DATES, m } from '@/tests/support/playoffs-view';

describe('keyDateRows', () => {
  it('lists the CCS dates and each league’s own date, labelled with its league, in date order', () => {
    const rows = m.keyDates.keyDateRows(m.data.getPlayoffs().keyDates, [
      { id: 'bval', leagueShort: 'BVAL', date: '2026-10-31', time: '11:00', label: 'BVAL play-in', detail: 'x' },
      { id: 'scval', leagueShort: 'SCVAL', date: '2026-10-30', time: null, label: 'SCVAL crossover and 4th-place play-in', detail: 'y' },
    ]);
    expect(rows.map((r) => `${r.dateLabel}|${r.leagueShort ?? ''}|${r.label}|${r.time ?? ''}`), KEY_DATES).toEqual([
      'Fri Oct 30|SCVAL|SCVAL crossover and 4th-place play-in|',
      'Sat Oct 31||CCS end of league season|',
      'Sat Oct 31|BVAL|BVAL play-in|11 AM PT',
      'Mon Nov 2||CCS entries due|12:00 PM PT',
      'Mon Nov 2||CCS seeding meeting|1:00 PM PT',
      'Sat Nov 7||Quarterfinals|',
      'Wed Nov 11||Semifinals|',
      'Sat Nov 14||Finals|',
      'Thu Nov 19||CCS evaluation meeting|4:00 PM PT',
    ]);
  });
});
