import Link from 'next/link';

import { regionOf } from '@/lib/config/leagues';
import { shortDate } from '@/lib/format/dates';
import type { ScoresDayView } from '@/views/scores/scores-view';

/** This is the only way to walk the season day by day on a phone, so the steppers are 44px
   pills (DESIGN §4.4), not bare text links. They are canvas pills (`sx-pill-ring`: the card
   plane with the hairline ring), so in light mode they read as buttons rather than as the
   surface-2 fact badges beside the h1; accent on surface is the strongest pairing the pill
   has. At the ends of the season the missing pill is a short badge — "First day" / "Last day",
   with " of the season" for screen readers only — so the steppers stay one line at 390. On a
   day with several leagues the "Full season" group wraps under them as one unit. */
export default function DayNav({
  date,
  previous,
  next,
  seasonLeagues,
  twoRegions,
}: Pick<ScoresDayView, 'date' | 'previous' | 'next' | 'seasonLeagues' | 'twoRegions'>) {
  return (
    <nav aria-label="Other days" className="sx-print-hide flex flex-wrap items-center gap-2">
      {previous ? (
        <Link
          href={`/scores/${previous}`}
          className="sx-pill sx-pill-ring min-h-11"
        >
          <span aria-hidden="true">&lsaquo;</span>
          {shortDate(previous)}
          <span className="sr-only">: the previous day with games</span>
        </Link>
      ) : (
        <span className="sx-badge">
          First day<span className="sr-only"> of the season</span>
        </span>
      )}
      {next ? (
        <Link
          href={`/scores/${next}`}
          className="sx-pill sx-pill-ring min-h-11"
        >
          {shortDate(next)}
          <span aria-hidden="true">&rsaquo;</span>
          <span className="sr-only">: the next day with games</span>
        </Link>
      ) : (
        <span className="sx-badge">
          Last day<span className="sr-only"> of the season</span>
        </span>
      )}
      {/* The full season is a league's page (/schedule/<league>), aimed at this date's group,
          which every league with a side in one of the day's games has (a day with no league side
          at all would fall back to /schedule's index row for it). One league: "Full season".
          Several: "Full season" then one short-name link per league, each named in full for
          screen readers. Plain <a>s, document navigations on purpose: the browser keeps re-running
          its fragment scroll while the list's content-visibility groups settle, so the date's
          header lands under the top bar for every date. A client <Link> scrolls once, and only
          lands for dates within ScheduleList's ±7-day laid-out window around the Scores tab's
          date. On a day with games in both regions each league's link carries its region's
          `data-region-scope`, so a reader sees the label and their own region's leagues (NorCal's
          first without JS, config order). */}
      {seasonLeagues.length <= 1 ? (
        <a
          href={seasonLeagues[0] ? `/schedule/${seasonLeagues[0].id}#${date}` : `/schedule#${date}`}
          className="sx-action min-h-11 rounded-chip px-3 text-meta font-medium text-accent no-underline hover:bg-surface-2"
        >
          Full season
          {seasonLeagues[0] ? (
            <span className="sr-only">{`: the ${seasonLeagues[0].shortName} schedule, at ${shortDate(date)}`}</span>
          ) : null}
        </a>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-0.5">
          <span aria-hidden="true" className="text-meta text-ink-3">
            Full season
          </span>
          {/* The links wrap together, never one by one (tight padding and gap): if the screen
              or the font can't hold them all beside the label, they all drop under it rather
              than stranding the last league. */}
          <span className="inline-flex items-center gap-x-0.5">
            {seasonLeagues.map((league) => (
              <a
                key={league.id}
                data-region-scope={twoRegions ? regionOf(league.id) : undefined}
                href={`/schedule/${league.id}#${date}`}
                className="sx-action min-h-11 rounded-chip px-1.5 text-meta font-medium text-accent no-underline hover:bg-surface-2"
              >
                {league.shortName}
                <span className="sr-only">{` full season, at ${shortDate(date)}`}</span>
              </a>
            ))}
          </span>
        </span>
      )}
    </nav>
  );
}
