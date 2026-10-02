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
 * main column plus a 22–26rem side column, re-placed with explicit row/column starts. A screen
 * reader and a 400%-zoom reader both get the phone order: my team → what just happened → the
 * tables → what's next → CCS (DESIGN §10.5).
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
    'Scores, standings and CCS playoff picture for the 16 SCVAL girls varsity field hockey teams — De Anza and El Camino divisions. Unofficial, updated nightly.',
  alternates: { canonical: '/' },
  openGraph: { ...OG_BASE, url: '/' },
};

/** Literal class strings, so Tailwind's scanner sees every placement it has to generate. */
const ROW = [
  'lg:row-start-1',
  'lg:row-start-2',
  'lg:row-start-3',
  'lg:row-start-4',
] as const;
const LEFT = 'lg:col-start-1';
const RIGHT = 'lg:col-start-2';
/** Full width in the md two-column grid, back to one column at lg. */
const WIDE = 'md:col-span-2 lg:col-span-1';

export default function HomePage() {
  const data = getHomeData();
  const { latest, unreported, slate, divisions, teamViews } = data;
  const [deAnza, elCamino] = divisions;

  // lg placement. The side column (De Anza, El Camino, CCS) is much shorter than the main one,
  // so the scores block spans two rows and CCS starts in the second of them, right under El
  // Camino, instead of waiting below the scores. The third row is `1fr`: an item that spans a
  // flexible track is sized in the flex step, so the spans grow that row only and never pad the
  // El Camino row. A played day that reported nothing pushes the scores down a row (DESIGN §8);
  // CCS then starts beside them.
  const latestRow = unreported ? ROW[2] : `${ROW[1]} lg:row-span-2`;
  const nextRow = ROW[3];
  const ccsRow = `${ROW[2]} lg:row-span-2`;
  const rows = unreported ? '' : ' lg:grid-rows-[auto_auto_1fr_auto]';
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

      <div
        className={`mt-8 flex flex-col gap-y-section md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-section-lg lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:items-start lg:gap-x-10${rows}`}
      >
        {/* 1 — my team, or the picker. Same reserved height in every state, so CLS is 0. */}
        <section className={`${WIDE} ${LEFT} ${ROW[0]}`}>
          {/* The heading is MyTeamCard's own: only it knows whether a team is pinned, and the
              action link's wording depends on that (components/home/MyTeamCard.tsx). */}
          <MyTeamCard views={teamViews} />
        </section>

        {/* 2 — a day that was played and reported nothing is shown, not hidden (DESIGN §8). */}
        {unreported ? (
          <LatestScores
            className={`${WIDE} ${LEFT} ${ROW[1]}`}
            kicker="Played, not reported"
            date={unreported.date}
            games={unreported.games}
            total={unreported.total}
            note={`${unreported.total} ${
              unreported.total === 1 ? 'game was' : 'games were'
            } on the schedule for ${longDate(
              unreported.date,
            )} and no score has been reported ${
              unreported.total === 1 ? 'for it' : 'for any of them'
            }. Scores usually appear the next morning. The results below are from ${
              latest ? longDate(latest.date) : 'an earlier day'
            }.`}
          />
        ) : null}

        {/* 3 — the most recent day that actually has results, always named by its date. */}
        {latest ? (
          <LatestScores
            className={`${WIDE} ${LEFT} ${latestRow}`}
            date={latest.date}
            games={latest.games}
            total={latest.total}
          />
        ) : (
          <section className={`${WIDE} ${LEFT} ${latestRow}`}>
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

        {/* 4 & 5 — both divisions, top four each, side by side at md. De Anza first. */}
        <MiniStandings className={`${RIGHT} ${ROW[0]}`} division={deAnza} />
        <MiniStandings className={`${RIGHT} ${ROW[1]}`} division={elCamino} showLegend />

        {/* 6 — today's remaining slate, or the next day that has one. */}
        <NextSlate
          className={`${WIDE} ${LEFT} ${nextRow}`}
          date={slate?.date ?? null}
          games={slate?.games ?? []}
          total={slate?.total ?? 0}
          isToday={slate?.isToday ?? false}
          kicker={latest ? undefined : 'First games'}
        />

        {/* 7 — the CCS berth math, with no model and no percentages. */}
        <PlayoffsCard
          className={`${WIDE} ${RIGHT} ${ccsRow}`}
          playoffs={data.playoffs}
          phase={data.phase}
          crossover={data.crossover}
        />
      </div>
    </div>
  );
}
