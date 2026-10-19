/** lib/format/numbers.ts: records, ordinals, signed goal differences, percentages and streaks. */

import { describe, expect, it } from 'vitest';

import {
  ordinal, ordinalWord, perGame, recordString, recordWords, signedGd, streakString, winPct,
} from '@/lib/format/numbers';
import { scoreGlyph } from '@/lib/format/score';
import { EM_DASH, EN_DASH, MINUS, formStripLabel } from '@/lib/format/words';

describe('format: records and numbers', () => {
  it('writes a W-L-T record', () => {
    expect(recordString({ w: 4, l: 1, t: 0 })).toBe('4-1-0');
  });

  it('writes a record in words, singular for exactly one', () => {
    expect(recordWords({ w: 5, l: 1, t: 0 })).toBe('5 wins, 1 loss, 0 ties');
    expect(recordWords({ w: 1, l: 2, t: 1 })).toBe('1 win, 2 losses, 1 tie');
    expect(recordWords({ w: 0, l: 0, t: 0 })).toBe('0 wins, 0 losses, 0 ties');
  });

  it('always signs a goal differential and uses a real minus sign', () => {
    expect(signedGd(30)).toBe('+30');
    expect(signedGd(-24)).toBe(`${MINUS}24`);
    expect(signedGd(0)).toBe('0');
    expect(signedGd(null)).toBe(EM_DASH);
  });

  it('drops the leading zero from a win percentage', () => {
    expect(winPct(0.625)).toBe('.625');
    expect(winPct(1)).toBe('1.000');
    expect(winPct(0)).toBe('.000');
  });

  it('keeps a genuine zero as 0.0 per game and a null as an em dash', () => {
    expect(perGame(0, 5)).toBe('0.0');
    expect(perGame(9, 4)).toBe('2.3');
    expect(perGame(null, 4)).toBe(EM_DASH);
    expect(perGame(3, 0)).toBe(EM_DASH);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st',
    ]);
  });

  it('tells a real 0 apart from a missing score', () => {
    expect(scoreGlyph(0)).toBe('0');
    expect(scoreGlyph(null)).toBe(EN_DASH);
  });

  it('writes a streak and a form-strip sentence', () => {
    expect(streakString({ count: 5, result: 'W' })).toBe('W5');
    expect(streakString({ count: 1, result: 'L' })).toBe('L1');
    expect(streakString(null)).toBe(EM_DASH);
    expect(formStripLabel(['L', 'L', 'W'])).toBe(
      'Last 3 league games, oldest first: loss, loss, win.',
    );
    expect(formStripLabel([])).toBe('No league results yet.');
  });
});

describe('ordinalWord', () => {
  it('words ordinals zeroth to tenth and falls back to ordinal() past them', () => {
    expect([0, 1, 4, 7, 9, 10].map(ordinalWord)).toEqual(['zeroth', 'first', 'fourth', 'seventh', 'ninth', 'tenth']);
    expect([11, 21, 22, 23].map(ordinalWord)).toEqual(['11th', '21st', '22nd', '23rd']);
  });
});
