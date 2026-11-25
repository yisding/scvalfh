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
 *
 * A cased name keeps its case, except for a lowercase letter where a capital was almost certainly
 * lost: after a hyphen ("Wright-lopez", "Dylan-marie"), after a leading "O'" or "D'" ("D'angelo")
 * and after a leading "Mc" ("Mcdonald"), each the school capitalizing only the word's first letter.
 * "Mac" is left alone: "Macias" and "Mackenzie" are not "MacIas" and "MacKenzie".
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

/** "Wright-lopez" → "Wright-Lopez", "D'angelo" → "D'Angelo", "Mcdonald" → "McDonald". */
function fixCased(word: string): string {
  return word
    .replace(/-(\p{Ll})/gu, (_, ch: string) => `-${ch.toUpperCase()}`)
    .replace(/(^|-)([OD]['’])(\p{Ll})/gu, (_, lead: string, pre: string, ch: string) => `${lead}${pre}${ch.toUpperCase()}`)
    .replace(/(^|-)Mc(\p{Ll})(?=\p{Ll})/gu, (_, lead: string, ch: string) => `${lead}Mc${ch.toUpperCase()}`);
}

function recaseShouted(word: string): string {
  const m = SHOUTED.exec(word);
  if (!m || ROMAN.test(word) || (m[2].match(/\p{Lu}/gu) ?? []).length < 3) return word;
  const cased = capitalize(m[2].toLowerCase());
  return m[1] ? `Mc${cased}` : cased;
}

/** No capital anywhere outside a lone initial: "addie dawson", "A. dawson". */
function isUncased(name: string): boolean {
  return !name
    .split(/\s+/)
    .filter((w) => !INITIAL.test(w))
    .some((w) => /\p{Lu}/u.test(w));
}

/**
 * Spellings a person has confirmed that MaxPreps gets wrong, applied after the recasing so a refetch
 * keeps them. Each is a run of whole words as MaxPreps writes them and as the family does, matched in
 * any case (a school that types the roster in capitals sends "OLIVIA VAN DE BRAAK", and the recasing
 * leaves a two-letter word such as "DE" as it is). The two sides have the same number of words, word for
 * word, so a roster row's first and last names are respelled along with its full name. Curated, never
 * guessed: an entry says who confirmed it.
 */
export const NAME_SPELLINGS: readonly { maxpreps: string; spelled: string; basis: string }[] = [
  {
    maxpreps: 'Van De Braak',
    spelled: 'Van de Braak',
    basis:
      "Olivia Van de Braak (St. Ignatius): the site owner confirmed the lowercase 'de' (2026-11-16), as SCVAL's " +
      '2025-26 all-league list writes it.',
  },
  {
    maxpreps: 'Gretta Jungjohann',
    spelled: 'Greta Jungjohann',
    basis: 'Greta Jungjohann (Stevenson): the site owner confirmed the one-t spelling of her first name (2026-11-16).',
  },
  {
    maxpreps: 'Sophie (mai Lam) Vu',
    spelled: 'Sophie (Mai Lam) Vu',
    basis: "Sophie (Mai Lam) Vu (Saratoga): the site owner confirmed the capital 'Mai' (2026-11-16).",
  },
  {
    maxpreps: 'Van every',
    spelled: 'Van Every',
    basis: "Kiana Van Every (soccer): the site owner confirmed both words of the last name are capitalized (2026-11-25).",
  },
  {
    maxpreps: 'Iris jin',
    spelled: 'Iris Jin',
    basis: "Iris Jin (Saratoga volleyball): SCVAL's 2025-26 all-league list types 'jin' without its capital, which MaxPreps' roster has; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'gigi Giraldiana',
    spelled: 'Gigi Giraldiana',
    basis: "Gigi Giraldiana (North Monterey County soccer): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'kimberly Mauricio',
    spelled: 'Kimberly Mauricio',
    basis: "Kimberly Mauricio (North Monterey County soccer): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Audrey Pin (gamecho)',
    spelled: 'Audrey Pin (Gamecho)',
    basis: "Audrey Pin (Gamecho) (Pacific Grove soccer): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'kriday Ramkumar',
    spelled: 'Kriday Ramkumar',
    basis: "Kriday Ramkumar (MacDonald basketball JV): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'kekobad',
    spelled: 'Kekobad',
    basis: "Karl Kekobad (MacDonald basketball JV): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'De leon',
    spelled: 'De Leon',
    basis: "Lorenz D. De Leon (Rancho San Juan basketball): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'jen Li',
    spelled: 'Jen Li',
    basis: "Jen Li (Saratoga volleyball): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Elizabeth (zibby) Baker',
    spelled: 'Elizabeth (Zibby) Baker',
    basis: "Elizabeth (Zibby) Baker (Point Loma field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Louella (lulu) Guevara',
    spelled: 'Louella (Lulu) Guevara',
    basis: "Louella (Lulu) Guevara (Huntington Beach field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Elizabeth "betty" Bush',
    spelled: 'Elizabeth "Betty" Bush',
    basis: 'Elizabeth "Betty" Bush (Westview field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner\'s request (2026-11-25).',
  },
  {
    maxpreps: 'Camille (cj) Bulatao',
    spelled: 'Camille (CJ) Bulatao',
    basis: "Camille (CJ) Bulatao (Scripps Ranch field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Eleanor (norah) Elder',
    spelled: 'Eleanor (Norah) Elder',
    basis: "Eleanor (Norah) Elder (Archie Williams field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner's request (2026-11-25).",
  },
  {
    maxpreps: 'Amelia "mimi" Scatena',
    spelled: 'Amelia "Mimi" Scatena',
    basis: 'Amelia "Mimi" Scatena (Mission Bay field hockey): a word typed without its capital, in an otherwise cased name; capitalized at the site owner\'s request (2026-11-25).',
  },
];

const words = (name: string) => name.split(/\s+/).filter(Boolean);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole words only: not inside a longer word, a hyphenated name or an apostrophe ("Smith-Van De Braak"). */
const wholeWords = (text: string, flags: string) =>
  new RegExp(`(?<![\\p{L}'’-])${escape(text)}(?![\\p{L}'’-])`, flags);

const SPELLINGS = NAME_SPELLINGS.map(({ maxpreps, spelled }) => {
  const from = words(maxpreps);
  const to = words(spelled);
  if (from.length !== to.length) {
    throw new Error(`lib/sources/person-name.ts: "${maxpreps}" and "${spelled}" differ in their number of words`);
  }
  return { re: wholeWords(maxpreps, 'giu'), spelled, pairs: from.map((w, i) => [w, to[i]] as const) };
});

function respell(name: string): string {
  return SPELLINGS.reduce((n, { re, spelled }) => n.replace(re, spelled), name);
}

/**
 * A first or last name respelled word for word by every entry its row's full name matched: "Gretta" is
 * "Greta" only on Gretta Jungjohann's row, never on every Gretta's.
 */
function respellPart(part: string, fullName: string): string {
  return SPELLINGS.filter(({ re }) => {
    re.lastIndex = 0;
    return re.test(fullName);
  }).reduce(
    (n, { pairs }) => pairs.reduce((m, [from, to]) => m.replace(wholeWords(from, 'giu'), to), n),
    part,
  );
}

function recaseAs(name: string, uncased: boolean): string {
  return name.replace(/\S+/g, uncased ? capitalize : (w) => fixCased(recaseShouted(w)));
}

/**
 * "PAIGE PIERSON" → "Paige Pierson", "McKAELA" → "McKaela", "O'BRIEN-SMITH" → "O'Brien-Smith",
 * "addie dawson" → "Addie Dawson", "A. dawson" → "A. Dawson", "Wright-lopez" → "Wright-Lopez"; then
 * NAME_SPELLINGS ("Olivia Van De Braak" → "Olivia Van de Braak").
 */
export function recaseName(name: string): string {
  return respell(recaseAs(name, isUncased(name)));
}

/**
 * A roster row's three name fields, recased on one decision taken from the full name: judged
 * alone, the "de la cruz" of "Anna de la cruz" would look uncased and come back "De La Cruz".
 */
export function recaseNameParts<P extends { firstName: string | null; lastName: string | null; fullName: string }>(
  p: P,
): P {
  const uncased = isUncased(p.fullName);
  const fullName = recaseAs(p.fullName, uncased);
  const part = (name: string | null) => (name === null ? null : respellPart(recaseAs(name, uncased), fullName));
  return { ...p, firstName: part(p.firstName), lastName: part(p.lastName), fullName: respell(fullName) };
}
