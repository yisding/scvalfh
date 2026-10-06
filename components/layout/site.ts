/**
 * The site's identity and shared metadata: its origin (SITE_URL), the branding strings (SITE_NAME,
 * SITE_WORDMARK, SITE_SHORT_NAME, SITE_DESCRIPTION, SITE_SCOPE_NOTE), the corrections thread
 * (DATA_CORRECTIONS_URL), the league list the site's descriptions name (leaguesBySectionWords) and
 * the openGraph defaults every route repeats (OG_BASE, ROOT_OG_ALT, ROOT_OG_IMAGE). Nothing here renders. Server-only: it reads the league
 * config and the team registry.
 */
import type { Metadata } from 'next';

import { listWords, numberWord } from '../../lib/format';
import {
  INDEPENDENT_LEAGUES,
  LEAGUES_WITH_TABLES,
  REGIONS,
  SECTIONS,
  getSection,
  regionOf,
  sectionsInRegion,
  type LeagueConfig,
  type SectionConfig,
} from '../../lib/leagues';
import type { RegionId } from '../../lib/types';
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
 *
 * The brand stays NorCal after the Southern California amendment (owner decision, 2026-10-06; DESIGN
 * §24.1): the site is NorCal Field Hockey ("ncfh", its forum's name too) and covers Southern
 * California's results behind the NorCal/SoCal toggle, whose default is NorCal. A neutral
 * "California" brand was built and reverted the same day. What a reader is told about the second
 * region is in the words that describe the site rather than the name: SITE_DESCRIPTION names both
 * regions, NorCal first, and SITE_SCOPE_NOTE names every section and league covered.
 */
export const SITE_NAME = 'NorCal High School Field Hockey';
/** The header wordmark: SITE_NAME with "High School" shortened to "HS" to fit the top bar. */
export const SITE_WORDMARK = 'NorCal HS Field Hockey';
/** The manifest `short_name` (≤ 12 characters, so a home-screen label never truncates). */
export const SITE_SHORT_NAME = 'NorCal FH';

/**
 * An independent group in a list of what is covered: `three Southern Section independents`, from the config
 * (the group's team count and its section's briefLabel), so the words follow the registry. The group is
 * covered but is not a league (it has no table), so no list calls it one and no count of leagues includes it
 * (LEAGUES_WITH_TABLES, DESIGN §24.9).
 */
export function independentsWords(group: LeagueConfig): string {
  const teams = group.divisions.reduce((n, d) => n + d.expectedTeams, 0);
  return `${numberWord(teams)} ${getSection(group.sectionId).briefLabel} independents`;
}

/**
 * Every covered league by its short name, then each group with no table by its name: 'SCVAL, BVAL, PCAL,
 * MCAL, EAL, Sunset, City, North, Metro and the Southern Section independents' (DESIGN §24.9). For copy that
 * names what the site covers in one list; never 'and Independent', whose short name is an adjective.
 */
export function coveredLeagueWords(): string {
  return listWords([...LEAGUES_WITH_TABLES.map((l) => l.shortName), ...INDEPENDENT_LEAGUES.map((l) => `the ${l.name}`)]);
}

/**
 * Every league, grouped by its section in config order, each group followed by its section in a
 * parenthesis: `SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL
 * (Northern Section)` with `'name'`, or each section's `briefLabel` with `'short'` (`… (CCS), MCAL
 * (NCS) and EAL (Northern Section)`). From SECTIONS and LEAGUES_WITH_TABLES, so a league added or dropped
 * in the config changes every description that names them. The independent groups follow the leagues as
 * one item each (`independentsWords`), so a sentence about every covered team stays true: `… City, North
 * and Metro (San Diego Section) and three Southern Section independents`. `region` limits it to that
 * region's sections (`'socal'`, short: `Sunset (Southern Section), City, North and Metro (San Diego Section)
 * and three Southern Section independents`); omitted, it names all nine leagues in config order, NorCal
 * first, then the independents.
 */
export function leaguesBySectionWords(style: 'name' | 'short', region?: RegionId): string {
  const sections = region === undefined ? SECTIONS : sectionsInRegion(region);
  const groups = sections.flatMap((section) => {
    const leagues = LEAGUES_WITH_TABLES.filter((l) => l.sectionId === section.id);
    if (leagues.length === 0) return [];
    const label = style === 'name' ? section.name : section.briefLabel;
    return [`${listWords(leagues.map((l) => l.shortName))} (${label})`];
  });
  const independents = INDEPENDENT_LEAGUES.filter((g) => sections.some((s) => s.id === g.sectionId)).map(independentsWords);
  return listWords([...groups, ...independents]);
}

/**
 * The noun a league's own name puts after its short name, lower-cased: 'Sunset field hockey league' →
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
 * Diego Section’s City, North and Metro conferences`. `cif` prefixes the first part only.
 */
function sectionCoverage(section: SectionConfig, leagues: readonly LeagueConfig[], cif: boolean): string {
  const lead = `the ${cif ? 'CIF ' : ''}${section.name}`;
  const nouns = new Set(leagues.map(leagueNoun));
  // The North County Conference's short name is 'North', so its noun reads 'county conference' beside City's and
  // Metro's 'conference': when the nouns differ only before a shared last word, that word is the noun.
  const lastWords = new Set([...nouns].map((n) => (n === null ? null : n.split(' ').pop() ?? null)));
  const noun = nouns.size === 1 ? [...nouns][0] : lastWords.size === 1 ? [...lastWords][0] : null;
  if (leagues.length > 1 && noun === null) return `${lead} (${leagues.map((l) => l.shortName).join(', ')})`;
  const names = listWords(leagues.map((l) => l.shortName));
  return `${lead}’s ${names}${noun === null ? '' : ` ${noun}${leagues.length > 1 ? 's' : ''}`}`;
}

/**
 * The site's meta description (root layout, manifest), one clause per region in REGIONS order, so NorCal
 * leads (owner decision, 2026-10-06: the brand and the focus stay NorCal; DESIGN §24.1): "Scores,
 * standings, schedules and playoff pictures for the 49 NorCal girls varsity field hockey teams in SCVAL,
 * BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section), and for the 53 Southern California teams
 * in Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section
 * independents. Rebuilt twice daily from MaxPreps; unofficial." The counts are the registry's (TEAMS by its league's region), the league
 * lists leaguesBySectionWords('short', region): a team or league added in the config changes the
 * sentence. The lead region carries the full noun phrase under its short name, the brand's word; the
 * second names its region in full, as the owner's wording of the sentence does.
 */
export const SITE_DESCRIPTION = (() => {
  const clauses = REGIONS.map((region, i) => {
    const count = TEAMS.filter((t) => regionOf(t.league) === region.id).length;
    const noun = i === 0 ? `${region.shortName} girls varsity field hockey teams` : `${region.name} teams`;
    return `the ${count} ${noun} in ${leaguesBySectionWords('short', region.id)}`;
  });
  // Two regions: 'for A, and for B'. The comma keeps the second 'for' from reading as part of A's list.
  return `Scores, standings, schedules and playoff pictures for ${clauses.join(', and for ')}. Rebuilt twice daily from MaxPreps; unofficial.`;
})();

/**
 * What the site covers, in one paragraph for the footer and /about (SPEC §11; DESIGN-socal §2.4, §24.9),
 * built from SECTIONS, LEAGUES_WITH_TABLES and the independent groups in config order: "Covers the CIF
 * Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL, the
 * Southern Section’s Sunset field hockey league and the San Diego Section’s City, North and Metro
 * conferences, plus the Southern Section’s three independents (Glendora, Harvard-Westlake and Thousand
 * Oaks), which play no league games. Other teams appear only as opponents."
 *
 * Until 2026-10-06 the second sentence read "Teams outside these nine leagues, including the Southern
 * Section’s Glendora, Harvard-Westlake and Thousand Oaks, appear only as opponents." The three are covered
 * now (owner decision: every California team with a 2026 varsity game), so the note names them as covered,
 * and "outside these nine leagues" would no longer be the whole of what appears only as an opponent.
 */
export const SITE_SCOPE_NOTE = (() => {
  const parts = SECTIONS.flatMap((section, i) => {
    const leagues = LEAGUES_WITH_TABLES.filter((l) => l.sectionId === section.id);
    return leagues.length === 0 ? [] : [sectionCoverage(section, leagues, i === 0)];
  });
  const plus = INDEPENDENT_LEAGUES.map((g) => {
    const names = TEAMS.filter((t) => t.league === g.id).map((t) => t.name).sort();
    const teams = g.divisions.reduce((n, d) => n + d.expectedTeams, 0);
    return `the ${getSection(g.sectionId).name}’s ${numberWord(teams)} independents (${listWords(names)}), which play no league games`;
  });
  const covers = `Covers ${listWords(parts)}${plus.length ? `, plus ${listWords(plus)}` : ''}.`;
  return `${covers} Other teams appear only as opponents.`;
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
