import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import LeagueSwitcher from '../../../components/layout/LeagueSwitcher';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site-url';
import OfficialFixtures from '../../../components/schedule/OfficialFixtures';
import ScheduleFilters, { ScheduleFiltersFallback } from '../../../components/schedule/ScheduleFilters';
import ScheduleList from '../../../components/schedule/ScheduleList';
import TimelineRail from '../../../components/schedule/TimelineRail';
import { countGames } from '../../../components/schedule/filter-data';
import { scheduleFilterProps } from '../../../components/schedule/filter-data-server';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  getGamesByDate,
  getLeagueIds,
  getLeagueSummary,
  getOfficialFixtures,
  getTeams,
  getToday,
} from '../../../lib/data';
import { monthDay } from '../../../lib/format';

import { leagueChips, leagueHrefs } from '../../standings/standings-data';

/**
 * `/schedule/<league>` — "My league's whole season" (SPEC §8.1, §10.4): every game with at least
 * one side in the league, date-grouped. A cross-league game appears in both leagues' lists, the
 * other side carrying its league's short name (`Saint Francis · SCVAL`).
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
 * `LIVE` is never a running score anywhere on this site: the snapshot is a once- or twice-daily
 * cron, and `/about#updates` says so in plain words.
 */
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export async function generateMetadata({ params }: PageProps<'/schedule/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const summary = getLeagueSummary(league);
  if (!summary) return { title: 'League not found' };
  const counts = countGames(getGamesByDate({ league: summary.id }).flatMap((group) => group.games));
  const title = `${summary.shortName} schedule and results`;
  const description = `All ${counts.total} ${
    counts.total === 1 ? 'contest' : 'contests'
  } involving ${summary.shortName} teams for Fall 2026, grouped by date: ${counts.final} final, ${counts.upcoming} still to come. Filter by team, game type or status.`;
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
  const span = dates.length > 0 ? `${monthDay(dates[0])} – ${monthDay(dates[dates.length - 1])}` : null;

  return (
    // `scroll-behavior: auto` on <html> while this page is mounted: a smooth scroll to a date
    // anchor renders the `content-visibility` groups it passes, their real heights replace the
    // estimates mid-flight, and the target slid out of view. An instant jump lands exactly.
    <div className="pb-section-lg [--sx-sticky-stack:var(--spacing-topbar)] md:[--sx-sticky-stack:var(--spacing-topbar-lg)] [html:has(&)]:[scroll-behavior:auto]">
      <PageHeader
        title={`${summary.shortName} schedule and results`}
        description={
          span ? (
            <>
              {summary.name} &middot; {span} &middot; every contest involving {summary.shortName} teams,
              league and non-league, oldest first &middot; all times Pacific
            </>
          ) : (
            <>{summary.name}</>
          )
        }
      />

      <LeagueSwitcher
        mode="link"
        includeAll
        label="Leagues"
        leagues={leagueChips()}
        current={summary.id}
        hrefs={leagueHrefs('/schedule')}
        className="mt-4"
      />

      <LeagueHealthNote leagueId={summary.id} className="mt-4" />

      <Suspense
        fallback={
          <ScheduleFiltersFallback teams={teams} divisions={divisions} counts={counts} className="mt-6" />
        }
      >
        <ScheduleFilters
          teams={teams}
          divisions={divisions}
          counts={counts}
          listId="schedule-list"
          className="mt-6"
        />
      </Suspense>

      {/* Bled to the screen edge on a phone so the rail scrolls under the gutter, with the chips'
          own padding inside; 4px of room at desktop so no ring or focus outline is clipped. */}
      <TimelineRail dates={dates} today={today} leagueId={summary.id} className="mt-4 -mx-gutter md:-mx-1" />

      <ScheduleList id="schedule-list" groups={groups} scopeLeague={summary.id} />

      {fixtures.length > 0 ? (
        <section className="mt-section md:mt-section-lg">
          <SectionHeader kicker={`Scheduled by ${summary.shortName}, not reported`} />
          <OfficialFixtures fixtures={fixtures} leagueId={summary.id} today={today} />
        </section>
      ) : null}

      {/* The same width as the fixtures card above it, so the two end-of-page disclosures read
          as one kind of thing. */}
      <details className="sx-inset sx-disclosure mt-section max-w-3xl md:mt-section-lg">
        {/* The same summary as every other page's legend, and no count: "(5 notes)" was a number
            to read before the notes themselves. */}
        <summary>How to read this page</summary>
        <ul className="m-0 mt-2 list-disc space-y-2 pl-5">
          <li>
            Standings count league games only. A league game carries its league&rsquo;s tag; a
            non-league game carries the <code>NL</code> tag and, on phone rows, a 2px left rule — it
            counts in a team&rsquo;s overall record and nowhere else.
          </li>
          <li>
            A real <span className="sx-num">0</span> shows as <span className="sx-num">0</span> in
            full-strength ink. A score we do not have shows as a dash &mdash; never{' '}
            <span className="sx-num">0-0</span>.
          </li>
          <li>
            <span className="font-sans text-micro font-semibold uppercase tracking-[0.04em]">
              score not reported
            </span>{' '}
            means the game was played and no score has been posted yet. It counts for nothing until
            it is.
          </li>
          <li>
            A <span aria-hidden="true">&dagger;</span>
            <span className="sr-only">dagger</span> beside a score means it was published from High
            School on SI (si.com) under the site&rsquo;s backfill rule, because MaxPreps does not
            have it.
          </li>
          <li>
            Every date and time is Pacific, formatted when the site was built. Tap a game to expand
            its venue, stream, ticket and box-score links; tap a date&rsquo;s Day page link to open
            that day on its own page.
          </li>
        </ul>
        <p className="mt-3 mb-0">
          <Link href="/about#conventions" prefetch={false} className="sx-action font-medium text-accent">
            Every rendering convention, in one table
          </Link>
        </p>
      </details>
    </div>
  );
}
