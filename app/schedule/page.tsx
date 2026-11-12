import type { Metadata } from 'next';

import { OG_BASE, ROOT_OG_IMAGE, coveredLeagueWords } from '../../components/layout/site';
import ScoreDay from '../../components/schedule/ScoreDay';
import { countGames } from '../../components/schedule/filter-data';
import { getGames, getToday } from '../../lib/data';
import { plural } from '../../lib/format';
import { SEASON_DISPLAY } from '../../lib/season';
import { SPORT_AUDIENCE } from '../../lib/sports/current';

/**
 * `/schedule` — the Scores page for today's Pacific date, exactly like `/` (DESIGN §33;
 * components/schedule/ScoreDay.tsx), so its canonical URL is `/`. The date bar walks the season day by
 * day and its Calendar holds every game day; a league's whole season is `/schedule/<league>`, reached
 * from the rail, `/standings/<league>` and the team pages.
 *
 * Old links keep working with no JavaScript: `/schedule#2026-09-24` has a target, the calendar's link
 * to that day (`id="2026-09-24"`, components/schedule/SeasonCalendar.tsx).
 *
 * Static: no search params; "today" is the snapshot's own Pacific day, never `Date.now()`.
 */
export function generateMetadata(): Metadata {
  const counts = countGames(getGames());
  const list = coveredLeagueWords();
  const description = `${counts.total} ${SPORT_AUDIENCE} games in ${list} for ${SEASON_DISPLAY}: ${plural(counts.final, 'final score')}, ${counts.upcoming} still to come. Today's scores, and every game day.`;
  return {
    title: 'Schedule & results',
    description,
    alternates: { canonical: '/' },
    openGraph: {
      ...OG_BASE,
      ...ROOT_OG_IMAGE,
      url: '/',
      title: 'Schedule & results — every league',
      description,
    },
  };
}

export default function SchedulePage() {
  return <ScoreDay date={getToday()} />;
}
