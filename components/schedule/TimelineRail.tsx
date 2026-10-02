import Link from 'next/link';

import { longDate, monthDay, parseLocal } from '../../lib/format';
import { PLAYOFF_KEY_DATES } from '../../lib/season';

/**
 * The season rail (DESIGN §3.3, §7.16): `↑ Aug 24 · Sep · ● Today · Oct · Oct 28 ↓ · CCS Nov 7–14`,
 * as a row of 36px capsules inside a 44px hit row.
 *
 * Plain `<a href="#2026-09-24">` anchors into the date groups below — real, shareable, JS-free
 * URLs, and `/scores/[date]` exists for every one of them. No scroll-spy and no client component:
 * DESIGN §7 deletes the scroll-spy outright, and an anchor that works with JavaScript disabled is
 * the whole point of rendering the complete list server-side.
 *
 * "Today" is derived from `snapshot.fetchedAt` in Pacific, never from `Date.now()`, so the rail is
 * part of the reproducible build rather than something that drifts between build and view.
 */
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface TimelineRailProps {
  /** Every date with a contest, ascending. */
  dates: readonly string[];
  /** 'YYYY-MM-DD' derived from the snapshot stamp. */
  today: string;
  className?: string;
}

interface Marker {
  date: string;
  label: string;
  /** A leading glyph: `↑` for the season's first day, `↓` for its last, `●` for today. */
  glyph?: string;
  /** The whole accessible name, because `Sep` alone is not a date. */
  sr: string;
  current?: boolean;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function buildMarkers(dates: readonly string[], today: string): Marker[] {
  if (dates.length === 0) return [];
  const first = dates[0];
  const last = dates[dates.length - 1];
  const candidates: Marker[] = [];

  // Today first, so that when it coincides with another marker it is the one that survives.
  if (dates.includes(today)) {
    candidates.push({
      date: today,
      label: 'Today',
      glyph: '●',
      sr: `Today, ${longDate(today)}`,
      current: true,
    });
  }
  candidates.push({
    date: first,
    label: monthDay(first),
    glyph: '↑',
    sr: `Jump to the first contest of the season, ${longDate(first)}`,
  });
  const seenMonths = new Set<string>([monthKey(first)]);
  for (const date of dates) {
    const key = monthKey(date);
    if (seenMonths.has(key)) continue;
    seenMonths.add(key);
    const month = parseLocal(date).month;
    candidates.push({
      date,
      label: MONTH_NAMES[month - 1],
      sr: `Jump to ${MONTH_NAMES_LONG[month - 1]}, starting ${longDate(date)}`,
    });
  }
  if (last !== first) {
    candidates.push({
      date: last,
      label: monthDay(last),
      glyph: '↓',
      sr: `Jump to the last contest of the season, ${longDate(last)}`,
    });
  }

  const byDate = new Map<string, Marker>();
  for (const marker of candidates) {
    if (!byDate.has(marker.date)) byDate.set(marker.date, marker);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ccsLabel(): string {
  const qf = monthDay(PLAYOFF_KEY_DATES.quarterfinals);
  const finalDay = parseLocal(PLAYOFF_KEY_DATES.finals).day;
  return `CCS ${qf}–${finalDay}`;
}

export function TimelineRail({ dates, today, className }: TimelineRailProps) {
  const markers = buildMarkers(dates, today);
  if (markers.length === 0) return null;
  return (
    <nav aria-label="Jump to a date" className={className}>
      {/* `relative` on every chip, so the `sr-only` label inside it has a positioned ancestor
          INSIDE this scroller. Tailwind's `sr-only` is `position: absolute` with no offsets, and
          with nothing positioned between it and <html> its containing block was the page: the rail
          clipped its own chips correctly while the last chip's hidden label resolved at x=350 past
          the clip and pushed `documentElement.scrollWidth` to 350 against a 320px viewport, which
          is DESIGN §10.8 / R-8's "no horizontal page scroll … at 320px" (WCAG 1.4.10 Reflow). */}
      {/* `scroll-px-10`: Chrome only scrolls a focused chip into view when it is wholly outside
          the scrollport, and the last chip sat half under the 2rem fade, so Tab left it there,
          masked. A 2.5rem scroll padding makes the faded edge count as outside. */}
      <ol className="sx-fade-x m-0 flex list-none items-center gap-2 overflow-x-auto scroll-px-10 px-gutter py-1 md:px-1">
        {markers.map((marker) => (
          <li key={marker.date} className="flex h-11 shrink-0 items-center">
            <a
              href={`#${marker.date}`}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-cell font-medium no-underline shadow-[var(--sx-ring)] ${
                marker.current
                  ? 'bg-accent-wash text-accent-ink'
                  : 'bg-surface text-ink-2 hover:text-ink'
              }`}
            >
              {marker.glyph ? <span aria-hidden="true">{marker.glyph}</span> : null}
              <span aria-hidden="true">{marker.label}</span>
              <span className="sr-only">{marker.sr}</span>
            </a>
          </li>
        ))}
        <li className="flex h-11 shrink-0 items-center">
          <Link
            href="/playoffs"
            className="relative inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-cell font-medium text-ink-2 no-underline shadow-[var(--sx-ring)] hover:text-ink"
          >
            <span aria-hidden="true">{ccsLabel()}</span>
            <span aria-hidden="true">&rarr;</span>
            <span className="sr-only">CCS playoffs, November 7 to 14</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

export default TimelineRail;
