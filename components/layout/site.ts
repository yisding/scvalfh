/**
 * The site's identity and shared metadata: its origin (SITE_URL), the branding strings (SITE_NAME,
 * SITE_WORDMARK, SITE_SHORT_NAME, SITE_DESCRIPTION, SITE_SCOPE_NOTE), the league list the site's
 * descriptions name (leaguesBySectionWords) and the openGraph defaults every route repeats
 * (OG_BASE, ROOT_OG_ALT, ROOT_OG_IMAGE). Nothing here renders. Server-only: it reads the league
 * config and the team registry.
 */
import type { Metadata } from 'next';

import { listWords } from '../../lib/format';
import { LEAGUES, SECTIONS } from '../../lib/leagues';
import { SEASON_CALENDAR_YEAR } from '../../lib/season';
import { TEAMS } from '../../lib/teams';

import { OG_SIZE } from './og-theme';

/**
 * The site's own origin, used by `metadataBase`, `robots.txt` and `sitemap.xml`.
 *
 * There is no production domain committed to the repo yet, so the honest fallback is localhost:
 * set `SITE_URL` in the deploy environment and every absolute URL follows. Returning a made-up
 * domain would put a wrong canonical and wrong OG URLs into the HTML.
 */
export const SITE_URL: string = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * Branding (SPEC §11). "NorCal" is the term local field hockey coverage uses: "Bay Area" is false
 * for Monterey, Salinas and Greenfield, and "CCS" is false for MCAL and EAL. The scope note (footer and
 * /about) names exactly what is covered. The repo name, the Worker name, the `scvalfh.*` storage
 * keys and the `SCVAL_*` env names deliberately stay as they are.
 */
export const SITE_NAME = 'NorCal High School Field Hockey';
/** The header wordmark: SITE_NAME with "High School" shortened to "HS" to fit the top bar. */
export const SITE_WORDMARK = 'NorCal HS Field Hockey';
/** The manifest `short_name` (≤ 12 characters, so a home-screen label never truncates). */
export const SITE_SHORT_NAME = 'NorCal FH';

/**
 * Every league, grouped by its section in config order, each group followed by its section in a
 * parenthesis: `SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL
 * (Northern Section)` with `'name'`, or each section's `briefLabel` with `'short'` (`… (CCS), MCAL
 * (NCS) and EAL (Northern Section)`). From SECTIONS and LEAGUES, so a league added or dropped in the
 * config changes every description that names them.
 */
export function leaguesBySectionWords(style: 'name' | 'short'): string {
  const groups = SECTIONS.flatMap((section) => {
    const leagues = LEAGUES.filter((l) => l.sectionId === section.id);
    if (leagues.length === 0) return [];
    const label = style === 'name' ? section.name : section.briefLabel;
    return [`${listWords(leagues.map((l) => l.shortName))} (${label})`];
  });
  return listWords(groups);
}

export const SITE_DESCRIPTION = `Scores, standings, schedules and playoff pictures for ${TEAMS.length} girls varsity field hockey teams in ${leaguesBySectionWords('short')}. Rebuilt twice daily from MaxPreps; unofficial.`;
export const SITE_SCOPE_NOTE =
  'Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL and the Northern Section’s EAL. Teams outside these five leagues appear only as opponents.';

/** The root OG card's alt: app/opengraph-image.tsx's `alt`, and ROOT_OG_IMAGE's for the routes that borrow it. */
export const ROOT_OG_ALT = `${SITE_NAME} — ${SEASON_CALENDAR_YEAR} standings, scores and playoffs`;

/**
 * The `openGraph` fields every page has to repeat.
 *
 * Next REPLACES the whole `openGraph` object at the nearest segment that declares one — it does
 * not merge its keys (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-metadata.md, "Overwriting fields" (#overwriting-fields): "All `openGraph` fields from
 * `app/layout.js` are **replaced** …"). A page that declared nothing but `url` therefore shipped
 * with no og:type, no og:site_name and no og:locale at all, which is eight of the ten route
 * families. Spread this first and override what differs (/game/[id] is `type: 'article'`).
 *
 * og:title never carries the site-name suffix: `siteName` (og:site_name) names the site on every
 * page, so the title is the page's own (`Season leaders`, `MCAL tournament`, a team's record; the
 * home page's is SITE_NAME), and every page states it. A page that leaves `openGraph.title` out
 * inherits its TEMPLATED `<title>`, `… — NorCal High School Field Hockey`
 * (node_modules/next/dist/lib/metadata/resolve-metadata.js `inheritFromMetadata`), which is how the
 * suffix used to appear on some pages and not others. An `openGraph.title.template` in the root
 * layout is no way out: vinext's metadata shim (node_modules/vinext/dist/shims/metadata.js) applies
 * no og:title template, so the Next and vinext builds would print different og:titles.
 */
export const OG_BASE = {
  type: 'website',
  siteName: SITE_NAME,
  locale: 'en_US',
} as const;

/**
 * The root card, for the routes with NO `opengraph-image.tsx` of their own: /schedule, /teams,
 * /playoffs, /leaders, /about and /history/2025-26. Without it those pages carried
 * `twitter:card=summary_large_image` and no image of any kind. /clubs, /clubs/[slug] and /commits
 * take it too: there is no clubs or commitments card (DESIGN §17.6, §21.6).
 *
 * Never spread this into a segment that HAS its own image file. Next attaches a file-based image
 * only when that segment's metadata does not declare `openGraph.images`
 * (node_modules/next/dist/lib/metadata/resolve-metadata.js: "file based metadata is specified and
 * current level metadata openGraph.images is not specified"), so naming the root card on
 * /standings or /teams/[slug] would swap that page's specific card for the generic one. A route
 * that is not the image's own segment has to state the image's dimensions and alt itself; both
 * come from the constants app/opengraph-image.tsx exports as its own (OG_SIZE, ROOT_OG_ALT), so
 * they cannot drift from the card.
 */
export const ROOT_OG_IMAGE: Pick<NonNullable<Metadata['openGraph']>, 'images'> = {
  images: [
    {
      url: '/opengraph-image',
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      alt: ROOT_OG_ALT,
      type: 'image/png',
    },
  ],
};
