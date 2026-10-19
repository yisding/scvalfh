/**
 * Reading the `data-react-class` / `data-react-props` payloads out of a si.com page (SPEC §1.2):
 * the props are an HTML-entity-escaped JSON attribute, and their top level is
 * `{query, variables, application}` (there is NO `props` key).
 */

import { htmlUnescape } from '@/lib/sources/html';

export interface ReactPropsBlock {
  className: string;
  props: unknown;
}

const CLASS_ATTR = 'data-react-class="';
const PROPS_ATTR = 'data-react-props="';

/** Every index of `needle` in `hay`, ascending (one linear pass). */
function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

/** The first value of a sorted array that is >= `min`, or -1. */
function firstAtOrAfter(sorted: readonly number[], min: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < min) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length ? sorted[lo] : -1;
}

/**
 * The `[className, rawProps]` pairs `/data-react-class="([^"]+)"[^>]*?data-react-props="([^"]*)"/g` would
 * capture, found in O(n log n): the regex rescans to the next `>` from every class attribute, which is
 * quadratic on a page of class attributes without props or without a closing `>`.
 */
export function reactPropsPairs(html: string): Array<[string, string]> {
  const quotes = allIndexes(html, '"');
  const gts = allIndexes(html, '>');
  const props = allIndexes(html, PROPS_ATTR);
  const out: Array<[string, string]> = [];
  let from = 0;
  for (;;) {
    const p = html.indexOf(CLASS_ATTR, from);
    if (p < 0) return out;
    from = p + 1;
    const classStart = p + CLASS_ATTR.length;
    const classEnd = firstAtOrAfter(quotes, classStart);
    if (classEnd <= classStart) continue; // `[^"]+`: at least one character, then the closing quote
    const marker = firstAtOrAfter(props, classEnd + 1);
    if (marker < 0) continue;
    const gt = firstAtOrAfter(gts, classEnd + 1);
    if (gt >= 0 && gt < marker) continue; // `[^>]*?` never crosses the end of the tag
    const valueStart = marker + PROPS_ATTR.length;
    const valueEnd = firstAtOrAfter(quotes, valueStart);
    if (valueEnd < 0) continue;
    out.push([html.slice(classStart, classEnd), html.slice(valueStart, valueEnd)]);
    from = valueEnd + 1;
  }
}

/**
 * `JSON.parse` of a prefix, the way Python's `JSONDecoder.raw_decode` works: parse the first
 * complete JSON value and ignore whatever follows. The attribute capture is normally exact, so
 * this only matters if a payload ever carries an escaped quote the capture cannot see past.
 */
export function parseJsonPrefix(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Walk the string tracking string-literal state and brace/bracket depth.
    const open = trimmed[0];
    if (open !== '{' && open !== '[') throw new Error('not a JSON object or array');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return JSON.parse(trimmed.slice(0, i + 1)) as unknown;
      }
    }
    throw new Error('unterminated JSON value in data-react-props');
  }
}

/** Every `data-react-class` / `data-react-props` pair on the page, decoded. */
export function extractReactProps(html: string, className?: string): ReactPropsBlock[] {
  const out: ReactPropsBlock[] = [];
  for (const [name, raw] of reactPropsPairs(html)) {
    if (className && name !== className) continue;
    out.push({ className: name, props: parseJsonPrefix(htmlUnescape(raw)) });
  }
  return out;
}

export class SbliveError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = 'SbliveError';
  }
}

export function requireBlock(html: string, className: string, url: string): unknown {
  const blocks = extractReactProps(html, className);
  if (blocks.length === 0) {
    const seen = extractReactProps(html).map((b) => b.className);
    throw new SbliveError(
      `no data-react-props for "${className}" (saw: ${seen.join(', ') || 'none'})`,
      url,
    );
  }
  return blocks[0].props;
}
