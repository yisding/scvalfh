import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import { formatStamp, hoursBetween } from '../../lib/format';

import { DATA_CORRECTIONS_URL } from './site';

/**
 * The freshness stamp (DESIGN §33). Formatted server-side in America/Los_Angeles so it can never
 * hydration-mismatch and no client ever reformats a date. It is always a sentence in ordinary
 * wrapping text, never a box in the header, so it cannot be cut off.
 *
 * Three forms:
 *  - `dateline`: "Updated Wed Nov 11, 1:03 PM PT." at the end of every page header's dateline
 *    (Dateline.tsx). Once every league's season is over: "Final. Last updated …".
 *  - `stamp`: the same sentence in the footer.
 *  - `strip`: the alarm. Past 36 hours, while some league is still playing, SiteHeader renders a
 *    yellow strip under the bar that says what the reader loses ("so newer scores may be missing")
 *    with the way to the explanation and to the corrections thread. Otherwise it renders nothing.
 *    Never hide a failure behind a timestamp nobody reads.
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
  variant?: 'dateline' | 'stamp' | 'strip';
  /** Every league's season is over: an old stamp is the final update, not a failing one. */
  seasonComplete?: boolean;
  className?: string;
}

const STALE_AFTER_HOURS = 36;

export function LastUpdated({ at, now, variant = 'stamp', seasonComplete = false, className }: LastUpdatedProps) {
  const time = <time dateTime={at}>{formatStamp(at)}</time>;

  if (variant === 'strip') {
    const stale = now ? hoursBetween(at, now) > STALE_AFTER_HOURS : false;
    if (!stale || seasonComplete) return null;
    // An <aside> with a label, so the strip sits in a landmark of its own (axe `region`).
    return (
      <aside aria-label="Data freshness" className="sx-stale sx-print-hide">
        <p>
          Last updated {time}, so newer scores may be missing.{' '}
          <Link href="/about#updates" prefetch={false}>
            Why
          </Link>{' '}
          <ExternalLink href={DATA_CORRECTIONS_URL}>Report an error</ExternalLink>
        </p>
      </aside>
    );
  }

  return (
    <span className={['sx-stamp', className].filter(Boolean).join(' ')}>
      {seasonComplete ? 'Final. Last updated ' : 'Updated '}
      {time}.
    </span>
  );
}

export default LastUpdated;
