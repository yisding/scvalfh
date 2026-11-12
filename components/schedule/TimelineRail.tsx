import Link from 'next/link';

import { dateSpan, longDate, monthDay, parseLocal } from '../../lib/format';
import { CCS, ccsFirstDay, ccsLastDay } from '../../lib/league-config/sections';
import { getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

import type { RailKind } from './rail-targets';

/**
 * The month jump on `/schedule/<league>` (DESIGN §33): one row of plain links, `Today · Aug 24 · Sep ·
 * Oct · Oct 28` and then the league's own postseason (`/playoffs#<league>` for a CCS league, the MCAL
 * tournament at `/playoffs/<league>`, the Super Regional for the EAL; none for a league without one —
 * never a CCS link on an NCS or NS league's page). Not sticky: the date strip is the sticky bar.
 *
 * Plain `<a href="#2026-09-24">` anchors into the date groups below: real, shareable, JS-free URLs.
 * No scroll-spy and no client component.
 *
 * "Today" comes first and is derived from `snapshot.fetchedAt` in Pacific, never from `Date.now()`.
 * On a day with no game the link reads `Next` and jumps to the next game day; it is left out only once
 * the season has no game day left. Its `data-rail-date` stays today either way (the href carries the
 * target), which is what rail-targets.ts's `today` rule measures from under a filter. The other links
 * follow in date order.
 *
 * Under a filter: each date link carries `data-rail-date` and `data-rail-kind`, its label
 * `data-rail-label` and its screen-reader name `data-rail-sr`, so ScheduleFilters can re-aim it at
 * a group that is still shown (rail-targets.ts) and put the server's version back afterwards. The
 * attribute order `href, data-rail-date, data-rail-kind, class` is pinned by tests. The HTML as
 * served is the whole-season row, which is all a reader without JavaScript ever sees.
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
  /** The chip's `data-rail-date`: for the today chip, today itself, even with no game on it. */
  date: string;
  /** Where the chip jumps when it is not `date`: the today chip's next game day. */
  target?: string;
  /** What the chip means, so a filter can re-aim it (rail-targets.ts). */
  kind: RailKind;
  label: string;
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

  // Today first, so that when it coincides with another marker it is the one that survives. With
  // no game today the chip is `● Next` and aims at the next game day; it stays out of the dedupe
  // below, so it sits beside an `↑` or month chip on that day rather than swallowing it.
  const next = dates.find((date) => date >= today);
  if (next === today) {
    candidates.push({
      date: today,
      kind: 'today',
      label: 'Today',
      sr: `Today, ${longDate(today)}`,
      current: true,
    });
  } else if (next) {
    candidates.push({
      date: today,
      target: next,
      kind: 'today',
      label: 'Next',
      sr: `Next game day, ${longDate(next)}`,
    });
  }
  candidates.push({
    date: first,
    kind: 'up',
    label: monthDay(first),
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
      sr: `Jump to the last contest of the season, ${longDate(last)}`,
    });
  }

  const byDate = new Map<string, Marker>();
  const extra: Marker[] = [];
  for (const marker of candidates) {
    if (marker.target) extra.push(marker);
    else if (!byDate.has(marker.date)) byDate.set(marker.date, marker);
  }
  // Today (or Next) first: it is where a reader most often wants to go. The rest in order of the
  // day each jumps to.
  const rest = [...byDate.values()].filter((marker) => marker.kind !== 'today').sort((x, y) => x.date.localeCompare(y.date));
  const todays = [...byDate.values(), ...extra].filter((marker) => marker.kind === 'today');
  return [...todays, ...rest];
}

/** The day a chip jumps to. */
function hrefDate(marker: Marker): string {
  return marker.target ?? marker.date;
}

/** `Nov 7–14` / `Oct 26–30` (one month), `Oct 30–Nov 14` across months. */
function span(first: string, last: string): string {
  const a = parseLocal(first);
  const b = parseLocal(last);
  return a.month === b.month ? `${monthDay(first)}–${b.day}` : `${monthDay(first)}–${monthDay(last)}`;
}

