/**
 * The Zod contract for data/club-events.json — the tournaments, league days and national events
 * Northern California club field hockey teams play in, as the organizers' own pages list them
 * (/club-calendar, DESIGN §34).
 *
 * The file is research, not a script's output, like data/clubs.json: it was written by hand on its
 * `capturedAt` date from pages read that day, and nothing refreshes it. Club events move (a turf
 * becomes unavailable, a tournament fills), so every event carries the pages it was read from and
 * the page prints the day it was read.
 *
 * Invariants:
 *   1. event ids are unique, and so are resource ids
 *   2. every URL is https and none is on a social-media host (lib/players/clubs-schema.ts `sourceUrl`)
 *   3. every event has at least one source
 *   4. a dated event's `end`, when set, is on or after its `start`; an `expected` event has no
 *      `start` and says in words when it usually runs (`expectedWhen`)
 *   5. `sessions` (a league's days) are real days, in order, inside `start`..`end` when both are set
 *   6. `hostClub` and every slug in `clubs` name a club in data/clubs.json — checked by
 *      lib/players/club-events.ts, which can see the clubs; this file cannot
 * 1, 4 and 5 are one file-level `superRefine`, whose every failure is a named issue with a path.
 *
 * Like the club records, an event names no individual (no tournament directors, no coaches).
 */

import { z } from 'zod';

import { calendarDateKey, slugId } from '../schema-primitives';
import { sourceUrl } from './clubs-schema';

/**
 * What kind of event it is; also the label each row prints (components/club-calendar/calendar-view.ts).
 *   tournament         a weekend or one-day tournament on grass or turf
 *   indoor-tournament  an indoor tournament
 *   play-day           a day of games between a few clubs' youth teams, not an open tournament
 *   league             a league that meets on set days (a fall or spring league)
 *   indoor-league      the same, indoors
 *   pickup             informal sessions anyone registered may join, self-umpired, no standings
 *   showcase           a recruiting showcase or camp-style event with games
 *   pathway            USA Field Hockey's player pathway (Nexus): players register one by one, not as club teams
 *   national-event     a USA Field Hockey national event (club championship, festival, national indoor)
 */
export const CLUB_EVENT_KINDS = [
  'tournament',
  'indoor-tournament',
  'play-day',
  'league',
  'indoor-league',
  'pickup',
  'showcase',
  'pathway',
  'national-event',
] as const;
export type ClubEventKind = (typeof CLUB_EVENT_KINDS)[number];

/** Who plays: club youth teams, adults, or both (an open event). */
export const CLUB_EVENT_LEVELS = ['youth', 'adult', 'open'] as const;
export type ClubEventLevel = (typeof CLUB_EVENT_LEVELS)[number];

/**
 * confirmed  the organizer's own page gives the dates
 * tentative  the organizer gives dates but calls them tentative, or "to be confirmed"
 * expected   an event that recurs, whose next dates are not posted: `start` is null and
 *            `expectedWhen` says when it usually runs; `lastHeld` says when it last did
 */
export const CLUB_EVENT_DATE_STATUSES = ['confirmed', 'tentative', 'expected'] as const;
export type ClubEventDateStatus = (typeof CLUB_EVENT_DATE_STATUSES)[number];

const text = z.string().min(1);

export const ClubEventSourceSchema = z.object({
  url: sourceUrl,
  /** What the page is and gave, for the page's source list ("Cal Cup tournament info"). */
  what: text,
  /** Verbatim from the page, kept so a maintainer can re-check it. Never rendered. */
  quote: text.max(300),
});

export const DateSpanSchema = z.object({
  start: calendarDateKey,
  end: calendarDateKey.nullable(),
});

export const ClubEventSchema = z.object({
  /** Ours, kebab-case: the `/club-calendar#<id>` anchor. Stable across editions ("khalsa-cup-2027"). */
  id: slugId,
  name: text,
  /** Who runs it, as the event's page names the organization (never a person). */
  organizer: text,
  /** The club in data/clubs.json that hosts it, when one does. */
  hostClub: slugId.nullable(),
  /** Clubs in data/clubs.json whose own pages say they enter it (the host is not repeated here). */
  clubs: z.array(slugId),
  kind: z.enum(CLUB_EVENT_KINDS),
  level: z.enum(CLUB_EVENT_LEVELS),
  /** The age groups or divisions as the page states them ("U12, U14, U16, U19"), when it does. */
  divisions: text.nullable(),
  dateStatus: z.enum(CLUB_EVENT_DATE_STATUSES),
  /** The first day; null only for an `expected` event. */
  start: calendarDateKey.nullable(),
  /** The last day of a multi-day event; null for a one-day event or an unknown end. */
  end: calendarDateKey.nullable(),
  /** A league's days, when its page lists them. */
  sessions: z.array(calendarDateKey),
  /** For an `expected` event: when it usually runs, in words ("Memorial Day weekend"). */
  expectedWhen: text.nullable(),
  /** The last edition's days, when the page gives them. */
  lastHeld: DateSpanSchema.nullable(),
  venue: text.nullable(),
  /** "Stanford, CA", "Lancaster, PA". */
  place: text.nullable(),
  /** In Northern California (false: a national event NorCal clubs travel to). */
  inNorCal: z.boolean(),
  /** One factual sentence a reader needs (the format, who may enter); no individual named. */
  summary: text.nullable(),
  /** The event's own page. */
  url: sourceUrl,
  /** Where the fixtures, brackets or results are posted, when that is another page. */
  fixturesUrl: sourceUrl.nullable(),
  /** Where teams register, when that is another page. */
  registrationUrl: sourceUrl.nullable(),
  sources: z.array(ClubEventSourceSchema).min(1, 'an event needs at least one source'),
  checkedOn: calendarDateKey,
});

