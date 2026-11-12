import Link from 'next/link';
import { Fragment } from 'react';

import { getLeagueSummaries, getStandings, getTeams, type LeagueSummary } from '../../lib/data';
import { REGIONS } from '../../lib/league-config/sections';
import { standingsLabel } from '../../lib/leagues';
import { buildOverviewDivision } from '../standings/standings-view';
import StandingsTable from '../standings/standings-table/StandingsTable';
import SectionHeader from '../ui/SectionHeader';

import { LeagueFact } from './MyTeamLine';

/**
 * The Scores page's rail (DESIGN §33): standings beside the games, level with the date bar from
 * 768 and after the games below it.
 *
 * Which league it shows is the league row's choice, drawn before paint by the scope stylesheet:
 *  - a league chosen (pinning a team chooses its league): `<SHORT> standings`, each division's
 *    compact table under its own strip, then "Full standings" and "<SHORT> schedule". When the
 *    pinned team is in that league the heading adds whose league it is ("Saint Francis’s league"),
 *    so the block never reads as a broken filter beside the tab row;
 *  - none (`data-scope="none"`, the All tab): "Standings", the top 3 of each league's first
 *    division under a strip with the league's name, per region, then "All standings".
 *
 * A group with no table (the LA independents) has no block of its own beyond its two links.
 */

/** How many rows of each league's first division the no-league rail lists. */
const TOP = 3;

function divisionsOf(league: LeagueSummary) {
  return league.divisions
    .map((division) =>
      buildOverviewDivision({
        division: division.id,
        standings: getStandings(division.id),
        teams: getTeams(division.id),
        throughDate: null,
      }),
    )
    .filter((division) => division.rows.length > 0);
}

function LeagueRail({ league }: { league: LeagueSummary }) {
  const divisions = divisionsOf(league);
  const names = Object.fromEntries(getTeams({ league: league.id }).map((team) => [team.slug, team.shortName]));
  return (
    <section className="sx-section" data-scope={league.id} aria-labelledby={`rail-${league.id}`}>
      <h2 id={`rail-${league.id}`} className="sx-dayhead">
        {standingsLabel(league.id)} <LeagueFact names={names} />
      </h2>
      {divisions.map((division) => (
        <Fragment key={division.division}>
          {/* A one-table league's strip would repeat the heading: the table sits under the h2. */}
          {division.heading ? <SectionHeader strip kicker={division.heading} /> : null}
          <StandingsTable
            division={division.division}
            rows={division.rows}
            gdDomain={0}
            variant="mini"
            caption={division.caption}
            berthRuleAfter={division.ladderLine?.after}
            notes="none"
          />
        </Fragment>
      ))}
      <ul className="sx-linkrow">
        <li>
          <Link href={`/standings/${league.id}`} prefetch={false} className="sx-action">
            Full standings
          </Link>
        </li>
        <li>
          <Link href={`/schedule/${league.id}`} prefetch={false} className="sx-action">
            {league.shortName} schedule
          </Link>
        </li>
      </ul>
    </section>
  );
}

export function ScoreRail() {
  const leagues = getLeagueSummaries();
  return (
    <aside className="sx-rail">
      <section className="sx-section" data-scope="none" aria-labelledby="rail-standings">
        <h2 id="rail-standings" className="sx-dayhead">
          Standings
        </h2>
        {REGIONS.map((region) => (
          <div key={region.id} data-region-scope={region.id}>
            {leagues
              .filter((league) => league.region === region.id)
              .map((league) => ({ league, division: divisionsOf(league)[0] }))
              .filter((entry) => entry.division !== undefined)
              .map(({ league, division }) => (
                <Fragment key={league.id}>
                  <SectionHeader
                    strip
                    kicker={league.shortName}
                    meta={league.singleDivision ? undefined : (division.heading ?? undefined)}
                  />
                  <StandingsTable
                    division={division.division}
                    rows={division.rows}
                    gdDomain={0}
                    variant="mini"
                    caption={division.caption}
                    limit={TOP}
                    notes="none"
                  />
                </Fragment>
              ))}
          </div>
        ))}
        <ul className="sx-linkrow">
          <li>
            <Link href="/standings" prefetch={false} className="sx-action">
              All standings
            </Link>
          </li>
        </ul>
      </section>
      {leagues.map((league) => (
        <LeagueRail key={league.id} league={league} />
      ))}
    </aside>
  );
}

export default ScoreRail;
