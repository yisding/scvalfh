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

/** Named entities React and the pages emit; any other name is left as written. */
const NAMED: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', ' '],
]);

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

/** One-pass decode of the named entities above and of decimal / hex character references. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m: string, e: string) => {
    if (e[0] !== '#') return NAMED.get(e) ?? m;
    const hex = e[1] === 'x' || e[1] === 'X';
    const code = Number.parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** The text of `html`: tags → spaces, entities decoded, whitespace runs collapsed to one space. */
export function textOf(html: string): string {
  return decodeEntities(stripTags(html, ' ')).replace(/\s+/g, ' ');
}
