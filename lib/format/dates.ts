/**
 * Dates and times as the site prints them, every one America/Los_Angeles and labelled PT
 * (DESIGN §10.11). Pure string work on naive local timestamps through lib/shared/dates.ts, which
 * says why no Date is ever built from `Game.dateLocal`.
 */

import type { Game } from '@/lib/model/game';
import {
  MONTHS,
  MONTHS_LONG,
  WEEKDAYS,
  WEEKDAYS_LONG,
  isoDateKey,
  pad2,
  parseLocal,
  toLocalTimestamp,
  weekdayIndex,
} from '@/lib/shared/dates';
import { type PartialDateKind, partialDateKind as kindOf } from '@/lib/shared/partial-date';

import { EN_DASH } from './words';

/** 'Tue Sep 29' */
export function shortDate(value: string): string {
  const p = parseLocal(value);
  return `${WEEKDAYS[weekdayIndex(value)]} ${MONTHS[p.month - 1]} ${p.day}`;
}

/** 'Sep 29' */
export function monthDay(value: string): string {
  const p = parseLocal(value);
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** 'Tuesday, September 29' */
export function longDate(value: string): string {
  const p = parseLocal(value);
  return `${WEEKDAYS_LONG[weekdayIndex(value)]}, ${MONTHS_LONG[p.month - 1]} ${p.day}`;
}

/** 'Sep 29, 2026' */
export function dateWithYear(value: string): string {
  const p = parseLocal(value);
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

/**
 * Which of the five shapes a partial date takes (lib/shared/partial-date.ts, the grammar
 * lib/schema/clubs.ts `isAsOf` and lib/schema/commits.ts `isCommitDate` validate with): a day, a
 * month, a year, a season ("2025-26") or a range of years ("2015-2018"). Throws on anything else
 * ("2025-27", "2025/26"); a value that came through a contract never does.
 */
export function partialDateKind(value: string): PartialDateKind {
  const kind = kindOf(value);
  if (kind === null) throw new Error(`format: not a partial date: ${value}`);
  return kind;
}

/**
 * A partial date in words, pure string work like `dateWithYear`: 'Jul 8, 2026', 'Oct 2025',
 * '2025', '2025-26 season', '2015–2018' (an en dash between the years). Throws on any other shape.
 */
export function partialDate(value: string): string {
  switch (partialDateKind(value)) {
    case 'day':
      return dateWithYear(value);
    case 'month':
      return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
    case 'year':
      return value;
    case 'season':
      return `${value} season`;
    case 'range':
      return value.replace('-', EN_DASH);
  }
}

/** '4:00 PM' */
export function timeOfDay(value: string): string {
  const { hour, minute } = parseLocal(value);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)} ${suffix}`;
}

/**
 * '5:30' — the clock face alone, for the narrow leading column of a dense row (DESIGN §3.3's
 * wireframe writes `5:30`, not `5:30 PM`). Every such row also carries the full `4:00 PM PT` in
 * its screen-reader sentence, and a scheduled game repeats it in the status label beside the
 * score, so the meridiem is never the only place the reader can find it.
 */
export function clockTime(value: string): string {
  const { hour, minute } = parseLocal(value);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)}`;
}

/** '4:00 PM PT' — every time on the site is labelled PT (DESIGN §10.11). */
export function timeOfDayPT(value: string): string {
  return `${timeOfDay(value)} PT`;
}

/**
 * A league config clock time ('HH:MM', a play-in or a tournament game): '11:00' → '11 AM',
 * '16:30' → '4:30 PM'. Unlike `timeOfDay`, whole hours drop their ':00'.
 */
export function leagueClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${pad2(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '11 AM PT' — `leagueClock` labelled PT, as /playoffs prints it. */
export function leagueClockPT(hhmm: string): string {
  return `${leagueClock(hhmm)} PT`;
}

/** The value for a `<time datetime>` attribute. */
export function dateTimeAttr(game: Pick<Game, 'dateLocal' | 'dateUtc' | 'isTimeTba'>): string {
  return game.isTimeTba ? isoDateKey(game.dateLocal) : game.dateUtc;
}

/** 'Tue Sep 29, 4:00 PM PT', or just the date when the time is TBA. */
export function gameWhen(game: Pick<Game, 'dateLocal' | 'isTimeTba' | 'isDateTba'>): string {
  if (game.isDateTba) return 'Date TBA';
  if (game.isTimeTba) return `${shortDate(game.dateLocal)}, time TBA`;
  return `${shortDate(game.dateLocal)}, ${timeOfDayPT(game.dateLocal)}`;
}

/** 'Tue Sep 29, 4:00 PM PT' for a snapshot stamp. */
export function formatStamp(instantIso: string): string {
  const local = toLocalTimestamp(instantIso);
  return `${shortDate(local)}, ${timeOfDayPT(local)}`;
}

/**
 * An inclusive span of two date keys with an en dash: 'Oct 30–31' within a month,
 * 'Oct 30–Nov 1' across one, 'Oct 30' when both are the same day.
 */
export function dateSpan(first: string, last: string): string {
  const a = parseLocal(first);
  const b = parseLocal(last);
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day ? monthDay(first) : `${monthDay(first)}${EN_DASH}${b.day}`;
  }
  return `${monthDay(first)}${EN_DASH}${monthDay(last)}`;
}
