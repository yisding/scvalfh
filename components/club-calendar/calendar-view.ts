/**
 * /club-calendar and a club page's "Tournaments and leagues" (DESIGN §34), derived from
 * lib/players/club-events.ts. Pure, so tests/ui/club-calendar-view.test.ts can assert it over the
 * real file; every word the calendar prints about an event is chosen here.
 *
 * What the page promises, and this module enforces:
 *   - the split between "coming up" and "earlier" is the day the file was checked (`capturedAt`),
 *     never the build's clock: the site is rebuilt only in the high school season, so a build-time
 *     split would go stale through the club season. The page says which day it is;
 *   - an event whose next dates are not posted is never given dates: it reads "Not announced yet",
 *     with when it usually runs and when it was last held;
 *   - a quote is never in a view type (it is for maintainers);
 *   - every link label comes from what the link is ("Event page", "Fixtures and results",
 *     "Register"), never from its URL path.
 */

import { EN_DASH, dateWithYear, listWords, shortDate } from '../../lib/format';
import { clubDisplayName, getClub } from '../../lib/players/clubs';
import { getClubEvents, getClubEventsFile, getClubEventsFor, type ClubEvent, type ClubEventKind } from '../../lib/players/club-events';
import { lastDay } from '../../lib/players/club-events-schema';

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The label each row prints for its kind. */
export const KIND_LABELS: Record<ClubEventKind, string> = {
  tournament: 'Tournament',
  'indoor-tournament': 'Indoor tournament',
  league: 'League',
  'indoor-league': 'Indoor league',
  showcase: 'Showcase',
  'national-event': 'National event',
};

const LEVEL_WORDS = { youth: 'Youth', adult: 'Adults', open: 'Youth and adults' } as const;

export interface CalendarLink {
  label: string;
  href: string;
}

export interface CalendarClubLink {
  name: string;
  href: string;
}

export interface CalendarEventRow {
  /** The anchor: `/club-calendar#<id>`. */
  id: string;
  name: string;
  kind: string;
  /** "Sat Dec 5 – Sun Dec 6, 2026", or "Not announced yet" for an expected event. */
  when: string;
  /** A machine-readable first day for `<time>`, when there is one. */
  dateTime: string | null;
  /** "Dates tentative", "Usually Memorial Day weekend · last held May 23–25, 2026". */
  dateNote: string | null;
  /** "League days: Apr 12, Apr 19, Apr 26 and May 10, 2026". */
  sessions: string | null;
  /** "Stanford Varsity Field Hockey Turf, Stanford, CA". */
  where: string | null;
  /** "Youth · U12, U14, U16, U19". */
  who: string;
  organizer: string;
  host: CalendarClubLink | null;
  clubs: CalendarClubLink[];
  summary: string | null;
  links: CalendarLink[];
  /** The other pages the row was read from, each URL once, labelled by what it is. */
  sources: CalendarLink[];
  inNorCal: boolean;
}

export interface CalendarMonth {
  /** `2026-12` → the anchor `month-2026-12`. */
  id: string;
  heading: string;
  events: CalendarEventRow[];
}

export interface CalendarResourceRow {
  id: string;
  name: string;
  organizer: string;
  what: string;
  href: string;
  feed: string | null;
}

export interface ClubCalendarView {
  /** "Nov 13, 2026": the day the list was read. */
  checkedOn: string;
  /** Coming up or under way on that day, by the month each starts in. */
  months: CalendarMonth[];
  /** Recurring events whose next dates were not posted that day. */
  undated: CalendarEventRow[];
  /** Over before that day, latest first: their results pages. */
  earlier: CalendarEventRow[];
  resources: CalendarResourceRow[];
  upcomingCount: number;
}

/** "Sat Dec 5, 2026", "Sat Dec 5 – Sun Dec 6, 2026", "Sun Dec 28, 2026 – Sat Jan 3, 2027". */
export function spanWords(start: string, end: string | null): string {
  if (end === null || end === start) return `${shortDate(start)}, ${start.slice(0, 4)}`;
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${shortDate(start)}, ${start.slice(0, 4)} ${EN_DASH} ${shortDate(end)}, ${end.slice(0, 4)}`;
  return `${shortDate(start)} ${EN_DASH} ${shortDate(end)}, ${end.slice(0, 4)}`;
}

/** "May 23–25, 2026", "Apr 12 – May 10, 2026": the short span a note uses. */
export function shortSpan(start: string, end: string | null): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  if (end === null || end === start) return dateWithYear(start);
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy !== ey) return `${dateWithYear(start)} ${EN_DASH} ${dateWithYear(end)}`;
  if (sm === em) return `${MONTHS[sm - 1]} ${sd}${EN_DASH}${ed}, ${sy}`;
  return `${MONTHS[sm - 1]} ${sd} ${EN_DASH} ${MONTHS[em - 1]} ${ed}, ${sy}`;
}

function clubLink(slug: string): CalendarClubLink {
  const club = getClub(slug);
  if (!club) throw new Error(`calendar-view: no club ${slug}`);
  return { name: clubDisplayName(club), href: `/clubs/${slug}` };
}

function sessionWords(e: ClubEvent): string | null {
  if (e.sessions.length === 0) return null;
  const years = new Set(e.sessions.map((d) => d.slice(0, 4)));
  const days = e.sessions.map((d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`);
  const tail = years.size === 1 ? `, ${[...years][0]}` : '';
  return `${e.kind === 'league' || e.kind === 'indoor-league' ? 'League days' : 'Days'}: ${listWords(days)}${tail}`;
}

