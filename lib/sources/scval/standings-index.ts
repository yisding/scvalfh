/**
 * The scval.com standings index (SPEC §1.3): where a 2026-27 field hockey standings PDF will
 * appear. LiveTransport reads the page ('scval-standings-index'); the official step parses it here.
 */

export const SCVAL_STANDINGS_INDEX = 'https://www.scval.com/standings/';

export interface StandingsPdfLink {
  href: string;
  url: string;
}

/**
 * Poll https://www.scval.com/standings/ for a 2026-27 field hockey standings PDF. There is none as
 * of 2026-09-29 (zero hrefs match 26-27), so the URL is discovered, never hardcoded (SPEC §1.3).
 * Filenames carry literal spaces and apostrophes and must be percent-encoded per segment.
 */
export function findStandingsPdfLink(
  html: string,
  season: { start: string; alt: string } = { start: '2026-27', alt: '26-27' },
): StandingsPdfLink | null {
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (!/\.pdf$/i.test(href)) continue;
    if (!/field\s*hockey/i.test(href)) continue;
    if (!href.includes(season.start) && !href.includes(season.alt)) continue;
    if (!/standings/i.test(href)) continue;
    return { href, url: SCVAL_STANDINGS_INDEX + encodeURIComponent(href) };
  }
  return null;
}

/** Every field-hockey href on the standings index, for the log. */
export function listFieldHockeyLinks(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => /field\s*hockey/i.test(h));
}
