/**
 * Clock words for /festival (DESIGN §35): venue time, labelled ET, first, because the readers are at the
 * fields in Naples; Pacific time beside it in slot headings and the freshness stamp, for the family at home.
 * A recorded deviation from the site's PT-only rule (DESIGN §11 item 10).
 *
 * Every word here is formatted from a UTC instant (a game's `startUtc`, the file's `fetchedAt`) with Intl in
 * the named zone. Never from the feed's naive `start` through lib/format's PT helpers, which read a naive
 * string as Pacific and would print a Naples 8:00 AM as "8:00 AM PT".
 *
 * `formatToParts`, not `format`: recent ICU puts a narrow no-break space before AM/PM, and these words are
 * matched by tests and read by copy gates as plain text.
 */

export const FESTIVAL_ET = 'America/New_York';
export const FESTIVAL_PT = 'America/Los_Angeles';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  monthName: string;
}

const FORMATS = new Map<string, Intl.DateTimeFormat>();

function formatFor(zone: string): Intl.DateTimeFormat {
  let fmt = FORMATS.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    FORMATS.set(zone, fmt);
  }
  return fmt;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function partsIn(iso: string, zone: string): ZonedParts {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error(`festival-time: not an instant: ${iso}`);
  const found: Record<string, string> = {};
  for (const part of formatFor(zone).formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  const month = Number(found.month);
  return {
    year: Number(found.year),
    month,
    day: Number(found.day),
    // h23 can still print '24' for midnight in some ICU builds.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    weekday: found.weekday,
    monthName: MONTHS[month - 1],
  };
}

function clockOf(p: ZonedParts): string {
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** '8:00 AM' at the venue. */
export function clockET(iso: string): string {
  return clockOf(partsIn(iso, FESTIVAL_ET));
}

/** '5:00 AM' in California. */
export function clockPT(iso: string): string {
  return clockOf(partsIn(iso, FESTIVAL_PT));
}

/** '2026-11-26': the venue's calendar day, which is the event's day. */
export function dayKeyET(iso: string): string {
  const p = partsIn(iso, FESTIVAL_ET);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 'Thu Nov 26' at the venue. */
export function dayLabelET(iso: string): string {
  const p = partsIn(iso, FESTIVAL_ET);
  return `${p.weekday} ${p.monthName} ${p.day}`;
}

/** 'Thu' at the venue. */
export function weekdayET(iso: string): string {
  return partsIn(iso, FESTIVAL_ET).weekday;
}

/** 'Sat 9:00 AM ET': a game away from its day's heading. */
export function whenET(iso: string): string {
  const p = partsIn(iso, FESTIVAL_ET);
  return `${p.weekday} ${clockOf(p)} ET`;
}

/** '8:00 AM ET · 5:00 AM PT': a time slot's two clocks. */
export function bothClocks(iso: string): string {
  return `${clockET(iso)} ET · ${clockPT(iso)} PT`;
}

/** 'Thu Nov 26 · 8:00 AM ET · 5:00 AM PT': a slot heading where no day heading sits above it. */
export function slotHeading(iso: string): string {
  return `${dayLabelET(iso)} · ${bothClocks(iso)}`;
}

/**
 * 'Thu 3:42 PM ET · 12:42 PM PT': when the file was read. The weekday is always there: during a three-day event
 * "3:42 PM" alone does not say whether it was today.
 */
export function stampWords(iso: string): string {
  return `${weekdayET(iso)} ${bothClocks(iso)}`;
}
