import type { Metadata } from 'next';

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
 * Phone source order is the DOM order, and the ≥900px two-column grid re-places the same nodes with
 * explicit row/column starts, so a screen reader and a 400%-zoom reader both get the phone order:
 * my team → what just happened → the tables → what's next → CCS (DESIGN §10.5).
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

/** Literal class strings, so Tailwind's scanner sees every row placement it has to generate. */
const ROW = [
  'min-[900px]:row-start-1',
  'min-[900px]:row-start-2',
  'min-[900px]:row-start-3',
  'min-[900px]:row-start-4',
] as const;
const LEFT = 'min-[900px]:col-start-1';
const RIGHT = 'min-[900px]:col-start-2';

export default function HomePage() {
  const data = getHomeData();
  const { latest, unreported, slate, divisions, teamViews } = data;
  const [deAnza, elCamino] = divisions;

  // The scores column shifts down a row when a played day reported nothing (DESIGN §8).
  const latestRow = unreported ? ROW[2] : ROW[1];
  const nextRow = unreported ? ROW[3] : ROW[2];
  // The latest day ANY result was reported, across both divisions — which is what the closing note
  // below is about. The two standings captions do NOT use it; each mini table names its own
  // division's last league result (components/home/MiniStandings.tsx).
  const asOfResults = latest?.date ?? data.today;

  return (
    <div className="pt-4 pb-8">
      <h1 className="sr-only">
        SCVAL girls varsity field hockey — scores, standings and the CCS playoff picture
      </h1>

      <PhaseLead
        phase={data.phase}
        today={data.today}
        firstGame={data.firstGame}
        firstLeagueGame={data.firstLeagueGame}
        nonLeagueFinals={data.nonLeagueFinals}
        crossoverDate={data.crossover.date}
        keyDates={data.playoffs.keyDates}
      />

      <div className="flex flex-col gap-8 min-[900px]:grid min-[900px]:grid-cols-[2fr_1fr] min-[900px]:items-start min-[900px]:gap-x-6 min-[900px]:gap-y-12">
        {/* 1 — my team, or the picker. Same reserved height in every state, so CLS is 0. */}
        <section className={`${LEFT} ${ROW[0]}`}>
          {/* The kicker is MyTeamCard's own: only it knows whether a team is pinned, and the
              action link's wording depends on that (components/home/MyTeamCard.tsx). */}
          <MyTeamCard views={teamViews} />
        </section>

        {/* 2 — a day that was played and reported nothing is shown, not hidden (DESIGN §8). */}
        {unreported ? (
          <LatestScores
            className={`${LEFT} ${ROW[1]}`}
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
            className={`${LEFT} ${latestRow}`}
            date={latest.date}
            games={latest.games}
            total={latest.total}
          />
        ) : (
          <section className={`${LEFT} ${latestRow}`}>
            <SectionHeader kicker="Latest scores" action={{ href: '/schedule', label: 'schedule' }} />
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

        {/* 4 & 5 — both divisions, top four each. De Anza first. */}
        <MiniStandings className={`${RIGHT} ${ROW[0]}`} division={deAnza} />
        <MiniStandings className={`${RIGHT} ${ROW[1]}`} division={elCamino} />

        {/* 6 — today's remaining slate, or the next day that has one. */}
        <NextSlate
          className={`${LEFT} ${nextRow}`}
          date={slate?.date ?? null}
          games={slate?.games ?? []}
          total={slate?.total ?? 0}
          isToday={slate?.isToday ?? false}
          kicker={latest ? undefined : 'First games'}
        />

        {/* 7 — the CCS berth math, with no model and no percentages. */}
        <PlayoffsCard
          className={`${RIGHT} ${ROW[2]}`}
          playoffs={data.playoffs}
          phase={data.phase}
          crossover={data.crossover}
        />
      </div>

      <p className="mt-8 mb-0 max-w-[62ch] text-meta text-ink-3">
        Records are computed from published game results, not copied from a standings table, and
        every number on this page is as of {shortDate(asOfResults)} Pacific.
      </p>
    </div>
  );
}
