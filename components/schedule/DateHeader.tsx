import Link from 'next/link';

import { longDate, shortDate } from '../../lib/format';

import { gameWord } from './filter-data';

/**
 * The date-group header (DESIGN §3.3, §7.16): `Thu Sep 24  (12 games)  ········  Share`.
 *
 * A 48px sticky band on the canvas — a 16px day heading, a count badge and the Share action — so
 * while you scroll 49 days of contests you always know which day you are looking at. The sticky offset comes from `--sx-sticky-stack`, which the
 * page sets to the height of whatever sticky chrome sits above it — the same pattern
 * `app/globals.css` already uses for `--sx-sticky-top` on a sticky table head.
 *
 * "Share" is a real, shareable URL: `/scores/[date]` is prerendered for every date that has a
 * contest, so the action is never a copy-to-clipboard affordance that a phone might not support.
 *
 * The count span carries `data-date-count` + `data-total` so the filter can rewrite it to
 * "6 of 12 games" without the client needing to know anything about dates.
 */
export interface DateHeaderProps {
  /** 'YYYY-MM-DD' */
  date: string;
  count: number;
  /** Renders the Share action pointing at /scores/[date]. */
  shareHref?: string;
  as?: 'h2' | 'h3';
  sticky?: boolean;
  className?: string;
}

export function DateHeader({
  date,
  count,
  shareHref,
  as: Heading = 'h2',
  sticky = false,
  className,
}: DateHeaderProps) {
  return (
    <div
      // Sticky on a phone, the header sits inside a full-bleed date group (ScheduleList), so it
      // pads itself back to the gutter rather than pulling out of it, and its 1px line is the top
      // edge of the band below at rest and the edge rows scroll under once it is stuck.
      // z-15: above a GameCard's z-10 "Box score" link (which otherwise painted over the stuck
      // band and took its clicks), below the z-20 top bar and the "More filters" tray.
      className={[
        'flex min-h-12 items-center gap-2',
        sticky
          ? 'sticky z-[15] bg-bg max-md:px-gutter max-md:shadow-[0_1px_0_var(--sx-border)]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={sticky ? { top: 'var(--sx-sticky-stack, 0px)' } : undefined}
    >
      <Heading className="m-0 text-body font-semibold text-ink">
        <time dateTime={date}>
          <span aria-hidden="true">{shortDate(date)}</span>
          <span className="sr-only">{longDate(date)}</span>
        </time>
      </Heading>
      {/* `data-date-count` + `data-total`: the filter rewrites this to "6 of 12 games". */}
      <span data-date-count data-total={count} className="sx-badge sx-num shrink-0">
        {count} {gameWord(count)}
      </span>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and /schedule renders one of these per date group — 49 of them, i.e. 49 whole
          day pages. Navigation still fetches on click. */}
      {shareHref ? (
        <Link
          href={shareHref}
          prefetch={false}
          className="sx-action ml-auto shrink-0 text-meta font-medium text-accent no-underline hover:underline"
        >
          Share
          <span className="sr-only"> this day</span>
        </Link>
      ) : null}
    </div>
  );
}

export default DateHeader;
