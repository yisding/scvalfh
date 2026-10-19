/**
 * Date arithmetic. Every date the site shows is America/Los_Angeles (DESIGN §10.11).
 *
 * `Game.dateLocal` is ALREADY naive America/Los_Angeles school time, so the helpers below (and the
 * formatters of lib/format/dates.ts built on them) do pure string/integer arithmetic on it and never
 * construct a Date from it. That matters: `new Date('2026-09-29T16:00:00')` is parsed in the RUNNING
 * MACHINE's zone, which would make the build machine's TZ leak into the HTML. Intl.DateTimeFormat with
 * `timeZone: 'America/Los_Angeles'` is used for the one thing that genuinely is an instant —
 * converting `snapshot.fetchedAt` (ISO UTC) into a local date — via `zonedParts`.
 *
 * Client-safe: its one runtime import is the season's TIME_ZONE (lib/config/season.ts).
 */

import { TIME_ZONE } from '@/lib/config/season';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Split a naive local timestamp or a plain date key. Throws on anything else. */
export function parseLocal(value: string): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!m) throw new Error(`format: not a local timestamp: ${value}`);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? '0'),
    minute: Number(m[5] ?? '0'),
    second: Number(m[6] ?? '0'),
  };
}

/** 0 = Sunday. Computed through Date.UTC so no local zone can shift it. */
export function weekdayIndex(value: string): number {
  const { year, month, day } = parseLocal(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Whole days since 1970-01-01 for a date key (a time suffix is ignored): integer arithmetic through
 * Date.UTC, so no local zone can shift it.
 */
export function dayNumber(dateKey: string): number {
  const { year, month, day } = parseLocal(dateKey);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whole days from `a` to `b` (YYYY-MM-DD): negative when `b` is earlier. */
export function dayDiff(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** The date key `days` days after `dateKey` (before it when negative). */
export function shiftDateKey(dateKey: string, days: number): string {
  return new Date((dayNumber(dateKey) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' — the URL key for /scores/[date] (SPEC §4, DESIGN §1.1). */
export function isoDateKey(value: string): string {
  const { year, month, day } = parseLocal(value);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** A number as two digits: '07', '12'. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ---------------------------------------------------------------- instants

/** An ISO UTC instant, expressed in America/Los_Angeles. This is the only Intl use here. */
export function zonedParts(instantIso: string): DateParts {
  const at = new Date(instantIso);
  if (Number.isNaN(at.getTime())) throw new Error(`format: not an instant: ${instantIso}`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const found: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** An ISO UTC instant → the naive America/Los_Angeles timestamp for it. */
export function toLocalTimestamp(instantIso: string): string {
  const p = zonedParts(instantIso);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** An ISO UTC instant → 'YYYY-MM-DD' in America/Los_Angeles. This is how "today" is derived. */
export function localDateKey(instantIso: string): string {
  const p = zonedParts(instantIso);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Whole hours between two instants — drives the >36 h stale-snapshot state (DESIGN §7.15). */
export function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 3_600_000;
}

/**
 * The latest of a list of date keys ('YYYY-MM-DD', or ISO instants in one zone), null when the list
 * is empty. A key sorts as it reads, so the lexicographic maximum is the latest day.
 */
export function latestDateKey(keys: readonly string[]): string | null {
  return keys.length === 0 ? null : keys.reduce((a, b) => (b > a ? b : a));
}

/** The earliest of a list of date keys (see latestDateKey), null when the list is empty. */
export function earliestDateKey(keys: readonly string[]): string | null {
  return keys.length === 0 ? null : keys.reduce((a, b) => (b < a ? b : a));
}
