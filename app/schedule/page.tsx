import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import OfficialFixtures from '@/components/schedule/OfficialFixtures';
import ScheduleFilters, { ScheduleFiltersFallback } from '@/components/schedule/ScheduleFilters';
import ScheduleList from '@/components/schedule/ScheduleList';
import TimelineRail from '@/components/schedule/TimelineRail';
import { countGames } from '@/components/schedule/filter-data';
import PageHeader from '@/components/layout/PageHeader';
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
    // `scroll-behavior: auto` on <html> while this page is mounted: a smooth scroll to a date
    // anchor renders the `content-visibility` groups it passes, their real heights replace the
    // estimates mid-flight, and the target slid out of view ("Today" landed on Oct 5 at 1280).
    // An instant jump lands exactly, as it already did for reduced-motion users.
    <div className="pb-section-lg [--sx-sticky-stack:var(--spacing-topbar)] md:[--sx-sticky-stack:var(--spacing-topbar-lg)] [html:has(&)]:[scroll-behavior:auto]">
      <PageHeader
        title="Schedule & results"
        description={
          span ? (
            <>
              {span} &middot; every contest, league and non-league, oldest first &middot; all
              times Pacific
            </>
          ) : undefined
        }
      />

      <Suspense
        fallback={<ScheduleFiltersFallback teams={teams} counts={counts} className="mt-6" />}
      >
        <ScheduleFilters teams={teams} counts={counts} listId="schedule-list" className="mt-6" />
      </Suspense>

      {/* Bled to the screen edge on a phone so the rail scrolls under the gutter, with the chips'
          own padding inside; 4px of room at desktop so no ring or focus outline is clipped. */}
      <TimelineRail dates={dates} today={today} className="mt-4 -mx-gutter md:-mx-1" />

      <ScheduleList id="schedule-list" groups={groups} />

      {fixtures.length > 0 ? (
        <section className="mt-section md:mt-section-lg">
          <SectionHeader kicker="Scheduled by SCVAL, not reported" />
          <OfficialFixtures fixtures={fixtures} />
        </section>
      ) : null}

      {/* The same width as the fixtures card above it, so the two end-of-page disclosures read
          as one kind of thing. */}
      <details className="sx-inset sx-disclosure mt-section max-w-3xl md:mt-section-lg">
        <summary>How to read this page (4 notes)</summary>
        <ul className="m-0 mt-2 list-disc space-y-2 pl-5">
          <li>
            Standings count league games only. A non-league game carries the <code>NL</code> tag
            and, on phone rows, a 2px left rule; it counts in a team&rsquo;s overall record and
            nowhere else.
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
            means the game was played and MaxPreps has not posted a score yet. It counts for nothing
            until it does.
          </li>
          <li>
            Every date and time is Pacific, formatted when the site was built. Tap a game to expand
            its venue, stream, ticket and box-score links; tap a date&rsquo;s Share link to open
            that day on its own page.
          </li>
        </ul>
        <p className="mt-3 mb-0">
          <Link href="/about#conventions" className="sx-action font-medium text-accent">
            Every rendering convention, in one table
          </Link>
        </p>
      </details>
    </div>
  );
}
