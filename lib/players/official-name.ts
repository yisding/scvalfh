/**
 * Which of a player's spellings is her official name, and what each of the others is.
 *
 * A player's sources spell her several ways: the MaxPreps roster's "Maddie Grimsley", the school's
 * "Madeleine Grimsley", the stat sheet's "Madeleine Grimsly". The registry shows one, the official
 * name, and files every other spelling under a kind (NAME_KINDS in lib/players/registry-schema.ts):
 *
 *   nickname    a familiar or chosen form: a first name that is a short form of the official one
 *               ("Maddie" for Madeleine, "Kai" for Kailaya), or a spelling that carries a second
 *               given name in parentheses or as an extra word ("Wenhe (Angela) Zhang" beside
 *               "Wenhe Zhang", "Giuliana Gigi Borello" beside "Giuliana Borello")
 *   previous    a name the player went by before and no longer does. Only a person says so
 *               (data/player-identity.json `names`): no rule can tell a changed name from a slip
 *   short-form  the official name with a part left out: a middle name, one of two last names
 *               ("Alana Phan" for "Alana Phan-Rodriguez")
 *   spelling    the same words a letter or two apart ("Popok", "Popek"): which one is right is
 *               the official name's source's word against the other's, nothing more
 *   variant     anything else: the words in another order, a source's annotations
 *               ("Sienna Steele (GK) 10"), a first name the table does not know as a nickname
 *
 * THE OFFICIAL NAME, in the order the rules run:
 *
 *   1. What a person has decided (data/player-identity.json `names` official) is the name.
 *   2. A spelling that is a nickname or a short form of another of the player's spellings is never
 *      official while that fuller spelling is there: a full name is more official than a familiar
 *      one, and a whole name than a part of it.
 *   3. Of what is left, a clean spelling beats one carrying a source's annotations ("(GK)", a
 *      grade), a word typed without its capital ("Iris jin"), stray spacing or decorative letters,
 *      and a spelling some list prints beats a stat sheet's, which MaxPreps rebuilds from the roster.
 *   4. Then the spelling the most sources agree on: each source counts once a season, and MaxPreps'
 *      roster pages and stat sheets are one source. A slip of the pen is rarely made twice.
 *   5. Then a spelling with its marks beats the same letters without them: accents, apostrophes and
 *      hyphens ("Téa", "Tea"; "O'Neil", "ONeil"; "Sebastian-Carattini", "Sebastian Carattini").
 *   6. Then the most official source: the school's own published list, then a cited public source
 *      (the overlay: a school site, a newspaper), then MaxPreps' rosters (which the coach types in),
 *      then a recruiting profile, then the league's all-league list, then a stat sheet. The
 *      all-league lists give full names (rule 2 takes those whatever the source) but are typed
 *      again by the league each year: of the 2026-11 registry's one-against-one spelling ties
 *      between an all-league list and a MaxPreps roster, the list held the slip in nearly every
 *      one ("Mitchelle", "Caityln", "Neibuhr", "Maletec").
 *   7. Then the latest season, then the longer spelling, then the alphabet, so a rebuild in any
 *      order picks the same name.
 *
 * Pure. Nothing here joins two players: it only orders the spellings one player already has.
 */

import { NICKNAMES } from './nicknames';
import { NOT_A_NAME, editDistance, fold, nameKey, nameTokens } from './name-compare';
import type { NameKind, ObservationSource } from './registry-schema';

/** One spelling of one player, where it was read. */
export interface SpellingSeen {
  name: string;
  src: ObservationSource;
  season: string;
}

/** What a person has decided about one player's names (data/player-identity.json `names`). */
export interface CuratedNames {
  official?: string;
  previous?: readonly string[];
}

/**
 * The rule that settled the official name: a person, rule 2 leaving one spelling, or the first of
 * rules 3–7 to tell the two leading spellings apart. `only` is a player with one spelling.
 */
export type DecidedBy = 'person' | 'only' | 'fullest' | 'clean' | 'listed' | 'support' | 'marks' | 'source' | 'season' | 'length' | 'alphabet';

