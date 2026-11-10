import type { Metadata } from 'next';
import Link from 'next/link';

import { RegionSwitcher } from '../../components/prefs/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import { JvLeagueGames, JvTeamIndex } from '../../components/jv/JvHub';
import JvStandings from '../../components/jv/JvStandings';
import { buildJvTablesView } from '../../components/jv/jv-standings-view';
import { buildLeagueJvHubView, buildLeagueJvTeams } from '../../components/jv/jv-view';
import Arrow from '../../components/ui/Arrow';
import SectionHeader from '../../components/ui/SectionHeader';
import { listWords } from '../../lib/format';
import { LEAGUES, LEAGUES_PROPER, leaguesInRegion, regionOf } from '../../lib/leagues';
import { ordersByRecord } from '../../lib/standings/order';
import { GENDER_NAME, SPORT } from '../../lib/sports/current';

/**
 * `/jv` — "Where does our JV stand, how did it do, and when does it play?" The JV hub: every league's JV
 * tables, computed (lib/jv/jv-standings.ts) and unofficial, one section per league (`#scval`, …), one block per
 * division (`#de-anza`, …); under them the league's latest JV results and next JV games
 * (components/jv/JvHub.tsx), a link to its whole JV season (`/jv/<league>`), and every school's JV team. Each
 * league's section carries its region's `data-region-scope` (DESIGN-socal §2.4), so the reader's region
 * shows; a deep link into the other region opens it (components/prefs/league-scope-css.ts).
 *
 * Its own page rather than a section of `/standings/<league>`: those pages carry the varsity tables
 * at their weight budget, and the JV tables are a different kind of claim (no league publishes one
 * in season; a JV league game is identified by its varsity counterpart; a table appears only once
 * enough of its games have a score), which this page states once at the top. Each league standings
 * page links here (`/jv#<league>`), and a team page's JV header links its division (`/jv#<division>`).
 *
 * The LA independents (DESIGN §24.10) get a JV section like a league's: a JV game between two
 * of them whose varsity counterpart counts for the group's table is a JV league game here.
 *
 * One static page, no params, nothing derived from `Date.now()`.
 */

const SHORT_NAMES = listWords(LEAGUES_PROPER.map((l) => l.shortName));
const PAGE_TITLE = 'JV standings and scores';
/** Every league's table is ordered the same way in a build: on points, or on the league record (basketball). */
const BY_RECORD = LEAGUES.every((l) => ordersByRecord(l.rules));

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `${GENDER_NAME} junior varsity ${SPORT.noun} for ${SHORT_NAMES}: unofficial JV standings computed from MaxPreps’ JV results, the latest JV scores, the next JV games and every school’s JV team.`,
  alternates: { canonical: '/jv' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/jv' },
};

export default function JvStandingsPage() {
  return (
    <div className="pb-section-lg">
      <PageHeader
        title={PAGE_TITLE}
        description="Junior varsity tables, latest results and next games · computed from published results&nbsp;· unofficial"
      />
      {/* The region control, its own row (DESIGN-socal §2.4); each league's section is region-scoped. */}
      <RegionSwitcher className="mt-4" />
      <p className="m-0 mt-4 max-w-prose text-body text-ink-2">
        No league publishes JV standings during the season, so these tables are computed from the JV
        results coaches enter: a JV game counts when its varsity counterpart counts, or when it is on the
        league&rsquo;s own schedule.{' '}
        {BY_RECORD
          ? 'Teams are ordered on their league record, as the varsity tables are.'
          : 'Teams are ordered on points (3 a win, 1 a tie).'}{' '}
        Under each league&rsquo;s tables are its latest JV results, its next JV games and every
        school&rsquo;s JV team.{' '}
        <Link href="/about#jv" prefetch={false} className="font-medium text-accent hover:underline">
          How JV tables are built <Arrow />
        </Link>
      </p>
      {LEAGUES.map((league) => (
        <section
          key={league.id}
          id={league.id}
          data-region-scope={regionOf(league.id)}
          aria-labelledby={`${league.id}-heading`}
          // The first league of each region takes the smaller gap: the other region's may be hidden.
          className={
            leaguesInRegion(regionOf(league.id))[0]?.id === league.id
              ? 'mt-8 md:mt-10'
              : 'mt-section md:mt-section-lg'
          }
        >
            <SectionHeader
              id={`${league.id}-heading`}
              kicker={`${league.shortName} JV`}
              action={{ href: `/standings/${league.id}`, label: 'Varsity table' }}
              // Capped like the tables below (48rem from lg), so the action sits over them.
              className="lg:max-w-3xl"
            />
            <JvStandings views={buildJvTablesView(league.id)} multi={league.divisions.length > 1} />
            <JvLeagueGames view={buildLeagueJvHubView(league.id)} leagueShort={league.shortName} idPrefix={`${league.id}-jv`} />
            <JvTeamIndex teams={buildLeagueJvTeams(league.id)} id={`${league.id}-jv-teams`} leagueShort={league.shortName} />
        </section>
      ))}
    </div>
  );
}
