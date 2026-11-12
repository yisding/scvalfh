import Link from 'next/link';

import { longDate, shortDate } from '../../lib/format';
import { gameWord } from '../words/plural';

/**
 * The date-group header (DESIGN §33): a tint strip (`.sx-band`), the date at the left and the count
 * at its right end. Sticky on a long list (`data-sticky`; it is that page's one sticky bar), so while
 * you scroll a season you always know which day you are looking at.
 *
 * The date itself is the link to that day's own page (`/scores/[date]`, prerendered for every date
 * that has a contest): a real URL to open, bookmark or send on. Its accessible name is the full date.
 *
 * The count span carries `data-date-count` + `data-total` so the filter can rewrite it to
 * "6 of 12 games" without the client needing to know anything about dates.
 */
export interface DateHeaderProps {
  /** 'YYYY-MM-DD' */
  date: string;
  count: number;
  /** Makes the date a link to this href, the day's own /scores/[date] page. */
  dayHref?: string;
  sticky?: boolean;
  className?: string;
}

export function DateHeader({ date, count, dayHref, sticky = false, className }: DateHeaderProps) {
  const words = (
    <>
      <span aria-hidden="true">{shortDate(date)}</span>
      <span className="sr-only">{longDate(date)}</span>
    </>
  );
  return (
    <div className={['sx-band', className].filter(Boolean).join(' ')} data-sticky={sticky ? '' : undefined}>
      {/* Every date group is a section under the page's h1. */}
      <h2>
        <time dateTime={date}>
          {/* `prefetch={false}`: every route here is STATIC, so Next's `auto` would download the
              whole day page the moment the link scrolls into view, one per date group. */}
          {dayHref ? (
            <Link href={dayHref} prefetch={false}>
              {words}
            </Link>
          ) : (
            words
          )}
        </time>
      </h2>
      <span className="sx-strip-end">
        {/* `data-date-count` + `data-total`: the filter rewrites this to "6 of 12 games". */}
        <span data-date-count data-total={count}>
          {count} {gameWord(count)}
        </span>
      </span>
    </div>
  );
}

export default DateHeader;
