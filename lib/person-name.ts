/**
 * A player's name as MaxPreps stores it, recased where the school typed it in capitals.
 *
 * Some coaches enter the roster in all caps (Hollister, 2026-10: "PAIGE PIERSON", "McKAELA DANZE"),
 * and MaxPreps renders it that way on every page, the stats sheet's "P. PIERSON" included. A word
 * is recased when it has at least three letters and every one is a capital, not counting a leading
 * "Mc", which a school that typed "McKAELA" has already cased. Shorter capitals are left alone:
 * "AJ" and "TJ" are names people write that way, as is a suffix like "III".
 */

const SHOUTED = /^(Mc)?(\P{Ll}*)$/u;
const ROMAN = /^[IVX]+\.?$/;

function recaseWord(word: string): string {
  const m = SHOUTED.exec(word);
  if (!m || ROMAN.test(word) || (m[2].match(/\p{Lu}/gu) ?? []).length < 3) return word;
  const cased = m[2]
    .toLowerCase()
    .replace(/(^|[-'’])(\p{Ll})/gu, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
  if (m[1]) return `Mc${cased}`;
  // "MCDONALD" → "McDonald"; a bare "Mc" word ("MC") is too short to reach here.
  return cased.replace(/^Mc(\p{Ll})/u, (_, ch: string) => `Mc${ch.toUpperCase()}`);
}

/** "PAIGE PIERSON" → "Paige Pierson", "McKAELA" → "McKaela", "O'BRIEN-SMITH" → "O'Brien-Smith". */
export function recaseName(name: string): string {
  return name.replace(/\S+/g, recaseWord);
}

export function recaseNullableName(name: string | null): string | null {
  return name === null ? null : recaseName(name);
}
