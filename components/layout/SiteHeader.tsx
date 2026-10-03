import Link from 'next/link';

import LastUpdated from '../ui/LastUpdated';
import { getSitePhase } from '../../lib/data';
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
 * row's height to the fold on every page. Past 36 hours it becomes the stale pill instead
 * (LastUpdated), so a failing nightly update shows at the top of every page, not only in the
 * footer — unless every league's season is over, when the update stops on purpose and the stamp
 * stays a plain date (`seasonComplete`).
 *
 * From 768px: 64px, the wordmark + the eight nav links + the toggle. 768–943 drops the stamp so
 * the nav fits; it comes back from 944 in its short month-day form, with the weekday from 1280; the
 * spelled-out wordmark waits until 1280 too. Measured in Chromium (2026-10-03, with the eighth
 * link, Leaders, and the widest stamp, "Updated Nov 30 12:48 PM", forced in): at 768 the nav
 * capsules' 8px side padding (NavLink.tsx) leaves 15px between the nav and the toggle's gap, with
 * the toggle on the content edge (at 10px it sat 21px into the gutter); the stamp leaves ≈ 29px at
 * 944 (59rem), ≈ 33px at 1024 (where the capsules and the nav's margin grow) and ≈ 61px at 1280
 * with the weekday and the full wordmark. With the weekday at 1024 it left ≈ 3px, which is why the
 * weekday waits for 1280. The stale pill ("Updated 12 days ago") is narrower than the widest stamp.
 *
 * Re-measured for the rename with the static Geist table (tests/ui/text-metrics.ts, 12px/500,
 * scaled to 16px; no browser here, so these are text widths, not a layout run): "NorCal" 56.6px
 * against "SCVAL" 55.5px, and " Field Hockey" is unchanged at 109.1px. Every budget therefore
 * moves by ≈ 1px (≈ 1.2px allowing for the bold face): 320px keeps mark 28 + gap 8 + ≈ 58 +
 * toggle 44 well inside its 288px row; 360px still fits the compact stamp; and the spelled-out
 * wordmark still waits for 1280. The accessible name of the home link
 * is always SITE_NAME ("NorCal Field Hockey"). Content is capped at 1200px, with the same
 * 16 / 24 / 32px gutter as <main>.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). Omit to never show stale. */
  now?: string;
  /** `{ slug: league }` for every team, so the nav can follow the page's league (SPEC §8.3). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/** 'NorCal' / ' Field Hockey': the visible short wordmark and the half that waits for 1280px. */
const [WORDMARK_SHORT, ...WORDMARK_REST] = SITE_NAME.split(' ');
const WORDMARK_TAIL = WORDMARK_REST.join(' ');

export function SiteHeader({ snapshotAt, now, slugLeague }: SiteHeaderProps) {
  // After every league's season ends the nightly update stops on purpose; the stale pill would
  // then shout "Updated 9 days ago" in every header, so the stamp stays a plain date.
  const seasonComplete = getSitePhase() === 'complete';
  return (
    <header className="sx-chrome-top sticky top-0 z-20 bg-surface shadow-sticky">
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
        {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
            left end of the chrome is a 48/64px target. The "Field Hockey" half is sr-only below
            1280px (it overflowed the 768–843 nav, and at 1024 it would crowd out the stamp), so
            the accessible name never changes; its leading space keeps the computed name from
            reading "NorCalField Hockey". The 6px of padding, cancelled by the negative margin, is
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
          <span className="text-body font-bold tracking-[-0.01em]">{WORDMARK_SHORT}</span>
          <span className="sr-only xl:not-sr-only xl:text-body xl:font-medium xl:tracking-[-0.01em] xl:text-ink-2">
            {' '}
            {WORDMARK_TAIL}
          </span>
        </Link>
        <TopNav className="ml-3 hidden md:block lg:ml-6" slugLeague={slugLeague} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–943
              where the eight nav links need the room; back from 944 (59rem, ≈ 29px to spare at the
              widest stamp with "NorCal"). The breakpoints are in rem, not px: Tailwind orders
              min-width variants by value only within one unit, and every px one sorts BEFORE
              `md:hidden` (48rem) and loses to it. rem also moves them with the reader's default
              font size, as `md` and `lg` do: at a 24px default the phone stamp starts at 540px,
              so a 390px screen drops it rather than scrolling sideways. */}
          <LastUpdated
            at={snapshotAt}
            now={now}
            seasonComplete={seasonComplete}
            variant="compact"
            className="hidden min-[22.5rem]:inline md:hidden min-[59rem]:inline"
          />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
