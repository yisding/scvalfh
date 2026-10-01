import Link from 'next/link';

import { longDate, shortDate } from '../../lib/format';

import { gameWord } from './filter-data';

/**
 * The date-group header (DESIGN §3.3, §7.16): `THU SEP 24 · 12 GAMES ──────── share →`.
 *
 * It is the rule-and-kicker in its sticky form, so while you scroll 49 days of contests you always
 * know which day you are looking at. The sticky offset comes from `--sx-sticky-stack`, which the
 * page sets to the height of whatever sticky chrome sits above it — the same pattern
 * `app/globals.css` already uses for `--sx-sticky-top` on a sticky table head.
 *
 * `share →` is a real, shareable URL: `/scores/[date]` is prerendered for every date that has a
 * contest, so the action is never a copy-to-clipboard affordance that a phone might not support.
 *
 * The count span carries `data-date-count` + `data-total` so the filter can rewrite it to
 * "6 of 12 games" without the client needing to know anything about dates.
 */
export interface DateHeaderProps {
  /** 'YYYY-MM-DD' */
  date: string;
  count: number;
  /** Renders the `share →` action pointing at /scores/[date]. */
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
      className={`sx-kicker mb-2${
        sticky ? ' sticky z-[5] bg-bg' : ''
      }${className ? ` ${className}` : ''}`}
      style={sticky ? { top: 'var(--sx-sticky-stack, 0px)', paddingBottom: '0.375rem' } : undefined}
    >
      <Heading className="m-0 text-kicker font-mono font-semibold tracking-[0.10em] uppercase text-ink">
        <time dateTime={date}>
          <span aria-hidden="true">{shortDate(date)}</span>
          <span className="sr-only">{longDate(date)}</span>
        </time>
      </Heading>
      <span data-date-count data-total={count} className="shrink-0">
        {count} {gameWord(count)}
      </span>
      <span className="sx-kicker-rule" aria-hidden="true" />
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and /schedule renders one of these per date group — 49 of them, i.e. 49 whole
          day pages. Navigation still fetches on click. */}
      {shareHref ? (
        <Link href={shareHref} prefetch={false} className="shrink-0 hover:underline">
          share <span aria-hidden="true">&rarr;</span>
          <span className="sr-only">this day</span>
        </Link>
      ) : null}
    </div>
  );
}

export default DateHeader;
