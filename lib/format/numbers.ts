/**
 * Records, differentials, rates and places as the tables, tiles and screen-reader sentences print
 * them. Pure and client-safe.
 */

import type { Outcome, Record3 } from '@/lib/model/game';

import { EM_DASH, MINUS, plural } from './words';

/** 'W-L-T', e.g. '4-1-0'. */
export function recordString(r: Record3 | { w: number; l: number; t: number }): string {
  return `${r.w}-${r.l}-${r.t}`;
}

/**
 * '5 wins, 1 loss, 0 ties' — the record in words, for a screen-reader label. '4-1-0' read aloud
 * is "four minus one minus zero" in some voices and a date in others; the words are unambiguous.
 */
export function recordWords(r: Record3 | { w: number; l: number; t: number }): string {
  return `${plural(r.w, 'win')}, ${plural(r.l, 'loss', 'losses')}, ${plural(r.t, 'tie')}`;
}

/** '+30' / '−24' / '0' — always signed, U+2212 for negatives (DESIGN §5.6). */
export function signedGd(gd: number | null): string {
  if (gd === null) return EM_DASH;
  if (gd === 0) return '0';
  return gd > 0 ? `+${gd}` : `${MINUS}${Math.abs(gd)}`;
}

/** '.625' / '1.000' / '.000' — the leading zero is dropped, sports-table convention. */
export function winPct(value: number): string {
  const s = value.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}

/** '0.0' for a genuine zero, em dash for nothing reported (DESIGN §8). */
export function perGame(total: number | null, gp: number): string {
  if (total === null || gp === 0) return EM_DASH;
  return (total / gp).toFixed(1);
}

/** '1st', '2nd', '3rd', '4th', '11th', '21st'. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * A place in words, as a sentence or a screen reader says it: '7th', or 'tied for 7th' for a
 * shared place (a level place the league's tiebreakers do not settle).
 */
export function placeWords(place: number, shared: boolean): string {
  return shared ? `tied for ${ordinal(place)}` : ordinal(place);
}

/**
 * A place as the eye reads it, in the site's two notations: a table cell's `7` / `T7`, and a
 * pill's or a tile's `7th` / `T-7th`. The spoken form is always `placeWords`.
 */
export function placeMark(place: number, shared: boolean, form: 'table' | 'pill'): string {
  if (form === 'table') return shared ? `T${place}` : String(place);
  return shared ? `T-${ordinal(place)}` : ordinal(place);
}

/** 'W5' / 'L3' / 'T1' (the US sports-page order: result, then length), or an em dash. */
export function streakString(streak: { count: number; result: Outcome } | null): string {
  return streak ? `${streak.result}${streak.count}` : EM_DASH;
}

const ORDINAL_WORDS = [
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
] as const;

/** 'zeroth' … 'tenth' for a whole number 0-10, `ordinal` otherwise ('fourth', '11th'). */
export function ordinalWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 10 ? ORDINAL_WORDS[n] : ordinal(n);
}
