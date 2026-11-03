/**
 * HTML character-reference decoding in ONE pass, so a decoded `&` is never read again as the start
 * of another entity: `&amp;lt;` is the text `&lt;`, never `<`.
 *
 * Each caller passes its own named-entity table, because what a name should become depends on why
 * the text is read: lib/sources/bval-sheet.ts folds the typographic quotes to a straight apostrophe
 * so a name matches the registry's spelling, while scripts/copy-rules.ts keeps them typographic to
 * check visible copy. Decimal and hex references are always decoded (up to U+10FFFF); a name the
 * table does not hold is left as written.
 *
 * Not used by lib/sources/http.ts htmlUnescape (scoped to SBLive's data-react-props attribute) or
 * lib/official/validate.ts cellText, whose output feeds a stored hash.
 *
 * Pure, with no imports.
 */

/** The escapes React and most pages emit, plus `&nbsp;` (U+00A0, a no-break space). */
export const BASIC_NAMED: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', '\u00a0'],
]);

/**
 * `s` with every `&name;`, `&#123;` and `&#x7b;` reference decoded in one pass. A name is looked
 * up in `named` as written, or lower-cased first with `foldCase`.
 */
export function decodeEntities(
  s: string,
  named: ReadonlyMap<string, string>,
  { foldCase = false }: { foldCase?: boolean } = {},
): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m: string, e: string) => {
    if (e[0] !== '#') return named.get(foldCase ? e.toLowerCase() : e) ?? m;
    const hex = e[1] === 'x' || e[1] === 'X';
    const code = Number.parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}
