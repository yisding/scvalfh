import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import LastUpdated from '../ui/LastUpdated';
import { getSitePhase } from '../../lib/data';
import type { LeagueId, TeamSlug } from '../../lib/types';

import { DATA_CORRECTIONS_URL, SITE_NAME, SITE_SHORT_NAME, SITE_WORDMARK } from './site';
import ThemeToggle from './ThemeToggle';
import TopNav from './TopNav';

/**
 * The sticky top bar (DESIGN §1.3, R-5; SPEC §10.2). A plain surface with a 1px sticky shadow, no
 * border and no translucency. No league switcher here: the league is chosen on the pages that are
 * about a league, never in the chrome.
 *
 * Phone: 48px, one line: the "CA HS FH" wordmark, the freshness stamp (from 360px), the theme
 * toggle. The stamp lives INSIDE the bar rather than occupying its own row, which returns that
 * row's height to the fold on every page. Past 36 hours it becomes the stale pill instead
 * (LastUpdated), so a failing scheduled update shows at the top of every page, not only in the
 * footer — unless every league's season is over, when the update stops on purpose and the stamp
 * stays a plain date (`seasonComplete`).
 *
 * From 768px: 64px, the wordmark + the seven nav links + the toggle. 768–895 drops the stamp so
 * the nav fits; it comes back from 896 in its short month-day form, with the weekday from 1024.
 * Below 1280 the wordmark is SITE_SHORT_NAME, "CA HS FH"; from 1280 it is "California HS FH".
 *
 * MEASURED in Chromium (2026-10-04, with the old wordmark "NorCal HS Field Hockey", no badge; the
 * seven links of DESIGN §18 and the widest stamp, "Updated Wed Nov 30 12:48 PM", forced in): the
 * short wordmark's link ("NorCal HS FH", 4px apart) was 115px wide with its padding, the full one
 * (8px apart) 193px; the gap from the wordmark to the stamp was ≈ 12px at 360, of which 8px is the
 * row's own gap, so 4px was spare; the nav cleared the toggle by ≈ 63px at 768; the stamp left
 * ≈ 28px at 896 (56rem) and ≈ 90px at 1024 with its weekday; with the "Report an error" pill (from
 * 1120) the nav cleared the stamp by 30px at 1120 and by 16px from 1280, where the content box stops
 * growing (1200px max) and the full wordmark took 78px back.
 *
 * ESTIMATED, not measured, for the neutral wordmark (DESIGN-socal §2.4; 2026-10-06): no browser was
 * available, so the new labels were sized with tests/ui/text-metrics.ts (Geist, 12px / 500, kerned)
 * scaled to the bar's 16px and then by the ratio the old labels' estimates bore to their Chromium
 * widths (115 / 123.7 and 193 / 209.5, ≈ 0.93 and 0.92; bold renders a little wider than 500, which
 * the ratio absorbs). "CA HS FH" ≈ 85px with padding, ≈ 30px narrower than "NorCal HS FH": ≈ 34px
 * spare at 360 (was 4px) and every narrower-than-1280 figure above improves by as much. "California
 * HS" + "FH" ≈ 134px: from 1280 it is ≈ 59px narrower than the old full wordmark, so ≈ 75px spare
 * beside the pill. The spelled-out "California HS Field Hockey" is NOT shown: ≈ 211px, ≈ 18px wider
 * than the old full form against the 16px that was spare from 1280 (the design review's "172px of
 * spare room" left the 141px pill out). "California HS" + "FH" would not fit 360 either (≈ 134px
 * against ≈ 119px of room), which is why the short form is the initials. Re-measure in Chromium with
 * scripts/a11y-axe.mjs's `layout:` lines before changing either label.
 *
 * The corrections thread (DATA_CORRECTIONS_URL) rides with the bar. From 1120px (70rem) it is a
 * ringed "Report an error ↗" pill beside the stamp; below that it is a second line under the bar,
 * "See something missing? Report a data error ↗", which is not sticky and scrolls away with the
 * page.
 *
 * The home link's accessible name always starts with its visible label: "CA HS FH California High
 * School Field Hockey" below 1280px (SITE_SHORT_NAME, then SITE_NAME sr-only), "California HS FH
 * Field Hockey" from 1280px (SITE_WORDMARK's first two words and its initials, then the tail sr-only).
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

/**
 * 'California HS' / 'Field Hockey': the visible lead of the 1280px wordmark and the half it shows only
 * as initials ('FH'), from SITE_WORDMARK. Below 1280 the visible label is SITE_SHORT_NAME, split the
 * same way ('CA HS' bold, 'FH' medium), so the two-tone mark reads the same at every width.
 */
