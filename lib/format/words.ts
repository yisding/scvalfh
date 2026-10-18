/**
 * The site's words: the typographic glyphs, count copy with real plurals, grades, outcomes, small
 * numbers in words, lists and the official documents' kinds. Pure and client-safe (type imports
 * only), so a 'use client' card can use any of it.
 */

import type { Outcome } from '@/lib/model/game';
import type { OfficialSourceId } from '@/lib/model/ids';

/** U+2212 MINUS SIGN — the typographic minus the design uses for negative differentials. */
export const MINUS = '−';
/** U+2013 EN DASH — the "no score" glyph (DESIGN §5.3). */
export const EN_DASH = '–';
/** U+2014 EM DASH — the "no value at all" glyph in tables. */
export const EM_DASH = '—';

/**
 * Count copy with real plurals (SPEC §0.4): `plural(1, 'game')` → '1 game', `plural(3, 'game')` →
 * '3 games', `plural(2, 'loss', 'losses')` → '2 losses'.
 */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 'game' / 'games' for a count printed separately (`{n} {gameWord(n)}`), never "1 games". */
export function gameWord(n: number): string {
  return n === 1 ? 'game' : 'games';
}

/** The accessible name of a team's form strip: 'Del Mar last 1 league game' / '… last 5 league games'. */
export function formStripName(teamName: string, count: number): string {
  return `${teamName} last ${plural(count, 'league game')}`;
}

/** The school year's words; anything else is printed as its number. */
export const GRADE_WORDS = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' } as const;

/** 'Freshman' … 'Senior' for grades 9-12, 'Grade 8' otherwise (the roster and the club pages). */
export function gradeWord(grade: number): string {
  return GRADE_WORDS[grade as keyof typeof GRADE_WORDS] ?? `Grade ${grade}`;
}

export const OUTCOME_WORDS: Record<Outcome, string> = { W: 'win', L: 'loss', T: 'tie' };

/** 'Last 5 league games: loss, loss, win.' — one sentence, never five letters (DESIGN §10.6). */
export function formStripLabel(last5: readonly Outcome[]): string {
  if (last5.length === 0) return 'No league results yet.';
  const words = last5.map((o) => OUTCOME_WORDS[o]).join(', ');
  return `Last ${plural(last5.length, 'league game')}, oldest first: ${words}.`;
}

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
] as const;

/** 'zero' … 'ten' for a whole number 0-10, its digits otherwise ('six', '49'). */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 10 ? NUMBER_WORDS[n] : String(n);
}

/**
 * 'A', 'A and B', 'A, B and C'; with `conj` 'or' every contender for one seat ('A, B or C'), and
 * with '&' the compact leader line ('A, B & C'). An empty list is ''.
 */
export function listWords(words: readonly string[], conj: 'and' | 'or' | '&' = 'and'): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} ${conj} ${words[words.length - 1]}`;
}

/**
 * What kind of document a league's official schedule is, as a link label names it: the BVAL
 * sheet is a Google Doc, the rest are PDFs. A `Record` over every `OfficialSourceId`, so a new
 * source fails typecheck until someone classifies it. The /standings link
 * (`officialScheduleLabel`) and the /about health card (`officialSourceLabel`) both read it.
 */
const OFFICIAL_SOURCE_FORMAT: Readonly<Record<OfficialSourceId, 'PDF' | 'Google Doc'>> = {
  'scval-pdf': 'PDF',
  'bval-docx': 'Google Doc',
  'pcal-pdf': 'PDF',
  'mcal-pdf': 'PDF',
};

export function officialSourceFormat(source: OfficialSourceId): 'PDF' | 'Google Doc' {
  return OFFICIAL_SOURCE_FORMAT[source];
}
