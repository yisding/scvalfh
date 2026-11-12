import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import JvSchedule from '../../../components/jv/JvSchedule';
import { buildLeagueJvScheduleView } from '../../../components/jv/jv-view';
import { BUILD_INSTANT } from '../../../components/layout/build-instant';
import LastUpdated from '../../../components/layout/LastUpdated';
import { leagueChips, leagueHrefs } from '../../../components/layout/league-chips';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import ScopeBar from '../../../components/prefs/ScopeBar';
import EmptyState from '../../../components/ui/EmptyState';
import { getFetchedAt, getGameDates } from '../../../lib/data';
import { monthDay, plural } from '../../../lib/format';
import { regionIdSuffix } from '../../../components/leaders/scope';
import { LEAGUE_IDS, getLeague, regionOf, standaloneName } from '../../../lib/leagues';
import { SEASON_DISPLAY } from '../../../lib/season';
import { GENDER_NAME, SPORT } from '../../../lib/sports/current';

/**
 * `/jv/<league>` — "When does our JV play, and how did it go?" Every JV game with a side in the league, by
 * date, the whole season on one page: results, the games with no score reported, and the games to come.
 *
 * The day pages (`/scores/<date>`) show a day's JV games under its varsity slate, and exist only for a date
 * with a varsity game; a team page lists one school's JV games. This page is the league's JV calendar,
 * including the dates only JV teams play (SCVAL basketball's Monday JV round before the last varsity night).
 * Where the league's own schedule sets the JV round, a game MaxPreps does not list yet is listed from the
 * schedule and noted "League schedule" (lib/jv/jv-official.ts).
 *
 * One static page per league, nothing derived from `Date.now()`: "today" is the JV file's own date.
 */

export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return LEAGUE_IDS.map((league) => ({ league }));
}

function titleOf(league: string): string {
  return `${standaloneName(league)} JV schedule and scores`;
}

export async function generateMetadata({ params }: PageProps<'/jv/[league]'>): Promise<Metadata> {
  const { league } = await params;
  if (!LEAGUE_IDS.includes(league)) return { title: 'League not found' };
  const view = buildLeagueJvScheduleView(league);
  const title = titleOf(league);
  const description = `Every ${GENDER_NAME.toLowerCase()} junior varsity ${SPORT.noun} game of ${getLeague(league).name}, ${SEASON_DISPLAY}, by date: ${plural(view.games, 'game')} listed, ${view.finals} with a final score. Unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/jv/${league}` },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title, description, url: `/jv/${league}` },
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function JvLeagueSchedulePage({ params }: PageProps<'/jv/[league]'>) {
  const { league } = await params;
  if (!LEAGUE_IDS.includes(league)) notFound();
  const config = getLeague(league);
  const region = regionOf(league);
  const view = buildLeagueJvScheduleView(league);
  const varsityDates = new Set(getGameDates());
  // The month links: each to its first JV game day (`#d-<date>`), as on the league's varsity schedule.
  const months = view.days.reduce<Array<{ key: string; name: string; first: string }>>((out, day) => {
    const key = day.dateKey.slice(0, 7);
    if (out.at(-1)?.key !== key) out.push({ key, name: MONTH_NAMES[Number(key.slice(5)) - 1], first: day.dateKey });
    return out;
  }, []);
  return (
    <div className="pb-section-lg">
      <PageHeader title={`${config.shortName} JV schedule`} />
      {/* The league's region only (links to the sibling leagues' JV schedules), plus All → the JV hub. */}
      <ScopeBar
        region={false}
        league={{
          mode: 'link',
          includeAll: true,
          label: 'Leagues',
          leagues: leagueChips(region),
          current: league,
          hrefs: leagueHrefs('/jv', region),
        }}
        stamp={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />}
      />
      {months.length > 1 || view.nextDateKey ? (
        <ul className="sx-linkrow">
          {view.nextDateKey ? (
            <li>
              <a href={`#d-${view.nextDateKey}`} className="sx-action">
                Next: {monthDay(view.nextDateKey)}
              </a>
            </li>
          ) : null}
          {months.length > 1
            ? months.map((month) => (
                <li key={month.key}>
                  <a href={`#d-${month.first}`} className="sx-action">
                    {month.name}
                  </a>
                </li>
              ))
            : null}
        </ul>
      ) : null}
      <div className="mt-4">
        {view.days.length === 0 ? (
          <EmptyState heading={`No ${config.shortName} JV games listed`} />
        ) : (
          <JvSchedule view={view} varsityDates={varsityDates} dayAnchor={`jv${regionIdSuffix(region)}`} />
        )}
      </div>
      <ul className="sx-linkrow mt-4">
        <li>
          <Link href={`/jv#${league}`} prefetch={false} className="sx-action">
            {config.shortName} JV standings
          </Link>
        </li>
        <li>
          <Link href={`/schedule/${league}`} prefetch={false} className="sx-action">
            {config.shortName} schedule
          </Link>
        </li>
      </ul>
    </div>
  );
}
