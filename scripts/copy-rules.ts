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
