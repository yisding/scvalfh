/** lib/format/postseason.ts: the postseason sentences built from config-derived values. */

import { describe, expect, it } from 'vitest';

import { playInWords } from '@/lib/format/postseason';
import type { PairingConfig } from '@/lib/model/league-config';

describe('playInWords: the BVAL-style play-in clause (lib/queries/postseason.ts playInClause supplies the config values)', () => {
  const playIn: PairingConfig = {
    id: 'bval-play-in', date: '2026-10-31', time: '11:00', tag: 'bval-play-in',
    seats: [{ division: 'santa-teresa', place: 1 }, { division: 'mt-hamilton', place: 4 }],
    seatLabels: ['Santa Teresa #1', 'Mt. Hamilton #4'], host: 0, isPlayIn: true,
    label: 'Mt. Hamilton #4 at Santa Teresa #1 — play-in for BVAL’s 4th automatic CCS berth',
  };

  it('pins the clause: the lower seat at the champion, the date and clock, the berth ordinal; no closing stop', () => {
    expect(playInWords({ leagueShortName: 'BVAL', autoBerths: 4, playIn, championDivisionLabel: 'Santa Teresa' })).toBe(
      'Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth',
    );
  });

  it('drops the clock when the pairing has no time, and words any berth count', () => {
    expect(playInWords({ leagueShortName: 'BVAL', autoBerths: 5, playIn: { ...playIn, time: null }, championDivisionLabel: 'Santa Teresa' })).toBe(
      'Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, for BVAL’s fifth automatic CCS berth',
    );
  });
});
