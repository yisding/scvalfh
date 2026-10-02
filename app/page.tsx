import type { Metadata } from 'next';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeader from '@/components/ui/SectionHeader';
import LatestScores from '@/components/home/LatestScores';
import MiniStandings from '@/components/home/MiniStandings';
import MyTeamCard from '@/components/home/MyTeamCard';
import NextSlate from '@/components/home/NextSlate';
import PhaseLead from '@/components/home/PhaseLead';
import PlayoffsCard from '@/components/home/PlayoffsCard';
import { getHomeData } from '@/components/home/home-data';
import { OG_BASE } from '@/components/layout/site-url';
import { longDate, shortDate } from '@/lib/format';

/**
 * `/` — "What just happened, and when's the next one?" (DESIGN §3.1)
 *
 * Phone source order is the DOM order. From 768px the same nodes sit in a two-column grid (the two
 * division tables side by side, everything else full width), and from 1024px the grid becomes a
 * main column plus a side column, re-placed with explicit row/column starts. A screen reader and a
 * 400%-zoom reader both get the phone order: my team → what just happened → the tables → what's
 * next → CCS (DESIGN §10.5).
 *
 * Space separates the sections (40px phone, 56px from 768px); the page title and a one-line data
 * status open the page, so the as-of fact is read first rather than in a closing footnote.
 *
 * Everything on this page is read through `lib/data.ts` and formatted in America/Los_Angeles from
 * `snapshot.fetchedAt`; no page calls `Date.now()`, so the build is reproducible and the header's
 * "as of" stamp is the only clock on the site. There is no `searchParams` in this signature, which
 * is what keeps the route static.
 */
export const metadata: Metadata = {
  description:
    'Scores, standings and CCS playoff picture for the 15 SCVAL girls varsity field hockey teams — De Anza and El Camino divisions. Unofficial, updated nightly.',
  alternates: { canonical: '/' },
  openGraph: { ...OG_BASE, url: '/' },
};

/**
 * The grid. Every class string is a whole literal (joined, never glued to a `${…}`), so Tailwind's
 * scanner sees each one.
 *
 * The side column is 24rem at 1024–1279 and 22–26rem from 1280: at 1024 a 26rem side column left
 * the main one 520px, which made the two latest-score cards 252px each and wrapped their time and
 * status lines ("4:00 / PM", "SCORE NOT / REPORTED"). At 24rem the main column is 552px (cards
 * 268px) and the side one keeps the 375px the mini tables need to draw their GD bars.
 */
const GRID = [
  'mt-8 flex flex-col gap-y-section md:mt-10 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-section-lg',
  'lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-10',
  'xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]',
].join(' ');

/**
 * The two lg column stacks. Below lg each wrapper is `display: contents`, so its sections are
 * ordinary items of the md grid (and of the phone flex column); from lg each is ONE grid item that
 * stacks its sections at the section gap. That keeps the two columns' rhythms independent: with
 * every section a separate grid item, De Anza shared a row with My team and sat 127px above El
 * Camino instead of 56. The DOM order is unchanged.
 *
 * lg placement: rows are `auto auto 1fr`. Row 1 is the division tables (the side stack), row 3 is
 * Next; my team + latest span rows 1–2, CCS spans 2–3. Row 2 has no item of its own, so the main
 * stack's overhang goes to it alone (an empty auto track has no growth limit yet when spanning
 * items are placed) and row 1 stays the side stack's height: CCS starts one section gap under El
 * Camino and Next one gap under the latest scores. Row 3 is the flexible one: CCS crosses it, so
 * CCS is sized in the flex step and a CCS card taller than Next lengthens row 3 BELOW Next instead
 * of pushing Next down (it is about 500px at 1024, where the side column is narrow).
 */
const MAIN_STACK =
  'contents lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-y-section-lg';
const SIDE_STACK = 'contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-y-section-lg';
/** Full width in the md two-column grid, one column again at lg. */
const WIDE = 'md:col-span-2 lg:col-span-1';

