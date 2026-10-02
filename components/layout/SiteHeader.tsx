import Link from 'next/link';

import LastUpdated from '../ui/LastUpdated';

import ThemeToggle from './ThemeToggle';
import TopNav from './TopNav';

/**
 * The sticky top bar (DESIGN §1.3, R-5). A plain surface with a 1px sticky shadow, no border and
 * no translucency.
 *
 * Phone: 48px, one line: the FH mark + "SCVAL", the freshness stamp (from 360px), the theme toggle.
 * The stamp lives INSIDE the bar rather than occupying its own row, which returns that row's
 * height to the fold on every page.
 *
 * From 768px: 64px, the wordmark + the seven nav links + the toggle. 768–1279 drops the stamp so
 * the nav fits; from 1024 the wordmark spells out "Field Hockey", and from 1280 the stamp comes
 * back. The accessible name of the home link is always "SCVAL Field Hockey". Content is capped at
 * 1200px, with the same 16 / 24 / 32px gutter as <main>.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
}

export function SiteHeader({ snapshotAt }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-surface shadow-sticky">
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
        {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
            left end of the chrome is a 48/64px target. The "Field Hockey" half is sr-only below
            1024px (it overflowed the 768–843 nav), so the accessible name never changes; its
            leading space keeps the computed name from reading "SCVALField Hockey". */}
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
          <span className="text-body font-bold tracking-[-0.01em]">SCVAL</span>
          <span className="sr-only lg:not-sr-only lg:text-body lg:font-medium lg:tracking-[-0.01em] lg:text-ink-2">
            {' '}
            Field Hockey
          </span>
        </Link>
        <TopNav className="ml-4 hidden md:block lg:ml-6" />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–1279
              where the seven nav links need the room (at 1024 the spelled-out wordmark, the nav
              and the stamp left 0px of slack); back from 1280. */}
          <LastUpdated
            at={snapshotAt}
            variant="compact"
            className="hidden min-[360px]:inline md:hidden xl:inline"
          />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
