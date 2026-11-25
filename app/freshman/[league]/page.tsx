import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FreshmanSchedule } from '../../../components/freshman/FreshmanGames';
import { buildLeagueFreshmanScheduleView } from '../../../components/freshman/freshman-view';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import EmptyState from '../../../components/ui/EmptyState';
import { getGameDates } from '../../../lib/data';
import { monthDay, plural } from '../../../lib/format';
import { hasFreshmanLevel } from '../../../lib/freshman/freshman';
import { LEAGUE_IDS, getLeague, standaloneName } from '../../../lib/leagues';
import { SEASON_DISPLAY } from '../../../lib/season';
import { GENDER_NAME, SPORT } from '../../../lib/sports/current';
import { FRESHMAN_LEVEL } from '../../../components/words/level-words';

/**
 * `/freshman/<league>` — every freshman game with a side in the league, by date, the whole season on one page, as
 * `/jv/<league>` is for the JV: results, the games with no score reported, and the games to come. A day page shows a
 * day's freshman games only on a date with a varsity game; this is where every other date is.
 *
 * One static page per league in a build with the freshman level (girls soccer and boys basketball); none in any other
 * build, where `dynamicParams = false` makes every segment a 404. Nothing derived from `Date.now()`.
 */

export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return hasFreshmanLevel() ? LEAGUE_IDS.map((league) => ({ league })) : [];
}

function titleOf(league: string): string {
  return `${standaloneName(league)} ${FRESHMAN_LEVEL.long} schedule and scores`;
}

export async function generateMetadata({ params }: PageProps<'/freshman/[league]'>): Promise<Metadata> {
  const { league } = await params;
  if (!hasFreshmanLevel() || !LEAGUE_IDS.includes(league)) return { title: 'League not found' };
  const view = buildLeagueFreshmanScheduleView(league);
  const title = titleOf(league);
  const description = `Every ${GENDER_NAME.toLowerCase()} ${FRESHMAN_LEVEL.long} ${SPORT.noun} game of ${getLeague(league).name}, ${SEASON_DISPLAY}, by date: ${plural(view.games, 'game')} listed, ${view.finals} with a final score. Unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/freshman/${league}` },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title, description, url: `/freshman/${league}` },
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function FreshmanLeagueSchedulePage({ params }: PageProps<'/freshman/[league]'>) {
  const { league } = await params;
  if (!hasFreshmanLevel() || !LEAGUE_IDS.includes(league)) notFound();
  const config = getLeague(league);
  const view = buildLeagueFreshmanScheduleView(league);
  const varsityDates = new Set(getGameDates());
  const months = view.days.reduce<Array<{ key: string; name: string; first: string }>>((out, day) => {
    const key = day.dateKey.slice(0, 7);
    if (out.at(-1)?.key !== key) out.push({ key, name: MONTH_NAMES[Number(key.slice(5)) - 1], first: day.dateKey });
    return out;
  }, []);
  return (
    <div className="pb-section-lg">
      <PageHeader title={`${config.shortName} ${FRESHMAN_LEVEL.long} schedule`} />
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
          <EmptyState heading={`No ${config.shortName} ${FRESHMAN_LEVEL.long} games listed`}>
            No school of the league has a freshman schedule on MaxPreps for this season yet.
          </EmptyState>
        ) : (
          <FreshmanSchedule view={view} varsityDates={varsityDates} />
        )}
      </div>
      <ul className="sx-linkrow mt-4">
        <li>
          <Link href="/freshman" prefetch={false} className="sx-action">
            All {FRESHMAN_LEVEL.long} games
          </Link>
        </li>
        <li>
          <Link href={`/jv/${league}`} prefetch={false} className="sx-action">
            {config.shortName} JV schedule
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
