import Link from 'next/link';

import {
  dateWithYear,
  formatStamp,
  hoursBetween,
  monthDay,
  plural,
  shortDate,
  timeOfDay,
  toLocalTimestamp,
} from '../../lib/format';

/**
 * The freshness stamp (DESIGN §1.3, §7.15). Formatted server-side in America/Los_Angeles so it
 * can never hydration-mismatch and no client ever reformats a date.
 *
 * Every form says what the time IS: "Updated …". A bare "Oct 2 3:48 AM" in the top bar could be
 * read as a game time or the clock, and "Snapshot" is our word, not a reader's. The digits are
 * `tabular-nums` in the sans face rather than `.sx-num`: a stamp is one line of text, not a
 * column, and the mono face was the widest thing in the 48px phone bar.
 *
 * Stale treatment: past 36 hours the stamp stops being quiet grey and becomes ink on the accent
 * wash, saying what the reader loses ("newer scores may be missing"), with a link to
 * /about#updates. In the top bar it becomes a single pill link, "Updated N days ago". Never hide a
 * failure behind a timestamp nobody reads.
 *
 * `now` is the instant staleness is measured against. A static site cannot observe its own
 * staleness at view time, so the caller passes the BUILD instant: if the scheduled fetch fails but
 * the build still runs, `fetchedAt` is old against a fresh build and the warning appears — which
 * is exactly the failure this state is for.
 *
 * `seasonComplete`: once every league's season is over the scheduled update stops on purpose, so an
 * old stamp is not a failure. Then the stamp's stale state reads `Season complete — final update
 * <date>.` in the quiet grey instead of the alarm, and the top bar keeps its plain "Updated …"
 * stamp instead of the pill (SPEC §10.2; SiteHeader and Attribution pass
 * `getSitePhase() === 'complete'`).
 */
export interface LastUpdatedProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  at: string;
  /** ISO UTC instant to measure staleness against. Omit to never show the stale state. */
  now?: string;
  /** 'compact' is the top-bar form: "Updated Fri Oct 2 3:48 AM" (the weekday drops where narrow). */
  variant?: 'stamp' | 'compact';
  /** Every league's season is over: an old stamp is the final update, not a failing one. */
  seasonComplete?: boolean;
  className?: string;
}

const STALE_AFTER_HOURS = 36;

/** '1 day ago' / '4 days ago'. Only reached past 36 hours, so never "0 days". */
function daysAgo(ageHours: number): string {
  const days = Math.round(ageHours / 24);
  return `${plural(days, 'day')} ago`;
}

export function LastUpdated({
  at,
  now,
  variant = 'stamp',
  seasonComplete = false,
  className,
}: LastUpdatedProps) {
  const local = toLocalTimestamp(at);
  const ageHours = now ? hoursBetween(at, now) : 0;
  const stale = ageHours > STALE_AFTER_HOURS;
  // An old stamp is only an alarm while some league is still playing.
  const alarm = stale && !seasonComplete;
  // Never `tabular-nums${…}`: Tailwind's scanner does not extract a class glued to an interpolation
  // (components/layout/PageHeader.tsx), so the caller's classes are joined on, not appended.
  const withClass = (base: string) => [base, className].filter(Boolean).join(' ');

  if (variant === 'compact') {
    if (alarm) {
      // One link, not a stamp plus a warning: the 48px bar has room for one short phrase, and the
      // phrase is the way to the explanation. A standalone link, so it carries its own 24px box
      // (`sx-action`, WCAG 2.5.8). `py-0.5` makes the 20px line a centred 24px box even where the
      // caller's display class (`inline`, blockified in the header's flex row) replaces
      // `sx-action`'s inline-flex. The footer on the same page carries the full sentence.
      return (
        <Link
          href="/about#updates"
          prefetch={false}
          className={withClass(
            'sx-action min-h-6 whitespace-nowrap rounded-full bg-accent-wash px-2 py-0.5 text-cell font-medium text-accent-ink tabular-nums no-underline',
          )}
        >
          Updated {daysAgo(ageHours)}
        </Link>
      );
    }
    return (
      <span className={withClass('whitespace-nowrap text-cell text-ink-3 tabular-nums')}>
        {/* The label sits OUTSIDE the <time>, so the element's text is only the instant. */}
        <span className="font-sans text-micro text-ink-3">Updated</span>{' '}
        <time dateTime={at}>
          {/* The weekday is the first thing to go: below 640px, where this sits in the 48px phone
              bar beside the wordmark and the theme toggle (DESIGN §1.3, R-5), and at 896–1023
              beside the seven nav links. "Wed Nov 30" does not fit in either next to the time.
              `hidden` removes a span from the accessibility tree too, so exactly one date is ever
              announced. */}
          <span className="sm:hidden md:inline lg:hidden">{monthDay(local)}</span>
          <span className="hidden sm:inline md:hidden lg:inline">{shortDate(local)}</span>{' '}
          {timeOfDay(local)}
          <span className="sr-only"> Pacific time</span>
        </time>
      </span>
    );
  }

  if (stale && seasonComplete) {
    return (
      <span className={withClass('text-meta text-ink-2')}>
        Season complete &mdash; final update{' '}
        <time dateTime={at} className="tabular-nums">
          {dateWithYear(local)}
        </time>
        .
      </span>
    );
  }

  if (alarm) {
    // A sentence, so it wraps on a phone: the chip radius rather than a full pill, which turns a
    // two-line box into a lozenge.
    return (
      <span className={withClass('inline-block rounded-chip bg-accent-wash px-2.5 py-1 text-meta text-ink')}>
        Not updated since{' '}
        <time dateTime={at} className="tabular-nums">
          {shortDate(local)}
        </time>
        , so newer scores may be missing.{' '}
        <Link href="/about#updates" prefetch={false} className="text-accent-ink underline">
          Why?
        </Link>
      </span>
    );
  }

  return (
    <span className={withClass('text-meta text-ink-2')}>
      Updated{' '}
      <time dateTime={at} className="tabular-nums">
        {formatStamp(at)}
      </time>
    </span>
  );
}

export default LastUpdated;
