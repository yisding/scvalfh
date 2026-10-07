/**
 * A player's name as MaxPreps stores it, recased where the school typed it with no case at all.
 *
 * Some coaches enter the roster in all caps (Hollister, 2026-10: "PAIGE PIERSON", "McKAELA DANZE"),
 * and MaxPreps renders it that way on every page, the stats sheet's "P. PIERSON" included. A word
 * is recased when it has at least three letters and every one is a capital, not counting a leading
 * "Mc", which a school that typed "McKAELA" has already cased. Shorter capitals are left alone:
 * "AJ" and "TJ" are names people write that way, as is a suffix like "III".
 *
 * Others type it all in lowercase (Poway, 2026-10: "addie dawson"). That is judged on the whole
 * name, not word by word: a lowercase word inside a cased name is the school's choice ("Anna van
 * der Berg"), but a name with no capital anywhere was never cased. An initial does not count: the
 * stats sheet abbreviates "addie dawson" as "A. dawson", capitalizing the initial itself.
 */

const SHOUTED = /^(Mc)?(\P{Ll}*)$/u;
const ROMAN = /^[IVX]+\.?$/;
const INITIAL = /^\p{Lu}\.?$/u;

/** "o'brien-smith" → "O'Brien-Smith", "mcdonald" → "McDonald". */
function capitalize(lower: string): string {
  return lower
    .replace(/(^|[-'’])(\p{Ll})/gu, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`)
    .replace(/(^|[-'’])Mc(\p{Ll})/gu, (_, lead: string, ch: string) => `${lead}Mc${ch.toUpperCase()}`);
}

function recaseShouted(word: string): string {
  const m = SHOUTED.exec(word);
  if (!m || ROMAN.test(word) || (m[2].match(/\p{Lu}/gu) ?? []).length < 3) return word;
  const cased = capitalize(m[2].toLowerCase());
  return m[1] ? `Mc${cased}` : cased;
}

/**
 * "PAIGE PIERSON" → "Paige Pierson", "McKAELA" → "McKaela", "O'BRIEN-SMITH" → "O'Brien-Smith",
 * "addie dawson" → "Addie Dawson", "A. dawson" → "A. Dawson".
 */
export function recaseName(name: string): string {
  const words = name.split(/\s+/).filter((w) => !INITIAL.test(w));
  if (!words.some((w) => /\p{Lu}/u.test(w))) return name.replace(/\S+/g, capitalize);
  return name.replace(/\S+/g, recaseShouted);
}

export function recaseNullableName(name: string | null): string | null {
  return name === null ? null : recaseName(name);
}
