/**
 * iCalendar (RFC 5545) line reading shared by the two `.ics` sources: the VNN school calendars
 * (lib/sources/vnn-ics.ts) and the CCS calendar (lib/sources/ccs.ts).
 */

/**
 * RFC 5545 line unfolding — a continuation line starts with a space or tab and joins the previous
 * one with no separator. Mandatory before parsing any `.ics` (SPEC §1.5).
 */
export function unfoldIcs(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (/^[ \t]/.test(raw) && out.length > 0) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

/** Split one unfolded iCalendar line into its name (with params) and value. */
export function icsLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const semi = left.indexOf(';');
  return {
    name: (semi < 0 ? left : left.slice(0, semi)).toUpperCase(),
    params: semi < 0 ? '' : left.slice(semi + 1),
    // iCalendar TEXT escaping: \, \; \n \\ .
    value: line
      .slice(colon + 1)
      .replace(/\\n/gi, '\n')
      .replace(/\\([,;\\])/g, '$1'),
  };
}
