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
 * main column plus a side column, each one stack placed in one grid row. A screen reader and a
 * 400%-zoom reader both get the phone order: my team → what just happened → what's still to play →
 * the tables → CCS (DESIGN §10.5). "Still to play" sits above the tables because on a game day it
 * is the second question the page answers, and below the two tables it was ~1,660px down a phone.
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
  'lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-10',
  'xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]',
].join(' ');

/**
 * The two lg column stacks. Below lg each wrapper is `display: contents`, so its sections are
 * ordinary items of the md grid (and of the phone flex column); from lg each is ONE grid item that
 * stacks its sections at the section gap. That keeps the two columns' rhythms independent: with
 * every section a separate grid item, De Anza shared a row with My team and sat 127px above El
 * Camino instead of 56. The DOM order is unchanged.
 *
 * lg placement: ONE row, two stacks. The main stack is my team → latest scores → still to play;
 * the side stack is De Anza → El Camino → CCS. Each section therefore starts one section gap under
 * the one above it in its own column, whatever the other column's height, which is what the old
 * three-row grid (Next in row 3, CCS spanning rows 2–3) was built to approximate.
 */
const MAIN_STACK = 'contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-y-section-lg';
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
          /* One line at 390: the division names wrapped "El Camino" alone onto a second line
             there, and both are named on the tables below. From 640px they fit and come back. */
          <p className="m-0 text-meta text-ink-2">
            Results through {shortDate(asOfResults)} &middot; {teamViews.length} teams
            <span className="hidden sm:inline"> &middot; De Anza and El Camino</span>
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
          {/* 1 — my team, or the picker. Its height does not change when storage is read (a floor
              while a team is pinned, the collapsed picker otherwise), so CLS is 0. */}
          <section className={WIDE}>
            {/* The heading is MyTeamCard's own, so the card and its header stay one unit
                (components/home/MyTeamCard.tsx). */}
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

          {/* 4 — today's remaining slate, or the next day that has one, plus when league play
              resumes if everything on it is non-league. */}
          <NextSlate
            className={WIDE}
            date={slate?.date ?? null}
            games={slate?.games ?? []}
            total={slate?.total ?? 0}
            isToday={slate?.isToday ?? false}
            kicker={latest ? undefined : 'First games'}
            nextLeague={data.nextLeague}
          />
        </div>

        {/* 5 & 6 — both divisions, top four each, side by side at md. De Anza first. Then 7, the
            CCS berth math, with no model and no percentages: full width at md, under the
            tables in the side column at lg. */}
        <div className={SIDE_STACK}>
          <MiniStandings division={deAnza} />
          <MiniStandings division={elCamino} showLegend />
          <PlayoffsCard
            className={WIDE}
            playoffs={data.playoffs}
            phase={data.phase}
            crossover={data.crossover}
          />
        </div>
      </div>
    </div>
  );
}
