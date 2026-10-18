/**
 * Visible text of server-rendered markup, for assertions on `renderToStaticMarkup` output.
 * NOT a test file: the tests/ui view tests import it read-only.
 *
 * Two steps, in this order, so neither undoes the other:
 *  1. `stripTags` drops every tag (`<` to the next `>`) with a character scan, not a regex, so a
 *     removal can never splice two halves into a new tag;
 *  2. `decodeEntities` decodes in ONE pass, so a decoded `&` is never read again as the start of
 *     another entity (`&amp;quot;` is the text `&quot;`, never `"`).
 */

import { BASIC_NAMED, decodeEntities as decodeWith } from '@/lib/html-entities';

/**
 * `html` with every tag replaced by `replacement`. A tag is a `<`, at least one character, and the
 * next `>` (exactly what `/<[^>]+>/g` matched): a `<>` and an unclosed `<` stay text.
 */
export function stripTags(html: string, replacement = ' '): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '<') {
      const gt = html.indexOf('>', i + 1);
      if (gt < 0) return out + html.slice(i);
      if (gt > i + 1) {
        out += replacement;
        i = gt + 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * One-pass decode (lib/html-entities.ts) of the named entities React and the pages emit (BASIC_NAMED;
 * any other name is left as written) and of decimal / hex character references.
 */
export function decodeEntities(s: string): string {
  return decodeWith(s, BASIC_NAMED);
}

/** The text of `html`: tags → spaces, entities decoded, whitespace runs collapsed to one space. */
export function textOf(html: string): string {
  return decodeEntities(stripTags(html, ' ')).replace(/\s+/g, ' ');
}

/**
 * The accessible name of a control with no aria-label: ALL of its text, sr-only spans included, tags
 * dropped without a separator and entities decoded (what a screen reader concatenates).
 */
export function textOfSrOnly(html: string): string {
  return decodeEntities(stripTags(html, ''));
}

/**
 * The text of `html` for score-glyph scans: tags → spaces, whitespace runs collapsed, and the two
 * spellings React emits for an en dash (`&#x2013;`, `&ndash;`) folded to the character. Other
 * entities are left as written, so a pattern over it sees exactly the glyphs the page prints.
 */
export function textFoldingDashes(html: string): string {
  return stripTags(html, ' ')
    .replace(/&#x2013;|&ndash;/g, '–')
    .replace(/\s+/g, ' ');
}
