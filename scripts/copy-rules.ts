/**
 * Copy rules shared by scripts/assert-copy.ts and its test (tests/copy-rules.test.ts): pure, so a
 * test can import them without running the script's scan of the built site.
 */

import type { LeagueHistory } from '../lib/history-schema';
import { decodeEntities as decodeWith } from '../lib/html-entities';

/**
 * A phrase that says something is limited to SCVAL: "SCVAL-only", "SCVAL only", "only SCVAL",
 * "only for the SCVAL", "SCVAL teams only".
 */
const SCVAL_LIMIT = String.raw`(?:SCVAL[- ](?:teams[- ])?only|only (?:(?:for|in|on|the) )*SCVAL)`;
/** What it must not be said about: rosters and player stats now cover every league. */
const SUBJECT = String.raw`(?:rosters?|player stats?)`;

/**
 * Rendered text (tags excluded between the two halves) claiming rosters or player stats are
 * SCVAL-only, either order, or a bare "rosters (SCVAL)" label. Rosters and player stats cover every
 * league, so any such claim on a page is stale copy.
 */
export const SCVAL_ONLY_CLAIM = new RegExp(
  String.raw`\b${SUBJECT}\b[^<>]{0,120}\b${SCVAL_LIMIT}\b|\b${SCVAL_LIMIT}\b[^<>]{0,120}\b${SUBJECT}\b|\b${SUBJECT}\s*\(\s*SCVAL(?: only| teams)?\s*\)`,
  'i',
);

// ---------------------------------------------------------------- the EAL (DESIGN §22.5)
//
// Five claims no page and no view model may make about the Eastern Athletic League. Each is a
// sourced fact the copy must not contradict, not a style rule; the EAL's own config strings
// (membershipNote, the official note, knownCause, the postseason note and citations) pass all five.

/**
 * Sentences, as the EAL rules read them: split after `.`, `!` or `?` followed by a space or the end
 * of the text, and at line breaks (visibleText ends every block element with one, so a heading never
 * runs into the paragraph under it). A dot inside a domain or a section number
 * ("fieldhockeyumpires.org", "§III.E.1") is followed by a letter or digit, so it ends nothing.
 */
function sentences(text: string): string[] {
  return text.split(/[.!?]+(?=\s|$)|\n+/).filter((s) => s.trim());
}

/**
 * The negation that may directly govern a claim and so excuse it: "not", "never", "no", "isn't",
 * "aren't", "wasn't", "weren't", then at most "be"/"been"/"called", "one of (the)" and an article, and
 * then the claim itself ("is not official", "has never been official", "is never called official",
 * "isn't an NS school", "is no Northern Section member", "are not one of the Northern Section
 * schools"). Anchored at the end of the text
 * before the claim, so a negation in another clause, or one that governs something else ("not only
 * official", "Chico, not Davis, is a Northern Section school", "the official grid, not the
 * umpires'"), excuses nothing: a lexical rule cannot tell what such a sentence denies, so it fails
 * and the copy says it the plain way. "If not" is no negation ("nothing if not official" asserts it).
 */
const GOVERNING_NEGATION =
  /\b(?:(?<!\bif\s+)not|never|no|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)\s+(?:(?:be|been|called)\s+)?(?:one of\s+(?:the\s+)?)?(?:(?:a|an|the)\s+)?$/i;

/**
 * What, after a negated claim, can say it again of something else: a contrast ("but", "yet",
 * "while", "whereas", "though", "although", "unlike"), "and so" / "so is" / "as is", a verb left bare
 * at the end of a clause ("…; the umpires' grid is.", "…, but Davis is", "…, and Davis has been
 * too"), or "is one" ("…, but the umpires' grid is one"). A negation is no excuse when one of these
 * follows it in the same sentence: "MaxPreps is not official, but the umpires' grid is" makes the
 * claim it seems to deny. It also fails an honest "…not official, though it matches MaxPreps", which
 * the copy then says in two sentences.
 */
const REOPENER =
  /\b(?:but|yet|while|whereas|though|although|unlike|and so|so (?:is|are|was|were|does|do|did|has|have)|as (?:is|are|was|were|does|do|has|have))\b|\b(?:is|are|was|were|be|been|does|do|did|has|have|had)(?:\s+(?:too|also|so))?\s*(?=[,;:)\u2013\u2014]|[.!?]?\s*$)|\b(?:is|are|was|were|be|been|as) one\b/i;

/**
 * Whether `text` holds a match of `claim` (a global pattern) that no GOVERNING_NEGATION excuses. A
 * negated match excuses nothing when a REOPENER follows it in `rest` (the text after `text` in the
 * same sentence, for a rule that reads a clause of it). With `about`, only the matches it accepts
 * (given the text before and after each) count at all.
 */
