import type { Metadata } from 'next';
import { Fragment } from 'react';

import CrossLeagueLatest from '../components/home/CrossLeagueLatest';
import FindYourTeam from '../components/home/FindYourTeam';
import LeagueCard from '../components/home/LeagueCard';
import LeaguePanel from '../components/home/LeaguePanel';
import MyTeamCard from '../components/home/MyTeamCard';
import { buildHomeView } from '../components/home/home-view';
import LeagueSwitcher, { RegionSwitcher } from '../components/layout/LeagueSwitcher';
import PageHeader from '../components/layout/PageHeader';
import { OG_BASE, SITE_NAME, leaguesBySectionWords } from '../components/layout/site';
import { listWords, shortDate } from '../lib/format';
import { INDEPENDENT_LEAGUES, LEAGUES_WITH_TABLES } from '../lib/leagues';
import { TEAMS } from '../lib/teams';

/**
 * `/` — "What just happened in MY league, and when's my team's next game?" (SPEC §10.1, §8.2)
 *
 * Every league's panel is in the static HTML. The remembered league (`localStorage`, stamped on
 * `<html data-league>` by the prefs script before first paint) and the scope stylesheet decide
 * which `data-scope` blocks show: `all` always, `none` only when no league is effective (the
 * first-visit view: Find your team + the latest from every league), `<id>` only for that league.
 * The remembered region (`<html data-region>`, DESIGN-socal §2.4) decides, independently, which
 * `data-region-scope` blocks show: each region's panels, its card grid, its latest-results block and
 * its status line. The finder stays outside them and searches all 99 teams.
 * No CSS reordering anywhere: DOM order is the reading order (WCAG 1.3.2 / 2.4.3), and a hidden
 * block is `display: none`, out of the accessibility tree. JS off or storage blocked → no stamp →
 * the first-visit view with every link working.
 *
 * Imports are relative, never `@/` (README, "Local development"): tests/ui/home-view.test.ts renders
 * this page with `react-dom/server` under Vitest, which has no path alias.
 *
 * The page body is read through `components/home/home-view.ts` (which reads only `lib/data.ts`) and
 * formatted in America/Los_Angeles from `snapshot.fetchedAt`; only the metadata description and
 * the sr-only league list read config (`lib/teams`, `lib/leagues`) directly. No page calls `Date.now()`, and
 * there is no `searchParams` in this signature, which is what keeps the route static.
 */
export const metadata: Metadata = {
  description: `Scores, standings and playoff pictures for the ${TEAMS.length} girls varsity field hockey teams in ${leaguesBySectionWords('name')}. Unofficial, updated twice daily.`,
  alternates: { canonical: '/' },
  openGraph: { ...OG_BASE, title: SITE_NAME, url: '/' },
};

/**
 * 'SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the Southern Section independents', from the
 * config (never a literal list): the leagues, then each group with no table by its name (DESIGN §24.9).
 */
const LEAGUE_LIST = listWords([
  ...LEAGUES_WITH_TABLES.map((l) => l.shortName),
  ...INDEPENDENT_LEAGUES.map((l) => `the ${l.name}`),
]);

/** The card grid of one region in "Find your team": two-up from 390px. */
const CARD_GRID = 'm-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 min-[390px]:grid-cols-2 md:gap-4';

export default function HomePage() {
  const data = buildHomeView();

  return (
    <div className="pb-section-lg">
      <div data-scope="all">
        <PageHeader
          title="NorCal High School Field Hockey Teams"
          srTitle={` — girls varsity scores, standings and playoff pictures for ${LEAGUE_LIST}`}
          meta={
            /* One line at 390: the league list wrapped onto a second line there, and the leagues
               are named by the switcher chips right below. From 640px it fits and comes back; the
               text stays in the DOM either way. One line per region (DESIGN-socal §2.4): the scope
               stylesheet shows the reader's, and without JS both read in turn, NorCal first. */
            <p className="m-0 text-meta text-ink-2">
              {data.regions.map((region, i) => (
                <span key={region.id} data-region-scope={region.id}>
                  {i > 0 ? <span className="sr-only"> </span> : null}
                  {region.status.resultsThrough
                    ? `Results through ${shortDate(region.status.resultsThrough)}`
                    : 'No results yet'}{' '}
                  &middot; {region.status.teamCount} {region.shortName} teams
                  <span className="hidden sm:inline"> &middot; {region.status.leagueShorts.join(' · ')}</span>
                </span>
              ))}
            </p>
          }
        />
      </div>

      {/* My team: hidden (with its heading) when there is no pin, no league and no stale pin. */}
      <section data-scope="all" className="sx-myteam-slot mt-8 md:mt-10" aria-labelledby="my-team-heading">
        <MyTeamCard views={data.teamViews} index={data.searchIndex} />
      </section>

      {/* The scope row: the region control first, then the league chips (each section's list is
          region-scoped by the switcher, so only the shown region's chips appear). */}
      <div data-scope="all" className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <RegionSwitcher separated />
        <LeagueSwitcher mode="scope" includeAll label="Your league" leagues={data.leagueChips} />
      </div>

      {/* ONE finder over all 99 teams, outside the region blocks; only the card grids are scoped. */}
      <FindYourTeam index={data.searchIndex} className="mt-8 md:mt-10">
        {data.regions.map((region) => (
          <Fragment key={region.id}>
            <h3 data-region-scope={region.id} className="m-0 mt-6 text-lead text-ink">
              {region.name}
            </h3>
            <ul data-region-scope={region.id} className={CARD_GRID}>
              {region.leagueCards.map((card, i, cards) => {
                // The last card of a region's odd count spans both columns of the two-up grid, so
                // five cards read 2 + 2 + 1 full-width rather than ending on an orphan half-card.
                const wide = cards.length % 2 === 1 && i === cards.length - 1;
                return (
                  <LeagueCard
                    key={card.id}
                    card={card}
                    wide={wide}
                    className={wide ? 'min-[390px]:col-span-2' : undefined}
                  />
                );
              })}
            </ul>
          </Fragment>
        ))}
      </FindYourTeam>

      {/* Each region's league panels in its own block; a panel's `data-scope` is unchanged. */}
      {data.regions.map((region) => (
        <div key={region.id} data-region-scope={region.id}>
          {data.panels
            .filter((panel) => panel.region === region.id)
            .map((panel) => (
              <LeaguePanel key={panel.id} panel={panel} />
            ))}
        </div>
      ))}

      {data.regions.map((region) => (
        <CrossLeagueLatest
          key={region.id}
          view={region.latest}
          region={{ id: region.id, shortName: region.shortName, idSuffix: region.idSuffix }}
          className="mt-section md:mt-section-lg"
        />
      ))}
    </div>
  );
}
