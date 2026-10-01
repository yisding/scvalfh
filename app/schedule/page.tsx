import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import OfficialFixtures from '@/components/schedule/OfficialFixtures';
import ScheduleFilters from '@/components/schedule/ScheduleFilters';
import ScheduleList from '@/components/schedule/ScheduleList';
import TimelineRail from '@/components/schedule/TimelineRail';
import { countGames, unfilteredCountLine } from '@/components/schedule/filter-data';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import { getGamesByDate, getOfficialFixtures, getTeams, getToday } from '@/lib/data';
import { monthDay } from '@/lib/format';

/**
 * `/schedule` — the whole season, date-grouped (DESIGN §1.1, §3.3).
 *
 * Rendering model, in order of importance:
 *
 *  1. **Every contest is server-rendered into the HTML.** No pagination, no virtualization, no
 *     client-side data fetch. Ctrl-F finds any team on any day and the page is complete with
 *     JavaScript disabled.
 *  2. **`content-visibility: auto` on each date group** (`.sx-dategroup`) keeps that from costing
 *     layout and paint for the 40-odd groups that are off screen.
 *  3. **Filters are a client component over the already-rendered list**, inside `<Suspense>`, and
 *     they never touch `searchParams` — which is what keeps this page static (DESIGN decision 7).
 *
 * `LIVE` is never a running score anywhere on this site: the snapshot is a once- or twice-daily
 * cron, and `/about#updates` says so in plain words.
 */
const counts = countGames(getGamesByDate().flatMap((group) => group.games));

export const metadata: Metadata = {
  title: 'Schedule & results',
  description: `All ${counts.total} SCVAL girls varsity field hockey contests for Fall 2026, grouped by date: ${counts.final} final, ${counts.upcoming} still to come. Filter by team, division, league games or status.`,
  alternates: { canonical: '/schedule' },
  openGraph: {
    ...OG_BASE,
    ...ROOT_OG_IMAGE,
    url: '/schedule',
    title: 'Schedule & results — SCVAL Field Hockey',
    description: `All ${counts.total} contests, date by date, with scores as they are reported.`,
  },
};

export default function SchedulePage() {
  const groups = getGamesByDate();
  const dates = groups.map((group) => group.date);
  const today = getToday();
  // shortName, not name: "St. Ignatius College Preparatory" is 31 characters in a 176px control,
  // and the short form is the one the standings table and every game row already use.
  const teams = getTeams().map((team) => ({
    slug: team.slug,
    name: team.shortName,
    division: team.division,
  }));
  const fixtures = getOfficialFixtures();
  const span =
    dates.length > 0 ? `${monthDay(dates[0])} – ${monthDay(dates[dates.length - 1])}` : null;

  return (
    <div className="pb-10 [--sx-sticky-stack:var(--spacing-topbar)] md:[--sx-sticky-stack:calc(var(--spacing-topbar-lg)+4.5rem)]">
      <h1 className="mt-3 mb-1 text-h1 font-semibold text-ink">Schedule &amp; results</h1>
      {span ? (
        <p className="m-0 mb-2 text-meta text-ink-3">
          {span} &middot; every contest, league and non-league, oldest first
        </p>
      ) : null}

      <Suspense
        fallback={
          <p className="sx-num m-0 border-b border-hairline py-2 text-meta text-ink-2">
            {unfilteredCountLine(counts)}
          </p>
        }
      >
        <ScheduleFilters teams={teams} counts={counts} listId="schedule-list" />
      </Suspense>

      <TimelineRail
        dates={dates}
        today={today}
        className="-mx-gutter border-b border-hairline px-gutter md:mx-0 md:px-0"
      />

      <ScheduleList id="schedule-list" groups={groups} />

      {fixtures.length > 0 ? (
        <section className="mt-8">
          <SectionHeader kicker="Scheduled by SCVAL, not reported" />
          <OfficialFixtures fixtures={fixtures} />
        </section>
      ) : null}

      <section className="mt-8">
        <SectionHeader kicker="How to read this page" />
        <ul className="m-0 max-w-[62ch] list-disc space-y-1 pl-5 text-meta text-ink-2">
          <li>
            Standings count league games only. A non-league game carries the <code>NL</code> tag and
            a 2px left rule; it counts in a team&rsquo;s overall record and nowhere else.
          </li>
          <li>
            A real <span className="sx-num">0</span> shows as <span className="sx-num">0</span> in
            full-strength ink. A score we do not have shows as a dash &mdash; never{' '}
            <span className="sx-num">0-0</span>.
          </li>
          <li>
            <span className="font-mono text-kicker font-semibold tracking-[0.10em] uppercase">
              score not reported
            </span>{' '}
            means the game was played and MaxPreps has not posted a score yet. It counts for nothing
            until it does.
          </li>
          <li>
            Every date and time is Pacific, formatted when the site was built. Tap a game to expand
            its venue, stream, ticket and box-score links; tap a date&rsquo;s{' '}
            <span className="whitespace-nowrap">share &rarr;</span> to open that day on its own page.
          </li>
        </ul>
        {/* `sx-action`: alone in its own paragraph, so the 24px floor rather than the 17px the
            type around it would give (WCAG 2.5.8; see app/globals.css). */}
        <p className="mt-3 mb-0 text-meta">
          <Link href="/about#conventions" className="sx-action text-accent hover:underline">
            Every rendering convention, in one table <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </section>
    </div>
  );
}
