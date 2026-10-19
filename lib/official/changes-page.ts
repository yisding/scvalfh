/**
 * The revision checks of the official documents (SPEC §2.1, §7.3): the sha256 of a document's bytes
 * (the `official-revision` resource) and of the `officialChanges` cell of a league's posted-changes
 * page (the `official-changes` resource, MCAL's Schedir.htm). LiveTransport
 * (lib/pipeline/transport.ts) turns each response into that hash; the official step compares it with
 * config (`bundledSha256`, `officialChanges.sha256`).
 */

import { createHash } from 'node:crypto';

/** Lowercase hex sha256 of a document's bytes (or of a UTF-8 string) — the revision-check body. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * The `officialChanges` cell (SPEC §2.1): the text of the first `<td>` whose text contains
 * `cellMarker`, with tags turned into spaces, `&nbsp;`/`&amp;` decoded, whitespace collapsed and
 * trimmed. The marker is matched against that decoded text, not the raw cell HTML, so a marker split
 * by a tag or spelled with `&amp;` still matches. null when no cell holds the marker.
 * LiveTransport (lib/pipeline/transport.ts) hashes this for the `official-changes` resource.
 */
export function officialChangesCellText(html: string, cellMarker: string): string | null {
  // Linear scans: the page is upstream HTML of any shape.
  for (const body of tdCellBodies(html)) {
    const text = cellText(body);
    if (text.includes(cellMarker)) return text;
  }
  return null;
}

/**
 * The bodies of the page's `<td …>…</td>` cells, in order — exactly what
 * `/<td\b[^>]*>([\s\S]*?)<\/td>/gi` captures, but in linear time: the regex rescans to the end of the
 * page from every `<td` when a `</td>` is missing, which is quadratic on a truncated or hostile page.
 */
export function* tdCellBodies(html: string): Generator<string> {
  let i = 0;
  for (;;) {
    const lt = html.indexOf('<', i);
    if (lt < 0) return;
    // `<td\b`: "td" in any case, then a non-word character (or the end of the page).
    if (html.slice(lt + 1, lt + 3).toLowerCase() !== 'td' || /\w/.test(html.charAt(lt + 3))) {
      i = lt + 1;
      continue;
    }
    const gt = html.indexOf('>', lt + 3);
    if (gt < 0) return; // no later `<td` can close its open tag either
    const close = indexOfCloseTd(html, gt + 1);
    if (close < 0) return; // no later cell can close either
    yield html.slice(gt + 1, close);
    i = close + '</td>'.length;
  }
}

function indexOfCloseTd(html: string, from: number): number {
  for (let j = html.indexOf('</', from); j >= 0; j = html.indexOf('</', j + 1)) {
    if (html.slice(j + 2, j + 5).toLowerCase() === 'td>') return j;
  }
  return -1;
}

/** A cell's text: tags → spaces (`/<[^>]*>/g`, in linear time), `&nbsp;`/`&amp;` decoded, whitespace collapsed. */
export function cellText(body: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const lt = body.indexOf('<', i);
    if (lt < 0) break;
    const gt = body.indexOf('>', lt + 1);
    if (gt < 0) break; // an unclosed `<` stays text, as with the regex
    out += `${body.slice(i, lt)} `;
    i = gt + 1;
  }
  out += body.slice(i);
  return out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** sha256 of the `officialChanges` cell, or null when the page has no such cell. */
export function officialChangesHash(html: string, cellMarker: string): string | null {
  const text = officialChangesCellText(html, cellMarker);
  return text === null ? null : sha256Hex(text);
}
