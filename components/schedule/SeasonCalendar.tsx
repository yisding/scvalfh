import Link from 'next/link';

import { longDate, parseLocal, weekdayIndex } from '../../lib/format';

/**
 * The month picker (DESIGN §33): the season as month grids, every day with a contest a link to its
 * own `/scores/[date]` page. It exists once per page, inside the date bar's Calendar `<details>`
 * (components/schedule/DayNav.tsx), so it is in the HTML whether the panel is open or not: no client
 * JavaScript, and it opens with JavaScript off.
 *
 * Each game day's link carries `id="YYYY-MM-DD"`, so an old `/schedule#2026-09-24` link still has a
 * target (scripts/smoke-server.sh checks one id per game day).
 *
 * Built from the date keys alone: `parseLocal` splits the key and `weekdayIndex` reads the weekday
 * of a UTC date built from its parts (lib/format), so nothing here reads a clock and the grid is
 * part of the reproducible build. Weeks run Monday first, because the season is weeknight league
 * play with a Saturday tail.
 *
 * A month is a labelled group: its name and one `.sx-cal` grid of seven columns: the weekday letters, then the days.
 * A game day is a link in ink whose accessible name is the full date; a day without games is grey
 * text, never a link (it would be a 404); today's numeral is underlined (`data-today`); the selected
 * day is the filled cell (`aria-current="date"`).
 */
export interface SeasonCalendarProps {
  /** Every date with a contest, 'YYYY-MM-DD', ascending (`getGameDates()`). */
  dates: readonly string[];
  /** The selected day. */
  current: string;
  /** The snapshot's Pacific day. */
  today?: string;
  className?: string;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Monday first. */
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

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
  /** The cells in reading order; `null` pads the first week. */
  cells: (string | null)[];
}

function buildMonths(dates: readonly string[]): Month[] {
  const keys = [...new Set(dates.map((date) => date.slice(0, 7)))];
  return keys.map((key) => {
    const { year, month } = parseLocal(`${key}-01`);
    // weekdayIndex is 0 = Sunday; shifted so 0 = Monday.
    const lead = (weekdayIndex(`${key}-01`) + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= daysInMonth(year, month); day += 1) cells.push(`${key}-${pad(day)}`);
    return { key, caption: `${MONTHS_LONG[month - 1]} ${year}`, cells };
  });
}

export function SeasonCalendar({ dates, current, today, className }: SeasonCalendarProps) {
  const months = buildMonths(dates);
  if (months.length === 0) return null;
  const contestDays = new Set(dates);
  return (
    <div className={['flex flex-wrap gap-x-8 gap-y-4', className].filter(Boolean).join(' ')}>
      {months.map((month) => (
        // A labelled group, not a heading: the panel sits inside the date bar, above the page's sections.
        <div key={month.key} role="group" className="min-w-0 max-w-full" aria-labelledby={`cal-${month.key}`}>
          <p id={`cal-${month.key}`} className="m-0 mb-1 text-lead text-ink">
            {month.caption}
          </p>
          <div className="sx-cal sx-num">
            {WEEKDAY_LETTERS.map((letter, i) => (
              <span key={i} aria-hidden="true">
                {letter}
              </span>
            ))}
            {month.cells.map((date, i) =>
              date === null ? (
                <span key={`pad-${i}`} aria-hidden="true" />
              ) : contestDays.has(date) ? (
                // prefetch={false}: one of these per game day, each a whole static route.
                <Link
                  key={date}
                  id={date}
                  href={`/scores/${date}`}
                  prefetch={false}
                  aria-current={date === current ? 'date' : undefined}
                  aria-label={longDate(date)}
                  data-today={date === today ? '' : undefined}
                >
                  {parseLocal(date).day}
                </Link>
              ) : (
                <span key={date}>{parseLocal(date).day}</span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SeasonCalendar;