/** A standing page where club fixtures or events are posted (a calendar, a tournament site). */
export const ClubFixtureResourceSchema = z.object({
  id: slugId,
  name: text,
  organizer: text,
  /** One sentence: what a reader finds there. */
  what: text,
  url: sourceUrl,
  /** A subscribable calendar feed, when the page offers one. */
  calendarFeedUrl: sourceUrl.nullable(),
  checkedOn: calendarDateKey,
});

const ClubEventsFileObject = z.object({
  builtBy: text,
  capturedAt: calendarDateKey,
  /** Method, rules and recall, in words. */
  notes: z.array(text),
  resources: z.array(ClubFixtureResourceSchema),
  events: z.array(ClubEventSchema).min(1),
});

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Invariants 1, 4 and 5: what one field cannot see. */
function checkClubEventsFile(f: z.infer<typeof ClubEventsFileObject>, ctx: Ctx): void {
  const ids = new Set<string>();
  f.events.forEach((e, i) => {
    if (ids.has(e.id)) issue(ctx, ['events', i, 'id'], `duplicate event id ${e.id}`);
    ids.add(e.id);
    if (e.dateStatus === 'expected') {
      if (e.start !== null) issue(ctx, ['events', i, 'start'], 'an expected event has no start: its dates are not posted');
      if (e.end !== null) issue(ctx, ['events', i, 'end'], 'an expected event has no end');
      if (e.expectedWhen === null) issue(ctx, ['events', i, 'expectedWhen'], 'an expected event says when it usually runs');
    } else {
      if (e.start === null) issue(ctx, ['events', i, 'start'], `a ${e.dateStatus} event has a start`);
      if (e.start !== null && e.end !== null && e.end < e.start) {
        issue(ctx, ['events', i, 'end'], `end ${e.end} is before start ${e.start}`);
      }
    }
    if (e.lastHeld && e.lastHeld.end !== null && e.lastHeld.end < e.lastHeld.start) {
      issue(ctx, ['events', i, 'lastHeld', 'end'], 'lastHeld ends before it starts');
    }
    e.sessions.forEach((d, j) => {
      if (j > 0 && d <= e.sessions[j - 1]) issue(ctx, ['events', i, 'sessions', j], 'sessions are in order, each once');
      if (e.start !== null && d < e.start) issue(ctx, ['events', i, 'sessions', j], `session ${d} is before start ${e.start}`);
      if (e.end !== null && d > e.end) issue(ctx, ['events', i, 'sessions', j], `session ${d} is after end ${e.end}`);
    });
    if (e.hostClub !== null && e.clubs.includes(e.hostClub)) {
      issue(ctx, ['events', i, 'clubs'], `${e.hostClub} is the host; it is not repeated in clubs`);
    }
    if (new Set(e.clubs).size !== e.clubs.length) issue(ctx, ['events', i, 'clubs'], 'a club is listed twice');
  });
  const resourceIds = new Set<string>();
  f.resources.forEach((r, i) => {
    if (resourceIds.has(r.id)) issue(ctx, ['resources', i, 'id'], `duplicate resource id ${r.id}`);
    resourceIds.add(r.id);
  });
}

export const ClubEventsFileSchema = ClubEventsFileObject.superRefine(checkClubEventsFile);

/** The day a dated event ends (its end, else its start); null for an expected event. */
export function lastDay(e: Pick<ClubEvent, 'start' | 'end'>): string | null {
  return e.end ?? e.start;
}

export type ClubEventSource = z.infer<typeof ClubEventSourceSchema>;
export type ClubEvent = z.infer<typeof ClubEventSchema>;
export type ClubFixtureResource = z.infer<typeof ClubFixtureResourceSchema>;
export type ClubEventsFile = z.infer<typeof ClubEventsFileSchema>;
