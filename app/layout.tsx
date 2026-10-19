import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { DISCLOSURE_SCRIPT } from '@/components/head/disclosure-script';
import { buildLeagueScopeCss } from '@/components/head/league-scope-css';
import { PINNED_TEAM_SCRIPT } from '@/components/head/pinned-team-script';
import { buildPrefsScript } from '@/components/head/prefs-script';
import { THEME_COLOR, THEME_SCRIPT } from '@/components/head/theme-script';
import Attribution from '@/components/layout/Attribution';
import BottomTabBar from '@/components/layout/BottomTabBar';
import SiteHeader from '@/components/layout/SiteHeader';
import PinnedTeamMarks from '@/components/ui/PinnedTeamMarks';
import TwinMarks from '@/components/ui/TwinMarks';
import { DEFAULT_REGION, LEAGUE_IDS, regionOf } from '@/lib/config/leagues';
import { getFetchedAt } from '@/lib/datasets/snapshot';
import { getTeams } from '@/lib/queries/teams';
import { BUILD_INSTANT } from '@/views/site/build-instant';
import { OG_BASE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SITE_WORDMARK } from '@/views/site/site';

import './globals.css';

/**
 * Two self-hosted families, both preloaded and both `display: 'swap'`, so text is never invisible
 * and neither face arrives late.
 *
 * Together they are 53 KB of the critical path (sans 29.6 KB, mono 23.4 KB) — the largest line
 * item after the framework's own JS, and the reason DESIGN §13's "`/` under 120 KB gzipped
 * including fonts" cannot be met. `preload: false` on the mono face was measured as a way to buy
 * that back and does NOT: mono is the numeral and tag face, so `.sx-num` and `Tag` ask
 * for it above the fold on every route, and the browser fetches it the moment the stylesheet is
 * applied whether or not a preload hint pointed at it — `/` measured 236.3 KB with the hint
 * removed against 236.8 KB with it, i.e. the ~550 bytes of the `<link>` itself. All it actually
 * changes is WHEN the scores get their real glyphs. Dropping the family outright would save the
 * 23 KB and is the one thing not on the table: mono numerals are the type system (DESIGN §4.2).
 * The budget is restated against the framework floor instead — see the note at the top of
 * docs/DESIGN.md.
 */
/*
 * The fallbacks are what the text is set in until the faces land (and for good if they never do),
 * so they are chosen for WIDTH, not just for being present. Each list is written inline, not as a
 * shared const: vinext's font plugin reads these options from the source and only self-hosts a
 * call whose object is all literals (node_modules/vinext/dist/plugins/fonts.js).
 *
 * Sans keeps next/font's metric-adjusted "Geist Fallback" (Arial at size-adjust 104.76%) and
 * takes NO `fallback` list: under Turbopack a `fallback` REPLACES the adjusted face rather than
 * following it (the built CSS lost "Geist Fallback" altogether; webpack and vinext keep both).
 * The generic tail (`ui-sans-serif, system-ui, sans-serif`) is appended where the variable is
 * used instead, by `--font-sans` in app/globals.css' @theme and by `body`, so a reader without
 * Arial (Android, most Linux) still gets a sans. The bold twin of "Geist Fallback" (600–900) is
 * app/globals.css' own @font-face.
 *
 * Mono drops the adjusted fallback (`adjustFontFallback: false`). next/font only knows Arial's and
 * Times' metrics, so its "Geist Mono Fallback" was Arial at size-adjust 134.59%: a proportional
 * face blown up until its AVERAGE advance matched, which set tags 27–29% and `.sx-num` figures
 * 6–21% wider than Geist Mono until it loaded (measured on /, /schedule/scval and
 * /teams/cupertino, Arial simulated), and not monospaced at all. A system monospace has Geist
 * Mono's 0.6em advance, so the fallback is one: app/globals.css declares "Geist Mono Fallback"
 * (SF Mono, Menlo, Liberation Mono, DejaVu Sans Mono … with Geist Mono's line metrics) and
 * "Geist Mono Fallback Narrow" (Consolas, size-adjusted from 0.55em), then the named families and
 * the generic follow for a reader with neither. Measured with the faces blocked: 0.0% width change
 * on the swap.
 */
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false,
  fallback: [
    'Geist Mono Fallback',
    'Geist Mono Fallback Narrow',
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    'Liberation Mono',
    'monospace',
  ],
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
  // og:title (views/site/site.ts OG_BASE).
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
  // (components/head/theme-script.ts), from the same THEME_COLOR pair.
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
/** `{ league: region }`, from the config (lib/config/leagues.ts regionOf): the prefs script ships the non-default part. */
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* ~300 bytes, blocking, before first paint: stamps data-theme so an explicit
            Light/Dark choice never flashes the other theme, and gives the browser chrome the
            chosen theme-color (DESIGN §7.14). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Marks the pinned team's row on /standings and its tile on /teams before the first
            paint, once the DOM is parsed. `DOMContentLoaded` fires once per document, so
            <PinnedTeamMarks /> below re-applies it after every client-side navigation; see
            components/head/pinned-team-script.ts for why this pass still lives here. */}
        <script dangerouslySetInnerHTML={{ __html: PINNED_TEAM_SCRIPT }} />
        {/* The remembered league and region (SPEC §8.2, DESIGN-socal §2.4), a SEPARATE blocking
            script: stamps data-js, data-league, data-region (SoCal only), data-pin and
            data-pin-stale on <html> before first paint, so the scope stylesheet below paints the
            right region and home panel first (CLS 0, no reordering). */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        {/* Unlayered on purpose: it must outrank every @layer, utilities included. Tailwind
            cannot generate one selector per league id (components/head/league-scope-css.ts);
            the region rules ride in the same sheet. */}
        <style dangerouslySetInnerHTML={{ __html: SCOPE_CSS }} />
        {/* Scrolls a <details> the reader just opened into view when its panel lands under the
            phone tab bar; see components/head/disclosure-script.ts. */}
        <script dangerouslySetInnerHTML={{ __html: DISCLOSURE_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-chip focus:bg-surface focus:px-3 focus:py-2 focus:text-meta focus:text-accent-ink"
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
