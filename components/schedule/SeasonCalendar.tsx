import Link from 'next/link';

import { longDate, parseLocal, weekdayIndex } from '../../lib/format';

/**
 * "Pick a date" on a day page (F-34): the season as month grids, every day with a contest a link
 * to its own `/scores/[date]` page.
 *
 * The day pages could only be walked one stepper tap at a time — Aug 24 to Oct 28 is 48 taps — so
 * this puts any day two taps away. It is a server component and a real `<details>`: no client
 * JavaScript, it opens with JavaScript off, and it starts closed so the day's games stay in the
 * fold.
 *
 * Built from the date keys alone: `parseLocal` splits the key and `weekdayIndex` reads the weekday
 * of a UTC date built from its parts (lib/format), so nothing here reads a clock and the grid is
 * part of the reproducible build. Weeks run Monday first, because the season is weeknight league
 * play with a Saturday tail.
 *
 * Each month is a plain `<table>` (not `.sx-table`, which is a data-table skin): a caption
 * ("September 2026"), one column head per weekday — a letter on screen, the whole name to a
 * screen reader — and one row per week. A contest day is a 44px-tall link whose accessible name is
 * the full date; the page's own day carries `aria-current="date"`, an accent ring and, because
 * forced colours drop box-shadows, a real border there. Days with no contest are muted numbers,
 * not links: a link to a day with no games would be a 404.
 */
export interface SeasonCalendarProps {
  /** Every date with a contest, 'YYYY-MM-DD', ascending (`getGameDates()`). */
  dates: readonly string[];
  /** The day page this sits on. */
  current: string;
  className?: string;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Monday first: the letter on screen and the name a screen reader announces. */
const WEEKDAY_HEADS = [
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
  ['S', 'Sunday'],
] as const;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

interface Month {
  key: string;
  caption: string;
  /** Rows of seven cells; `null` pads the first and last weeks. */
  weeks: (string | null)[][];
}

function buildMonths(dates: readonly string[]): Month[] {
  const keys = [...new Set(dates.map((date) => date.slice(0, 7)))];
  return keys.map((key) => {
    const { year, month } = parseLocal(`${key}-01`);
    // weekdayIndex is 0 = Sunday; shifted so 0 = Monday.
    const lead = (weekdayIndex(`${key}-01`) + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= daysInMonth(year, month); day += 1) cells.push(`${key}-${pad(day)}`);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { key, caption: `${MONTHS_LONG[month - 1]} ${year}`, weeks };
  });
}

export function SeasonCalendar({ dates, current, className }: SeasonCalendarProps) {
  const months = buildMonths(dates);
  if (months.length === 0) return null;
  const contestDays = new Set(dates);
  return (
    <details className={['sx-disclosure', className].filter(Boolean).join(' ')}>
      <summary>Pick a date</summary>
      {/* One month under another on a phone; side by side from 768px, where three 7-column
          grids fit the content box (~32px cells at 768, ~47px at 1280). `items-start`: a
          five-week month must not stretch to the height of a six-week one beside it, which
          spread its rows apart. */}
      <div className="mt-2 grid items-start gap-stack md:grid-cols-3 md:gap-6">
        {months.map((month) => (
          <table key={month.key} className="w-full table-fixed border-collapse">
            <caption className="pb-2 text-left text-meta font-semibold text-ink">
              {month.caption}
            </caption>
            <thead>
              <tr>
                {WEEKDAY_HEADS.map(([letter, weekday]) => (
                  <th
                    key={weekday}
                    scope="col"
                    className="pb-1 text-center text-micro font-medium text-ink-3"
                  >
                    <span aria-hidden="true">{letter}</span>
                    <span className="sr-only">{weekday}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((date, d) => (
                    <td key={date ?? `pad-${d}`} className="p-0.5">
                      {date === null ? null : contestDays.has(date) ? (
                        // prefetch={false}: 49 of these, one per day page (see DateHeader.tsx).
                        // `relative` gives the sr-only name a positioned ancestor inside the cell
                        // (the reason TimelineRail's chips carry it). A contest day is filled and
                        // in accent so it reads as a link without colour alone (weight + fill).
                        <Link
                          href={`/scores/${date}`}
                          prefetch={false}
                          aria-current={date === current ? 'date' : undefined}
                          className={`sx-num relative flex h-11 w-full items-center justify-center rounded-chip text-cell font-semibold no-underline ${
                            date === current
                              ? 'bg-accent-wash text-accent-ink shadow-[inset_0_0_0_2px_var(--sx-accent)] forced-colors:border-2 forced-colors:border-[Highlight]'
                              : 'bg-surface-2 text-accent hover:bg-surface-3 active:bg-surface-3 forced-colors:border forced-colors:border-[LinkText]'
                          }`}
                        >
                          <span aria-hidden="true">{parseLocal(date).day}</span>
                          <span className="sr-only">{longDate(date)}</span>
                        </Link>
                      ) : (
                        <span className="sx-num flex h-11 w-full items-center justify-center text-cell text-ink-3">
                          {parseLocal(date).day}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </details>
  );
}

export default SeasonCalendar;
