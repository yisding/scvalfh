import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FreshmanLeagueGames, FreshmanTeamIndex } from '../../components/freshman/FreshmanGames';
import { buildLeagueFreshmanHubView, buildLeagueFreshmanTeams, freshmanLeagues } from '../../components/freshman/freshman-view';
import { BUILD_INSTANT } from '../../components/layout/build-instant';
import LastUpdated from '../../components/layout/LastUpdated';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import EmptyState from '../../components/ui/EmptyState';
import SectionHeader from '../../components/ui/SectionHeader';
import { getFreshmanFetchedAt, hasFreshmanLevel } from '../../lib/freshman/freshman';
import { LEAGUE_IDS, getLeague } from '../../lib/leagues';
import { GENDER_NAME, SPORT } from '../../lib/sports/current';
import { FRESHMAN_LEVEL, SECOND_LEVEL } from '../../components/words/level-words';

/**
 * `/freshman` — "When does our freshman team play, and how did it do?" The freshman hub (girls soccer and boys
 * basketball, added 2026-11-25): what the level is and where its games come from (`#about`), then one section per
 * league with a listed freshman game (`#<league>`): its latest freshman results and next freshman games, a link to its
 * whole freshman season (`/freshman/<league>`), and its schools with freshman games, each linked to its team page's
 * freshman section.
 *
 * No tables: the site keeps no freshman standings (owner decision, 2026-11-25), so the hub is games and records only.
 * Linked from `/jv` and from every team page with freshman games, not from the top navigation (owner decision). A
 * build without the level (field hockey, volleyball, the VAL) renders this route as a 404.
 *
 * One static page, no params, nothing derived from `Date.now()`: "today" is the freshman file's own date.
 */

const PAGE_TITLE = `${FRESHMAN_LEVEL.longTitle} schedules and scores`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: `${GENDER_NAME} ${FRESHMAN_LEVEL.long} ${SPORT.noun}: every school’s freshman games from MaxPreps’ freshman schedules, the latest scores and the next games. Unofficial; no freshman standings.`,
  alternates: { canonical: '/freshman' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/freshman' },
};

export default function FreshmanHubPage() {
  if (!hasFreshmanLevel()) notFound();
  const leagues = freshmanLeagues(LEAGUE_IDS);
  const fetchedAt = getFreshmanFetchedAt();
  return (
    <div className="pb-section-lg">
      <PageHeader title={FRESHMAN_LEVEL.longTitle} />
      <section id="about" aria-labelledby="about-heading" className="sx-section sx-target">
        <h2 id="about-heading" className="sr-only">
          About freshman games
        </h2>
        <p className="m-0 max-w-prose text-body text-ink">
          Many schools field a freshman team beside their varsity and {SECOND_LEVEL.short}. Its games come from the
          freshman schedules coaches enter on MaxPreps, and they are kept apart: no varsity or {SECOND_LEVEL.short}{' '}
          record, table or rating counts them, and the site keeps no freshman standings. A record here is the team’s
          over the freshman games listed.
        </p>
        <ul className="sx-linkrow">
          <li>
            <Link href="/jv" prefetch={false} className="sx-action">
              {SECOND_LEVEL.short} standings and scores
            </Link>
          </li>
        </ul>
        {fetchedAt ? (
          <p className="sx-note">
            <LastUpdated at={fetchedAt} now={BUILD_INSTANT} variant="time" />
          </p>
        ) : null}
      </section>
      {leagues.length === 0 ? (
        <EmptyState heading="No freshman games are listed yet">
          No school’s freshman schedule is on MaxPreps for this season yet.
        </EmptyState>
      ) : (
        leagues.map((id) => {
          const league = getLeague(id);
          return (
            <section key={id} id={id} aria-labelledby={`${id}-heading`} className="sx-section sx-target">
              <SectionHeader id={`${id}-heading`} kicker={league.shortName} action={{ href: `/freshman/${id}`, label: 'Schedule' }} />
              <FreshmanLeagueGames view={buildLeagueFreshmanHubView(id)} leagueShort={league.shortName} idPrefix={`${id}-freshman`} />
              <FreshmanTeamIndex teams={buildLeagueFreshmanTeams(id)} id={`${id}-freshman-teams`} leagueShort={league.shortName} />
            </section>
          );
        })
      )}
    </div>
  );
}
