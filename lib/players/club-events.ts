/**
 * The read API for data/club-events.json — the Northern California club tournaments, leagues and
 * national events of /club-calendar (DESIGN §34).
 *
 * The file is research written by hand (lib/players/club-events-schema.ts); it is imported so the
 * build bundles it (a Worker has no project filesystem) and validated once at module scope, the
 * schema first and then the one join it cannot see: every `hostClub` and `clubs` slug must be a club
 * in data/clubs.json. A bad file fails at import, and so `pnpm test` and the build fail.
 *
 * Field hockey's alone. Another sport's build serves no events: the route is a 404 there
 * (lib/sports/current.ts HAS_RECRUITING) and the club pages are too.
 */

import bundled from '../../data/club-events.json';
import { validateData } from '../data-file';
import { IS_FIELD_HOCKEY } from '../sports/current';
import { getClub } from './clubs';
import { ClubEventsFileSchema, lastDay, type ClubEvent, type ClubEventsFile } from './club-events-schema';

export type {
  ClubEvent,
  ClubEventDateStatus,
  ClubEventKind,
  ClubEventLevel,
  ClubEventSource,
  ClubEventsFile,
  ClubFixtureResource,
} from './club-events-schema';

/**
 * Parse `raw` against the contract, then check that every club an event names is in data/clubs.json.
 * Throws on the first failure. Runs once at module scope on the bundled file; tests call it on files
 * built in memory.
 */
export function loadClubEvents(raw: unknown, hasClub: (slug: string) => boolean = (s) => getClub(s) !== undefined): ClubEventsFile {
  const file = validateData('club-events', ClubEventsFileSchema, raw);
  for (const e of file.events) {
    for (const slug of [...(e.hostClub ? [e.hostClub] : []), ...e.clubs]) {
      if (!hasClub(slug)) throw new Error(`club-events: ${e.id} names ${slug}, which is not a club in data/clubs.json`);
    }
  }
  return file;
}

const EMPTY: ClubEventsFile = { builtBy: '', capturedAt: '1970-01-01', notes: [], resources: [], events: [] };

const file: ClubEventsFile = IS_FIELD_HOCKEY ? loadClubEvents(bundled) : EMPTY;

/**
 * Calendar order: dated events by first day, then last day, then name; the expected events (no
 * dates posted) after them, by name.
 */
function byCalendar(a: ClubEvent, b: ClubEvent): number {
  if (a.start === null || b.start === null) {
    if (a.start !== b.start) return a.start === null ? 1 : -1;
    return a.name.localeCompare(b.name);
  }
  return (
    a.start.localeCompare(b.start) || (lastDay(a) ?? '').localeCompare(lastDay(b) ?? '') || a.name.localeCompare(b.name)
  );
}

const ORDERED: readonly ClubEvent[] = [...file.events].sort(byCalendar);

/** The whole file: capturedAt, notes and the resources as well as the events. */
export function getClubEventsFile(): ClubEventsFile {
  return file;
}

/** Every event, in calendar order. */
export function getClubEvents(): readonly ClubEvent[] {
  return ORDERED;
}

/** The events a club hosts or whose pages say it enters, in calendar order. */
export function getClubEventsFor(slug: string): readonly ClubEvent[] {
  return ORDERED.filter((e) => e.hostClub === slug || e.clubs.includes(slug));
}

/** The last day the file was checked: its capturedAt or a later event's checkedOn (the sitemap's date). */
export function getClubEventsLastChecked(): string {
  return [file.capturedAt, ...file.events.map((e) => e.checkedOn), ...file.resources.map((r) => r.checkedOn)]
    .sort()
    .at(-1)!;
}
