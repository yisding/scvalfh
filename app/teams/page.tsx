import type { Metadata } from 'next';

import PageHeader from '@/components/layout/PageHeader';
import TeamTile from '@/components/teams/TeamTile';
import { buildTeamsIndex } from '@/components/teams/team-view';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '@/components/layout/site-url';
import { getCounts } from '@/lib/data';
import { DIVISION_LABELS, DIVISIONS } from '@/lib/season';

/**
 * /teams — "Find my school" (DESIGN §3.6).
 *
 * Fifteen card tiles, grouped by division and sorted alphabetically inside each one: 2-up below
 * 768px and 4-up from there. El Camino's eight fill every row (4×2 from 768px, 2×4 below) and De
 * Anza's seven leave one slot open on the last row; a 3-up tablet step left a slot open after
 * the last tile of both. 4-up starts at 768px, not 1024px, so every school fits one tablet
 * screen (2-up took two and a half); between 768 and 1023px the tile stacks its monogram over the
 * name (TeamTile) so a long name still gets the whole tile width. **All fifteen**: league membership is the repo's list from the official
 * SCVAL PDFs, not the feed's rows, and dropping a school because a source has no data for it is
 * the single worst bug this site could ship (DESIGN §12.1, R-6).
 *
 * There is no search box on purpose: 15 teams and ten pages, so this page beats one (DESIGN §1.2).
 */
export const metadata: Metadata = {
  title: 'Teams',
  description:
    'All 15 SCVAL girls varsity field hockey teams — De Anza and El Camino — with league records. Find your school.',
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
            record.
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
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4 md:gap-4">
              {tiles.map((data) => (
                <TeamTile key={data.team.slug} data={data} />
              ))}
            </ul>
          </section>
        );
      })}

      {/* The lede says what the page is; how it was made sits down here. The alignment sentence
          is why a school with no games in any source still has a tile. */}
      <p className="mt-section mb-0 max-w-prose text-meta text-ink-3">
        Records are league games only. A dash means no results have been reported yet. Division
        alignment comes from the official SCVAL schedules, so every member is listed even where a
        source has no games for it.
      </p>
    </div>
  );
}