export interface NameChoice {
  name: string;
  decidedBy: DecidedBy;
  /** Every other spelling, in the order given, then any curated name no source spells. */
  aliases: Array<{ name: string; kind: NameKind }>;
}

/** Most official first: rule 6 above. */
const OFFICIAL_SOURCES: readonly ObservationSource[] = [
  'school-jv-roster',
  'enrichment',
  'maxpreps-roster',
  'maxpreps-jv-roster',
  'profile',
  'all-league',
  'maxpreps-stats',
];

/** Endings a familiar form adds to a stem: "Maddie" is "Madd" + "ie", "Izzy" "Izz" + "y". */
const DIMINUTIVE = /(ie|ee|ey|y|i|e)$/;

/**
 * Whether the given name `short` is a familiar form of `full`: the table's (lib/players/nicknames.ts),
 * a stem of it that `full` begins with ("Kai", "Kailaya"; "Nate", "Nathan"; "Ollie", "Oliver"), the
 * end of it ("Bella", "Ysabella"), or its first two letters doubled ("Gigi", "Giuliana"; "Lala",
 * "Laura"). Two names a single letter apart are a spelling, not a nickname ("Chevy", "Chevey").
 */
export function isNicknameOf(short: string, full: string): boolean {
  const a = fold(short).replace(/[^a-z]/g, '');
  const b = fold(full).replace(/[^a-z]/g, '');
  if (a === '' || b === '' || a === b) return false;
  if (NICKNAMES[a]?.includes(b)) return true;
  if (a.length >= b.length || editDistance(a, b) <= 1) return false;
  if (a.length >= 2 && b.length - a.length >= 2 && b.startsWith(a)) return true;
  if (a.length >= 4 && b.length - a.length >= 2 && b.endsWith(a)) return true;
  if (a.length === 4 && a.slice(0, 2) === a.slice(2) && b.startsWith(a.slice(0, 2))) return true;
  const stems = new Set<string>();
  const cut = a.replace(DIMINUTIVE, '');
  if (cut !== a) stems.add(cut);
  // "Franny" → "Frann" → "Fran"; "Emme" → "Emm" → "Em".
  for (const s of [...stems]) if (s.length >= 3 && s.at(-1) === s.at(-2)) stems.add(s.slice(0, -1));
  return [...stems].some((s) => s.length >= 2 && b.startsWith(s));
}

interface Parsed {
  raw: string;
  /** The name's words outside parentheses and quotes. */
  core: string[];
  /** Name words in parentheses or quotes: "Vivienne (Bella) Pablo" → ["bella"]; "(GK)" gives none. */
  paren: string[];
  /**
   * Something a clean spelling does not have: a source's annotations ("(GK)", a grade), a word
   * typed without its capital ("Iris jin"; "de", "van" and their kind are written small), stray
   * spacing ("Medeiros- Schomberg"), or letters from a decorative alphabet.
   */
  flawed: boolean;
}

