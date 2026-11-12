import type { Metadata } from 'next';
import Link from 'next/link';

import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../components/layout/league-chips';
import { OG_BASE, ROOT_OG_IMAGE, leaguesBySectionWords } from '../../components/layout/site';
import ScopeBar from '../../components/prefs/ScopeBar';
import TeamFinder from '../../components/search/TeamFinder';
import { buildTeamsByRegion } from '../../components/teams/teams-index-view';
import SectionHeader from '../../components/ui/SectionHeader';
import TeamMonogram from '../../components/ui/TeamMonogram';
import { getCounts, getFetchedAt, getTeamSearchIndex } from '../../lib/data';
import { recordString } from '../../lib/format';
import { HAS_RECRUITING, SPORT_AUDIENCE } from '../../lib/sports/current';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Teams';

/**
 * /teams — "Find my school" (DESIGN §33). The directory: every team, by league and division, as a
 * name list. Standings live on /standings; each league's heading links its own.
 *
 * **Every team**: league membership is the registry's list from each league's official schedule,
 * not the feed's rows, and dropping a school because a source has no data for it is the single
 * worst bug this site could ship (DESIGN §12.1, R-6). A team with no results is listed with no
 * record beside it, never 0-0-0.
 *
 * Order: the title, the finder (the first thing under it: this is also where the header's team
 * search lands, `?q=`), the league row (anchors to each league, the region switch, the short
 * stamp), then the list. With JavaScript the finder toggles `hidden` on the server-rendered items
 * (`[data-team-tile]`) and on any `[data-team-group]` wrapper left with no visible team, and hides
 * the league row while a query is typed. Without JavaScript the finder is not painted
 * (`sx-js-only`) and the list IS the page; the league row's `#<league>` anchors work either way.
 *
 * Regions (DESIGN-socal §2.4): one `<div id="norcal|socal" data-region-scope>` per region inside
 * `#team-list`, and the scope stylesheet shows the reader's region; the finder stays outside them
 * and searches every team, and while it is searching both regions' lists show.
 *
 * Heading outline: each league is a `<section aria-labelledby>` with an h2 (`id=<league>`, its team
 * full name and team count beside it in grey, action `<SHORT> standings`; a league whose schools are not all in its section,
 * the EAL, has its membership note under the heading) → each division an h3 strip (omitted for a
 * single-division league). The division wrapper carries the division id unless it equals the league
 * id (PCAL, EAL), so `#de-anza`, `#mt-hamilton` and `#marin-county` resolve and every id is unique.
 *
 * The last section links /commits, /clubs and /recruiting (none is in the nav). It sits outside
 * `#team-list`, so the finder never hides it.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `All ${getCounts().teams} ${SPORT_AUDIENCE} teams in ${leaguesBySectionWords('name')}, by league and division. Find your school.`,
  alternates: { canonical: '/teams' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/teams' },
};

export default function TeamsPage() {
  const regions = buildTeamsByRegion();

  return (
    <div className="pb-section-lg" data-teams-page="">
      <PageHeader title="Teams" />

      {/* Client-rendered on the server too, so its field is in the first paint whenever JS runs
          (`html[data-js]` is stamped before paint); without JS it is not painted. */}
      <TeamFinder
        index={getTeamSearchIndex()}
        mode="filter"
        listId="team-list"
        hideWhileSearchingId="team-league-switcher"
        className="max-w-[34rem]"
      />

      <div id="team-league-switcher" className="mt-3">
        <ScopeBar
          league={{ mode: 'anchor', label: 'Leagues', leagues: leagueChips(), hrefs: leagueHrefs(null) }}
          stamp={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />}
        />
      </div>

      <div id="team-list">
        {regions.map((region) => {
          const groups = region.sections.flatMap((section) => section.leagues);
          return (
            <div key={region.id} id={region.id} data-region-scope={region.id}>
              {groups.map((group, index) => (
                <section
                  key={group.league.id}
                  aria-labelledby={group.league.id}
                  data-team-group=""
                  className="sx-section"
                  data-first={index === 0 ? '' : undefined}
                >
                  <SectionHeader
                    id={group.league.id}
                    kicker={group.title.split(' — ')[0]}
                    meta={[group.title.split(' — ')[1], group.meta].filter(Boolean).join(', ')}
                    action={{ href: group.standingsHref, label: group.standingsLabel }}
                  />
                  {/* Only where a league's schools are not all in the section it plays in (EAL). */}
                  {group.membershipNote ? <p className="sx-note mt-0 mb-3">{group.membershipNote}</p> : null}
                  {group.divisions.map((division) => (
                    <div
                      key={division.division}
                      id={division.anchorId ?? undefined}
                      data-team-group=""
                      className={division.heading ? 'sx-target mt-4 first-of-type:mt-0' : 'sx-target'}
                    >
                      {division.heading ? <h3 className="sx-strip">{division.heading}</h3> : null}
                      <ul className="sx-auto m-0 list-none grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] p-0">
                        {division.rows.map(({ team, standing }) => (
                          <li
                            key={team.slug}
                            data-team-slug={team.slug}
                            data-team-tile={team.slug}
                            className="relative flex min-h-11 items-center gap-2.5 border-b border-hairline px-2 py-1.5 hover:bg-surface-2"
                          >
                            <TeamMonogram team={team} size={24} />
                            <span className="min-w-0 flex-1">
                              <Link href={`/teams/${team.slug}`} prefetch={false} className="sx-rowlink text-body font-medium">
                                {team.name}
                              </Link>
                              <span className="sx-pin-note" hidden>
                                Your team
                              </span>
                            </span>
                            {standing.hasReportedResults ? (
                              <span className="sx-num shrink-0 text-body text-ink-2">
                                <span className="sr-only">League record </span>
                                {recordString(standing.computed)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          );
        })}
      </div>

      {HAS_RECRUITING ? (
        <section className="sx-section" aria-labelledby="teams-more">
          <h2 id="teams-more">More</h2>
          <ul className="sx-linkrow">
            <li>
              <Link href="/commits" prefetch={false} className="sx-action">
                College commitments
              </Link>
            </li>
            <li>
              <Link href="/clubs" prefetch={false} className="sx-action">
                Club teams
              </Link>
            </li>
            <li>
              <Link href="/recruiting" prefetch={false} className="sx-action">
                Recruiting by school
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
