/**
 * Real plurals in count copy (SPEC §0.4): components/ui/plural.ts. (The source guard against the
 * '1 league games' / '1 games' templates it replaced is tests/arch/plural-counts.test.ts.)
 */
import { describe, expect, it } from 'vitest';

import { formStripName, gameWord, plural } from '@/components/ui/plural';

describe('plural()', () => {
  it('says 1 game and 0 / 2 games', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(0, 'game')).toBe('0 games');
    expect(plural(2, 'game')).toBe('2 games');
    expect(plural(1, 'match', 'matches')).toBe('1 match');
    expect(plural(3, 'match', 'matches')).toBe('3 matches');
  });

  it('names a one-entry form strip in the singular', () => {
    expect(formStripName('Del Mar', 1)).toBe('Del Mar last 1 league game');
    expect(formStripName('Del Mar', 5)).toBe('Del Mar last 5 league games');
  });

  it('gives the bare word for a count printed separately', () => {
    expect(gameWord(1)).toBe('game');
    expect(gameWord(0)).toBe('games');
    expect(gameWord(2)).toBe('games');
  });
});
