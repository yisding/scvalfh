/**
 * lib/engine/standings/uneven.ts: the uneven games-played sentence.
 */

import { describe, expect, it } from 'vitest';

import { unevenGamesSentence } from '@/lib/engine/standings';

describe('Southern California: ladders, the cross-check skip, uneven games (DESIGN-socal §2.1.7)', () => {
  it('words an uneven games-played spread with "of N" for a fixed schedule and without it for the Sunset', () => {
    expect(unevenGamesSentence('mcal', { min: 9, max: 12, scheduled: 16 })).toBe(
      'Teams have played between 9 and 12 of 16 league games, so points favour teams that have played more.',
    );
    expect(unevenGamesSentence('sunset', { min: 2, max: 7, scheduled: null })).toBe(
      'Teams have played between 2 and 7 games against other Sunset teams, and there is no fixed league schedule, so points favour teams that have played more.',
    );
    expect(unevenGamesSentence('sunset', { min: 2, max: 3, scheduled: null })).toBeNull();
    expect(unevenGamesSentence('palomar', { min: 4, max: 5, scheduled: 12 })).toBeNull();
  });
});
