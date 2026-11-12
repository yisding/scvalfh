import type { Metadata, Viewport } from 'next';
import { Public_Sans } from 'next/font/google';

import Attribution from '../components/layout/Attribution';
import BottomTabBar from '../components/layout/BottomTabBar';
import SiteHeader from '../components/layout/SiteHeader';
import { BUILD_INSTANT } from '../components/layout/build-instant';
import { DISCLOSURE_SCRIPT } from '../components/layout/disclosure-script';
import { buildLeagueScopeCss } from '../components/prefs/league-scope-css';
import { buildPrefsScript } from '../components/prefs/prefs-script';
import { OG_BASE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SITE_WORDMARK } from '../components/layout/site';
import { PINNED_TEAM_SCRIPT } from '../components/prefs/pinned-team-script';
import { THEME_COLOR, THEME_SCRIPT } from '../components/prefs/theme-script';
import PinnedTeamMarks from '../components/prefs/PinnedTeamMarks';
import TwinMarks from '../components/layout/TwinMarks';
import { getFetchedAt, getTeams } from '../lib/data';
import { DEFAULT_REGION } from '../lib/league-config/sections';
import { LEAGUE_IDS, regionOf } from '../lib/leagues';

import './globals.css';

/**
 * ONE self-hosted family, Public Sans (variable, 100–900), preloaded and `display: 'swap'`, so text
 * is never invisible (DESIGN §33). Figures are tabular lining numerals of the same face (`body` and
 * `.sx-num` in app/globals.css): there is no mono face any more.
 *
 * The options are written inline as literals, not as a shared const: vinext's font plugin reads
 * them from the source and only self-hosts a call whose object is all literals
 * (node_modules/vinext/dist/plugins/fonts.js).
 *
 * It keeps next/font's metric-adjusted "Public Sans Fallback" (Arial, size-adjusted) and takes NO
 * `fallback` list: under Turbopack a `fallback` REPLACES the adjusted face rather than following
 * it. The generic tail (`ui-sans-serif, system-ui, sans-serif`) is appended where the variable is
 * used instead, by `--font-sans` in app/globals.css' @theme, so a reader without Arial (Android,
 * most Linux) still gets a sans. The bold twin of "Public Sans Fallback" (600–900) is
 * app/globals.css' own @font-face.
 */
const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The suffix is the WORDMARK, the header's own "NorCal HS Field Hockey", not SITE_NAME: search
  // results cut a title at about 60 characters, and the 33-character "— NorCal High School Field
  // Hockey" pushed most team, league and date titles past it, so the page's own words (which now
  // carry "field hockey" themselves) were what got cut. og:site_name still states SITE_NAME.
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_WORDMARK}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The fallback for metadata that declares no `openGraph` of its own (a `generateMetadata` that
  // answers an unknown param); every page, the 404 included, replaces it whole and states its own
  // og:title (components/layout/site.ts OG_BASE).
  openGraph: { ...OG_BASE },
  twitter: { card: 'summary_large_image' },
  // No `robots` here on purpose. `index, follow` is what a crawler assumes when the tag is absent,
  // so stating it bought nothing on a 200, and on a 404 it was actively wrong: not-found metadata
  // does not override it, so every 404 shipped the framework's `noindex` AND this `index, follow`
  // as two contradictory <meta name="robots"> tags (measured on `next start` and `vinext start`
  // alike). Leaving it unset lets the 404's own `noindex` stand alone.
  other: { 'format-detection': 'telephone=no' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches --sx-bg in each mode, so the browser chrome never flashes the other theme. These follow
  // the OS; an explicit Light/Dark choice prepends a media-less meta that outranks them
  // (components/prefs/theme-script.ts), from the same THEME_COLOR pair.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

/**
 * `{ slug: league }` for every team: embedded in the prefs script (to validate a pin and derive its
 * league before first paint) and handed to the nav (so `/teams/<slug>` has a page league). Built
 * once per process; one object, so the RSC payload can refer back to it.
 */
const SLUG_LEAGUE: Readonly<Record<string, string>> = Object.fromEntries(
  getTeams().map((t) => [t.slug, t.league]),
);
/** `{ league: region }`, from the config (lib/leagues.ts regionOf): the prefs script ships the non-default part. */
const LEAGUE_REGION: Readonly<Record<string, string>> = Object.fromEntries(LEAGUE_IDS.map((id) => [id, regionOf(id)]));
const PREFS_SCRIPT = buildPrefsScript({
  leagueIds: LEAGUE_IDS,
  slugLeague: SLUG_LEAGUE,
  leagueRegion: LEAGUE_REGION,
  defaultRegion: DEFAULT_REGION,
});
const SCOPE_CSS = buildLeagueScopeCss(LEAGUE_IDS);

export default function RootLayout({ children }: LayoutProps<'/'>) {
  const snapshotAt = getFetchedAt();
  return (
    <html lang="en" className={publicSans.variable} suppressHydrationWarning>
      <head>
        {/* ~300 bytes, blocking, before first paint: stamps data-theme so an explicit
            Light/Dark choice never flashes the other theme, and gives the browser chrome the
            chosen theme-color (DESIGN §7.14). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Marks the pinned team's row on /standings and its tile on /teams before the first
            paint, once the DOM is parsed. `DOMContentLoaded` fires once per document, so
            <PinnedTeamMarks /> below re-applies it after every client-side navigation; see
            components/prefs/pinned-team-script.ts for why this pass still lives here. */}
        <script dangerouslySetInnerHTML={{ __html: PINNED_TEAM_SCRIPT }} />
        {/* The remembered league and region (SPEC §8.2, DESIGN-socal §2.4), a SEPARATE blocking
            script: stamps data-js, data-league, data-region (SoCal only), data-pin and
            data-pin-stale on <html> before first paint, so the scope stylesheet below paints the
            right region and home panel first (CLS 0, no reordering). */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        {/* Unlayered on purpose: it must outrank every @layer, utilities included. Tailwind
            cannot generate one selector per league id (components/prefs/league-scope-css.ts);
            the region rules ride in the same sheet. */}
        <style dangerouslySetInnerHTML={{ __html: SCOPE_CSS }} />
        {/* Scrolls a <details> the reader just opened into view when its panel lands under the
            phone tab bar; see components/layout/disclosure-script.ts. */}
        <script dangerouslySetInnerHTML={{ __html: DISCLOSURE_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:bg-ink focus:px-3 focus:py-2 focus:text-meta focus:font-semibold focus:text-bg"
        >
          Skip to content
        </a>
        <PinnedTeamMarks />
        <TwinMarks />
        <SiteHeader snapshotAt={snapshotAt} now={BUILD_INSTANT} slugLeague={SLUG_LEAGUE} />
        {/* `tabIndex={-1}` is what makes the skip link actually MOVE focus. Without it only
            browsers that implement the sequential-focus-navigation starting point continue from
            here; elsewhere `#main` scrolls into view while focus stays on <body> and a screen
            reader's virtual cursor does not move. A negative value keeps it out of the tab ring,
            and `:focus-visible` draws no ring on a programmatic focus. */}
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-content px-gutter md:px-gutter-lg xl:px-gutter-xl"
        >
          {children}
        </main>
        <Attribution snapshotAt={snapshotAt} now={BUILD_INSTANT} />
        <BottomTabBar slugLeague={SLUG_LEAGUE} />
      </body>
    </html>
  );
}
