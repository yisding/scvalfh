import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import Attribution from '@/components/layout/Attribution';
import BottomTabBar from '@/components/layout/BottomTabBar';
import SiteHeader from '@/components/layout/SiteHeader';
import { BUILD_INSTANT } from '@/components/layout/build-instant';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/components/layout/site-url';
import { PINNED_TEAM_SCRIPT } from '@/components/layout/pinned-team-script';
import { THEME_SCRIPT } from '@/components/layout/theme-script';
import PinnedTeamMarks from '@/components/ui/PinnedTeamMarks';
import { getFetchedAt } from '@/lib/data';

import './globals.css';

/**
 * Two self-hosted families, both preloaded and both `display: 'swap'`, so text is never invisible
 * and neither face arrives late.
 *
 * Together they are 53 KB of the critical path (sans 29.6 KB, mono 23.4 KB) — the largest line
 * item after the framework's own JS, and the reason DESIGN §13's "`/` under 120 KB gzipped
 * including fonts" cannot be met. `preload: false` on the mono face was measured as a way to buy
 * that back and does NOT: mono is the numeral and kicker face, so `.sx-kicker` and `.sx-num` ask
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
    default: `${SITE_NAME} — 2026 scores, standings and CCS playoffs`,
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
  robots: { index: true, follow: true },
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
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-chip focus:bg-surface focus:px-3 focus:py-2 focus:text-meta focus:text-accent-ink"
        >
          Skip to content
        </a>
        <PinnedTeamMarks />
        <SiteHeader snapshotAt={snapshotAt} />
        {/* `tabIndex={-1}` is what makes the skip link actually MOVE focus. Without it only
            browsers that implement the sequential-focus-navigation starting point continue from
            here; elsewhere `#main` scrolls into view while focus stays on <body> and a screen
            reader's virtual cursor does not move. A negative value keeps it out of the tab ring,
            and `:focus-visible` draws no ring on a programmatic focus. */}
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-content px-gutter md:px-gutter-lg"
        >
          {children}
        </main>
        <Attribution snapshotAt={snapshotAt} now={BUILD_INSTANT} />
        <BottomTabBar />
      </body>
    </html>
  );
}
