import Link from 'next/link';

import { longDate, monthDay, parseLocal } from '../../lib/format';
import { CCS, getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import type { RailKind } from './rail-targets';

/**
 * The season rail (DESIGN §3.3, §7.16): `↑ Aug 24 · Sep · ● Today · Oct · Oct 28 ↓ · CCS Nov 7–14`,
 * as a row of 36px capsules inside a 44px hit row. The last chip is the league's own postseason:
 * the CCS dates (`/playoffs#<league>`) for a CCS league, the MCAL tournament
 * (`/playoffs/<league>`) for a league tournament — never a CCS chip on an NCS league's page.
 *
 * Plain `<a href="#2026-09-24">` anchors into the date groups below — real, shareable, JS-free
 * URLs, and `/scores/[date]` exists for every one of them. No scroll-spy and no client component:
 * DESIGN §7 deletes the scroll-spy outright, and an anchor that works with JavaScript disabled is
 * the whole point of rendering the complete list server-side.
 *
 * "Today" is derived from `snapshot.fetchedAt` in Pacific, never from `Date.now()`, so the rail is
 * part of the reproducible build rather than something that drifts between build and view.
 *
 * Under a filter: each date chip carries `data-rail-date` and `data-rail-kind`, its date label
 * `data-rail-label` and its screen-reader name `data-rail-sr`, so ScheduleFilters can re-aim it at
 * a group that is still shown (rail-targets.ts) and put the server's version back afterwards. The
 * HTML as served is the whole-season rail, which is all a reader without JavaScript ever sees.
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
  /** The page's league: its postseason chip ends the rail. */
  leagueId: LeagueId;
  className?: string;
}

interface Marker {
  date: string;
  /** What the chip means, so a filter can re-aim it (rail-targets.ts). */
  kind: RailKind;
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
      kind: 'today',
      label: 'Today',
      glyph: '●',
      sr: `Today, ${longDate(today)}`,
      current: true,
    });
  }
  candidates.push({
    date: first,
    kind: 'up',
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
      kind: 'month',
      label: MONTH_NAMES[month - 1],
      sr: `Jump to ${MONTH_NAMES_LONG[month - 1]}, starting ${longDate(date)}`,
    });
  }
  if (last !== first) {
    candidates.push({
      date: last,
      kind: 'down',
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

/** `Nov 7–14` / `Oct 26–30` (one month), `Oct 30–Nov 14` across months. */
function span(first: string, last: string): string {
  const a = parseLocal(first);
  const b = parseLocal(last);
  return a.month === b.month ? `${monthDay(first)}–${b.day}` : `${monthDay(first)}–${monthDay(last)}`;
}

/** The rail's last chip: the league's postseason, from config. */
export function postseasonChip(leagueId: LeagueId): { label: string; href: string; sr: string } {
  const league = getLeague(leagueId);
  if (league.postseason.kind === 'league-tournament') {
    const rounds = league.postseason.rounds.filter((r) => !r.optional).map((r) => r.date).sort();
    const first = rounds[0];
    const last = rounds[rounds.length - 1];
    return {
      label: `${league.postseason.name} ${span(first, last)}`,
      href: `/playoffs/${league.id}`,
      sr: `${league.postseason.name}, ${longDate(first)} to ${longDate(last)}`,
    };
  }
  return {
    label: `CCS ${span(CCS.keyDates.quarterfinals, CCS.keyDates.finals)}`,
    href: `/playoffs#${league.id}`,
    sr: `CCS playoffs, ${longDate(CCS.keyDates.quarterfinals)} to ${longDate(CCS.keyDates.finals)}`,
  };
}

export function TimelineRail({ dates, today, leagueId, className }: TimelineRailProps) {
  const chip = postseasonChip(leagueId);
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
      {/* Keyboard focus is handled in CSS, not with scroll padding: while a chip has
          `:focus-visible`, `.sx-fade-x` drops its fade and lets the rail wrap (globals.css, F-103),
          so a tabbed-to chip is never left half under the faded edge — which a 2.5rem
          `scroll-padding` only half fixed, since Chrome scrolls a focused chip into view only
          when it is wholly outside the scrollport. */}
      <ol className="sx-fade-x m-0 flex list-none items-center gap-2 overflow-x-auto px-gutter py-1 md:px-1">
        {markers.map((marker) => (
          <li key={marker.date} className="flex h-11 shrink-0 items-center">
            <a
              href={`#${marker.date}`}
              data-rail-date={marker.date}
              data-rail-kind={marker.kind}
              // `forced-colors:border`: the ring is a box-shadow, which forced colours drop. The
              // press state (`active:`) is for touch, where there is no hover to show the tap
              // landed; the current chip keeps its wash.
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-cell font-medium no-underline shadow-[var(--sx-ring)] forced-colors:border forced-colors:border-[CanvasText] ${
                marker.current
                  ? 'bg-accent-wash text-accent-ink'
                  : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-2'
              }`}
            >
              {marker.glyph ? <span aria-hidden="true">{marker.glyph}</span> : null}
              <span aria-hidden="true" data-rail-label>
                {marker.label}
              </span>
              <span className="sr-only" data-rail-sr>
                {marker.sr}
              </span>
            </a>
          </li>
        ))}
        <li className="flex h-11 shrink-0 items-center">
          <Link
            href={chip.href}
            prefetch={false}
            className="relative inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-cell font-medium text-ink-2 no-underline shadow-[var(--sx-ring)] hover:bg-surface-2 hover:text-ink active:bg-surface-2 forced-colors:border forced-colors:border-[CanvasText]"
          >
            <span aria-hidden="true">{chip.label}</span>
            <span aria-hidden="true">&rarr;</span>
            <span className="sr-only">{chip.sr}</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

export default TimelineRail;
