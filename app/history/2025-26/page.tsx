import type { Metadata } from 'next';
import Link from 'next/link';

import AwardsBlock from '@/components/about/AwardsBlock';
import HistoryStandingsTable from '@/components/about/HistoryStandingsTable';
import ExternalLink from '@/components/ui/ExternalLink';
import PageHeader from '@/components/layout/PageHeader';
import TeamMonogram from '@/components/ui/TeamMonogram';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import { getTeamBySlug } from '@/lib/data';
import {
  getHistoryAwards,
  getHistoryChampions,
  getHistorySeason,
  getHistorySources,
  getHistoryStandings,
} from '@/lib/history';
import { DIVISIONS, DIVISION_LABELS } from '@/lib/season';

/**
 * `/history/2025-26` (DESIGN §1.1, §3.9) — final standings for both divisions, both levels, plus
 * the all-league awards, built once from the two scval.com end-of-season PDFs
 * (`scripts/build-history.ts`). MaxPreps cannot serve a prior season at all — the year segment of
 * its league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so this page is
 * the only place last season's numbers live, and it is not part of the nightly snapshot.
 */
export const metadata: Metadata = {
  title: '2025-26 season archive',
  description:
    'Final SCVAL De Anza and El Camino girls varsity and JV field hockey standings and all-league awards from the 2025-26 season, from the official scval.com PDFs.',
  alternates: { canonical: '/history/2025-26' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/history/2025-26' },
};

export default function HistoryPage() {
  const season = getHistorySeason();
  const champions = getHistoryChampions();
  const sources = getHistorySources();

  return (
    <div>
      <PageHeader
        eyebrow="Archive · not part of the nightly snapshot"
        title={`${season} season archive`}
        description={
          <>
            Final varsity and JV standings and all-league awards for the Santa Clara Valley
            Athletic League&rsquo;s De Anza and El Camino field hockey divisions, taken directly
            from SCVAL&rsquo;s own end-of-season PDFs. This page is built once from those PDFs,
            not from the live MaxPreps snapshot the rest of the site uses — MaxPreps only ever
            serves the current season.
          </>
        }
      />

      {champions.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:mt-10">
          {champions.map(({ division, row }) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            return (
              <div key={division} className="sx-card p-5">
                <p className="m-0 text-micro font-medium text-ink-3">
                  {DIVISION_LABELS[division]} champion
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {team ? <TeamMonogram team={team} size={40} /> : null}
                  <p className="m-0 min-w-0 text-title text-ink">{row.name}</p>
                </div>
                <p className="mt-3 mb-0 text-meta text-ink-2">{row.leagueRecord} league record</p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-section grid gap-y-section md:mt-section-lg md:gap-y-section-lg lg:grid-cols-2 lg:gap-x-10">
      {DIVISIONS.map((division) => {
        const varsity = getHistoryStandings(division, 'varsity');
        const jv = getHistoryStandings(division, 'jv');
        const varsityAwards = getHistoryAwards(division, 'varsity');
        const jvAwards = getHistoryAwards(division, 'jv');
        const label = DIVISION_LABELS[division];
        return (
          <section
            key={division}
            className="min-w-0"
            id={division}
            aria-label={label}
          >
            {/* `nowrap` on the season: a season identifier is one token, and as a shrinkable
                flex child it broke at its own hyphen into "2025-" / "26" at 320px. */}
            <SectionHeader
              kicker={`${label} · varsity final standings`}
              meta={<span className="whitespace-nowrap">{season}</span>}
            />
            <HistoryStandingsTable
              rows={varsity}
              caption={`${label} varsity final standings, ${season}`}
              emptyLabel="No varsity standings were published for this division."
            />

            <SectionHeader kicker={`${label} · JV final standings`} className="mt-section" />
            <HistoryStandingsTable
              rows={jv}
              caption={`${label} JV final standings, ${season}`}
              emptyLabel="No JV standings were published for this division."
            />

            <SectionHeader kicker={`${label} · all-league awards, varsity`} className="mt-section" />
            <AwardsBlock awards={varsityAwards} levelLabel="Varsity" />

            <SectionHeader kicker={`${label} · all-league awards, JV`} className="mt-section" />
            <AwardsBlock awards={jvAwards} levelLabel="JV" />
          </section>
        );
      })}
      </div>

      <p className="mt-section max-w-prose text-meta text-ink-3 md:mt-section-lg">
        Source: scval.com &mdash;{' '}
        <ExternalLink href={sources.standingsPdf}>2025-26 final standings (PDF)</ExternalLink> and{' '}
        <ExternalLink href={sources.allLeaguePdf}>2025-26 all-league awards (PDF)</ExternalLink>.
        League record is each PDF&rsquo;s own W-L(-T) column; the PDF&rsquo;s overall-record
        column was empty for this season, so it renders as an em dash here rather than a guess.
        Full attribution and update details are on the{' '}
        <Link href="/about" className="text-accent hover:underline">
          About &amp; sources
        </Link>{' '}
        page.
      </p>
    </div>
  );
}