export default function HomePage() {
  const data = getHomeData();
  const { latest, unreported, slate, divisions, teamViews } = data;
  const [deAnza, elCamino] = divisions;

  // The latest day ANY result was reported, across both divisions — which is what the status line
  // under the title is about. The two standings captions do NOT use it; each mini table names its own
  // division's last league result (components/home/MiniStandings.tsx).
  const asOfResults = latest?.date ?? data.today;

  return (
    <div className="pb-section-lg">
      <PageHeader
        title="SCVAL field hockey"
        srTitle=" — girls varsity scores, standings and the CCS playoff picture"
        meta={
          <p className="m-0 text-meta text-ink-2">
            Results through {shortDate(asOfResults)} &middot; {teamViews.length} teams &middot; De
            Anza and El Camino
          </p>
        }
      />

      <PhaseLead
        phase={data.phase}
        today={data.today}
        firstGame={data.firstGame}
        firstLeagueGame={data.firstLeagueGame}
        nonLeagueFinals={data.nonLeagueFinals}
        crossoverDate={data.crossover.date}
        keyDates={data.playoffs.keyDates}
      />

      <div className={GRID}>
        <div className={MAIN_STACK}>
          {/* 1 — my team, or the picker. Same reserved height in every state, so CLS is 0. */}
          <section className={WIDE}>
            {/* The heading is MyTeamCard's own: only it knows whether a team is pinned, and the
                action link's wording depends on that (components/home/MyTeamCard.tsx). */}
            <MyTeamCard views={teamViews} />
          </section>

          {/* 2 — a day that was played and reported nothing is shown, not hidden (DESIGN §8). */}
          {unreported ? (
            <LatestScores
              className={WIDE}
              kicker="Played, not reported"
              date={unreported.date}
              games={unreported.games}
              total={unreported.total}
              note={`${unreported.total} ${
                unreported.total === 1 ? 'game was' : 'games were'
              } on the schedule for ${longDate(unreported.date)} and no score has been reported ${
                unreported.total === 1 ? 'for it' : 'for any of them'
              }. Scores usually appear the next morning. The results below are from ${
                latest ? longDate(latest.date) : 'an earlier day'
              }.`}
            />
          ) : null}

          {/* 3 — the most recent day that actually has results, always named by its date. */}
          {latest ? (
            <LatestScores
              className={WIDE}
              date={latest.date}
              games={latest.games}
              total={latest.total}
            />
          ) : (
            <section className={WIDE}>
              <SectionHeader
                kicker="Latest scores"
                action={{ href: '/schedule', label: 'Full schedule' }}
              />
              <EmptyState
                heading="No results yet."
                action={{ href: '/schedule', label: 'Full schedule' }}
              >
                {data.firstGame
                  ? `The first games are ${longDate(data.firstGame)}. Scores appear here the morning after they are played.`
                  : 'Scores appear here the morning after a game is played.'}
              </EmptyState>
            </section>
          )}
        </div>

        {/* 4 & 5 — both divisions, top four each, side by side at md. De Anza first. */}
        <div className={SIDE_STACK}>
          <MiniStandings division={deAnza} />
          <MiniStandings division={elCamino} showLegend />
        </div>

        {/* 6 — today's remaining slate, or the next day that has one. */}
        <NextSlate
          className={`${WIDE} lg:col-start-1 lg:row-start-3`}
          date={slate?.date ?? null}
          games={slate?.games ?? []}
          total={slate?.total ?? 0}
          isToday={slate?.isToday ?? false}
          kicker={latest ? undefined : 'First games'}
        />

        {/* 7 — the CCS berth math, with no model and no percentages. */}
        <PlayoffsCard
          className={`${WIDE} lg:col-start-2 lg:row-span-2 lg:row-start-2`}
          playoffs={data.playoffs}
          phase={data.phase}
          crossover={data.crossover}
        />
      </div>
    </div>
  );
}
