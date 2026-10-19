/**
 * HTML entity decoding shared by the source parsers that read text out of a server-rendered page:
 * si.com's `data-react-props` attribute (lib/sources/sblive/props.ts), the MaxPreps roster page's
 * cells (lib/sources/maxpreps/roster.ts) and the CIF-SS widget's table cells (lib/sources/cifss.ts).
 */

/** The five named HTML entities SBLive's `data-react-props` attribute can contain (SPEC §1.2). */
export function htmlUnescape(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
