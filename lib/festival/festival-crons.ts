/**
 * The National Hockey Festival refresh's schedule (.github/workflows/update-data-festival.yml), derived from the game
 * slots of data/field-hockey/festival.json: the cron lines that workflow must carry. tests/workflows.test.ts holds the
 * workflow's crons to `festivalCrons(festivalSlots(getFestival()))`, and `pnpm festival-crons` prints them to paste
 * when TourneyMachine moves a slot.
 *
 * The rule (owner decision, 2026-11-26; spec §5): every game lasts 55 minutes (FESTIVAL_GAME_MINUTES), so a slot
 * starting on the hour ends at :55. Three runs follow each slot's end, FESTIVAL_REFRESH_OFFSETS minutes after it:
 * :07, :27 and :47 past the next hour, an even 20-minute cadence up to the next slot's end, never on GitHub's busy
 * :00. Scores are entered at the fields 10 to 30 minutes late, unevenly, and GitHub starts a scheduled run 5 to 15
 * minutes late; every run reads the whole feed, so a late score from an earlier slot is caught by the next run. One
 * catch-up per festival day follows its last slot, FESTIVAL_CATCH_UP_MINUTES after it ends, for the scores entered
 * after the fields close.
 *
 * Cron fields are UTC and the slots are Eastern, so a run is grouped by its UTC day: Friday's 6 PM ET slot ends at
 * 23:55 UTC and its runs fall on the next UTC day (hour 0), as do the evening catch-ups. Day-of-week stays '*' (with
 * both day fields restricted, cron matches either). The month and day carry no year: the workflow's window job
 * stops a fire outside the festival's dates.
 *
 * Pure: slots in, strings out, no data import.
 */

import type { FestivalSlot } from './festival';

/** Minutes after a slot's games end at which the refresh runs. The cadence is this one line. */
export const FESTIVAL_REFRESH_OFFSETS: readonly number[] = [12, 32, 52];

/** The day's catch-up run, this many minutes after its last slot ends (2 h 15 min). */
export const FESTIVAL_CATCH_UP_MINUTES = 135;

export type FestivalRunKind = 'slot' | 'catch-up';

export interface FestivalRun {
  /** UTC, to the minute: '2026-11-26T14:07:00Z'. */
  at: string;
  kind: FestivalRunKind;
}

type SlotTimes = Pick<FestivalSlot, 'start' | 'endUtc'>;

const MINUTE = 60_000;

/** `ms` floored to its minute, as an ISO string without milliseconds (cron cannot say seconds). */
function minuteIso(ms: number): string {
  return new Date(Math.floor(ms / MINUTE) * MINUTE).toISOString().replace('.000Z', 'Z');
}

/**
 * Every scheduled run, in time order: FESTIVAL_REFRESH_OFFSETS after each slot's end, and one catch-up per festival
 * day (the slot's venue date, `start`'s first ten characters) after that day's last slot. A catch-up that lands on a
 * slot run is that run.
 */
export function festivalRuns(slots: readonly SlotTimes[]): FestivalRun[] {
  const runs = new Map<string, FestivalRunKind>();
  const lastEnd = new Map<string, number>();
  for (const slot of slots) {
    const end = Date.parse(slot.endUtc);
    for (const offset of FESTIVAL_REFRESH_OFFSETS) runs.set(minuteIso(end + offset * MINUTE), 'slot');
    const day = slot.start.slice(0, 10);
    lastEnd.set(day, Math.max(lastEnd.get(day) ?? -Infinity, end));
  }
  for (const end of lastEnd.values()) {
    const at = minuteIso(end + FESTIVAL_CATCH_UP_MINUTES * MINUTE);
    if (!runs.has(at)) runs.set(at, 'catch-up');
  }
  return [...runs]
    .map(([at, kind]) => ({ at, kind }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** A cron list: ascending numbers, a run of three or more consecutive ones as a range ('0,14-20'). */
export function cronList(values: Iterable<number>): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${sorted[i]}-${sorted[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(',');
}

/**
 * The cron lines for `slots` (UTC, 'minutes hours day month *'): the slot runs first, then the catch-ups, each by UTC
 * day; within a day, the hours that share the same minutes share a line. For today's file:
 *   '7,27,47 14-22 26 11 *', '7,27,47 14-23 27 11 *', '7,27,47 0,14-20 28 11 *', '10 0 27 11 *', '10 2,22 28 11 *'.
 */
export function festivalCrons(slots: readonly SlotTimes[]): string[] {
  const lines: string[] = [];
  for (const kind of ['slot', 'catch-up'] as const) {
    // UTC day ('MM-DD', which sorts as the days do within a year) → hour → minutes.
    const days = new Map<string, Map<number, Set<number>>>();
    for (const run of festivalRuns(slots)) {
      if (run.kind !== kind) continue;
      const d = new Date(run.at);
      const day = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const hours = days.get(day) ?? new Map<number, Set<number>>();
      days.set(day, hours);
      const minutes = hours.get(d.getUTCHours()) ?? new Set<number>();
      hours.set(d.getUTCHours(), minutes);
      minutes.add(d.getUTCMinutes());
    }
    for (const [day, hours] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
      const [month, date] = day.split('-').map(Number);
      // Minutes list → its hours, in the order the first hour of each appears.
      const byMinutes = new Map<string, number[]>();
      for (const [hour, minutes] of [...hours].sort(([a], [b]) => a - b)) {
        const key = cronList(minutes);
        byMinutes.set(key, [...(byMinutes.get(key) ?? []), hour]);
      }
      for (const [minutes, hourList] of byMinutes) lines.push(`${minutes} ${cronList(hourList)} ${date} ${month} *`);
    }
  }
  return lines;
}
