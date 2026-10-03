import type { Metadata } from 'next';
import Link from 'next/link';

import AwardsBlock from '../../../components/about/AwardsBlock';
import HistoryStandingsTable from '../../../components/about/HistoryStandingsTable';
import ExternalLink from '../../../components/ui/ExternalLink';
import PageHeader from '../../../components/layout/PageHeader';
import DivisionTabs from '../../../components/standings/DivisionTabs';
import TeamMonogram from '../../../components/ui/TeamMonogram';
import SectionHeader from '../../../components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site-url';
import { getTeamBySlug } from '../../../lib/data';
import {
  getHistoryAwards,
  getHistoryChampions,
  getHistorySeason,
  getHistorySources,
  getHistoryStandings,
} from '../../../lib/history';
import { HISTORY_LEAGUE, divisionsOf, getLeague } from '../../../lib/leagues';

/**
 * `/history/2025-26` (DESIGN §1.1, §3.9; SPEC §10.8) — SCVAL ONLY: final standings for both
 * divisions, both levels, plus the all-league awards, built once from the two scval.com
 * end-of-season PDFs
 * (`scripts/build-history.ts`). MaxPreps cannot serve a prior season at all — the year segment of
 * its league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so this page is
 * the only place last season's numbers live, and it is not part of the nightly snapshot.
 *
 * No other league has a prior season here, so the page is labelled with the league everywhere
 * and reads its divisions from `divisionsOf(HISTORY_LEAGUE)` (never every division on the site).
 *
 * The header says only what a reader needs before the tables (what this is, where it came from,
 * that it does not change, and that no other league has one) in a short lede; the provenance
 * detail (built once, why not MaxPreps, why there is no overall record) sits in the source note at
 * the foot. A long lede here pushed the first standings row under the phone tab bar.
 */
const HISTORY = getLeague(HISTORY_LEAGUE);
const DIVISIONS = divisionsOf(HISTORY_LEAGUE);
const PAGE_TITLE = `${HISTORY.shortName} 2025-26`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description:
    `Final ${HISTORY.shortName} ${DIVISIONS.map((d) => d.label).join(' and ')} girls varsity and JV field hockey standings and all-league awards from the 2025-26 season, from the official league PDFs.`,
  alternates: { canonical: '/history/2025-26' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/history/2025-26' },
};

export default function HistoryPage() {
  const season = getHistorySeason();
  const champions = getHistoryChampions();
  const sources = getHistorySources();
  const tabs = DIVISIONS.map((division) => ({
    href: `#${division.id}`,
    label: division.label,
  }));

  return (
    // The sticky table heads park under the 48px top bar plus the 48px jump bar on a phone
    // (6rem); from md the pills sit in the title row and do not stick.
    <div className="pb-section-lg [--sx-sticky-top:6rem] md:[--sx-sticky-top:var(--spacing-topbar-lg)]">
      <PageHeader
        eyebrow="Archive"
        title={`${HISTORY.shortName} ${season}`}
        description={
          <>
            Final varsity and JV standings and all-league awards from {HISTORY.shortName}&rsquo;s
            end-of-season PDFs. This page doesn&rsquo;t change. Prior-season results are available
            for {HISTORY.shortName} only.
          </>
        }
        aside={<DivisionTabs variant="inline" tabs={tabs} label="Jump to a division" />}
        asideClassName="hidden md:block lg:hidden"
      />

      {/* Jump bar: a long page (about 13,000px on a phone) with two divisions to reach. Sticky
          under the top bar below md; at md the pills sit in the title row; at lg both divisions
          are on screen side by side and neither is shown. */}
      <DivisionTabs variant="bar" tabs={tabs} label="Jump to a division" className="mt-4" />

      {champions.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 md:mt-10">
          {champions.map(({ division, row }) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            return (
              // Monogram on the left spanning three short lines, so the pair is ~190px tall on a
              // phone instead of ~300 and the first standings row stays near the first screen.
              <div
                key={division}
                className="sx-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 sm:p-5"
              >
                {team ? <TeamMonogram team={team} size={40} /> : null}
                <div className="col-start-2 min-w-0">
                  <p className="m-0 text-micro font-medium text-ink-3">
                    {DIVISIONS.find((d) => d.id === division)?.label ?? division} champion
                  </p>
                  <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{row.name}</p>
                  <p className="m-0 mt-0.5 text-meta text-ink-2">{row.leagueRecord} league record</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* From lg the two divisions sit side by side and share eight row tracks (subgrid): each
          section's four headings and four blocks are its direct grid items, so the JV heading,
          the awards headings and the First/Second team labels line up across the pair even
          though El Camino's varsity table has one more row than De Anza's. Below lg the sections
          simply stack. */}
      <div className="mt-section grid gap-y-section md:mt-section-lg md:gap-y-section-lg lg:grid-cols-2 lg:grid-rows-[repeat(8,auto)] lg:gap-x-10 lg:gap-y-0">
      {DIVISIONS.map(({ id: division, label }) => {
        const varsity = getHistoryStandings(division, 'varsity');
        const jv = getHistoryStandings(division, 'jv');
        const varsityAwards = getHistoryAwards(division, 'varsity');
        const jvAwards = getHistoryAwards(division, 'jv');
        return (
          <section
            key={division}
            className="min-w-0 lg:row-span-8 lg:grid lg:grid-rows-subgrid"
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
        This page is built once from those PDFs, not from the live MaxPreps snapshot the rest of
        the site uses &mdash; MaxPreps only ever serves the current season.{' '}
        {HISTORY.shortName}&rsquo;s final PDFs list league records only; their overall-record
        column was empty for this season.
        Full attribution and update details are on the{' '}
        <Link href="/about" className="text-accent hover:underline">
          About &amp; sources
        </Link>{' '}
        page.
      </p>
    </div>
  );
}