/** Name words written in lower case by custom: "Olivia Van de Braak", "Colette von Klemperer". */
const PARTICLES = new Set(['de', 'da', 'del', 'della', 'der', 'di', 'do', 'dos', 'du', 'la', 'le', 'van', 'von', 'y', 'e', 'bin', 'bint', 'al', 'el', 'ten', 'ter']);
const ASIDE = /\(([^)]*)\)|["“”]([^"“”]*)["“”]/g;

function parse(raw: string): Parsed {
  const inside = [...raw.matchAll(ASIDE)].map((m) => m[1] ?? m[2] ?? '').join(' ');
  const core = nameTokens(raw.replace(ASIDE, ' '));
  const words = fold(raw).split(/[^a-z0-9]+/).filter(Boolean);
  const annotated = /\d/.test(raw) || words.some((w) => w === 'gk' || w === 'slug');
  const uncased = raw
    .replace(ASIDE, ' ')
    .split(/\s+/)
    .some((w) => {
      const first = w.match(/\p{L}/u)?.[0];
      return first !== undefined && first !== first.toUpperCase() && !PARTICLES.has(fold(w).replace(/[^a-z]/g, ''));
    });
  const spacing = /\s[-–]|[-–]\s|\s{2,}/.test(raw.trim());
  const decorative = raw.normalize('NFKC') !== raw.normalize('NFC');
  return { raw, core, paren: nameTokens(inside).filter((w) => !NOT_A_NAME.has(w)), flawed: annotated || uncased || spacing || decorative };
}

/** How many accents, apostrophes and hyphens a spelling keeps: "Téa" 1, "O'Neil" 1, "ONeil" 0. */
const marks = (raw: string) => (raw.normalize('NFD').match(/[\u0300-\u036f'’-]/g) ?? []).length;

/** Where a spelling was read, as rule 4 counts sources: MaxPreps' pages are one. */
const family = (src: ObservationSource) => (src === 'maxpreps-roster' || src === 'maxpreps-jv-roster' || src === 'maxpreps-stats' ? 'maxpreps' : src);

const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((w, i) => w === y[i]);
/** Every word of `x` is in `y`, in order. */
function within(x: readonly string[], y: readonly string[]): boolean {
  let j = 0;
  for (const w of x) {
    while (j < y.length && y[j] !== w) j += 1;
    if (j === y.length) return false;
    j += 1;
  }
  return true;
}
const lastOf = (p: Parsed) => p.core[p.core.length - 1];
/** The last names agree: the same, or one is a word of the other's ("Phan", "Phan Rodriguez"). */
const lastAgrees = (a: Parsed, b: Parsed) => lastOf(a) === lastOf(b) || b.core.slice(1).includes(lastOf(a)) || a.core.slice(1).includes(lastOf(b));

/**
 * What `a` is beside `b`, when it is a less official form of it (rule 2), else null. `firstNames`
 * are the first names the player's spellings use: a word one spelling adds that another uses as a
 * first name is a nickname written in, not a middle name.
 */
function lesserForm(a: Parsed, b: Parsed, firstNames: ReadonlySet<string>): 'nickname' | 'short-form' | null {
  if (a.core.length === 0 || b.core.length === 0) return null;
  // "Wenhe (Angela) Zhang" beside "Wenhe Zhang".
  if (same(a.core, b.core)) return a.paren.length > 0 && b.paren.length === 0 ? 'nickname' : null;
  // "Bella Pablo" beside "Vivienne (Bella) Pablo".
  if (b.paren.includes(a.core[0]) && lastAgrees(a, b) && a.core.length <= b.core.length) return 'nickname';
  // "Maddie Grimsley" beside "Madeleine Grimsley".
  if (isNicknameOf(a.core[0], b.core[0]) && lastAgrees(a, b) && a.core.length <= b.core.length) return 'nickname';
  // a adds words to b. When one of them is the player's other first name, or a short form of this
  // one, a is the one carrying a nickname: "Giuliana Gigi Borello" beside "Giuliana Borello".
  if (b.core[0] === a.core[0] && b.core.length < a.core.length && within(b.core, a.core)) {
    const added = a.core.filter((w) => !b.core.includes(w));
    if (added.some((w) => (firstNames.has(w) && w !== a.core[0]) || isNicknameOf(w, a.core[0]))) return 'nickname';
    return null;
  }
  return null;
}

/** `a` leaves out part of `b`: "Alana Phan" of "Alana Phan Rodriguez". Two words at least. */
function shortFormOf(a: Parsed, b: Parsed, firstNames: ReadonlySet<string>): boolean {
  if (a.core.length < 2 || a.core.length >= b.core.length || a.core[0] !== b.core[0] || !within(a.core, b.core)) return false;
  // …unless what b adds is a nickname written in (lesserForm says b is the lesser one then).
  return lesserForm(b, a, firstNames) === null;
}

function kindBeside(s: Parsed, o: Parsed, firstNames: ReadonlySet<string>): NameKind {
  const lesser = lesserForm(s, o, firstNames);
  if (lesser) return lesser;
  if (shortFormOf(s, o, firstNames)) return 'short-form';
  if (s.core.length > 0 && s.core.length === o.core.length && !same(s.core, o.core)) {
    if ([...s.core].sort().join(' ') === [...o.core].sort().join(' ')) return 'variant';
    if (editDistance(s.core.join(''), o.core.join('')) <= 2) return 'spelling';
  }
  return 'variant';
}

/**
 * The official name of a player whose sources spell her as `spellings` (each spelling once per
 * source and season it was read in), and the kind of every other spelling. `order` is the order the
 * other spellings are listed in; `curated` is what a person has decided.
 */
export function chooseNames(order: readonly string[], spellings: readonly SpellingSeen[], curated?: CuratedNames): NameChoice {
  if (order.length === 0) throw new Error('chooseNames: a player with no spelling');
  const seen = new Map<string, { rank: number; season: string; listed: boolean; support: Set<string> }>();
  for (const s of spellings) {
    const rank = OFFICIAL_SOURCES.indexOf(s.src);
    const was = seen.get(s.name);
    seen.set(s.name, {
      rank: Math.min(was?.rank ?? Infinity, rank === -1 ? OFFICIAL_SOURCES.length : rank),
      season: was && was.season > s.season ? was.season : s.season,
      listed: (was?.listed ?? false) || s.src !== 'maxpreps-stats',
      support: (was?.support ?? new Set<string>()).add(`${family(s.src)} ${s.season}`),
    });
  }
  const parsed = new Map(order.map((n) => [n, parse(n)]));
  const firstNames = new Set([...parsed.values()].flatMap((p) => (p.core.length ? [p.core[0], ...p.paren] : [])));
  const lesser = (a: string) =>
    order.some((b) => b !== a && nameKey(b) !== '' && (lesserForm(parsed.get(a) as Parsed, parsed.get(b) as Parsed, firstNames) !== null || shortFormOf(parsed.get(a) as Parsed, parsed.get(b) as Parsed, firstNames)));
  const open = order.filter((n) => !lesser(n));
  const pool = open.length > 0 ? open : [...order];
  const score = (n: string) => {
    const p = parsed.get(n) as Parsed;
    const s = seen.get(n);
    // Rule 5: the same letters as another spelling, with fewer marks.
    const flattened = order.some((m) => m !== n && nameKey(m) === nameKey(n) && marks(m) > marks(n));
    return [p.flawed ? 1 : 0, s?.listed === false ? 1 : 0, -(s?.support.size ?? 0), flattened ? 1 : 0, s?.rank ?? OFFICIAL_SOURCES.length];
  };
  pool.sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    const [sa, sb] = [seen.get(a)?.season ?? '', seen.get(b)?.season ?? ''];
    if (sa !== sb) return sa > sb ? -1 : 1;
    if (nameKey(a).length !== nameKey(b).length) return nameKey(b).length - nameKey(a).length;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const name = curated?.official ?? pool[0];
  let decidedBy: DecidedBy = 'only';
  if (curated?.official !== undefined) decidedBy = 'person';
  else if (pool.length === 1) decidedBy = order.length > 1 ? 'fullest' : 'only';
  else {
    const [x, y] = [score(pool[0]), score(pool[1])];
    const rules: DecidedBy[] = ['clean', 'listed', 'support', 'marks', 'source'];
    const i = x.findIndex((v, k) => v !== y[k]);
    const [sa, sb] = [seen.get(pool[0])?.season ?? '', seen.get(pool[1])?.season ?? ''];
    decidedBy = i !== -1 ? rules[i] : sa !== sb ? 'season' : nameKey(pool[0]).length !== nameKey(pool[1]).length ? 'length' : 'alphabet';
  }
  const previous = new Set(curated?.previous ?? []);
  const official = parse(name);
  const rest = [...order.filter((n) => n !== name), ...[...previous].filter((n) => n !== name && !order.includes(n))];
  return {
    name,
    decidedBy,
    aliases: rest.map((n) => ({ name: n, kind: previous.has(n) ? 'previous' : kindBeside(parsed.get(n) ?? parse(n), official, firstNames) })),
  };
}