function hasUnnegated(
  text: string,
  claim: RegExp,
  rest = '',
  about?: (before: string, after: string) => boolean,
): boolean {
  for (const m of text.matchAll(claim)) {
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (about && !about(before, after)) continue;
    if (!GOVERNING_NEGATION.test(before)) return true;
    if (REOPENER.test(after + rest)) return true;
  }
  return false;
}

/**
 * The EAL/SRL umpires' 2026 league grid (fieldhockeyumpires.org) matches MaxPreps game for game, but
 * it is not a league or Section document, so it is never called official: a sentence that mentions
 * an umpire and says "official" fails. Test it with `umpireOfficialClaims`, which applies it sentence
 * by sentence (the pattern itself stops at a sentence end, but not at the dots of a domain) and lets
 * an "official" through only when a negation directly governs it ("The umpires' grid is not
 * official."); this pattern alone is the lexical half.
 */
export const UMPIRE_OFFICIAL_CLAIM =
  /umpire(?:[^.!?\n]|[.!?](?=\S))*\bofficial\b|\bofficial\b(?:[^.!?\n]|[.!?](?=\S))*umpire/i;

/** Every "official" (not "officially", not "unofficial"), for the negation check. */
const OFFICIAL_WORD = /\bofficial\b/gi;

/**
 * The sentences of `text` that call the umpires' grid official (UMPIRE_OFFICIAL_CLAIM, with at least
 * one "official" that no GOVERNING_NEGATION excuses); [] when clean.
 */
export function umpireOfficialClaims(text: string): string[] {
  return sentences(text)
    .filter((s) => UMPIRE_OFFICIAL_CLAIM.test(s) && hasUnnegated(s, OFFICIAL_WORD))
    .map((s) => s.trim());
}

/** The two EAL teams that are Sac-Joaquin Section schools (CIF-SJS directory; NS member list). */
const NON_MEMBER_SCHOOL = /\b(?:Davis|Bella Vista)\b/;
/**
 * The Northern Section by any name the copy might use: "Northern Section", "Northern-Section", "NS",
 * "CIF-NS" (any dash), "CIF Northern Section", and the possessive ("the Northern Section's schools").
 */
const NORTHERN_SECTION = String.raw`(?:\bCIF[-\u2010-\u2013 ])?(?:\bNorthern[-\u2010-\u2013 ]Section|\bNS)(?:['’]s)?\b`;
/**
 * Membership in it: "Northern Section (high) school(s)", "NS member(s)", "CIF-NS team(s)", "an NS
 * program", or "member (school)(s) of the Northern Section".
 */
const NORTHERN_SECTION_MEMBER = new RegExp(
  String.raw`${NORTHERN_SECTION}[-\u2010-\u2013 ](?:high[- ])?(?:school|member|team|program)s?\b|\bmembers?(?: (?:school|team)s?)? of (?:the )?${NORTHERN_SECTION}`,
  'gi',
);

/** Davis or Bella Vista, by name (case-sensitive, as names are). */
const NON_MEMBER_NAME = /\b(?:Davis|Bella Vista)\b/;
const NON_MEMBER = String.raw`\b(?:Davis|Bella Vista)\b`;
/** A capitalized name, one or more words ("Chico", "Pleasant Valley"). */
const PROPER_NAME = String.raw`[A-Z][\w’'.-]*(?:\s+[A-Z][\w’'.-]*)*`;
/** Determiners and counts that may sit between a frame and the phrase ("beat every", "against the two"). */
const QUANTIFIER = String.raw`(?:a|an|the|every|each|all|both|any|one|two|three|four|five|six|several|of|\d+)`;
/**
 * The phrase is the object of a game verb or a preposition, so it names an opponent: "Davis defeated
 * a Northern Section team", "3-0 against NS schools", "lost to the …", "ahead of every …".
 */
