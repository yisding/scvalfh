/**
 * Real plurals in count copy (SPEC §0.4): lib/format/words.ts. (The source guard against the
 * '1 league games' / '1 games' templates it replaced is tests/arch/plural-counts.test.ts.)
 */
import { describe, expect, it } from 'vitest';

import {
  agree, formStripName, gameWord, gradeWord, indefiniteArticle, listWords, numberWord, plural,
} from '@/lib/format/words';

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

describe('numberWord', () => {
  it('words zero to ten and prints anything else as digits', () => {
    expect([0, 1, 6, 10].map(numberWord)).toEqual(['zero', 'one', 'six', 'ten']);
    expect([11, 49, -1, 2.5].map(numberWord)).toEqual(['11', '49', '-1', '2.5']);
  });
});

describe('gradeWord', () => {
  it('words grades 9-12 and prints any other as its number', () => {
    expect([9, 10, 11, 12].map(gradeWord)).toEqual(['Freshman', 'Sophomore', 'Junior', 'Senior']);
    expect(gradeWord(8)).toBe('Grade 8');
  });
});

describe('indefiniteArticle: one rule table, three modes', () => {
  it('vowel: a vowel letter, any case', () => {
    const a = (w: string) => indefiniteArticle(w, { mode: 'vowel' });
    expect(['Avocado', 'Eagle', 'Ivy', 'Oak', 'Union', 'assist'].map(a)).toEqual(['an', 'an', 'an', 'an', 'an', 'an']);
    expect(['Metro South Bay', 'goal', 'save', 'BVAL'].map(a)).toEqual(['a', 'a', 'a', 'a']);
    // The recorded edge: an acronym is read by its first letter, not its letter name.
    expect(a('MCAL')).toBe('a');
  });

  it('letter-name: a capital whose letter name opens on a vowel sound', () => {
    const a = (w: string) => indefiniteArticle(w, { mode: 'letter-name' });
    expect(['MCAL', 'EAL', 'SCVAL', 'NCS', 'LA', 'FHS', 'HS', 'RBV', 'XYZ', 'AIA', 'IAC', 'OIA'].map(a)).toEqual(
      Array(12).fill('an'),
    );
    expect(['BVAL', 'PCAL', 'CCS', 'DAL', 'GAL', 'KAL', 'TAL', 'UAL', 'WAL', 'YAL', 'ZAL', 'VAL', 'JAL', 'QAL'].map(a)).toEqual(
      Array(14).fill('a'),
    );
  });

  it('vowel-or-acronym: a vowel letter, or MCAL / SCVAL (the game page title)', () => {
    const a = (w: string) => indefiniteArticle(w, { mode: 'vowel-or-acronym' });
    expect(['MCAL tournament game', 'SCVAL league game', 'mcal', 'exhibition game', 'Avocado game'].map(a)).toEqual([
      'an', 'an', 'an', 'an', 'an',
    ]);
    expect(['BVAL league game', 'league game', 'non-league game', 'PCAL game'].map(a)).toEqual(['a', 'a', 'a', 'a']);
  });
});

describe('agree', () => {
  it('picks the word for a count of exactly one', () => {
    expect(agree(1, 'is', 'are')).toBe('is');
    expect(agree(0, 'has', 'have')).toBe('have');
    expect(agree(2, 'was', 'were')).toBe('were');
    expect(agree(11, 'does', 'do')).toBe('do');
  });
});

describe('listWords', () => {
  it('joins names the way a sentence does, with "and" by default', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['Cupertino'])).toBe('Cupertino');
    expect(listWords(['Cupertino', 'Homestead'])).toBe('Cupertino and Homestead');
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('joins every contender for one seat with "or"', () => {
    expect(listWords(['Cupertino'], 'or')).toBe('Cupertino');
    expect(listWords(['A', 'B'], 'or')).toBe('A or B');
    expect(listWords(['A', 'B', 'C'], 'or')).toBe('A, B or C');
  });

  it('joins a compact leader line with "&"', () => {
    expect(listWords([], '&')).toBe('');
    expect(listWords(['A', 'B'], '&')).toBe('A & B');
    expect(listWords(['A', 'B', 'C'], '&')).toBe('A, B & C');
  });
});
