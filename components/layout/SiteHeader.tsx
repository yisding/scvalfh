import Link from 'next/link';

import LastUpdated from '../ui/LastUpdated';

import ThemeToggle from './ThemeToggle';
import TopNav from './TopNav';

/**
 * The sticky top bar (DESIGN §1.3, R-5).
 *
 * Phone: 44px, one line — wordmark · freshness stamp · theme toggle. The stamp lives INSIDE the
 * bar rather than occupying its own 28px row, which is 28px of fold returned on every page and
 * takes permanent phone chrome down to 100px of 664 (15.1%).
 *
 * Desktop: 56px — wordmark + seven nav links + the toggle. Content is capped at 1120px.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
}

export function SiteHeader({ snapshotAt }: SiteHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-hairline bg-surface"
      style={{ boxShadow: 'var(--sx-shadow-sticky)' }}
    >
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg">
        {/* The wordmark is the home link, and at `text-kicker` its own box is 11px tall — the one
            target on every page under DESIGN §4.4's 44px floor. `inline-flex` + `h-full` makes it
            the height of the bar it already sits in, so the whole left end of the 44px chrome is
            tappable; nothing moves, because `items-center` already centred the text in that space.
            (WCAG 2.5.8 was satisfied by spacing alone — the toggle is 200px away — so this is
            §4.4, not axe.) */}
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-full shrink-0 items-center font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink no-underline"
        >
          SCVAL Field Hockey
        </Link>
        <TopNav className="hidden md:block" />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* `sm` is 640px in Tailwind v4, so gating this on `sm:` put `display:none` on the stamp
              across the ENTIRE phone range — the one thing DESIGN §1.3 / R-5 puts inside the 44px
              bar was missing from the bar on every phone. It now shows from 360px, where the
              wordmark, the shortened "Sep 30 12:47 AM" form and the toggle all fit on one line;
              below that the footer stamp is still there. */}
          <LastUpdated at={snapshotAt} variant="compact" className="hidden min-[360px]:inline" />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