const OPPONENT_FRAME = new RegExp(
  String.raw`\b(?:defeat(?:s|ed|ing)?|beat(?:s|en|ing)?|play(?:s|ed|ing)?|host(?:s|ed|ing)?|fac(?:e|es|ed|ing)|meet(?:s|ing)?|met|edg(?:e|es|ed|ing)|tops|topped|shut out|blank(?:s|ed)?|outscor(?:e|es|ed|ing)|(?:tie[sd]?|tying|dr[ae]ws?) with|(?:lost|loses?|fell|falls?) to|vs\.?|versus|against|over|than|by|from|above|below|behind|ahead of|for)\s+(?:${QUANTIFIER}\s+)*$`,
);
/** The phrase is an appositive to the names right before it: "Chico, a Northern Section school". */
const APPOSITIVE_TO = new RegExp(
  String.raw`(?<!\b(?:like|as|with)\s+)(${PROPER_NAME}(?:\s*(?:,|&|\band\b|\bor\b)\s*${PROPER_NAME})*)\s*,\s*(?:${QUANTIFIER}\s+)*$`,
);
/** Names right after the phrase that include Davis or Bella Vista: "NS schools such as Chico and Davis". */
const NAMED_AFTER_MEMBERSHIP = new RegExp(
  String.raw`^\s*,?\s*(?:(?:such as|like|including|includes?|included|namely|are|were|is|was)\s+)?(?:${PROPER_NAME}\s*(?:,|&|\band\b|\bor\b)\s*)*${NON_MEMBER}`,
);
/** A phrase fronted before the clause's subject: "As a Northern Section team, Davis …". */
const FRONTED = new RegExp(String.raw`^\s*(?:(?:as|like|being|long|once|now|still|also|${QUANTIFIER})\s+)*$`, 'i');
const FRONTED_SUBJECT = new RegExp(
  String.raw`^[^,]{0,40},\s*(?:${PROPER_NAME}\s*(?:,|&|\band\b|\bor\b)\s*)*${NON_MEMBER}`,
);
/**
 * Whether a membership phrase in a clause that names Davis or Bella Vista is said of them. Strict by
 * default: when one of them comes before the phrase it is said of them ("Davis High is a Northern
 * Section school", "Davis competes as an NS member", "Davis (a Northern Section school) …"), unless
 * the phrase names an opponent (OPPONENT_FRAME: "Davis defeated a Northern Section team") or is an
 * appositive to other names (APPOSITIVE_TO: "Davis plays Chico, a Northern Section school"). When they
 * come only after it, it is said of them when it names them (NAMED_AFTER_MEMBERSHIP) or is fronted
 * before them (FRONTED: "As a Northern Section team, Davis …"); "A Northern Section team beat Davis"
 * is about the opponent.
 */
function saidOfNonMember(before: string, after: string): boolean {
  if (NON_MEMBER_NAME.test(before)) {
    if (OPPONENT_FRAME.test(before)) return false;
    const appositive = before.match(APPOSITIVE_TO);
    return !(appositive && !NON_MEMBER_NAME.test(appositive[1]));
  }
  return NAMED_AFTER_MEMBERSHIP.test(after) || (FRONTED.test(before) && FRONTED_SUBJECT.test(after));
}

/**
 * Davis and Bella Vista play field hockey in the EAL, which the Northern Section's Guidelines
 * govern, but neither is a Northern Section school. The clauses of `text` (split on `.`, `;`, `:`
 * and line breaks) that call Davis or Bella Vista a Northern Section school, member, team or
 * program (NORTHERN_SECTION_MEMBER, any of its names, said of them: saidOfNonMember) where no
 * GOVERNING_NEGATION excuses it ("Davis and Bella Vista are not Northern Section schools" passes,
 * unless a REOPENER follows in the rest of the sentence: "Bella Vista is not a Northern Section
 * school; Davis is." fails); [] when clean. "Davis defeated a Northern Section team" speaks of the
 * opponent and passes. The EAL membershipNote names both kinds of school in separate clauses and
 * passes.
 */
export function nonMemberSectionClaims(text: string): string[] {
  const found: string[] = [];
  for (const sentence of text.split(/[.!?]+(?=\s|$)|\n+/)) {
    const clauses = sentence.split(/[;:]/);
    clauses.forEach((clause, i) => {
      const rest = clauses.slice(i + 1).join(';');
      if (NON_MEMBER_SCHOOL.test(clause) && hasUnnegated(clause, NORTHERN_SECTION_MEMBER, rest, saidOfNonMember)) {
        found.push(clause.trim());
      }
    });
  }
  return found;
}

/**
 * Red Bluff is not fielding a varsity team in 2026, and that is all a page may say: it still has a
 * JV game, and no source says its season was cancelled, that it withdrew or dropped field hockey,
 * or that it has no program.
 */
export const RED_BLUFF_STATUS_CLAIM = /Red Bluff[^.;:]{0,80}\b(cancel\w*|withdr\w*|dropped|no (field hockey )?program)\b/i;

/**
 * "EAL" here always means the field hockey grouping (four Northern Section schools and two
 * Sac-Joaquin ones), not the all-sports Eastern Athletic League, whose schools differ. So never
 * "EAL school(s)" or "EAL member(s)": the copy says "EAL teams". Case-sensitive, as the names are.
 */
