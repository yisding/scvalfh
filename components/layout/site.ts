/**
 * The site's identity and shared metadata: its origin (SITE_URL), the branding strings (SITE_NAME,
 * SITE_WORDMARK, SITE_SHORT_NAME, SITE_DESCRIPTION, SITE_SCOPE_NOTE), the corrections thread
 * (DATA_CORRECTIONS_URL), the league list the site's descriptions name (leaguesBySectionWords) and
 * the openGraph defaults every route repeats (OG_BASE, ROOT_OG_ALT, ROOT_OG_IMAGE). Nothing here renders. Server-only: it reads the league
 * config and the team registry.
 */
import type { Metadata } from 'next';

import { listWords, numberWord } from '../../lib/format';
import { DATA_QUALITY, LEAGUES, SECTIONS, getSection, type LeagueConfig, type SectionConfig } from '../../lib/leagues';
import type { SectionId } from '../../lib/types';
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
 * Branding (SPEC §11; DESIGN-socal §2.4). The site covers both halves of the state since the Southern
 * California amendment, so the brand is neutral: "California", never a region. A per-region wordmark
 * was rejected (design-review UI §4): the header is rendered once in the root layout and cannot know
 * a page's region on the server, a JS-free render would print both, and a first visit from search to a
 * San Diego team's page would read "NorCal". The scope note (footer and /about) names exactly what is
 * covered. The repo name, the Worker name, the `scvalfh.*` storage keys and the `SCVAL_*` env names
 * deliberately stay as they are.
 */
export const SITE_NAME = 'California High School Field Hockey';
/**
 * The header wordmark: SITE_NAME with "High School" shortened to "HS" to fit the top bar. Below 1280px
 * the header shows the short form 'CA HS FH' (components/layout/SiteHeader.tsx), and the OG cards print
 * it at 44px as their title.
 */
export const SITE_WORDMARK = 'California HS Field Hockey';
/** The manifest `short_name` (≤ 12 characters, so a home-screen label never truncates). */
export const SITE_SHORT_NAME = 'CA HS FH';

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

/**
 * The independents the scope note names (DESIGN-socal §2.4): Southern Section schools with games against
 * covered teams but no league of their own to cover — each is the only field hockey team in its all-sports
 * MaxPreps league (League B, Marmonte, Palomares; research-cifss.md §2a). A small constant rather than a
 * filter over DATA_QUALITY.notCovered's sentences, so a reworded reason cannot drop a school silently;
 * each name must be a notCovered entry (checked at module load, so a school removed there fails the build
 * rather than staying in the footer). Alphabetical, as the note lists them.
 */
const INDEPENDENTS: { section: SectionId; names: readonly string[] } = {
  section: 'ss',
  names: ['Glendora', 'Harvard-Westlake', 'Thousand Oaks'],
};
for (const name of INDEPENDENTS.names) {
  if (!DATA_QUALITY.notCovered.some((n) => n.name === name)) {
    throw new Error(`components/layout/site.ts: independent ${name} is not a DATA_QUALITY.notCovered entry`);
  }
}

/**
 * The noun a league's own name puts after its short name, lower-cased: 'Sunset Field Hockey League' →
 * 'field hockey league', 'City Conference' → 'conference'; null when the name does not start with the
 * short name (SCVAL is the 'Santa Clara Valley Athletic League').
 */
function leagueNoun(league: LeagueConfig): string | null {
  const prefix = `${league.shortName} `;
  return league.name.startsWith(prefix) ? league.name.slice(prefix.length).toLowerCase() : null;
}

/**
 * One section's part of the scope note, from LEAGUES: `the CIF Central Coast Section (SCVAL, BVAL,
 * PCAL)` when it has several leagues with no shared noun (the form the note always used for the CCS),
 * else `the North Coast Section’s MCAL`, `the Southern Section’s Sunset field hockey league`, `the San
 * Diego Section’s City, North County and Metro conferences`. `cif` prefixes the first part only.
 */
function sectionCoverage(section: SectionConfig, leagues: readonly LeagueConfig[], cif: boolean): string {
  const lead = `the ${cif ? 'CIF ' : ''}${section.name}`;
  const nouns = new Set(leagues.map(leagueNoun));
  const noun = nouns.size === 1 ? [...nouns][0] : null;
  if (leagues.length > 1 && noun === null) return `${lead} (${leagues.map((l) => l.shortName).join(', ')})`;
  const names = listWords(leagues.map((l) => l.shortName));
  return `${lead}’s ${names}${noun === null ? '' : ` ${noun}${leagues.length > 1 ? 's' : ''}`}`;
}

export const SITE_DESCRIPTION = `Scores, standings, schedules and playoff pictures for ${TEAMS.length} girls varsity field hockey teams in ${numberWord(LEAGUES.length)} leagues across ${numberWord(SECTIONS.length)} CIF sections: ${leaguesBySectionWords('short')}. Rebuilt twice daily from MaxPreps; unofficial.`;

/**
 * What the site covers, in one paragraph for the footer and /about (SPEC §11; DESIGN-socal §2.4), built
 * from SECTIONS and LEAGUES in config order: "Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL),
 * the North Coast Section’s MCAL, the Northern Section’s EAL, the Southern Section’s Sunset field hockey
 * league and the San Diego Section’s City, North County and Metro conferences. Teams outside these nine
 * leagues, including the Southern Section’s Glendora, Harvard-Westlake and Thousand Oaks, appear only as
 * opponents."
 */
export const SITE_SCOPE_NOTE = (() => {
  const parts = SECTIONS.flatMap((section, i) => {
    const leagues = LEAGUES.filter((l) => l.sectionId === section.id);
    return leagues.length === 0 ? [] : [sectionCoverage(section, leagues, i === 0)];
  });
  const independents = `the ${getSection(INDEPENDENTS.section).name}’s ${listWords(INDEPENDENTS.names)}`;
  return (
    `Covers ${listWords(parts)}. Teams outside these ${numberWord(LEAGUES.length)} leagues, including ` +
    `${independents}, appear only as opponents.`
  );
})();

/**
 * Where readers report a wrong score, date, name or record: the "Data errors" thread on the site's
 * forum. The footer opens with it on every page, the team page's Elsewhere row ends with it, and
 * /about#corrections explains what to include.
 */
export const DATA_CORRECTIONS_URL = 'https://ncfh.freeflarum.com/d/3-data-errors';

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
 * inherits its TEMPLATED `<title>`, `… — California High School Field Hockey`
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
