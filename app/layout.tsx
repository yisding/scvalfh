import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import Attribution from '@/components/layout/Attribution';
import BottomTabBar from '@/components/layout/BottomTabBar';
import SiteHeader from '@/components/layout/SiteHeader';
import { BUILD_INSTANT } from '@/components/layout/build-instant';
import { DISCLOSURE_SCRIPT } from '@/components/layout/disclosure-script';
import { buildLeagueScopeCss } from '@/components/layout/league-scope-css';
import { buildPrefsScript } from '@/components/layout/prefs-script';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/components/layout/site-url';
import { PINNED_TEAM_SCRIPT } from '@/components/layout/pinned-team-script';
import { THEME_SCRIPT } from '@/components/layout/theme-script';
import PinnedTeamMarks from '@/components/ui/PinnedTeamMarks';
import { getFetchedAt, getTeams } from '@/lib/data';
import { LEAGUE_IDS } from '@/lib/leagues';

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
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — 2026 scores, standings and playoffs`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — 2026`,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
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
  // Matches --sx-bg in each mode, so the browser chrome never flashes the other theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
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
const PREFS_SCRIPT = buildPrefsScript({ leagueIds: LEAGUE_IDS, slugLeague: SLUG_LEAGUE });
const SCOPE_CSS = buildLeagueScopeCss(LEAGUE_IDS);

export default function RootLayout({ children }: LayoutProps<'/'>) {
  const snapshotAt = getFetchedAt();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* ~200 bytes, blocking, before first paint: stamps data-theme so an explicit
            Light/Dark choice never flashes the other theme (DESIGN §7.14). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Marks the pinned team's row on /standings and its tile on /teams before the first
            paint, once the DOM is parsed. `DOMContentLoaded` fires once per document, so
            <PinnedTeamMarks /> below re-applies it after every client-side navigation; see
            components/layout/pinned-team-script.ts for why this pass still lives here. */}
        <script dangerouslySetInnerHTML={{ __html: PINNED_TEAM_SCRIPT }} />
        {/* The remembered league (SPEC §8.2), a SEPARATE blocking script: stamps data-js,
            data-league, data-pin and data-pin-stale on <html> before first paint, so the scope
            stylesheet below paints the right home panel first (CLS 0, no reordering). */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        {/* Unlayered on purpose: it must outrank every @layer, utilities included. Tailwind
            cannot generate one selector per league id (components/layout/league-scope-css.ts). */}
        <style dangerouslySetInnerHTML={{ __html: SCOPE_CSS }} />
        {/* Scrolls a <details> the reader just opened into view when its panel lands under the
            phone tab bar; see components/layout/disclosure-script.ts. */}
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