export const EAL_SCHOOL_CLAIM = /\b(EAL|Eastern Athletic League) (school|member)s?\b/;

/**
 * A seed word: "1st seed", "No. 2 seed", "#1 seed", "a 3-seed", "top-seeded", "the sixth seed",
 * "the lowest seed", "seed No. 1", "seeded fifth". The Super Regional's seeding criteria are quoted,
 * never applied, and no bracket is published, so no EAL page may print one (its standings and
 * schedule pages, its team pages and the /playoffs EAL card). Wider than DESIGN §22.5's first
 * pattern, which caught only "1st", "No. N", "top", "first" and "second": the Super Regional takes
 * six teams, so "third" to "sixth" are the likely words. "Seeding", "seeds are set" and "the top six"
 * are not seed words.
 */
export const SEED_CLAIM =
  /(?:\b(?:\d+(?:st|nd|rd|th)|No\. ?\d+|\d+|top|first|second|third|fourth|fifth|sixth|last|lowest|highest|bottom)|#\d+)[- ]seed(?:ed|s)?\b|\bseed(?:ed)? (?:No\. ?|#)?\d+\b|\bseeded (?:first|second|third|fourth|fifth|sixth|last|\d+(?:st|nd|rd|th))\b/i;

/**
 * Named entities visibleText decodes: React writes text as characters and escapes only `& < > " '`,
 * so these are the escapes plus the typographic names a hand-written string might carry.
 */
const VISIBLE_ENTITIES: ReadonlyMap<string, string> = new Map(Object.entries({
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', middot: '·', hellip: '…',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓',
}));

/** Block elements: visibleText ends each with a line break, so their texts never run together. */
const BLOCK_END = /^\/?(?:p|div|h[1-6]|li|ul|ol|dt|dd|dl|tr|td|th|table|section|article|header|footer|nav|main|aside|figcaption|figure|summary|details|caption|br|hr)\b/i;

/** `text` with its character references decoded in one pass (VISIBLE_ENTITIES, any case, and numeric ones). */
function decodeEntities(text: string): string {
  return decodeWith(text, VISIBLE_ENTITIES, { foldCase: true });
}

/**
 * `html` without its `<script>`, `<style>` and `<template>` elements and its comments. Repeated
 * until nothing changes: one pass over `<!<!---->--` would leave a `<!--` behind (CodeQL
 * js/incomplete-multi-character-sanitization).
 */
function withoutScripts(html: string): string {
  let out = html;
  for (let before = ''; before !== out; ) {
    before = out;
    out = out.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, '');
  }
  return out;
}

/**
 * The text a reader of a built page sees: the `<body>` without its `<script>`, `<style>` and
 * `<template>` elements (the inline RSC payload is in scripts) and without its tags, entities
 * decoded, block elements ending in a line break and other tags in a space. What the EAL rules
 * read on every built page, with `attributeText`.
 */
