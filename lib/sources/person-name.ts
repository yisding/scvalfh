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
 * leaves a two-letter word such as "DE" as it is). Where the two sides have the same number of words, a
 * roster row's first and last names are respelled word for word along with its full name; where they do
 * not (two words joined by a hyphen: "Ann Katrin" → "Ann-Katrin"), a first or last name is respelled only
 * when it is the whole run. Curated, never guessed: an entry says who confirmed it.
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
    maxpreps: 'SaynWittgenstein',
    spelled: 'Sayn-Wittgenstein',
    basis: "Ann Katrin Sayn-Wittgenstein (Los Gatos field hockey, 2025-26): the site owner confirmed the hyphen MaxPreps' stat sheet drops (2026-11-25).",
  },
  {
    maxpreps: 'Ann Katrin',
    spelled: 'Ann-Katrin',
    basis: "Ann-Katrin Sayn-Wittgenstein (Los Gatos field hockey, 2025-26): the site owner confirmed the hyphen in her first name too (2026-11-25). No other player in the repository is named Ann Katrin.",
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
    maxpreps: 'Decker Alina',
    spelled: 'Alina Decker',
    basis:
      "Alina Decker (Menlo-Atherton soccer): MaxPreps' row has her first and last names the other way round (first name " +
      "'Decker', last name 'Alina'); the M-A Chronicle names her Alina Decker, and the site owner asked for the swap (2026-11-26). " +
      'The pairs apply at once, so her first name becomes Alina and her last name Decker.',
  },
  {
    maxpreps: 'Gklaros-Stavropolous',
    spelled: 'Gklaros-Stavropoulos',
    basis:
      "Melina Gklaros-Stavropoulos (Archbishop Mitty volleyball): MaxPreps' roster and stat sheets spell the second half " +
      "'Stavropolous'; her Prep Dig page and the NCVA's Power League roster write 'Stavropoulos', as her brother Nick's " +
      "Mitty basketball row does, and the site owner confirmed it (2026-11-27).",
  },
  {
    maxpreps: 'Victoria Tuipolotu',
    spelled: 'Victoria Tuipulotu',
    basis:
      "Victoria Tuipulotu (Saint Francis volleyball): MaxPreps' roster writes 'Tuipolotu'; Saint Francis' own Hudl team " +
      "roster and the NCVA's Power League roster write 'Tuipulotu', and the site owner confirmed it (2026-11-27). Her " +
      'row only: the run is her whole name.',
  },
  {
    maxpreps: 'Thas Ettori',
    spelled: 'Thaïs Ettori',
    basis: "Thaïs Ettori (Archbishop Mitty volleyball): MaxPreps drops the 'ï' ('Thas'); her own Hudl profile writes 'Thaïs Ettori' and the NCVA's Vision 16 Gold roster 'Thais Ettori'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Caylee Chinn',
    spelled: 'Caylee Chin',
    basis: "Caylee Chin (Sacred Heart Cathedral volleyball): MaxPreps' roster writes 'Chinn'; her own Hudl profile, the NCVA's SF Tremors 16 roster and MaxPreps' own 2025-26 stat sheet write 'Chin'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Chelsie Chinn',
    spelled: 'Chelsie Chin',
    basis: "Chelsie Chin (Sacred Heart Cathedral volleyball, JV): MaxPreps' JV roster writes 'Chinn'; her own Hudl profile and the NCVA's SF Tremors 15 roster write 'Chin', as for her sister Caylee. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Dhrishti Shan',
    spelled: 'Dhrishti Shah',
    basis: "Dhrishti Shah (Saratoga volleyball, JV): MaxPreps' JV roster writes 'Shan'; Saratoga's own JV roster (shs-athletics.com) and the NCVA's Red Rock 14 roster write 'Shah'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Nethra Lyer',
    spelled: 'Nethra Iyer',
    basis: "Nethra Iyer (Saratoga volleyball, JV): MaxPreps' JV roster writes 'Lyer', a lowercase l for the capital I; Saratoga's own JV roster writes 'Iyer'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Madina Nooray',
    spelled: 'Madina Noorzay',
    basis: "Madina Noorzay (Saratoga volleyball, JV): MaxPreps' JV roster writes 'Nooray'; Saratoga's own JV roster writes 'Noorzay'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Kyraiki Pries',
    spelled: 'Kyriaki Pries',
    basis: "Kyriaki Pries (Leland field hockey, JV): MaxPreps' JV roster writes 'Kyraiki'; Leland's own JV list writes 'Kyriaki', the Greek name. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Bradfrd',
    spelled: 'Bradford',
    basis: "Ella Bradford (Stevenson field hockey): MaxPreps' roster and 2026 stat sheet write 'Bradfrd'; its own 2025-26 stat sheet writes 'Bradford'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the surname alone, which no one else has, so the stat sheet's 'E. Bradfrd' is respelled too.",
  },
  {
    maxpreps: 'Guiliana (GiGi) Borello',
    spelled: 'Giuliana (GiGi) Borello',
    basis: "Giuliana (GiGi) Borello (Valley Christian soccer): MaxPreps' soccer roster transposes two letters ('Guiliana'); the school's own rosters, the 2025-26 all-league list and her field hockey row write 'Giuliana' (data/player-identity.json, 2026-11-22). Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Daisy Regaldo',
    spelled: 'Daisy Regalado',
    basis: "Daisy Regalado (Andrew Hill soccer): MaxPreps' soccer roster writes 'Regaldo'; her volleyball row at the same school writes 'Regalado'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
  },
  {
    maxpreps: 'Varun Pannikar',
    spelled: 'Varun Panikkar',
    basis: "Varun Panikkar (Homestead basketball): MaxPreps' roster writes 'Pannikar'; SCVAL's official 2025-26 all-league list writes 'Panikkar'. Corrected at the site owner's request after a sweep for MaxPreps misspellings (2026-11-27); keyed to the whole name, so no one else is respelled.",
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
  // Word for word where the counts agree; otherwise a part is respelled only when it is the whole run.
  const pairs = from.length === to.length ? from.map((w, i) => [w, to[i]] as const) : [];
  return { re: wholeWords(maxpreps, 'giu'), whole: new RegExp(`^${escape(maxpreps)}$`, 'iu'), spelled, pairs };
});

function respell(name: string): string {
  return SPELLINGS.reduce((n, { re, spelled }) => n.replace(re, spelled), name);
}

/**
 * A first or last name respelled word for word by every entry its row's full name matched: "Gretta" is
 * "Greta" only on Gretta Jungjohann's row, never on every Gretta's. An entry's word pairs apply in one pass,
 * so an entry that swaps two words ("Decker Alina" → "Alina Decker") swaps them rather than undoing itself.
 */
function respellPart(part: string, fullName: string): string {
  return SPELLINGS.filter(({ re }) => {
    re.lastIndex = 0;
    return re.test(fullName);
  }).reduce((n, { whole, spelled, pairs }) => {
    if (whole.test(n)) return spelled;
    if (pairs.length === 0) return n;
    const to = new Map(pairs.map(([from, word]) => [from.toLowerCase(), word]));
    const any = new RegExp(`(?<![\\p{L}'’-])(?:${pairs.map(([from]) => escape(from)).join('|')})(?![\\p{L}'’-])`, 'giu');
    return n.replace(any, (word) => to.get(word.toLowerCase()) ?? word);
  }, part);
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
