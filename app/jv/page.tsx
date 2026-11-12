import type { Metadata } from 'next';

import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import { leagueChips, leagueHrefs } from '../../components/layout/league-chips';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import { JvLeagueGames, JvTeamIndex } from '../../components/jv/JvHub';
import JvStandings from '../../components/jv/JvStandings';
import { buildJvTablesView } from '../../components/jv/jv-standings-view';
import { buildLeagueJvHubView, buildLeagueJvTeams } from '../../components/jv/jv-view';
import ScopeBar from '../../components/prefs/ScopeBar';
import SectionHeader from '../../components/ui/SectionHeader';
import { getFetchedAt } from '../../lib/data';
import { listWords } from '../../lib/format';
import { LEAGUES, LEAGUES_PROPER, regionOf } from '../../lib/leagues';
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
 * enough of its games have a score), which /about#jv states once. Each league standings
 * page links here (`/jv#<league>`), and a team page's JV header links its division (`/jv#<division>`).
 *
 * The LA independents (DESIGN §24.10) get a JV section like a league's: a JV game between two
 * of them whose varsity counterpart counts for the group's table is a JV league game here.
 *
 * One static page, no params, nothing derived from `Date.now()`.
 */

const SHORT_NAMES = listWords(LEAGUES_PROPER.map((l) => l.shortName));
const PAGE_TITLE = 'JV standings and scores';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `${GENDER_NAME} junior varsity ${SPORT.noun} for ${SHORT_NAMES}: unofficial JV standings computed from MaxPreps’ JV results, the latest JV scores, the next JV games and every school’s JV team.`,
  alternates: { canonical: '/jv' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/jv' },
};

export default function JvStandingsPage() {
  return (
    <div className="pb-section-lg">
      <PageHeader title="JV" />
      {/* The league row: anchors to each league's section, the region switch and the short stamp. Each league's
          section is region-scoped (DESIGN-socal §2.4). */}
      <ScopeBar
        league={{ mode: 'anchor', label: 'Leagues', leagues: leagueChips(), hrefs: leagueHrefs(null) }}
        stamp={<LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />}
      />
      {LEAGUES.map((league, index) => (
        <section
          key={league.id}
          id={league.id}
          data-region-scope={regionOf(league.id)}
          aria-labelledby={`${league.id}-heading`}
          className="sx-section"
          // The first league of each region is the first block the reader sees: the other region's is hidden.
          data-first={index === 0 || regionOf(LEAGUES[index - 1].id) !== regionOf(league.id) ? '' : undefined}
        >
          <SectionHeader
            id={`${league.id}-heading`}
            kicker={league.shortName}
            action={{ href: `/standings/${league.id}`, label: 'Varsity standings' }}
          />
          <JvStandings views={buildJvTablesView(league.id)} multi={league.divisions.length > 1} />
          <JvLeagueGames view={buildLeagueJvHubView(league.id)} leagueShort={league.shortName} idPrefix={`${league.id}-jv`} />
          <JvTeamIndex teams={buildLeagueJvTeams(league.id)} id={`${league.id}-jv-teams`} leagueShort={league.shortName} />
        </section>
      ))}
    </div>
  );
}