export function visibleText(html: string): string {
  const body = /<body[\s>][\s\S]*<\/body>/i.exec(html)?.[0] ?? html;
  return decodeEntities(
    withoutScripts(body).replace(/<([^>]*)>/g, (_m, inner: string) => (BLOCK_END.test(inner) ? '\n' : ' ')),
  )
    .replace(/[ \t\r\f\v\u00a0]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

/** The `<meta>` names whose `content` a reader is shown: the description and its link-preview copies. */
const SHOWN_META = /^(?:description|og:title|og:description|twitter:title|twitter:description)$/i;

/** One attribute of a tag: its name and its quoted (or bare) value. */
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** The attributes of a start tag's inside (what follows the tag name), names lowercased. */
function attributesOf(inner: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of inner.matchAll(ATTRIBUTE)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

/**
 * The text a page shows or reads out that is not in its body text (visibleText): the `<title>`,
 * the `content` of its description metas (`description`, `og:` and `twitter:` titles and
 * descriptions, what a link preview prints) and every `title`, `aria-label` and `alt` attribute
 * (tooltips, what assistive technology reads). One per line, entities decoded, scripts (the RSC
 * payload) excluded. What the EAL rules read on every built page, besides visibleText.
 */
export function attributeText(html: string): string {
  const out: string[] = [];
  const source = withoutScripts(html);
  for (const m of source.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)) out.push(m[1]);
  for (const m of source.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = attributesOf(m[2]);
    if (m[1].toLowerCase() === 'meta') {
      const name = attrs.get('name') ?? attrs.get('property') ?? '';
      if (SHOWN_META.test(name)) out.push(attrs.get('content') ?? '');
    }
    for (const a of ['title', 'aria-label', 'alt']) {
      const v = attrs.get(a);
      if (v) out.push(v);
    }
  }
  return out
    .map((t) => decodeEntities(t).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

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

/** A page's `<main>…</main>` element (one per page; the smoke test asserts it exists), '' when absent. */
export function mainElement(html: string): string {
  return /<main[\s>][\s\S]*?<\/main>/.exec(html)?.[0] ?? '';
}

/**
 * The `<section …>…</section>` element whose start tag carries `id="<id>"`, wherever that attribute
 * sits in the tag (React renders a division's `className` before its `id`, a league's after), up to
 * its own closing tag: sections nested inside it (a league's division sections) are part of it, a
 * sibling section is not. '' when no section carries that id.
 */
export function sectionById(html: string, id: string): string {
  return elementById(html, id, 'section');
}

/**
 * `sectionById` for any element name: the `<tag …>…</tag>` element whose start tag carries
 * `id="<id>"`, nested elements of the same name included. The /playoffs EAL card is a `<div>`.
 */
export function elementById(html: string, id: string, tag: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(String.raw`<${tag}\b[^>]*\sid=(?:"${escaped}"|'${escaped}')[^>]*>`, 'i').exec(html);
  if (!start) return '';
  const tags = new RegExp(String.raw`<(\/?)${tag}\b[^>]*>`, 'gi');
  tags.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start.index, m.index + m[0].length);
  }
  // Never closed: everything after it is inside it.
  return html.slice(start.index);
}

/** A short window of text around a match, tags flattened, for a failure line. */
export function around(text: string, index: number): string {
  return text.slice(Math.max(0, index - 60), index + 60).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * `html` without each `<a>…</a>` whose text reads exactly `text` (tags, including React's `<!-- -->`
 * text separators, dropped and whitespace collapsed): the one link a page may say a word in that the
 * rest of it may not. It matches the words a reader sees, not the markup, so a link's arrow can be
 * components/ui/Arrow's aria-hidden `<span>→</span>` or bare text alike.
 */
export function withoutLink(html: string, text: string): string {
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (link, inner: string) =>
    withoutTags(inner).replace(/\s+/g, ' ').trim() === text ? '' : link,
  );
}

/**
 * `html` with every tag removed, repeated until nothing changes, as withoutScripts is (CodeQL
 * js/incomplete-multi-character-sanitization): no removal can leave the pieces of a new tag behind.
 */
function withoutTags(html: string): string {
  let out = html;
  for (let before = ''; before !== out; ) {
    before = out;
    out = out.replace(/<[^>]*>/g, '');
  }
  return out;
}

// ---------------------------------------------------------------- /history/2025-26

/**
 * What the history page's `<main>` gets wrong about `leagues` (lib/history.ts getHistoryLeagues),
 * one message per problem: every league has its `<section id="<league>">`; an available league has
 * an anchor for each division and every varsity row's league record, and never says
 * "Unavailable"; an unavailable league has the "Unavailable" card with its reason, and no table and
 * no champion, winner or award, since nothing official was read for it.
 */
export function historyPageProblems(
  main: string,
  leagues: ReadonlyArray<{ id: string; entry: LeagueHistory }>,
): string[] {
  const problems: string[] = [];
  for (const { id, entry } of leagues) {
    const section = sectionById(main, id);
    if (!section) {
      problems.push(`no <section id="${id}">`);
      continue;
    }
    if (entry.status === 'available') {
      for (const d of entry.divisions) {
        if (!section.includes(`id="${d.division}"`)) problems.push(`${id}: no id="${d.division}" division anchor`);
        for (const row of d.standings.varsity) {
          if (!section.includes(`>${row.leagueRecord}<`)) {
            problems.push(`${id}/${d.division}: ${row.name}'s record ${row.leagueRecord} is not on the page`);
          }
        }
      }
      if (/Unavailable/.test(section)) problems.push(`${id}: an available league says "Unavailable"`);
    } else {
      if (!section.includes('Unavailable')) problems.push(`${id}: unavailable league has no "Unavailable" card`);
      if (!decodeEntities(section).includes(entry.reason.slice(0, 40))) problems.push(`${id}: the reason is not on the page`);
      if (/<table/.test(section)) problems.push(`${id}: an unavailable league shows a table`);
      const award = /champion|winner|all-league|MVP|first team/i.exec(section);
      if (award) problems.push(`${id}: an unavailable league shows a result or award — “…${around(section, award.index)}…”`);
    }
  }
  return problems;
}
