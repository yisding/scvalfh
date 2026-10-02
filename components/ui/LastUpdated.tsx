import Link from 'next/link';

import {
  dateWithYear,
  formatStamp,
  hoursBetween,
  monthDay,
  shortDate,
  timeOfDay,
  toLocalTimestamp,
} from '../../lib/format';

/**
 * The freshness stamp (DESIGN §1.3, §7.15). Formatted server-side in America/Los_Angeles so it
 * can never hydration-mismatch and no client ever reformats a date.
 *
 * Stale treatment: past 36 hours the stamp stops being quiet grey and becomes body ink on the
 * accent wash, reading "the nightly update may be failing", with a link to /about#updates. Never
 * hide a failure behind a timestamp nobody reads.
 *
 * `now` is the instant staleness is measured against. A static site cannot observe its own
 * staleness at view time, so the caller passes the BUILD instant: if the nightly fetch fails but
 * the build still runs, `fetchedAt` is old against a fresh build and the warning appears — which
 * is exactly the failure this state is for.
 *
 * `seasonComplete`: once every league's season is over the nightly update stops on purpose, so an
 * old stamp is not a failure. Then the stale state reads `Season complete — final update <date>.`
 * in the quiet grey instead of the alarm (SPEC §10.2; Attribution passes
 * `getSitePhase() === 'complete'`).
 */
export interface LastUpdatedProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  at: string;
  /** ISO UTC instant to measure staleness against. Omit to never show the stale state. */
  now?: string;
  /** 'compact' is the top-bar form: "Sun 5:04 AM". */
  variant?: 'stamp' | 'compact';
  /** Every league's season is over: an old stamp is the final update, not a failing one. */
  seasonComplete?: boolean;
  className?: string;
}

const STALE_AFTER_HOURS = 36;

export function LastUpdated({ at, now, variant = 'stamp', seasonComplete = false, className }: LastUpdatedProps) {
  const local = toLocalTimestamp(at);
  const ageHours = now ? hoursBetween(at, now) : 0;
  const stale = ageHours > STALE_AFTER_HOURS;

  if (variant === 'compact') {
    return (
      <time
        dateTime={at}
        className={`sx-num whitespace-nowrap text-cell text-ink-3${className ? ` ${className}` : ''}`}
      >
        <span className="sr-only">Snapshot </span>
        {/* The weekday is the first thing to go. This form lives inside the 48px phone top bar
            beside the wordmark and the theme toggle (DESIGN §1.3, R-5), and "Wed Sep 30" does not
            fit there next to the time. `hidden` removes a span from the accessibility tree too, so
            exactly one date is ever announced. */}
        <span className="sm:hidden">{monthDay(local)}</span>
        <span className="hidden sm:inline">{shortDate(local)}</span> {timeOfDay(local)}
        <span className="sr-only"> Pacific time</span>
      </time>
    );
  }

  if (stale && seasonComplete) {
    return (
      <span className={`text-meta text-ink-2${className ? ` ${className}` : ''}`}>
        Season complete &mdash; final update{' '}
        <time dateTime={at} className="sx-num">
          {dateWithYear(local)}
        </time>
        .
      </span>
    );
  }

  if (stale) {
    const days = Math.round(ageHours / 24);
    return (
      <span
        className={`inline-flex flex-wrap items-baseline gap-1 rounded-full px-2.5 py-1 text-meta text-ink${
          className ? ` ${className}` : ''
        }`}
        style={{ background: 'var(--sx-accent-wash)' }}
      >
        Last updated{' '}
        <time dateTime={at} className="sx-num">
          {days === 1 ? '1 day' : `${days} days`}
        </time>{' '}
        ago &mdash; the nightly update may be failing.{' '}
        <Link href="/about#updates" className="text-accent-ink underline">
          Why
        </Link>
      </span>
    );
  }

  return (
    <span className={`text-meta text-ink-2${className ? ` ${className}` : ''}`}>
      Snapshot{' '}
      <time dateTime={at} className="sx-num">
        {formatStamp(at)}
      </time>
    </span>
  );
}

export default LastUpdated;
