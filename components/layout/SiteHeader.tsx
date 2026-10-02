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
 * height to the fold on every page. Past 36 hours it becomes the stale pill instead (LastUpdated),
 * so a failing nightly update shows at the top of every page, not only in the footer.
 *
 * From 768px: 64px, the wordmark + the seven nav links + the toggle. 768–895 drops the stamp so
 * the nav fits; it comes back from 896 in its short month-day form ("Updated Sep 30 12:48 PM", the
 * widest it gets, needs 876px), with the weekday from 1024; the spelled-out wordmark waits until
 * 1280. The accessible name of the home link is always
 * "SCVAL Field Hockey". Content is capped at 1200px, with the same 16 / 24 / 32px gutter as <main>.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). Omit to never show stale. */
  now?: string;
}

export function SiteHeader({ snapshotAt, now }: SiteHeaderProps) {
  return (
    <header className="sx-chrome-top sticky top-0 z-20 bg-surface shadow-sticky">
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
        {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
            left end of the chrome is a 48/64px target. The "Field Hockey" half is sr-only below
            1280px (it overflowed the 768–843 nav, and at 1024 it would crowd out the stamp), so
            the accessible name never changes; its leading space keeps the computed name from
            reading "SCVALField Hockey". The 6px of padding, cancelled by the negative margin, is
            room for the focus ring INSIDE the link: drawn outside, it ran into the screen edge
            and through the badge. */}
        <Link
          href="/"
          prefetch={false}
          className="-mx-1.5 inline-flex h-full shrink-0 items-center gap-2 rounded-chip px-1.5 text-ink no-underline focus-visible:-outline-offset-2"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center rounded-chip bg-accent-wash text-micro font-bold tracking-[-0.01em] text-accent-ink"
          >
            FH
          </span>
          <span className="text-body font-bold tracking-[-0.01em]">SCVAL</span>
          <span className="sr-only xl:not-sr-only xl:text-body xl:font-medium xl:tracking-[-0.01em] xl:text-ink-2">
            {' '}
            Field Hockey
          </span>
        </Link>
        <TopNav className="ml-4 hidden md:block lg:ml-6" />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–895
              where the seven nav links need the room; back from 896 (56rem, 20px to spare at the
              widest stamp). The breakpoints are in rem, not px: Tailwind orders min-width variants
              by value only within one unit, and every px one sorts BEFORE `md:hidden` (48rem) and
              loses to it. rem also moves them with the reader's default font size, as `md` and
              `lg` do: at a 24px default the phone stamp starts at 540px, so a 390px screen drops
              it rather than scrolling sideways. */}
          <LastUpdated
            at={snapshotAt}
            now={now}
            variant="compact"
            className="hidden min-[22.5rem]:inline md:hidden min-[56rem]:inline"
          />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
