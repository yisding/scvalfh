import { describe, expect, it } from 'vitest';

import { winnerFirstRecap } from '../lib/recap';

describe('winnerFirstRecap (lib/recap.ts)', () => {
  it('turns a loss around so the winner leads, at the other side of the field', () => {
    expect(winnerFirstRecap('Helix lost their away non-conference game against Point Loma by a score of 7-1.')).toBe(
      'Point Loma won their home non-conference game against Helix by a score of 7-1.',
    );
    expect(winnerFirstRecap('Saratoga lost their home conference game against Santa Clara by a score of 3-2.')).toBe(
      'Santa Clara won their away conference game against Saratoga by a score of 3-2.',
    );
    expect(winnerFirstRecap('Great Oak lost their neutral tournament game against Torrey Pines by a score of 9-0.')).toBe(
      'Torrey Pines won their neutral tournament game against Great Oak by a score of 9-0.',
    );
  });

  it('keeps a win as MaxPreps wrote it', () => {
    const won = 'Mission Vista won their neutral tournament game against Olympian by a score of 4-0.';
    expect(winnerFirstRecap(won)).toBe(won);
  });

  it('puts the home team first on a tie, and leaves a neutral-site tie alone', () => {
    expect(winnerFirstRecap('Marina tied their away non-conference game against Bonita by a score of 1-1.')).toBe(
      'Bonita tied their home non-conference game against Marina by a score of 1-1.',
    );
    const neutral = 'La Costa Canyon tied their neutral tournament game against Eastlake by a score of 0-0.';
    expect(winnerFirstRecap(neutral)).toBe(neutral);
  });

  it('handles a forfeit and a recap with no score', () => {
    expect(winnerFirstRecap('Valley Center lost by forfeit in their away conference game against Del Norte.')).toBe(
      'Del Norte won by forfeit in their home conference game against Valley Center.',
    );
    expect(winnerFirstRecap('Escondido lost their away conference game against Vista.')).toBe(
      'Vista won their home conference game against Escondido.',
    );
  });

  it('closes on a name’s own period instead of doubling it', () => {
    expect(winnerFirstRecap('Davis Sr. lost their away conference game against Chico.')).toBe(
      'Chico won their home conference game against Davis Sr.',
    );
    expect(winnerFirstRecap('Davis Sr. lost their neutral non-conference game against Del Norte by a score of 3-1.')).toBe(
      'Del Norte won their neutral non-conference game against Davis Sr. by a score of 3-1.',
    );
  });

  it('is idempotent and leaves any other shape unchanged', () => {
    const flipped = winnerFirstRecap('Marin Catholic lost their away conference game against University by a score of 6-0.');
    expect(winnerFirstRecap(flipped)).toBe(flipped);
    const jv = 'The Lick-Wilmerding JV field hockey team lost by forfeit in their away non-conference game against Berkeley.';
    expect(winnerFirstRecap(jv)).toBe(jv);
    expect(winnerFirstRecap('Senior Night.')).toBe('Senior Night.');
  });
});
