import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueJumpLinks from '../../components/layout/LeagueJumpLinks';
import LeagueSwitcher, { RegionSwitcher } from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { leagueChips, leagueHrefs } from '../../components/layout/league-chips';
import { OG_BASE } from '../../components/layout/site';
import OverviewDivisionBlock from '../../components/standings/OverviewDivisionBlock';
import { buildStandingsOverviewView } from '../../components/standings/standings-page-view';
import { leaderClause } from '../../components/standings/standings-view';
import SectionHeader from '../../components/ui/SectionHeader';
import { listWords, shortDate } from '../../lib/format';
import { getLeague, isIndependentLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

/**
 * /standings — "Where does everyone stand?" (SPEC §8.1, §10.3): every division of every league as
 * a COMPACT full table (place, team, GP, W-L-T, PTS), grouped section → league → division.
 *
 * The old SCVAL anchors keep resolving with no JavaScript and no redirect: `#de-anza` and
 * `#el-camino` are real elements here, as are `#ccs`/`#ncs`/`#ns`/`#ss`/`#sds` (sections), every league
 * id and every division id, and `#norcal`/`#socal` (the region wrappers, DESIGN-socal §2.4: a deep link
 * into the hidden region opens it, components/layout/league-scope-css.ts). A single-division league whose division id equals its league id (PCAL, EAL) has ONE
 * element carrying the id; every id on the page is unique.
 *
 * Heading outline (SPEC §10.0): each section is a `<section aria-labelledby>` with an h2 → each
 * league an h3 → each division a plain h4 (omitted for a single-division league). Each table
 * links its league's full page, `/standings/<league>#<division>`. A league whose schools are not all
 * in its section (the EAL) carries its membership note under its h3. A division with no ladder line
 * (the EAL) draws no rule in its compact table.
 *
 * No sticky table head, no GD bars, no form strips, no disclosures: this page is the light index.
 * Static: no search params, nothing derived from `Date.now()`.
 */
export function generateMetadata(): Metadata {
  const { leaders, throughDate } = buildStandingsOverviewView();
  const summary = leaders
    .map(({ league, lines }) => `${league.shortName}: ${leaderClause(lines)}`)
    .join('. ');
  const description = `Every division, ordered on points (3 a win, 1 a tie). ${summary}.${
    throughDate ? ` League games through ${shortDate(throughDate)}.` : ''
  } Computed from published results; unofficial.`;
  return {
    title: 'Standings',
    description,
    alternates: { canonical: '/standings' },
    openGraph: { ...OG_BASE, title: 'Standings — every league', description, url: '/standings' },
  };
}

/**
 * 'Sunset, City, North and Metro': the leagues whose table order is this site's own points. A group with no
 * table (the Southern Section independents) orders nothing, so it is not one of them.
 */
function siteOrderedLeagues(leagues: readonly { id: LeagueId; shortName: string }[]): string[] {
  return leagues
    .filter((l) => getLeague(l.id).rules.orderScope === 'site' && !isIndependentLeague(l.id))
    .map((l) => l.shortName);
}

export default function StandingsPage() {
  const { leagues, regions } = buildStandingsOverviewView();
  const siteOrdered = siteOrderedLeagues(leagues);
  // The leagues with a table; the independents' block (no table) sits under its section like a league's.
  const tabled = leagues.filter((l) => !isIndependentLeague(l.id));

  return (
    <div className="pb-section-lg">
      <PageHeader
        title="Standings"
        description={`Every division in ${listWords(tabled.map((l) => l.shortName))} · league games only`}
      />

      {/* The region control, its own row under the header (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* Jump links: shown before paint only for the remembered league (league-scope CSS). */}
      <LeagueJumpLinks leagues={leagues} />

      {/* Anchor chips: each section's list is region-scoped by the switcher itself. */}
      <LeagueSwitcher mode="anchor" label="Leagues" leagues={leagueChips()} hrefs={leagueHrefs(null)} className="mt-4" />

      {/* One wrapper per region around its section h2s (`#norcal`, `#socal`): the scope stylesheet shows
          the reader's region; without JS both read in turn, NorCal first, and every anchor resolves. */}
      {regions.map((region) => (
        <div key={region.id} id={region.id} data-region-scope={region.id}>
          {region.sections.map((section) => (
            <section
              key={section.id}
              aria-labelledby={section.id}
              className="mt-section md:mt-section-lg"
            >
              <SectionHeader id={section.id} kicker={section.name} />
              {section.leagues.map((league) => (
                <section key={league.id} aria-labelledby={league.id} className="mt-8">
                  <SectionHeader as="h3" id={league.id} kicker={league.title} />
                  {/* Only where a league's schools need saying (the EAL's two sections; the Sunset is a
                      field hockey grouping, not the all-sports league of that name). */}
                  {league.membershipNote ? (
                    <p className="m-0 mt-2 max-w-prose text-meta text-ink-3">{league.membershipNote}</p>
                  ) : null}
                  {league.divisions.map((division) => (
                    <OverviewDivisionBlock key={division.division} division={division} />
                  ))}
                </section>
              ))}
            </section>
          ))}
        </div>
      ))}

      <p className="mt-section mb-0 max-w-prose text-meta text-ink-3 md:mt-section-lg">
        Places, GP and W-L-T count league games only; PTS is 3 for a win and 1 for a tie in every
        table{siteOrdered.length > 0
          ? ` (${listWords(siteOrdered)} publish no points rule, so there the order is this site’s own points)`
          : ''}. Each league&rsquo;s full page has its tiebreak rules, GD, form, and the games still
        to play.{' '}
        <Link href="/about" prefetch={false} className="font-medium text-accent hover:underline">
          How standings are computed
        </Link>
      </p>
    </div>
  );
}