/** `Oct 30 to 31` (one month), `Oct 30 to Nov 1` across months: a span read out in words. */
function spanWords(first: string, last: string): string {
  const a = parseLocal(first);
  const b = parseLocal(last);
  return a.month === b.month ? `${monthDay(first)} to ${b.day}` : `${monthDay(first)} to ${monthDay(last)}`;
}

/**
 * The rail's last chip: the league's postseason, from config. An unbracketed tournament (the EAL's
 * Super Regional) has no bracket page, so its chip goes to the league's card on /playoffs, as does a
 * San Diego league's ('Section playoffs Nov 2–14'). A league with no postseason (the Sunset: CIF-SS Blue
 * Book 2011.1, 3500.2) gets no chip at all: there is no event to jump to.
 */
function postseasonChip(leagueId: LeagueId): { label: string; href: string; sr: string } | null {
  const league = getLeague(leagueId);
  const ps = league.postseason;
  switch (ps.kind) {
    case 'league-tournament': {
      const rounds = ps.rounds.filter((r) => !r.optional).map((r) => r.date).sort();
      const first = rounds[0];
      const last = rounds[rounds.length - 1];
      return {
        label: `${ps.name} ${span(first, last)}`,
        href: `/playoffs/${league.id}`,
        sr: `${ps.name}, ${longDate(first)} to ${longDate(last)}`,
      };
    }
    case 'unbracketed-tournament':
      return {
        label: `${ps.name} ${dateSpan(ps.dates.first, ps.dates.last)}`,
        href: `/playoffs#${league.id}`,
        sr: `${ps.name}, ${spanWords(ps.dates.first, ps.dates.last)}`,
      };
    case 'ccs-ladder':
      return {
        label: `CCS ${span(ccsFirstDay(CCS.keyDates), ccsLastDay(CCS.keyDates))}`,
        href: `/playoffs#${league.id}`,
        sr: `CCS playoffs, ${longDate(ccsFirstDay(CCS.keyDates))} to ${longDate(ccsLastDay(CCS.keyDates))}`,
      };
    case 'section-playoffs':
      // 'Section playoffs Nov 2–14' (DESIGN-socal §2.4): short enough for the rail; the spoken form names it in full.
      return {
        label: `Section playoffs ${span(ps.dates.first, ps.dates.last)}`,
        href: `/playoffs#${league.id}`,
        sr: `${ps.name}, ${longDate(ps.dates.first)} to ${longDate(ps.dates.last)}`,
      };
    case 'no-postseason':
      return null;
  }
}

export function TimelineRail({ dates, today, leagueId, className }: TimelineRailProps) {
  const chip = postseasonChip(leagueId);
  const markers = buildMarkers(dates, today);
  if (markers.length === 0) return null;
  return (
    <nav aria-label="Jump to a date" className={['sx-print-hide', className].filter(Boolean).join(' ')}>
      <ul className="sx-linkrow">
        {markers.map((marker) => (
          // `relative`: the sr-only name inside the link needs a positioned ancestor of its own, or
          // it resolves against the page and can widen it at 320px.
          <li key={`${marker.kind}:${marker.date}`}>
            <a
              href={`#${hrefDate(marker)}`}
              data-rail-date={marker.date}
              data-rail-kind={marker.kind}
              className="sx-action relative"
              aria-current={marker.current ? 'date' : undefined}
            >
              <span aria-hidden="true" data-rail-label>
                {marker.label}
              </span>
              <span className="sr-only" data-rail-sr>
                {marker.sr}
              </span>
            </a>
          </li>
        ))}
        {chip ? (
          <li>
            <Link href={chip.href} prefetch={false} className="sx-action relative">
              <span aria-hidden="true">{chip.label}</span>
              <span className="sr-only">{chip.sr}</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

export default TimelineRail;
