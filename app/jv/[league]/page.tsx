import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import JvSchedule from '../../../components/jv/JvSchedule';
import { buildLeagueJvScheduleView } from '../../../components/jv/jv-view';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import Arrow from '../../../components/ui/Arrow';
import EmptyState from '../../../components/ui/EmptyState';
import { getGameDates } from '../../../lib/data';
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
 * schedule and tagged SCHED (lib/jv/jv-official.ts).
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

export default async function JvLeagueSchedulePage({ params }: PageProps<'/jv/[league]'>) {
  const { league } = await params;
  if (!LEAGUE_IDS.includes(league)) notFound();
  const config = getLeague(league);
  const view = buildLeagueJvScheduleView(league);
  const varsityDates = new Set(getGameDates());
  const counts = [
    plural(view.games, 'game'),
    `${view.finals} final`,
    view.toCome > 0 ? `${view.toCome} to come` : null,
    view.noScore > 0 ? `${view.noScore} with no score reported` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="pb-section-lg">
      <PageHeader
        title={titleOf(league)}
        description={`Junior varsity games, ${SEASON_DISPLAY} · ${counts}`}
      />
      <p className="m-0 mt-4 flex flex-wrap gap-x-5 gap-y-2 text-meta">
        <Link href={`/jv#${league}`} prefetch={false} className="font-medium text-accent hover:underline">
          {config.shortName} JV standings <Arrow />
        </Link>
        {view.nextDateKey ? (
          <a href={`#d-${view.nextDateKey}`} className="font-medium text-accent hover:underline">
            Jump to {monthDay(view.nextDateKey)}, the next JV game day <Arrow />
          </a>
        ) : null}
        <Link href={`/schedule/${league}`} prefetch={false} className="font-medium text-accent hover:underline">
          Varsity schedule <Arrow />
        </Link>
      </p>
      <div className="mt-6">
        {view.days.length === 0 ? (
          <EmptyState heading={`No ${config.shortName} JV game is listed yet.`}>
            MaxPreps lists no JV game for any {config.shortName} school this season. Coaches enter JV schedules
            later, and less often, than varsity ones.
          </EmptyState>
        ) : (
          <JvSchedule view={view} varsityDates={varsityDates} dayAnchor={`jv${regionIdSuffix(regionOf(league))}`} />
        )}
      </div>
    </div>
  );
}
