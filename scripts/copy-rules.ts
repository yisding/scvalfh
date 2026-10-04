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
 * renders: an affiliation's `basis`, or a fragment of a source's verbatim `quote` (split on "…") of
 * at least LEAK_MIN_FRAGMENT letters and digits. Both can name people who are not on the tracked
 * rosters — a club's director, a teammate, a coach — so a hit is a privacy failure, not a style
 * one. Returns one line per leak, naming whose record it came from; [] when clean.
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
  { printsItself }: { printsItself?: ReadonlySet<string> } = {},
): string[] {
  return leaks(
    squash(text),
    file.affiliations.map((a) => ({ who: `${a.teamSlug} / ${a.fullName} (${a.club})`, basis: a.basis, sources: a.sources })),
    printsItself,
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
  { printsItself }: { printsItself?: ReadonlySet<string> } = {},
): string[] {
  return leaks(
    squash(text),
    file.commitments.map((c) => ({ who: `${c.teamSlug} / ${c.fullName} (${c.college})`, basis: c.basis, sources: c.sources })),
    printsItself,
  );
}

/** The shared rule: a record's basis anywhere on the page, or a long enough fragment of a quote. */
function leaks(
  page: string,
  records: ReadonlyArray<{ who: string; basis: string; sources: ReadonlyArray<{ url: string; quote: string }> }>,
  printsItself: ReadonlySet<string> | undefined,
): string[] {
  const found: string[] = [];
  for (const r of records) {
    if (page.includes(squash(r.basis))) found.push(`${r.who}: its basis`);
    for (const s of r.sources) {
      if (printsItself?.has(s.url)) continue;
      const hit = s.quote
        .split('…')
        .map(squash)
        .some((fragment) => fragment.length >= LEAK_MIN_FRAGMENT && page.includes(fragment));
      if (hit) found.push(`${r.who}: the quote from ${s.url}`);
    }
  }
  return found;
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