const WORDMARK_WORDS = SITE_WORDMARK.split(' ');
const WORDMARK_LEAD = WORDMARK_WORDS.slice(0, 2).join(' ');
const WORDMARK_TAIL = WORDMARK_WORDS.slice(2).join(' ');
/** 'FH': the tail's initials, shown in its place. */
const WORDMARK_TAIL_ABBR = WORDMARK_WORDS.slice(2).map((word) => word[0]).join('');
const SHORT_WORDS = SITE_SHORT_NAME.split(' ');
/** 'CA HS' / 'FH'. */
const SHORT_LEAD = SHORT_WORDS.slice(0, -1).join(' ');
const SHORT_TAIL = SHORT_WORDS.slice(-1).join(' ');
if (SHORT_TAIL !== WORDMARK_TAIL_ABBR) {
  throw new Error(`SiteHeader: SITE_SHORT_NAME must end in ${WORDMARK_TAIL_ABBR}, got ${JSON.stringify(SITE_SHORT_NAME)}`);
}

export function SiteHeader({ snapshotAt, now, slugLeague }: SiteHeaderProps) {
  // After every league's season ends the scheduled update stops on purpose; the stale pill would
  // then shout "Updated 9 days ago" in every header, so the stamp stays a plain date.
  const seasonComplete = getSitePhase() === 'complete';
  return (
    <>
      <header className="sx-chrome-top sticky top-0 z-20 bg-surface shadow-sticky">
        <div className="mx-auto flex h-topbar max-w-content items-center gap-2 px-gutter md:h-topbar-lg md:px-gutter-lg xl:px-gutter-xl">
          {/* The wordmark is the home link. `h-full` makes it the height of the bar, so the whole
              left end of the chrome is a 48/64px target. Below 1280px the visible label is "CA HS
              FH" and SITE_NAME follows sr-only, so the name is "CA HS FH California High School
              Field Hockey"; from 1280px it is "California HS FH" with "Field Hockey" sr-only, so the
              name is "California HS FH Field Hockey". Either way the visible label is the start of
              the name (WCAG 2.5.3), so "click CA HS FH" works for voice control. The leading spaces
              keep the computed name from running words together. The spelled-out "Field Hockey"
              no longer shows at 1280 (≈ 18px too wide; see the comment above). The 6px of padding,
              cancelled by the negative margin, is room for the focus ring INSIDE the link: drawn
              outside, it ran into the screen edge. */}
          <Link
            href="/"
            prefetch={false}
            className="-mx-1.5 inline-flex h-full shrink-0 items-center gap-1 rounded-chip px-1.5 text-ink no-underline focus-visible:-outline-offset-2"
          >
            <span className="text-body font-bold tracking-[-0.01em] xl:hidden">{SHORT_LEAD}</span>
            <span className="hidden text-body font-bold tracking-[-0.01em] xl:inline">{WORDMARK_LEAD}</span>
            <span className="text-body font-medium tracking-[-0.01em] text-ink-2">
              {' '}
              {WORDMARK_TAIL_ABBR}
            </span>
            <span className="sr-only xl:hidden"> {SITE_NAME}</span>
            <span className="hidden xl:sr-only xl:inline"> {WORDMARK_TAIL}</span>
          </Link>
          <TopNav className="ml-4 hidden md:block lg:ml-6" slugLeague={slugLeague} />
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {/* From 360px on a phone (below that the footer stamp is still there); hidden 768–895
                where the seven nav links need the room; back from 896 (56rem, ≈ 33px to spare at the
                widest stamp with the old "NorCal HS FH", measured; ≈ 30px more with "CA HS FH",
                estimated). The breakpoints are in rem, not px: Tailwind orders
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
            {/* The corrections thread, from 1120px (70rem). Measured in Chromium with the widest
                stamp: the pill is 141px, and with it the nav cleared the stamp by 30px at 1120 and
                16px from 1280 beside the old full wordmark (both measured; with "CA HS FH" and
                "California HS FH" ≈ 60px and ≈ 75px, estimated); at 1088 it would not fit.
                Below 70rem it is the second line under the bar instead. The short label is what
                fits: "Report a data error" is 27px wider. The ringed pill, not the accent wash,
                which is the lit nav capsule's fill. */}
            <ExternalLink
              href={DATA_CORRECTIONS_URL}
              className="sx-pill sx-pill-ring hidden min-h-9 px-3 min-[70rem]:inline-flex"
            >
              Report an error
            </ExternalLink>
            <ThemeToggle />
          </span>
        </div>
      </header>
      {/* Below 1120px the corrections link is a second line under the bar, the whole line one
          40px link. NOT part of the sticky header: it scrolls away with the page, so the sticky
          stack every offset is measured against (--sx-sticky-top, html's scroll-padding-top, the
          division and date bars) stays the 48/64px bar, and the reader gets the height back once
          they start reading. An <aside> with a label, so it sits in a landmark of its own: outside
          every landmark, axe reports the line under `region`. */}
      <aside
        aria-label="Data corrections"
        className="border-b border-hairline bg-surface min-[70rem]:hidden"
      >
        <ExternalLink
          href={DATA_CORRECTIONS_URL}
          className="mx-auto flex min-h-10 max-w-content items-center gap-1 px-gutter text-meta font-medium no-underline md:px-gutter-lg"
        >
          <span className="text-ink-2">See something missing?</span> Report a data error
        </ExternalLink>
      </aside>
    </>
  );
}

export default SiteHeader;
