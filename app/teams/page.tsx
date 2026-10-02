import type { Metadata } from 'next';

import PageHeader from '@/components/layout/PageHeader';
import TeamTile from '@/components/teams/TeamTile';
import { buildTeamsIndex } from '@/components/teams/team-view';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import { getCounts, getFetchedAt } from '@/lib/data';
import { formatStamp } from '@/lib/format';
import { DIVISION_LABELS, DIVISIONS } from '@/lib/season';

/**
 * /teams — "Find my school" (DESIGN §3.6).
 *
 * Sixteen card tiles, grouped by division and sorted alphabetically inside each one: 2-up on a
 * phone, 3-up from 640px and 4-up from 1024px, so each division is two rows of four on desktop.
 * 768–1023 stays 3-up: four 168px tiles there clipped "Presentation" mid-word (TeamTile).
 * **All sixteen**, Wilcox included: league membership is the
 * repo's list from the official SCVAL PDFs, not the feed's seven De Anza rows, and dropping a
 * school because a source has no data for it is the single worst bug this site could ship
 * (DESIGN §12.1, R-6).
 *
 * There is no search box on purpose: 16 teams and ten pages, so this page beats one (DESIGN §1.2).
 */
export const metadata: Metadata = {
  title: 'Teams',
  description:
    'All 16 SCVAL girls varsity field hockey teams — De Anza and El Camino — with league records. Find your school.',
  alternates: { canonical: '/teams' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/teams' },
};

export default function TeamsPage() {
  const counts = getCounts();
  return (
    <div className="pb-section-lg">
      <PageHeader
        title="Teams"
        description={
          <>
            All {counts.teams} schools in the two SCVAL divisions, with each team&rsquo;s league
            record. Division alignment comes from the official SCVAL schedules, so every member is
            listed even where a source has no games for it.
          </>
        }
      />

      {DIVISIONS.map((division, index) => {
        const tiles = buildTeamsIndex(division);
        return (
          <section
            key={division}
            id={division}
            className={index === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
          >
            <SectionHeader
              kicker={DIVISION_LABELS[division]}
              meta={`${tiles.length} teams`}
              action={{ href: `/standings#${division}`, label: 'Standings' }}
            />
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {tiles.map((data) => (
                <TeamTile key={data.team.slug} data={data} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-section mb-0 max-w-prose text-meta text-ink-3">
        Records are league games only, computed from published results as of{' '}
        {formatStamp(getFetchedAt())}. A team with no results reported shows an em dash rather
        than 0-0-0.
      </p>
    </div>
  );
}
