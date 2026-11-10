import DateHeader from '../schedule/DateHeader';
import { JvGameList } from './JvDayGames';
import { JvFootnote } from './TeamJvGames';
import type { LeagueJvScheduleView } from './jv-view';

/**
 * `/jv/<league>`: every JV game of the league, a group per date (`#d-<date>`), oldest first. A date with a
 * varsity game links its day page, where the same JV games sit under the varsity slate; a JV-only date (a
 * Monday JV round, a JV tournament day) has no day page, which is why this list exists. One footnote under
 * the whole list.
 */
export function JvSchedule({
  view,
  varsityDates,
  dayAnchor,
}: {
  view: LeagueJvScheduleView;
  varsityDates: ReadonlySet<string>;
  /** The day page's JV block for this league's region: `jv`, or `jv-socal`. */
  dayAnchor: string;
}) {
  return (
    <>
      {view.days.map((day) => (
        <section key={day.dateKey} id={`d-${day.dateKey}`} className="mt-4 scroll-mt-24 first:mt-0">
          <DateHeader
            date={day.dateKey}
            count={day.rows.length}
            dayHref={varsityDates.has(day.dateKey) ? `/scores/${day.dateKey}#${dayAnchor}` : undefined}
            className="md:max-w-3xl"
          />
          <JvGameList rows={day.rows} />
        </section>
      ))}
      <JvFootnote summary={view} />
    </>
  );
}

export default JvSchedule;
