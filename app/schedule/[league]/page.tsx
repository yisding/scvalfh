import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import LastUpdated from '../../../components/layout/LastUpdated';
import PageHeader from '../../../components/layout/PageHeader';
import { BUILD_INSTANT } from '../../../components/layout/build-instant';
import ScopeBar from '../../../components/prefs/ScopeBar';
import { leagueChips, leagueHrefs } from '../../../components/layout/league-chips';
import { OG_BASE } from '../../../components/layout/site';
import OfficialFixtures from '../../../components/schedule/OfficialFixtures';
import ScheduleFilters, { ScheduleFiltersFallback } from '../../../components/schedule/ScheduleFilters';
import ScheduleList from '../../../components/schedule/ScheduleList';
import TimelineRail from '../../../components/schedule/TimelineRail';
import { countGames } from '../../../components/schedule/filter-data';
import { scheduleFilterProps } from '../../../components/schedule/filter-data-server';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  getFetchedAt,
  getGamesByDate,
  getLeagueIds,
  getLeagueSummary,
  getOfficialFixtures,
  getTeams,
  getToday,
} from '../../../lib/data';
import { plural } from '../../../lib/format';
import { isIndependentLeague, standaloneName } from '../../../lib/leagues';
import { SEASON_DISPLAY } from '../../../lib/season';
import { SPORT, SPORT_AUDIENCE } from '../../../lib/sports/current';


/**
 * `/schedule/<league>` — "My league's whole season" (SPEC §8.1, §10.4; DESIGN §33): every game with at
 * least one side in the league, date-grouped, oldest first. A cross-league game appears in both
 * leagues' lists. The title is the page's identity ("SCVAL schedule"); under it the league row (links
 * to the sibling leagues' schedules, then the two native selects), the month links, and per date a
 * sticky date strip over that day's rows (two columns from 768, three where the page is wide enough).
 *
 * Rendering model, in order of importance:
 *
 *  1. **Every contest is server-rendered into the HTML.** No pagination, no virtualization, no
 *     client-side data fetch. Ctrl-F finds any team on any day and the page is complete with
 *     JavaScript disabled. Splitting by league is what keeps each page fast (SPEC §8.1).
 *  2. **`content-visibility: auto` on each date group** (`.sx-dategroup`) keeps that from costing
 *     layout and paint for the groups that are off screen.
 *  3. **Filters are a client component over the already-rendered list**, inside `<Suspense>`, and
 *     they never touch search params — which is what keeps this page static (DESIGN decision 7).
 *     A single-division league gets no division select.
 *
 * Nothing on this site is marked LIVE: the snapshot is a once- or twice-daily cron, so a game
 * MaxPreps marks in progress renders as scheduled, and `/about#updates` says so in plain words.
 *
 * The LA independents (DESIGN §24.9, §24.11) get the same page; its `<title>` is "LA teams: … schedule
 * and results".
 */

/** The `<title>`'s words: 'SCVAL schedule and results'; for the LA independents, 'LA teams: schedule and results'. */
function scheduleTitle(summary: { id: string; shortName: string }): string {
  return isIndependentLeague(summary.id)
    ? `${summary.shortName} teams: schedule and results`
    : `${summary.shortName} schedule and results`;
}
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export async function generateMetadata({ params }: PageProps<'/schedule/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) return { title: 'League not found' };
  const counts = countGames(getGamesByDate({ league: summary.id }).flatMap((group) => group.games));
  // The h1 is scheduleTitle; the <title> adds the sport, which a search result has no other way to show.
  const title = scheduleTitle(summary).replace('schedule and results', `${SPORT.noun} schedule and results`);
  // 'involving SCVAL teams'; the LA independents are named by their standaloneName: 'involving the LA independents'.
  const involving = isIndependentLeague(summary.id) ? standaloneName(summary.id) : `${summary.shortName} teams`;
  const description = `All ${plural(counts.total, `${SPORT_AUDIENCE} game`)} involving ${involving} for ${SEASON_DISPLAY}, grouped by date: ${plural(counts.final, 'final score')}, ${counts.upcoming} still to come. Filter by team, game type or status.`;
  return {
    title,
    description,
    alternates: { canonical: `/schedule/${summary.id}` },
    openGraph: { ...OG_BASE, title, description, url: `/schedule/${summary.id}` },
  };
}

export default async function LeagueSchedulePage({ params }: PageProps<'/schedule/[league]'>) {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) notFound();

  const groups = getGamesByDate({ league: summary.id });
  const dates = groups.map((group) => group.date);
  const counts = countGames(groups.flatMap((group) => group.games));
  const today = getToday();
  const { teams, divisions } = scheduleFilterProps(summary, getTeams({ league: summary.id }));
  const fixtures = getOfficialFixtures({ league: summary.id });
  return (
    // `scroll-behavior: auto` on <html> while this page is mounted: a smooth scroll to a date
    // anchor renders the `content-visibility` groups it passes, their real heights replace the
    // estimates mid-flight, and the target slid out of view. An instant jump lands exactly.
    <div className="pb-section-lg [html:has(&)]:[scroll-behavior:auto]">
      <PageHeader
        title={`${summary.shortName} schedule`}
        end={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />}
      />

      {/* The page league's region only, plus All → the Scores page (DESIGN-socal §2.4); then the
          filters on their own row. */}
      <ScopeBar
        region={false}
        league={{
          mode: 'link',
          includeAll: true,
          label: 'Leagues',
          leagues: leagueChips(summary.region),
          current: summary.id,
          hrefs: leagueHrefs('/schedule', summary.region),
        }}
        end={
          <Suspense fallback={<ScheduleFiltersFallback teams={teams} divisions={divisions} counts={counts} />}>
            <ScheduleFilters teams={teams} divisions={divisions} counts={counts} listId="schedule-list" />
          </Suspense>
        }
      />

      <LeagueHealthNote leagueId={summary.id} className="mt-4" />

      <TimelineRail dates={dates} today={today} leagueId={summary.id} />

      <ScheduleList id="schedule-list" groups={groups} scopeLeague={summary.id} />

      {fixtures.length > 0 ? (
        <section className="sx-section">
          <SectionHeader kicker={`Scheduled by ${summary.shortName}, not reported`} />
          <OfficialFixtures fixtures={fixtures} leagueId={summary.id} today={today} />
        </section>
      ) : null}

      {/* How scores are shown lives once, on /about. */}
      <ul className="sx-linkrow mt-6">
        <li>
          <Link href="/about#conventions" prefetch={false} className="sx-action">
            About this data
          </Link>
        </li>
      </ul>
    </div>
  );
}
