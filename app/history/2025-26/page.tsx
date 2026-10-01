import type { Metadata } from 'next';
import Link from 'next/link';

import AwardsBlock from '@/components/about/AwardsBlock';
import HistoryStandingsTable from '@/components/about/HistoryStandingsTable';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import StatTile from '@/components/ui/StatTile';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
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
    <div className="py-6 md:py-10">
      <p className="m-0 font-mono text-kicker font-semibold tracking-[0.10em] text-ink-3 uppercase">
        Archive &middot; not part of the nightly snapshot
      </p>
      <h1 className="mt-1 mb-0 text-h1 text-ink">{season} season archive</h1>
      <p className="mt-2 mb-0 max-w-[62ch] text-body text-ink-2">
        Final varsity and JV standings and all-league awards for the Santa Clara Valley Athletic
        League&rsquo;s De Anza and El Camino field hockey divisions, taken directly from
        SCVAL&rsquo;s own end-of-season PDFs. This page is built once from those PDFs, not from
        the live MaxPreps snapshot the rest of the site uses — MaxPreps only ever serves the
        current season.
      </p>

      {/* A SUBGRID 2-up, not two independent stacks. These tiles carry a school NAME where every
          other `StatTile` on the site carries a number, so at 320px one of the two wraps to a
          second line and the other does not — "St. Ignatius" over two lines beside "Los Gatos" on
          one. With each tile stacking on its own that pushed its DE ANZA CHAMPION kicker and its
          "11-0-1 league record" a whole line below El Camino's, and a 2-up whose two halves share
          no baseline reads as broken. `grid-rows-subgrid` puts both tiles on the parent's three
          rows instead, so the name block is as tall as the taller of the two and the kicker and
          record lines always align. (It works because these tiles pass no `href`: with one,
          `StatTile` wraps its three spans in a `<Link>` and they are no longer grid items.) */}
      {champions.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 grid-rows-[auto_auto_auto] gap-x-6 gap-y-4 border-t border-hairline pt-4">
          {champions.map(({ division, row }) => (
            <StatTile
              key={division}
              label={`${DIVISION_LABELS[division]} champion`}
              value={row.name}
              sub={`${row.leagueRecord} league record`}
              className="row-span-3 grid grid-rows-subgrid"
            />
          ))}
        </div>
      ) : null}

      {DIVISIONS.map((division) => {
        const varsity = getHistoryStandings(division, 'varsity');
        const jv = getHistoryStandings(division, 'jv');
        const varsityAwards = getHistoryAwards(division, 'varsity');
        const jvAwards = getHistoryAwards(division, 'jv');
        const label = DIVISION_LABELS[division];
        return (
          <section
            key={division}
            className="mt-10"
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

            <SectionHeader kicker={`${label} · JV final standings`} className="mt-8" />
            <HistoryStandingsTable
              rows={jv}
              caption={`${label} JV final standings, ${season}`}
              emptyLabel="No JV standings were published for this division."
            />

            <SectionHeader kicker={`${label} · all-league awards, varsity`} className="mt-8" />
            <AwardsBlock awards={varsityAwards} levelLabel="Varsity" />

            <SectionHeader kicker={`${label} · all-league awards, JV`} className="mt-8" />
            <AwardsBlock awards={jvAwards} levelLabel="JV" />
          </section>
        );
      })}

      <p className="mt-10 max-w-[62ch] border-t border-hairline pt-4 text-meta text-ink-3">
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
