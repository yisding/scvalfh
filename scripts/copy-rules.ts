/**
 * Copy rules shared by scripts/assert-copy.ts and its test (tests/copy-rules.test.ts): pure, so a
 * test can import them without running the script's scan of the built site.
 */

/**
 * A phrase that says something is limited to SCVAL: "SCVAL-only", "SCVAL only", "only SCVAL",
 * "only for the SCVAL", "SCVAL teams only".
 */
const SCVAL_LIMIT = String.raw`(?:SCVAL[- ](?:teams[- ])?only|only (?:(?:for|in|on|the) )*SCVAL)`;
/** What it must not be said about: rosters and player stats now cover every league. */
const SUBJECT = String.raw`(?:rosters?|player stats?)`;

/**
 * Rendered text (tags excluded between the two halves) claiming rosters or player stats are
 * SCVAL-only, either order, or a bare "rosters (SCVAL)" label. Rosters and player stats cover all
 * four leagues, so any such claim on a page is stale copy.
 */
export const SCVAL_ONLY_CLAIM = new RegExp(
  String.raw`\b${SUBJECT}\b[^<>]{0,120}\b${SCVAL_LIMIT}\b|\b${SCVAL_LIMIT}\b[^<>]{0,120}\b${SUBJECT}\b|\b${SUBJECT}\s*\(\s*SCVAL(?: only| teams)?\s*\)`,
  'i',
);

// ---------------------------------------------------------------- clubs (SPEC §1.1j2, DESIGN §17.2)

/** The slice of data/clubs.json the leak rule reads. Type-only, so this file stays pure. */
interface LeakAffiliation {
  teamSlug: string;
  fullName: string;
  club: string;
  basis: string;
  sources: ReadonlyArray<{ url: string; quote: string }>;
}

/** A quote fragment shorter than this (in letters and digits) is too common to call a leak. */
export const LEAK_MIN_FRAGMENT = 40;

/**
 * An excerpt of a quote (a run of LEAK_MIN_FRAGMENT or more, not the whole fragment) is a leak only
 * when at least this many of its letters and digits are not public vocabulary (`publicTerms`): the
 * site prints school, club and college names, cities and rostered players' names side by side all
 * the time, and a quote that opens "St. Ignatius College Preparatory | San Francisco …" shares a
 * 40-letter run with every page that prints that school and its city.
 */
export const LEAK_MIN_PRIVATE = 20;

/** What the leak rules accept besides the page and the file. */
export interface LeakOptions {
  /**
   * Source URLs whose document the page prints from a source of its own (see affiliationLeaks):
   * a quote from one of these is not reported; a basis always is.
   */
  printsItself?: ReadonlySet<string>;
  /**
   * Names and places the site prints in its own right (scripts/public-terms.ts): they do not count
   * towards LEAK_MIN_PRIVATE. Without them every letter of an excerpt counts as private.
   */
  publicTerms?: readonly string[];
}

const LEAK_ENTITIES: Readonly<Record<string, string>> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/**
 * Lower-case letters and digits only, after decoding what can hide them: tags, HTML entities
 * (`&amp;`, `&#x27;`, `&rsquo;`) and the JSON escapes of an inline RSC payload (`&`, `\"`).
 * Spacing, punctuation and line breaks then cannot split a match.
 */
