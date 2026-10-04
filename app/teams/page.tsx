import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueSwitcher from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site-url';
import TeamFinder from '../../components/search/TeamFinder';
import CompactStandingsTable from '../../components/standings/CompactStandingsTable';
import { buildTeamsByLeague, teamsLeagueChips } from '../../components/teams/team-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { getCounts, getTeamSearchIndex } from '../../lib/data';

/**
 * /teams — "Find my school, and where does it stand?" (DESIGN §3.6, §18; SPEC §10.5, §9.3).
 *
 * The phone's Teams tab, and the desktop nav's Teams link: the team list and the standings in one
 * page (DESIGN §18 merged the Table tab into it). All 49 teams, grouped section → league →
 * division, and each division is its COMPACT standings table (place, team, GP, W-L-T, PTS, the
 * league's ladder line), the same table the /standings overview draws, built by the same view
 * (`buildOverviewDivision`), so the two pages never disagree about a place. **Every team**: league
 * membership is the registry's list from each league's official schedule, not the feed's rows, and
 * dropping a school because a source has no data for it is the single worst bug this site could
 * ship (DESIGN §12.1, R-6). A team with no results is listed last with dashes, never 0-0-0.
 *
 * With JavaScript, `TeamFinder` (filter mode) sits above the tables and toggles `hidden` on the
 * server-rendered team rows (`[data-team-tile]`), on the ladder rows (`[data-hide-while-searching]`,
 * meaningless between filtered rows) and on any `[data-team-group]` wrapper left with no visible
 * team, and hides the anchor-mode league switcher while a query is typed. Without JavaScript the
 * finder is not painted (`sx-js-only`) and the full set of tables IS the page; the switcher's
 * `#<league>` anchors work either way.
 *
 * Heading outline (SPEC §10.0): each section is a `<section aria-labelledby>` with an h2
 * (`Central Coast Section` / `North Coast Section` / `Northern Section`, `id="ccs"`/`"ncs"`/`"ns"`)
 * → each league an h3 (`id=<league>`, action `<SHORT> standings`, the full league page; a league
 * whose schools are not all in its section, the EAL, has its membership note under the h3) → each
 * division a plain h4 (omitted for a single-division league) over its table and its
 * `Full <division> table →` link.
 * The division wrapper carries the division id unless it equals the league id (PCAL), so
 * `#de-anza`, `#mt-hamilton` and `#marin-county` resolve and every id on the page is unique
 * (SPEC §8.1).
 *
 * Two quiet lines under the tables link /clubs (DESIGN §17.1) and /commits (DESIGN §21.4), neither
 * in the nav. They sit outside `#team-list`, so the finder never hides them, and add no heading
 * and no group wrapper.
 */
export const metadata: Metadata = {
  title: 'Teams and standings',
  description:
    'All 49 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL (Northern Section), each in its division’s standings table. Find your school.',
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
        title="Teams and standings"
        description={`All ${counts.teams} girls varsity teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL (Northern Section), each in its division’s standings table. League and division alignment comes from each league’s official schedule; the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026.`}
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
                {/* Only where a league's schools are not all in the section it sits under (EAL). */}
                {group.membershipNote ? (
                  <p className="m-0 mt-2 max-w-prose text-meta text-ink-3">{group.membershipNote}</p>
                ) : null}
                {group.divisions.map((division) => (
                  <div
                    key={division.division}
                    id={division.anchorId ?? undefined}
                    data-team-group=""
                    className="mt-6"
                  >
                    {division.heading ? (
                      <h4 className="m-0 mb-3 text-lead text-ink">{division.heading}</h4>
                    ) : null}
                    <CompactStandingsTable
                      rows={division.rows}
                      ladderLine={division.ladderLine}
                      caption={division.caption}
                      filterable
                    />
                    <p className="m-0 mt-2">
                      <Link
                        href={division.fullHref}
                        prefetch={false}
                        className="sx-action text-meta font-medium text-accent hover:underline"
                      >
                        {division.fullLabel} &rarr;
                      </Link>
                    </p>
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
        Places, GP and W-L-T count league games only; PTS is 3 for a win and 1 for a tie in every
        league. A dash means no results have been reported yet. Each league&rsquo;s full page has its
        tiebreak rules, GD, form, and the games still to play.{' '}
        <Link href="/about" prefetch={false} className="font-medium text-accent hover:underline">
          How standings are computed
        </Link>
      </p>
      <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">
        Club field hockey: the{' '}
        <Link href="/clubs" prefetch={false} className="text-accent hover:underline">
          club teams
        </Link>{' '}
        page lists youth field hockey clubs and, for each, the players here a public page ties to it.
      </p>
      <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">
        College field hockey: the{' '}
        <Link href="/commits" prefetch={false} className="text-accent hover:underline">
          college commitments
        </Link>{' '}
        page lists the players here a public page says have committed to play in college.
      </p>
    </div>
  );
}
