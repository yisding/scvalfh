import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueSwitcher from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site-url';
import TeamFinder from '../../components/search/TeamFinder';
import TeamTile from '../../components/teams/TeamTile';
import { buildTeamsByLeague, teamsLeagueChips } from '../../components/teams/team-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { getCounts, getTeamSearchIndex } from '../../lib/data';

/**
 * /teams — "Find my school" (DESIGN §3.6, SPEC §10.5, §9.3).
 *
 * All 43 teams, grouped section → league → division, each division's tiles sorted alphabetically:
 * 2-up below 768px and 4-up from there, so a league's teams fit one tablet screen; between 768 and
 * 1023px the tile stacks its monogram over the name (TeamTile) so a long name still gets the whole
 * tile width. **Every team**: league membership is the registry's list
 * from each league's official schedule, not the feed's rows, and dropping a school because a
 * source has no data for it is the single worst bug this site could ship (DESIGN §12.1, R-6).
 *
 * With JavaScript, `TeamFinder` (filter mode) sits above the list and toggles `hidden` on the
 * server-rendered tiles (`[data-team-tile]` on each `<li>`) and on any `[data-team-group]` wrapper
 * left empty, and hides the anchor-mode league switcher while a query is typed. Without
 * JavaScript the finder is not painted (`sx-js-only`) and the full grouped list IS the page; the
 * switcher's `#<league>` anchors work either way.
 *
 * Heading outline (SPEC §10.0): each section is a `<section aria-labelledby>` with an h2
 * (`Central Coast Section` / `North Coast Section`, `id="ccs"`/`"ncs"`) → each league an h3
 * (`id=<league>`, action `<SHORT> standings`) → each division a plain h4 (omitted for a
 * single-division league). The division wrapper carries the division id unless it equals the
 * league id (PCAL), so `#de-anza`, `#mt-hamilton` and `#marin-county` resolve and every id on the
 * page is unique (SPEC §8.1).
 *
 * One quiet line under the list links /clubs (DESIGN §16.1), which is not in the nav. It sits
 * outside `#team-list`, so the finder never hides it, and adds no heading and no group wrapper.
 */
export const metadata: Metadata = {
  title: 'Teams',
  description:
    'All 43 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section) and MCAL (North Coast Section), with league records. Find your school.',
  alternates: { canonical: '/teams' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/teams' },
};

export default function TeamsPage() {
  const counts = getCounts();
  const sections = buildTeamsByLeague();
  const { chips, hrefs } = teamsLeagueChips();

  return (
    <div className="pb-section-lg" data-teams-page="">
      <PageHeader
        title="Teams"
        description={`All ${counts.teams} girls varsity teams in SCVAL, BVAL and PCAL (Central Coast Section) and MCAL (North Coast Section). League and division alignment comes from each league’s official schedule.`}
      />

      {/* The finder is client-rendered on the server too, so its 48px field is in the first paint
          whenever JS runs (`html[data-js]` is stamped before paint); without JS it is not painted. */}
      <TeamFinder
        index={getTeamSearchIndex()}
        mode="filter"
        listId="team-list"
        hideWhileSearchingId="team-league-switcher"
        className="mt-6"
      />

      <div id="team-league-switcher" className="mt-4">
        <LeagueSwitcher mode="anchor" label="Leagues" leagues={chips} hrefs={hrefs} />
      </div>

      <div id="team-list">
        {sections.map((section, sectionIndex) => (
          <section
            key={section.id}
            aria-labelledby={section.id}
            data-team-group=""
            className={sectionIndex === 0 ? 'mt-8 md:mt-10' : 'mt-section md:mt-section-lg'}
          >
            <SectionHeader id={section.id} kicker={section.name} />
            {section.leagues.map((group) => (
              <section
                key={group.league.id}
                aria-labelledby={group.league.id}
                data-team-group=""
                className="mt-8"
              >
                <SectionHeader
                  as="h3"
                  id={group.league.id}
                  kicker={group.title}
                  meta={group.meta}
                  action={{ href: group.standingsHref, label: group.standingsLabel }}
                />
                {group.divisions.map((division) => (
                  <div
                    key={division.id}
                    id={division.anchorId ?? undefined}
                    data-team-group=""
                    className="mt-6"
                  >
                    {division.heading ? (
                      <h4 className="m-0 mb-3 text-lead text-ink">{division.heading}</h4>
                    ) : null}
                    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4 md:gap-4">
                      {division.tiles.map((data) => (
                        <TeamTile key={data.team.slug} data={data} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </section>
        ))}
      </div>

      {/* No snapshot stamp or "computed from published results" here: the footer states both on
          every page, one line below. The alignment source is already in the page description. */}
      <p className="mt-section mb-0 max-w-prose text-meta text-ink-3">
        Records are league games only. A dash means no results have been reported yet.
      </p>
      <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">
        Club field hockey: the{' '}
        <Link href="/clubs" prefetch={false} className="text-accent hover:underline">
          club teams
        </Link>{' '}
        page lists youth field hockey clubs and, for each, the players here a public page ties to it.
      </p>
    </div>
  );
}