export function eventRow(e: ClubEvent): CalendarEventRow {
  const links: CalendarLink[] = [{ label: 'Event page', href: e.url }];
  if (e.fixturesUrl && e.fixturesUrl !== e.url) links.push({ label: 'Fixtures and results', href: e.fixturesUrl });
  if (e.registrationUrl && e.registrationUrl !== e.url && e.registrationUrl !== e.fixturesUrl) {
    links.push({ label: 'Register', href: e.registrationUrl });
  }
  const linked = new Set(links.map((l) => l.href));
  const sources: CalendarLink[] = [];
  for (const s of e.sources) {
    if (linked.has(s.url)) continue;
    linked.add(s.url);
    sources.push({ label: s.what, href: s.url });
  }

  let when: string;
  let dateNote: string | null = null;
  if (e.start === null) {
    when = 'Dates not announced yet';
    const parts = [e.expectedWhen ? `Usually ${e.expectedWhen}` : null, e.lastHeld ? `last held ${shortSpan(e.lastHeld.start, e.lastHeld.end)}` : null];
    dateNote = parts.filter(Boolean).join(' · ') || null;
  } else {
    when = spanWords(e.start, e.end);
    if (e.dateStatus === 'tentative') dateNote = 'Dates tentative';
  }

  return {
    id: e.id,
    name: e.name,
    kind: KIND_LABELS[e.kind],
    when,
    dateTime: e.start,
    dateNote,
    sessions: sessionWords(e),
    where: [e.venue, e.place].filter(Boolean).join(', ') || null,
    who: [LEVEL_WORDS[e.level], e.divisions].filter(Boolean).join(' · '),
    organizer: e.organizer,
    host: e.hostClub ? clubLink(e.hostClub) : null,
    clubs: e.clubs.map(clubLink),
    summary: e.summary,
    links,
    sources,
    inNorCal: e.inNorCal,
  };
}

export function buildClubCalendarView(): ClubCalendarView {
  const file = getClubEventsFile();
  const today = file.capturedAt;
  const months = new Map<string, CalendarMonth>();
  const undated: CalendarEventRow[] = [];
  const earlier: ClubEvent[] = [];
  let upcomingCount = 0;
  for (const e of getClubEvents()) {
    const last = lastDay(e);
    if (e.start === null || last === null) {
      undated.push(eventRow(e));
      continue;
    }
    if (last < today) {
      earlier.push(e);
      continue;
    }
    const key = e.start.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = { id: key, heading: `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, events: [] };
      months.set(key, month);
    }
    month.events.push(eventRow(e));
    upcomingCount += 1;
  }
  earlier.sort((a, b) => (lastDay(b) ?? '').localeCompare(lastDay(a) ?? '') || a.name.localeCompare(b.name));
  return {
    checkedOn: dateWithYear(today),
    months: [...months.values()],
    undated,
    earlier: earlier.map(eventRow),
    resources: file.resources.map((r) => ({
      id: r.id,
      name: r.name,
      organizer: r.organizer,
      what: r.what,
      href: r.url,
      feed: r.calendarFeedUrl,
    })),
    upcomingCount,
  };
}

/** A club page's events: the ones it hosts and the ones its pages say it enters, in calendar order. */
export interface ClubEventLine {
  id: string;
  name: string;
  href: string;
  /** "Hosts" or "Enters". */
  role: string;
  when: string;
}

export function clubEventLines(slug: string): ClubEventLine[] {
  return getClubEventsFor(slug).map((e) => ({
    id: e.id,
    name: e.name,
    href: `/club-calendar#${e.id}`,
    role: e.hostClub === slug ? 'Hosts' : 'Enters',
    when: e.start === null ? 'Dates not announced yet' : shortSpan(e.start, e.end),
  }));
}
