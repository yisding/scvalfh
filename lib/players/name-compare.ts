/**
 * Comparing spellings of a name: the folding, the words and the distances every name rule in
 * lib/players/ is built on. Pure, and safe for any bundle.
 */

/** Letters NFKD leaves whole: folded by hand so "Đỗ" and "Do", "Søren" and "Soren" are one name. */
const FOLD: Readonly<Record<string, string>> = { đ: 'd', ø: 'o', ł: 'l', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ð: 'd', ı: 'i' };

export function fold(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[đøłæœßþðı]/g, (c) => FOLD[c] ?? c);
}

/**
 * "Zoë  O'Brien-Smith" → "zoeobriensmith": a name compared across sources' spellings. Empty for a
 * name with no Latin letter at all, which therefore matches nothing.
 */
export function nameKey(name: string): string {
  return fold(name).replace(/[^a-z]/g, '');
}

/** Words a roster types beside a name that are not part of it: "(GK)", "Jr.", a grade. */
export const NOT_A_NAME = new Set(['gk', 'jr', 'sr', 'ii', 'iii', 'iv', 'slug']);

/** "Sienna Steele (GK) 10" → ["sienna", "steele"]. */
export function nameTokens(name: string): string[] {
  return fold(name)
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !NOT_A_NAME.has(w));
}

export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/** A slip of the pen: two letters in a long word, one in a middling one, none in a short one. */
export function slipApart(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length);
  return editDistance(a, b) <= (shorter >= 6 ? 2 : shorter >= 4 ? 1 : 0);
}
