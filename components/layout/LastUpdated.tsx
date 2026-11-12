import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import { formatStamp, hoursBetween, localDateKey } from '../../lib/format';

import { DATA_CORRECTIONS_URL } from './site';

/**
 * The freshness stamp (DESIGN §33). Formatted server-side in America/Los_Angeles so it can never
 * hydration-mismatch and no client ever reformats a date. It is never in the header.
 *
 * Four forms:
 *  - `time`: the short one, "Updated 3:42 PM", shown ONCE per page beside the scores (the live
 *    board's head, else the league row through ScopeBar's `stamp`, else PageHeader's `end` slot).
 *    The time alone when the snapshot was taken on the current Pacific date (`now`, the build
 *    instant), with the weekday in front otherwise: "Updated Tue 9:12 PM". Plain text, never wraps.
 *  - `dateline`: the long one, "Updated Wed Nov 11, 1:03 PM PT" (/about, through Dateline.tsx).
 *  - `stamp`: the long one in the footer, linked to /about#updates.
 *  - `strip`: the alarm. Past 36 hours, while some league is still playing, SiteHeader renders a
 *    bordered notice under the band that says what the reader loses ("so newer scores may be
 *    missing") with the way to the explanation and to the corrections thread. Otherwise it renders
 *    nothing. Never hide a failure behind a timestamp nobody reads.
 *
 * `now` is the instant staleness is measured against. A static site cannot observe its own
 * staleness at view time, so the caller passes the BUILD instant: if the scheduled fetch fails but
 * the build still runs, `fetchedAt` is old against a fresh build and the strip appears.
 *
 * `seasonComplete`: once every league's season is over the scheduled update stops on purpose, so an
 * old stamp is not a failure and the strip never shows.
 */
export interface LastUpdatedProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  at: string;
  /** ISO UTC instant to measure staleness against. Omit to never show the stale strip. */
  now?: string;
  variant?: 'dateline' | 'stamp' | 'strip' | 'time';
  /** Every league's season is over: an old stamp is the final update, not a failing one. */
  seasonComplete?: boolean;
  className?: string;
}

const STALE_AFTER_HOURS = 36;

/**
 * '3:42 PM' when `at` is on `now`'s Pacific date (or `now` is unknown), else 'Tue 9:12 PM'. Cut from
 * formatStamp's 'Tue Sep 29, 4:00 PM PT', so the two forms can never disagree.
 */
export function shortStamp(at: string, now?: string): string {
  const long = formatStamp(at);
  const time = long.slice(long.indexOf(', ') + 2).replace(/ PT$/, '');
  if (!now || localDateKey(at) === localDateKey(now)) return time;
  return `${long.slice(0, long.indexOf(' '))} ${time}`;
}

export function LastUpdated({ at, now, variant = 'stamp', seasonComplete = false, className }: LastUpdatedProps) {
  const time = <time dateTime={at}>{formatStamp(at)}</time>;

  if (variant === 'strip') {
    const stale = now ? hoursBetween(at, now) > STALE_AFTER_HOURS : false;
    if (!stale || seasonComplete) return null;
    // An <aside> with a label, so the notice sits in a landmark of its own (axe `region`).
    return (
      <aside aria-label="Data freshness" className="sx-stale sx-print-hide">
        <p>
          Scores were last updated {time}, so newer scores may be missing.{' '}
          <Link href="/about#updates" prefetch={false}>
            How updates work
          </Link>{' '}
          <ExternalLink href={DATA_CORRECTIONS_URL}>Report an error</ExternalLink>
        </p>
      </aside>
    );
  }

  const cls = ['sx-stamp', className].filter(Boolean).join(' ');

  if (variant === 'time') {
    return (
      <span className={cls}>
        Updated <time dateTime={at}>{shortStamp(at, now)}</time>
      </span>
    );
  }

  if (variant === 'stamp') {
    return (
      <span className={cls}>
        <Link href="/about#updates" prefetch={false}>
          Updated {time}
        </Link>
      </span>
    );
  }

  return (
    <span className={cls}>
      Updated {time}
    </span>
  );
}

export default LastUpdated;
