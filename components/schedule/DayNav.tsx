import Link from 'next/link';

import { monthDay, shortDate } from '../../lib/format';
import { REGIONS } from '../../lib/league-config/sections';
import type { Game, RegionId } from '../../lib/types';
import { CalendarGlyph, ChevronLeft, ChevronRight } from '../ui/glyphs';

import SeasonCalendar from './SeasonCalendar';
import { dayRegions } from './day-summary';
import { dateBarView, dayCountWords } from './scores-page-view';

/**
 * The date bar (DESIGN §33): the Scores page's filter and its visible title, and the one sticky bar
 * on it. The selected day and the six game days nearest to it (scores-page-view.ts `dateBarView`),
 * a step arrow each side and the Calendar button, whose panel is the season's month grids.
 *
 * A cell is three lines: the weekday ("Today" on the snapshot's own day), the date, and the number
 * of games that day in the reader's region. While a game that day is being played the count reads
 * "2 live". Today's cell links to `/`.
 *
 * Each region walks ITS OWN game days: a NorCal reader never steps onto a day with only SoCal games.
 * So the cells and the two arrows are rendered once per region, each `data-region-scope`d (the scope
 * stylesheet shows the reader's; without JavaScript both sets read in turn, NorCal first). A
 * one-region build renders one unscoped set.
 *
 * CSS counts the cells by the bar's own width (3, 5 or 7; `data-far`), so nothing scrolls and no
 * script is needed. At the ends of the season the missing arrow is drawn disabled, not dropped: the
 * cells keep their place.
 */
export interface DateBarProps {
  /** The selected day, 'YYYY-MM-DD'. */
  date: string;
  /** Every date with a contest, ascending. */
  dates: readonly string[];
  /** The snapshot's Pacific day. */
  today: string;
  /** A day's games (lib/data `getGames({ date })`). */
  gamesOn: (date: string) => readonly Game[];
}

function hrefOf(date: string, today: string): string {
  return date === today ? '/' : `/scores/${date}`;
}

function Step({ to, today, next, region }: { to: string | null; today: string; next?: boolean; region?: RegionId }) {
  const words = next ? 'Next game day' : 'Previous game day';
  const glyph = next ? <ChevronRight /> : <ChevronLeft />;
  if (to === null) {
    return (
      <span
        className="sx-iconbtn"
        role="link"
        aria-disabled="true"
        aria-label={words}
        data-next={next ? '' : undefined}
        data-region-scope={region}
      >
        {glyph}
      </span>
    );
  }
  return (
    <Link
      className="sx-iconbtn"
      href={hrefOf(to, today)}
      prefetch={false}
      aria-label={`${words}, ${shortDate(to)}`}
      data-next={next ? '' : undefined}
      data-region-scope={region}
    >
      {glyph}
    </Link>
  );
}

export function DateBar({ date, dates, today, gamesOn }: DateBarProps) {
  const scoped = REGIONS.length > 1;
  /** A day's games with a side in the region (every game in a one-region build). */
  const inRegion = (d: string, region: RegionId): readonly Game[] =>
    scoped ? (dayRegions(gamesOn(d)).regions.find((r) => r.id === region)?.withSide ?? []) : gamesOn(d);
  const bars = REGIONS.map((region) => ({
    region: scoped ? region.id : undefined,
    id: region.id,
    view: dateBarView(
      dates.filter((d) => inRegion(d, region.id).length > 0),
      date,
      today,
    ),
  }));
  return (
    <nav className="sx-datebar sx-print-hide" data-sticky aria-label="Game days">
      {bars.map((bar) => (
        <Step key={bar.id} to={bar.view.previous} today={today} region={bar.region} />
      ))}
      <ul className="sx-days">
        {bars.flatMap((bar) =>
          bar.view.cells.map((cell) => {
            const games = inRegion(cell.date, bar.id);
            const count = dayCountWords(games);
            return (
              <li key={`${bar.id}:${cell.date}`} data-far={cell.far ?? undefined} data-region-scope={bar.region}>
                <Link
                  className="sx-day"
                  href={hrefOf(cell.date, today)}
                  prefetch={false}
                  aria-current={cell.current ? 'date' : undefined}
                  data-today={cell.today ? '' : undefined}
                  data-live={count.live ? '' : undefined}
                >
                  {cell.today ? 'Today' : shortDate(cell.date).split(' ')[0]}
                  <b>{monthDay(cell.date)}</b>
                  <small>{count.text}</small>
                </Link>
              </li>
            );
          }),
        )}
      </ul>
      {bars.map((bar) => (
        <Step key={bar.id} to={bar.view.next} today={today} next region={bar.region} />
      ))}
      {/* The month picker. `static`: the panel is placed against the bar (the sticky nav), so it
          opens under the whole bar, not under the button at its end. */}
      <details className="sx-disclosure static! pb-0!">
        <summary className="sx-btn">
          <CalendarGlyph />
          <span>Calendar</span>
        </summary>
        <div className="absolute inset-x-0 top-full z-10 max-h-[70vh] overflow-x-hidden overflow-y-auto rounded-control border border-rule bg-bg p-3">
          <SeasonCalendar dates={dates} current={date} today={today} />
        </div>
      </details>
    </nav>
  );
}

export default DateBar;
