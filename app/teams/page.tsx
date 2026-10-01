import type { Metadata } from 'next';

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
 * Sixteen tiles, grouped by division and sorted alphabetically inside each one, 3-up on a phone,
 * 4-up at 768px and 8-up at 1120px. **All sixteen**, Wilcox included: league membership is the
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
    <div className="pt-3 pb-6">
      <h1 className="m-0 text-h1">Teams</h1>
      <p className="mt-1 mb-5 max-w-[62ch] text-meta text-ink-2">
        All {counts.teams} schools in the two SCVAL divisions, with each team&rsquo;s league
        record. Division alignment comes from the official SCVAL schedules, so every member is
        listed even where a source has no games for it.
      </p>

      {DIVISIONS.map((division) => {
        const tiles = buildTeamsIndex(division);
        return (
          <section
            key={division}
            id={division}
            className="mb-6"
          >
            <SectionHeader
              kicker={DIVISION_LABELS[division]}
              meta={`${tiles.length} teams`}
              action={{ href: `/standings#${division}`, label: 'standings' }}
            />
            <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 min-[1120px]:grid-cols-8">
              {tiles.map((data) => (
                <TeamTile key={data.team.slug} data={data} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-6 mb-0 max-w-[62ch] text-meta text-ink-3">
        Records are league games only, computed from published results as of{' '}
        {formatStamp(getFetchedAt())}. A team with no results reported shows an em dash rather
        than 0-0-0.
      </p>
    </div>
  );
}