function squash(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\u([0-9a-f]{4})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return LEAK_ENTITIES[e.toLowerCase()] ?? ' ';
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Where `text` (a built page, or a rendered component) shows what data/clubs.json keeps but never
 * renders: an affiliation's `basis`, or a run of at least LEAK_MIN_FRAGMENT letters and digits from a
 * source's verbatim `quote` (split on "…"), whole or excerpted. Both can name people who are not on
 * the tracked rosters — a club's director, a teammate, a coach — so a hit is a privacy failure, not a
 * style one. Returns one line per leak, naming whose record it came from; [] when clean.
 *
 * `printsItself`: source URLs whose document the page prints from a source of its own. A quote is
 * verbatim public text, so a page built from another of the site's sources can show the same words:
 * /history/2025-26 prints the SCVAL 2025-26 all-league PDF, which four quotes copy a line of. A
 * quote from one of these URLs is not reported; a basis — the researchers' own prose, which no
 * other source can print — always is. scripts/assert-copy.ts passes it only for a page that is not
 * built from data/clubs.json and that cites the document itself.
 */
export function affiliationLeaks(
  text: string,
  file: { affiliations: readonly LeakAffiliation[] },
  { printsItself, publicTerms = [] }: LeakOptions = {},
): string[] {
  return leaks(
    squash(text),
    file.affiliations.map((a) => ({ who: `${a.teamSlug} / ${a.fullName} (${a.club})`, basis: a.basis, sources: a.sources })),
    printsItself,
    publicTerms,
  );
}

// ---------------------------------------------------------------- commits (SPEC §1.1j3, DESIGN §21.2)

/** The slice of data/commits.json the leak rule reads. Type-only, so this file stays pure. */
interface LeakCommitment {
  teamSlug: string;
  fullName: string;
  college: string;
  basis: string;
  sources: ReadonlyArray<{ url: string; quote: string }>;
}

/**
 * `affiliationLeaks` for data/commits.json: a commitment's `basis`, or a fragment of a source's
 * verbatim `quote`, shown on a page. Same rule, same threshold, same `printsItself` excuse: a
 * commitment list or a news story can name teammates and coaches who are not on the rosters, so a
 * hit is a privacy failure. One line per leak, naming whose record it came from; [] when clean.
 */
export function commitmentLeaks(
  text: string,
  file: { commitments: readonly LeakCommitment[] },
  { printsItself, publicTerms = [] }: LeakOptions = {},
): string[] {
  return leaks(
    squash(text),
    file.commitments.map((c) => ({ who: `${c.teamSlug} / ${c.fullName} (${c.college})`, basis: c.basis, sources: c.sources })),
    printsItself,
    publicTerms,
  );
}

/**
 * The shared rule: a record's basis anywhere on the page; a whole quote fragment of at least
 * LEAK_MIN_FRAGMENT; or an excerpt of one at least that long with LEAK_MIN_PRIVATE letters and
 * digits that are not public vocabulary.
 */
function leaks(
  page: string,
  records: ReadonlyArray<{ who: string; basis: string; sources: ReadonlyArray<{ url: string; quote: string }> }>,
  printsItself: ReadonlySet<string> | undefined,
  publicTerms: readonly string[],
): string[] {
  const found: string[] = [];
  for (const r of records) {
    if (page.includes(squashed(r.basis))) found.push(`${r.who}: its basis`);
    for (const s of r.sources) {
      if (printsItself?.has(s.url)) continue;
      const hit = s.quote.split('…').some((fragment) => sharesRun(page, squashed(fragment), publicTerms));
      if (hit) found.push(`${r.who}: the quote from ${s.url}`);
    }
  }
  return found;
}

/** `squash` of a record's text, kept: assert-copy checks every built page against the same records. */
const SQUASHED = new Map<string, string>();
function squashed(text: string): string {
  let value = SQUASHED.get(text);
  if (value === undefined) {
    value = squash(text);
    SQUASHED.set(text, value);
  }
  return value;
}

/**
 * For each position of `fragment`, how many of its letters and digits up to there are NOT covered by
 * a public term (a prefix sum, so a run's private count is two lookups). Kept per terms list and
 * fragment: both are fixed for a whole assert-copy run.
 */
const PRIVATE_COUNTS = new WeakMap<readonly string[], Map<string, Int32Array>>();
/** Public terms shorter than this, in letters and digits, are not set aside. */
const MIN_PUBLIC_TERM = 5;
function privateCounts(fragment: string, publicTerms: readonly string[]): Int32Array {
  let byFragment = PRIVATE_COUNTS.get(publicTerms);
  if (!byFragment) {
    byFragment = new Map();
    PRIVATE_COUNTS.set(publicTerms, byFragment);
  }
  let counts = byFragment.get(fragment);
  if (counts) return counts;
  const isPublic = new Uint8Array(fragment.length);
  for (const term of publicTerms) {
    const t = squashed(term);
    // An abbreviation or a short mascot ("SI", "Rams") would mark letters inside unrelated words.
    if (t.length < MIN_PUBLIC_TERM) continue;
    for (let at = fragment.indexOf(t); at !== -1; at = fragment.indexOf(t, at + 1)) isPublic.fill(1, at, at + t.length);
  }
  counts = new Int32Array(fragment.length + 1);
  for (let i = 0; i < fragment.length; i++) counts[i + 1] = counts[i] + (isPublic[i] ? 0 : 1);
  byFragment.set(fragment, counts);
  return counts;
}

/**
 * Whether `page` shows `fragment` (squashed): the whole of it, at least LEAK_MIN_FRAGMENT long; or a
 * run of it at least that long, from anywhere in it, with LEAK_MIN_PRIVATE letters and digits that no
 * public term covers. Any run that long contains one of the fragment's aligned chunks of half that
 * length (rounded up), so only those chunks are searched for, and each place one is found is extended
 * both ways along the fragment to measure the shared run. That keeps assert-copy's scan of every page
 * near one search per chunk.
 */
function sharesRun(page: string, fragment: string, publicTerms: readonly string[]): boolean {
  if (fragment.length < LEAK_MIN_FRAGMENT) return false;
  if (page.includes(fragment)) return true;
  const size = Math.ceil(LEAK_MIN_FRAGMENT / 2);
  for (let start = 0; start + size <= fragment.length; start += size) {
    const chunk = fragment.slice(start, start + size);
    for (let at = page.indexOf(chunk); at !== -1; at = page.indexOf(chunk, at + 1)) {
      let before = 0;
      while (before < start && before < at && page[at - before - 1] === fragment[start - before - 1]) before++;
      let after = size;
      while (start + after < fragment.length && at + after < page.length && page[at + after] === fragment[start + after]) {
        after++;
      }
      if (before + after < LEAK_MIN_FRAGMENT) continue;
      const counts = privateCounts(fragment, publicTerms);
      if (counts[start + after] - counts[start - before] >= LEAK_MIN_PRIVATE) return true;
    }
  }
  return false;
}

/**
 * The `<section …>…</section>` element whose start tag carries `id="<id>"`, wherever that attribute
 * sits in the tag (React renders a division's `className` before its `id`, a league's after), up to
 * its own closing tag: sections nested inside it (a league's division sections) are part of it, a
 * sibling section is not. '' when no section carries that id.
 */
export function sectionById(html: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(String.raw`<section\b[^>]*\sid=(?:"${escaped}"|'${escaped}')[^>]*>`, 'i').exec(html);
  if (!start) return '';
  const tag = /<(\/?)section\b[^>]*>/gi;
  tag.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start.index, m.index + m[0].length);
  }
  // Never closed: everything after it is inside it.
  return html.slice(start.index);
}
