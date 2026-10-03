/**
 * Where each timeline-rail chip points while the schedule is filtered (F-21).
 *
 * The rail (TimelineRail.tsx) is server-rendered for the WHOLE season: `↑ Aug 24` is the first
 * contest, `Sep` the first day of September, `● Today` the snapshot's day, `↓ Oct 28` the last
 * contest. Once a filter hides date groups those anchors can point at a hidden section, and a jump
 * to a `hidden` element goes nowhere. ScheduleFilters therefore re-aims each chip at a group that
 * is still shown, using the pure mapping below, and restores the server's hrefs and text once
 * every group is shown again. Without JavaScript none of this runs and the rail is unchanged.
 *
 * Pure and dependency-free on purpose: it is bundled into `/schedule`'s one client module, so it
 * formats its own two date strings rather than pulling `lib/format` (and `lib/season`) into the
 * client, and it never reads a clock. tests/ui/rail-targets.test.ts holds the formatting to
 * `lib/format`'s output for every date in the snapshot.
 */

export type RailKind = 'up' | 'month' | 'today' | 'down';

export interface RailMarker {
  /** The server-rendered target, 'YYYY-MM-DD'. For `today` it is the snapshot's day. */
  date: string;
  kind: RailKind;
}

/**
 * The date each marker should jump to, given the dates whose groups are still shown, or `null`
 * when nothing shown answers it (the chip is then hidden):
 *
 *   up    → the first shown date;
 *   down  → the last shown date;
 *   month → the first shown date in the marker's own month;
 *   today → the first shown date on or after the marker's date.
 */
export function railTargets(
  visible: readonly string[],
  markers: readonly RailMarker[],
): (string | null)[] {
  const shown = [...visible].sort();
  const first = shown[0] ?? null;
  const last = shown[shown.length - 1] ?? null;
  return markers.map((marker) => {
    switch (marker.kind) {
      case 'up':
        return first;
      case 'down':
        return last;
      case 'month': {
        const month = marker.date.slice(0, 7);
        return shown.find((date) => date.slice(0, 7) === month) ?? null;
      }
      case 'today':
        return shown.find((date) => date >= marker.date) ?? null;
    }
  });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
/** Sakamoto's month offsets: the weekday of a Gregorian date in integer arithmetic alone. */
const SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

function parts(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** 'Oct 7' — what `lib/format`'s `monthDay` prints. */
export function railMonthDay(date: string): string {
  const { month, day } = parts(date);
  return `${MONTHS[month - 1]} ${day}`;
}

/** 'Wed Oct 7' — what `lib/format`'s `shortDate` prints. */
export function railShortDate(date: string): string {
  const { year, month, day } = parts(date);
  const y = month < 3 ? year - 1 : year;
  const weekday =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAKAMOTO[month - 1] + day) %
    7;
  return `${WEEKDAYS[weekday]} ${railMonthDay(date)}`;
}

/**
 * The accessible name for a re-aimed chip, which says it now jumps among the SHOWN contests:
 * "First shown contest, Thu Aug 27", "Next shown contest, Wed Oct 7".
 */
export function railSr(marker: RailMarker, target: string): string {
  const when = railShortDate(target);
  switch (marker.kind) {
    case 'up':
      return `First shown contest, ${when}`;
    case 'down':
      return `Last shown contest, ${when}`;
    case 'month':
      return `First shown contest in ${MONTHS_LONG[parts(marker.date).month - 1]}, ${when}`;
    case 'today':
      return target === marker.date ? `Today, ${when}` : `Next shown contest, ${when}`;
  }
}

/**
 * The visible label for a re-aimed chip, or `null` to keep the server's. The season-end chips
 * print the shown date (`↑ Aug 24`, `↓ Oct 28`). A Today chip re-aimed past today says "Next", so
 * its visible label stays inside its "Next shown contest, …" name (WCAG 2.5.3 Label in Name) and a
 * sighted user is not told "Today" before landing on a later day. `Sep` keeps its label.
 */
export function railLabel(marker: RailMarker, target: string): string | null {
  if (marker.kind === 'today') return target === marker.date ? null : 'Next';
  return marker.kind === 'up' || marker.kind === 'down' ? railMonthDay(target) : null;
}
