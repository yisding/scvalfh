import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import { RegionSwitcher } from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import SeasonCalendar from '@/components/schedule/SeasonCalendar';
import BetweenRegions from '@/components/scores/BetweenRegions';
import DayNav from '@/components/scores/DayNav';
import JvDayBlocks from '@/components/scores/JvDayBlocks';
import RegionDayBlock from '@/components/scores/RegionDayBlock';
import EmptyState from '@/components/ui/EmptyState';
import { shortDate } from '@/lib/format/dates';
import { gameWord } from '@/lib/format/words';
import { scoresStaticParams } from '@/views/scores/scores-route';
import { buildScoresDayView } from '@/views/scores/scores-view';
import { missingMetadata, pageMetadata } from '@/views/site/page-metadata';

/**
 * `/scores/[date]` — one day's slate (DESIGN §1.1, §3.4).
 *
 * One prerendered page per date that actually has a contest (one per game date in the snapshot),
 * which is what makes the "Day page" link on every schedule date header a real URL instead of a
 * clipboard trick. Unknown dates `notFound()` rather than rendering an empty day, because an empty
 * day and a day with no games are different claims and only one of them is true.
 *
 * The previous / next day pills step through dates that HAVE contests, not calendar neighbours:
 * a link to an empty Sunday would be a dead end. "Pick a date" (SeasonCalendar) jumps straight to
 * any of them, every league's days included, and links only the days that have contests for the
 * same reason.
 *
 * Grouped by region, then by league (SPEC §10.4; DESIGN §24.3), the shape of the other index pages:
 *  - `<section id="norcal" data-region-scope="norcal">`, h2 "Northern California": one h3 group per
 *    NorCal league — its counted league games and its postseason games, `<SHORT> · <n> league games`
 *    — then `Non-league · <n>` for games between two NorCal teams or a NorCal team and a team outside
 *    the registry; then that region's moved-game note and its leagues' unreported official fixtures;
 *  - only on a day that has one, `<section id="between-regions">`, unscoped (shown in both views), h2
 *    "NorCal vs SoCal": the games with a registry side in each region, never repeated in a region block;
 *  - `<section id="socal" data-region-scope="socal">`, h2 "Southern California", the same for SoCal,
 *    its repeated ids suffixed `-socal` (`#non-league-socal`; DESIGN-socal §2.4).
 * A game appears once (day-summary.ts dayRegions). A region with no game that day still renders its
 * block, with one EmptyState sentence, so a reader in that region never meets an empty page. Without
 * JS both blocks render, NorCal first; the region switcher under the header picks one.
 *
 * The unreported official fixtures of the day are one block per league, inside its region: on a past
 * day `Scheduled by <SHORT>, not reported` (SPEC §10.4); today and on a day still to come, more of
 * the day ("Also on <SHORT>’s schedule for this day…"), never a missing result. The day's JV games
 * (lib/queries/jv.ts) come last, one block per region (`#jv`, `#jv-socal`), each region-scoped and omitted
 * when empty, never mixed into a league group or a varsity count.
 *
 * The header's badges and the meta description count each region (a NorCal vs SoCal game in both,
 * as on /schedule's every-day rows) only when both regions have a game; a one-region day keeps the
 * whole-day forms it always had.
 */
/** Every date with a contest is prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams(): { date: string }[] {
  return scoresStaticParams();
}

export async function generateMetadata({
  params,
}: PageProps<'/scores/[date]'>): Promise<Metadata> {
  const { date } = await params;
  const view = buildScoresDayView(date);
  if (!view) return missingMetadata('Day not found');
  return pageMetadata({
    path: `/scores/${date}`,
    title: view.title,
    description: view.description,
    ogTitle: view.title,
    ogDescription: view.description,
    card: 'own',
  });
}

export default async function ScoresByDatePage({ params }: PageProps<'/scores/[date]'>) {
  const { date } = await params;
  const view = buildScoresDayView(date);
  if (!view) notFound();
  const { games, summary, today, dates, between, regionBlocks, jvBlocks, year } = view;

  return (
    <div className="pb-section-lg">
      <PageHeader
        // What the page is, above the date the h1 names: the h1 alone ("Thursday, September 24,
        // 2026") never said which sport's scores these are.
        eyebrow="Girls varsity field hockey scores"
        title={
          <time dateTime={date}>
            {/* The trailing space keeps the h1's text content "Thursday, Sep 24 Thursday, September
                24, 2026" rather than one run-on string for a reader of the raw text (a crawler); it
                collapses at the end of the line on screen. */}
            <span aria-hidden="true" className="md:hidden">
              {view.shortTitle}{' '}
            </span>
            <span className="sr-only md:not-sr-only">
              {view.longTitle}, {year}
            </span>
          </time>
        }
        // Sans with tabular figures, not `.sx-num` mono: these are short phrases ("3 final scores"),
        // not a column of digits (DESIGN §4.3).
        meta={view.badges.map((badge) => (
          <span key={badge.key} data-region-scope={badge.region} className="sx-badge tabular-nums">
            {badge.text}
          </span>
        ))}
        aside={<DayNav {...view} />}
      />

      {/* The region control, its own row under the header, as on the other index pages (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Its own block under the header, closed by default so the day's games stay in the fold.
          Every league's game days: the day page is all-league. */}
      <SeasonCalendar dates={dates} current={date} className="mt-4 md:mt-6" />

      {view.nothingReportedYet ? (
        <p className="sx-inset mt-6 mb-0 max-w-prose text-ink">
          {summary.total} {gameWord(summary.total)} {summary.total === 1 ? 'is' : 'are'} on the
          schedule for {shortDate(date)} and no score has been reported yet. Coaches enter results by
          hand, so a game that finishes in the evening usually appears the next morning.
        </p>
      ) : null}

      {games.length > 0 ? (
        <>
          {regionBlocks.map((block, i) => (
            <Fragment key={block.region.id}>
              {/* The NorCal vs SoCal block sits between the two regions: after NorCal's, before SoCal's. */}
              {i === 1 && between.length > 0 ? <BetweenRegions {...view} /> : null}
              <RegionDayBlock {...block} date={date} today={today} />
            </Fragment>
          ))}
        </>
      ) : (
        <div className="mt-8 md:mt-10">
          <EmptyState heading="No games on this date." />
        </div>
      )}

      <JvDayBlocks jvBlocks={jvBlocks} />

      {/* One always-visible line under the day's games instead of a caption plus a "How scores
          are shown" disclosure: the zone every time here is in, the two states a reader can
          mistake for each other, the si.com mark, and the full table. "Unofficial" is not
          repeated here; the footer says it on every page. The link sits inside the sentence, so
          it needs no 24px box of its own (WCAG 2.5.8's inline exception). */}
      <p className="mt-stack mb-0 max-w-prose text-meta text-ink-3">
        All times Pacific. A dash means no score has been reported;{' '}
        <span className="sx-num">0</span> is a real zero; a &dagger; marks a score published from
        si.com under the site&rsquo;s rules for missing or wrong scores.{' '}
        <Link href="/about#conventions" prefetch={false} className="text-accent">
          How every state is shown
        </Link>
      </p>
    </div>
  );
}
