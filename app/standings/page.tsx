import type { Metadata } from 'next';
import Link from 'next/link';

import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../components/layout/league-chips';
import { OG_BASE } from '../../components/layout/site';
import ScopeBar from '../../components/prefs/ScopeBar';
import OverviewDivisionBlock from '../../components/standings/OverviewDivisionBlock';
import { buildStandingsOverviewView } from '../../components/standings/standings-page-view';
import { leaderClause } from '../../components/standings/standings-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { shortDate } from '../../lib/format';
import { LEAGUES_PROPER, isIndependentLeague } from '../../lib/leagues';
import { ordersByRecord } from '../../lib/standings/order';

/** Every league of this build orders its table on its league record (basketball), not on points. */
const BY_RECORD = LEAGUES_PROPER.length > 0 && LEAGUES_PROPER.every((l) => ordersByRecord(l.rules));
const ORDERED_ON = BY_RECORD ? 'league record' : 'points (3 a win, 1 a tie)';

/**
 * /standings — "Where does everyone stand?" (SPEC §8.1, §10.3; DESIGN §33): every division of every
 * league as a COMPACT table (place, team, W-L-T, Pts, and Last 5 where the table is wide enough).
 *
 * Layout. Under the title: the league row (anchor tabs, the region switch, the short "Updated"
 * stamp). Then, per region, a grid of leagues (`sx-auto`: one column on a phone, two from 768, three
 * at 1280). A league with several divisions takes a whole row and sets its divisions side by side,
 * each under its own strip; a single-division league takes one column, so three of them sit in one
 * row at 1280. Nothing is stretched across the page and no row ends in a blank third.
 *
 * Anchors keep resolving with no JavaScript and no redirect: `#de-anza` and `#el-camino` are real
 * elements here, as are `#ccs`/`#ncs`/`#ns`/`#ss`/`#sds` (an empty marker at the top of each section's
 * first league), every league id and every division id, and `#norcal`/`#socal` (the region wrappers,
 * DESIGN-socal §2.4: a deep link into the hidden region opens it,
 * components/prefs/league-scope-css.ts). A single-division league whose division id equals its
 * league id (PCAL, EAL) has ONE element carrying the id; every id on the page is unique.
 *
 * Heading outline: h1, then each league an h2 (its short name, with "Full standings" to the league's
 * own page), then each division an h3 inside its strip (omitted for a single-division league). A
 * league whose schools are not all in its section (the EAL) or whose name could be mistaken (the
 * Sunset) carries its membership note under its table. A division with no ladder line (the EAL)
 * draws none.
 *
 * How the order is worked out is on /about; this page links it once, at the end.
 * Static: no search params, nothing derived from `Date.now()`.
 */
export function generateMetadata(): Metadata {
  const { leaders, throughDate } = buildStandingsOverviewView();
  const summary = leaders
    .map(({ league, lines }) => `${league.shortName}: ${leaderClause(lines)}`)
    .join('. ');
  const description = `Every division, ordered on ${ORDERED_ON}. ${summary}.${
    throughDate ? ` League games through ${shortDate(throughDate)}.` : ''
  } Computed from published results; unofficial.`;
  return {
    title: 'Standings',
    description,
    alternates: { canonical: '/standings' },
    openGraph: { ...OG_BASE, title: 'Standings — every league', description, url: '/standings' },
  };
}

export default function StandingsPage() {
  const { asOf, regions } = buildStandingsOverviewView();

  return (
    <div className="pb-section-lg">
      <PageHeader title="Standings" />

      {/* Anchor tabs: each section's list is region-scoped by the switcher itself. */}
      <ScopeBar
        league={{ mode: 'anchor', label: 'Leagues', leagues: leagueChips(), hrefs: leagueHrefs(null) }}
        stamp={<LastUpdated at={asOf} now={BUILD_INSTANT} variant="time" />}
      />

      {/* One BLOCK wrapper per region (`#norcal`, `#socal`): the scope stylesheet shows the reader's
          region; without JS both read in turn, NorCal first, and every anchor resolves. The grid is
          the element inside it, never the scoped wrapper itself. */}
      {regions.map((region) => (
        <div key={region.id} id={region.id} data-region-scope={region.id}>
          <div className="sx-auto">
            {region.sections.map((section, s) =>
              section.leagues.map((league, l) => {
                const several = league.divisions.length > 1;
                return (
                  <section
                    key={league.id}
                    aria-labelledby={league.id}
                    // Only a league on a row of its own may sit closer to the league row above it: one
                    // that shares its row must keep the same offset as its neighbours.
                    data-first={s === 0 && l === 0 && several ? '' : undefined}
                    className={several ? 'sx-section col-span-full min-w-0' : 'sx-section min-w-0'}
                  >
                    {/* The section's anchor (`#ccs`, `#ncs`, …): an empty marker at the top of its first league. */}
                    {l === 0 ? <span id={section.id} /> : null}
                    <SectionHeader
                      id={league.id}
                      // The independents' short name is an adjective ('LA'); their title names the group.
                      kicker={isIndependentLeague(league.id) ? league.title : league.shortName}
                      action={{ href: `/standings/${league.id}`, label: 'Full standings' }}
                    />
                    {/* auto-FIT, not `sx-auto`'s auto-fill: two divisions share the row in halves
                        (no empty third track); three go three across where each has 17rem. */}
                    <div
                      className={
                        several
                          ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-x-10 gap-y-4'
                          : undefined
                      }
                    >
                      {league.divisions.map((division) => (
                        <OverviewDivisionBlock key={division.division} division={division} />
                      ))}
                    </div>
                    {/* Only where a league's schools need saying (the EAL's two sections; the Sunset is a
                        field hockey grouping, not the all-sports league of that name). */}
                    {league.membershipNote ? <p className="sx-note">{league.membershipNote}</p> : null}
                  </section>
                );
              }),
            )}
          </div>
        </div>
      ))}

      <ul className="sx-linkrow mt-10">
        <li>
          <Link href="/about#standings" prefetch={false} className="sx-action">
            How standings are calculated
          </Link>
        </li>
      </ul>
    </div>
  );
}
