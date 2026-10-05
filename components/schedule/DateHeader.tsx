import Link from 'next/link';

import { longDate, shortDate } from '../../lib/format';
import { gameWord } from '../ui/plural';

/**
 * The date-group header (DESIGN §3.3, §7.16): `Thu Sep 24  (12 games)  ········  Day page`.
 *
 * A 48px sticky band on the canvas — a 16px day heading, a count badge and the Day page link — so
 * while you scroll every game day of contests you always know which day you are looking at. The sticky
 * offset comes from `--sx-sticky-stack`, which the page sets to the height of whatever sticky
 * chrome sits above it — the same pattern `app/globals.css` already uses for `--sx-sticky-top` on
 * a sticky table head.
 *
 * "Day page" says where the link goes: `/scores/[date]`, prerendered for every date that has a
 * contest, i.e. a real URL to open, bookmark or send on (it used to read "Share", which promised a
 * share sheet it never opened). Its accessible name carries the date — "Day page for Thursday,
 * September 24" — because dozens of identical "Day page" links are useless in a links list.
 *
 * The count span carries `data-date-count` + `data-total` so the filter can rewrite it to
 * "6 of 12 games" without the client needing to know anything about dates. It is sans with
 * `tabular-nums`, not `.sx-num` mono: it is a phrase, not a column of digits, and the wider mono
 * "12 of 12 games" wrapped the heading at 320.
 */
export interface DateHeaderProps {
  /** 'YYYY-MM-DD' */
  date: string;
  count: number;
  /** Renders the "Day page" link to this href, the day's own /scores/[date] page. */
  dayHref?: string;
  sticky?: boolean;
  className?: string;
}

export function DateHeader({ date, count, dayHref, sticky = false, className }: DateHeaderProps) {
  return (
    <div
      // Sticky on a phone, the header sits inside a full-bleed date group (ScheduleList), so it
      // pads itself back to the gutter rather than pulling out of it. It draws a 1px rule on BOTH
      // edges: the bottom one is the top edge of the band below at rest and the edge rows scroll
      // under once it is stuck; the top one (inset, so it stays inside the 48px) closes off the
      // previous day's band, now that phone groups sit flush with no gap between them (G-20).
      // z-15: above a GameCard's z-10 "Box score" link (which otherwise painted over the stuck
      // band and took its clicks), below the z-20 top bar and the "More filters" tray.
      className={[
        'flex min-h-12 items-center gap-2',
        sticky
          ? 'sticky z-[15] bg-bg max-md:px-gutter max-md:shadow-[inset_0_1px_0_var(--sx-border),0_1px_0_var(--sx-border)]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={sticky ? { top: 'var(--sx-sticky-stack, 0px)' } : undefined}
    >
      {/* Every date group is a section under the page's h1. */}
      <h2 className="m-0 text-body font-semibold text-ink">
        <time dateTime={date}>
          <span aria-hidden="true">{shortDate(date)}</span>
          <span className="sr-only">{longDate(date)}</span>
        </time>
      </h2>
      {/* `data-date-count` + `data-total`: the filter rewrites this to "6 of 12 games". */}
      <span data-date-count data-total={count} className="sx-badge shrink-0 tabular-nums">
        {count} {gameWord(count)}
      </span>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and /schedule/<league> renders one of these per date group, so one whole day
          page per group. Navigation still fetches on click. */}
      {dayHref ? (
        <Link
          href={dayHref}
          prefetch={false}
          className="sx-action ml-auto shrink-0 text-meta font-medium text-accent no-underline hover:underline"
        >
          Day page
          <span className="sr-only"> for {longDate(date)}</span>
        </Link>
      ) : null}
    </div>
  );
}

export default DateHeader;
