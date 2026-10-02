import Link from 'next/link';

import LastUpdated from '../ui/LastUpdated';
import type { LeagueId, TeamSlug } from '../../lib/types';

import { SITE_NAME } from './site-url';
import ThemeToggle from './ThemeToggle';
import TopNav from './TopNav';

/**
 * The sticky top bar (DESIGN §1.3, R-5; SPEC §10.2). A plain surface with a 1px sticky shadow, no
 * border and no translucency. No league switcher here: the league is chosen on the pages that are
 * about a league, never in the chrome.
 *
 * Phone: 48px, one line: the FH mark + "NorCal", the freshness stamp (from 360px), the theme
 * toggle. The stamp lives INSIDE the bar rather than occupying its own row, which returns that
 * row's height to the fold on every page.
 *
 * From 768px: 64px, the wordmark + the seven nav links + the toggle. 768–1023 drops the stamp so
 * the nav fits; it comes back from 1024, where the freshness fact outranks the spelled-out
 * wordmark, which waits until 1280 ("Field Hockey" plus the stamp left 4px of slack at 1024).
 *
 * Re-measured for the rename with the static Geist table (tests/ui/text-metrics.ts, 12px/500,
 * scaled to 16px; no browser here, so these are text widths, not a layout run): "NorCal" 56.6px
 * against "SCVAL" 55.5px, and " Field Hockey" is unchanged at 109.1px. Every budget therefore
 * moves by ≈ 1px (≈ 1.2px allowing for the bold face): 320px keeps mark 28 + gap 8 + ≈ 58 +
 * toggle 44 well inside its 288px row; 360px still fits the compact stamp; 768–1023 still drops
 * the stamp for the seven links; 1024 keeps the stamp with the short wordmark; and the 4px of
 * slack that kept "Field Hockey" out at 1024 becomes ≈ 3px, so the spelled-out wordmark still
 * waits for 1280. The accessible name of the home link
 * is always SITE_NAME ("NorCal Field Hockey"). Content is capped at 1200px, with the same
 * 16 / 24 / 32px gutter as <main>.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** `{ slug: league }` for every team, so the nav can follow the page's league (SPEC §8.3). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/** 'NorCal' / ' Field Hockey': the visible short wordmark and the half that waits for 1280px. */
const [WORDMARK_SHORT, ...WORDMARK_REST] = SITE_NAME.split(' ');
const WORDMARK_TAIL = WORDMARK_REST.join(' ');

export function SiteHeader({ snapshotAt, slugLeague }: SiteHeaderProps) {
  return (
    <header className="sx-chrome-top sticky top-0 z-20 bg-surface shadow-sticky">
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
        {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
            left end of the chrome is a 48/64px target. The "Field Hockey" half is sr-only below
            1280px (it overflowed the 768–843 nav, and at 1024 it would crowd out the stamp), so
            the accessible name never changes; its leading space keeps the computed name from
            reading "NorCalField Hockey". */}
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-full shrink-0 items-center gap-2 text-ink no-underline"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center rounded-chip bg-accent-wash text-micro font-bold tracking-[-0.01em] text-accent-ink"
          >
            FH
          </span>
          <span className="text-body font-bold tracking-[-0.01em]">{WORDMARK_SHORT}</span>
          <span className="sr-only xl:not-sr-only xl:text-body xl:font-medium xl:tracking-[-0.01em] xl:text-ink-2">
            {' '}
            {WORDMARK_TAIL}
          </span>
        </Link>
        <TopNav className="ml-4 hidden md:block lg:ml-6" slugLeague={slugLeague} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–1023
              where the seven nav links need the room; back from 1024 (about 100px of slack
              there with the short wordmark). */}
          <LastUpdated
            at={snapshotAt}
            variant="compact"
            className="hidden min-[360px]:inline md:hidden lg:inline"
          />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
