import Link from 'next/link';

import LastUpdated from '../ui/LastUpdated';
import { getSitePhase } from '../../lib/data';
import type { LeagueId, TeamSlug } from '../../lib/types';

import { SITE_WORDMARK } from './site';
import ThemeToggle from './ThemeToggle';
import TopNav from './TopNav';

/**
 * The sticky top bar (DESIGN §1.3, R-5; SPEC §10.2). A plain surface with a 1px sticky shadow, no
 * border and no translucency. No league switcher here: the league is chosen on the pages that are
 * about a league, never in the chrome.
 *
 * Phone: 48px, one line: the "NorCal HS FH" wordmark, the freshness stamp (from 360px), the theme
 * toggle. The stamp lives INSIDE the bar rather than occupying its own row, which returns that
 * row's height to the fold on every page. Past 36 hours it becomes the stale pill instead
 * (LastUpdated), so a failing nightly update shows at the top of every page, not only in the
 * footer — unless every league's season is over, when the update stops on purpose and the stamp
 * stays a plain date (`seasonComplete`).
 *
 * From 768px: 64px, the wordmark + the seven nav links + the toggle. 768–895 drops the stamp so
 * the nav fits; it comes back from 896 in its short month-day form, with the weekday from 1024; the
 * spelled-out wordmark waits until 1280; below that, "FH" stands in for "Field Hockey". Measured in
 * Chromium (2026-10-04, the wordmark "NorCal HS Field Hockey" with no badge; the seven links of
 * DESIGN §18 and the widest stamp, "Updated Wed Nov 30 12:48 PM", forced in): the short wordmark's
 * link ("NorCal HS FH", 4px apart) is 115px wide with its padding, the full one (8px apart) 193px;
 * the gap from the wordmark to the stamp is ≈ 12px at 360, of which 8px is the row's own gap, so
 * 4px is spare; the nav clears the toggle by ≈ 63px at 768; the stamp leaves ≈ 28px at 896 (56rem),
 * ≈ 90px at 1024 with its weekday and ≈ 172px at 1280 beside the full wordmark. The full wordmark
 * at 1024 would leave ≈ 12px, which is why it still waits for 1280. The 4px between "NorCal HS" and
 * "FH" is what fits 360: at 8px the widest stamp had 0.1px to spare. The stale pill ("Updated 12
 * days ago") is narrower than the widest stamp. (Eight links, DESIGN §16, needed tighter capsules
 * and a later stamp; §18's merge of Standings into Teams gave the room back.)
 *
 * The home link's accessible name always starts with its visible label: "NorCal HS FH Field Hockey"
 * below 1280px, SITE_WORDMARK ("NorCal HS Field Hockey") from 1280px.
 * Content is capped at 1200px, with the same 16 / 24 / 32px gutter as <main>.
 */
export interface SiteHeaderProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). Omit to never show stale. */
  now?: string;
  /** `{ slug: league }` for every team, so the nav can follow the page's league (SPEC §8.3). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/** 'NorCal HS' / 'Field Hockey': the visible short wordmark and the half that waits for 1280px. */
const WORDMARK_WORDS = SITE_WORDMARK.split(' ');
const WORDMARK_SHORT = WORDMARK_WORDS.slice(0, 2).join(' ');
const WORDMARK_TAIL = WORDMARK_WORDS.slice(2).join(' ');
/** 'FH': the tail's initials, shown in its place below 1280px. */
const WORDMARK_TAIL_ABBR = WORDMARK_WORDS.slice(2).map((word) => word[0]).join('');

export function SiteHeader({ snapshotAt, now, slugLeague }: SiteHeaderProps) {
  // After every league's season ends the nightly update stops on purpose; the stale pill would
  // then shout "Updated 9 days ago" in every header, so the stamp stays a plain date.
  const seasonComplete = getSitePhase() === 'complete';
  return (
    <header className="sx-chrome-top sticky top-0 z-20 bg-surface shadow-sticky">
      <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
        {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
            left end of the chrome is a 48/64px target. The "Field Hockey" half is sr-only below
            1280px (it overflowed the 768–843 nav, and at 1024 it would crowd out the stamp) and
            "FH" stands in for it. "FH" stays in the accessible name: the visible label has to be
            part of the name (WCAG 2.5.3) so "click NorCal HS FH" works for voice control, and the
            sr-only tail still spells it out, so the name is "NorCal HS FH Field Hockey" below 1280px
            and "NorCal HS Field Hockey" from 1280px. The leading spaces keep the computed name from
            reading "NorCal HSFH" or "NorCal HSField Hockey". The 6px of padding, cancelled by the negative margin, is
            room for the focus ring INSIDE the link: drawn outside, it ran into the screen edge. */}
        <Link
          href="/"
          prefetch={false}
          className="-mx-1.5 inline-flex h-full shrink-0 items-center gap-1 rounded-chip px-1.5 xl:gap-2 text-ink no-underline focus-visible:-outline-offset-2"
        >
          <span className="text-body font-bold tracking-[-0.01em]">{WORDMARK_SHORT}</span>
          <span className="text-body font-medium tracking-[-0.01em] text-ink-2 xl:hidden">
            {' '}
            {WORDMARK_TAIL_ABBR}
          </span>
          <span className="sr-only xl:not-sr-only xl:text-body xl:font-medium xl:tracking-[-0.01em] xl:text-ink-2">
            {' '}
            {WORDMARK_TAIL}
          </span>
        </Link>
        <TopNav className="ml-4 hidden md:block lg:ml-6" slugLeague={slugLeague} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–895
              where the seven nav links need the room; back from 896 (56rem, ≈ 33px to spare at the
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
            className="hidden min-[22.5rem]:inline md:hidden min-[56rem]:inline"
          />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

export default SiteHeader;
