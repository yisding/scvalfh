import { SCORE_UNIT } from '../../../components/words/score-words';
import { leagueOfDivision } from '../../../lib/leagues';
import { orderValueShort, ordersByRecord } from '../../../lib/standings/order';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import TeamElo from '../../../components/teams/TeamElo';
import TeamElsewhere from '../../../components/teams/TeamElsewhere';
import TeamGameLog from '../../../components/teams/TeamGameLog';
import TeamIdentity from '../../../components/teams/TeamIdentity';
import TeamJvGames from '../../../components/jv/TeamJvGames';
import TeamJvRoster from '../../../components/jv/TeamJvRoster';
import TeamNextGame from '../../../components/teams/TeamNextGame';
import TeamOfficialFixtures from '../../../components/teams/TeamOfficialFixtures';
import TeamPlayerStats from '../../../components/teams/TeamPlayerStats';
import TeamPlayoffLine from '../../../components/teams/TeamPlayoffLine';
import TeamRoster from '../../../components/teams/TeamRoster';
import TeamSplits from '../../../components/teams/TeamSplits';
import TeamUnbeaten from '../../../components/teams/TeamUnbeaten';
import { buildPlayerStatsView } from '../../../components/teams/player-stats-view';
import { buildRosterView } from '../../../components/teams/roster-view';
import {
  buildTeamPageParts,
  postseasonDescription,
  postseasonKicker,
  rosterExtras,
} from '../../../components/teams/team-page-view';
import { buildTeamPageView } from '../../../components/teams/team-view';
import { regionIdSuffix } from '../../../components/leaders/scope';
import { buildOverviewDivision } from '../../../components/standings/standings-view';
import StandingsTable from '../../../components/standings/standings-table/StandingsTable';
import { gameKind } from '../../../components/ui/describe-game';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import { plural } from '../../../components/words/plural';
import SectionHeader from '../../../components/ui/SectionHeader';
import JsonLd from '../../../components/metadata/JsonLd';
import { OG_BASE } from '../../../components/layout/site';
import { teamJsonLd } from '../../../components/metadata/structured-data';
import { getLastLeagueResultDate, getStandings, getTeamSlugs, getTeams } from '../../../lib/data';
import { byDateThenId, recordString } from '../../../lib/format';
import { getLeague, regionOf } from '../../../lib/leagues';
import { HAS_RECRUITING, SPORT, SPORT_AUDIENCE } from '../../../lib/sports/current';

/**
 * /teams/[slug] — "How is MY team doing?" (DESIGN §33).
 *
 * One static page per member of each league's official alignment. There is ONE source order at
 * every width, so the DOM order matches the visual order at every breakpoint:
 *
 *  - the header (`TeamIdentity`): logo, the name as the h1, the league and division on one line,
 *    the record as figures, the pin state and the short Updated stamp;
 *  - the page's one tab row and its one sticky bar: Schedule, Standings, Roster, Stats (plain
 *    in-page anchors, no scroll-spy, so none is ever marked current);
 *  - the league's health note, only while its data is behind;
 *  - main column: Next game (one full-width row), Schedule (ONE log: league, non-league and
 *    postseason games merged in date order, then the fixtures that exist only on the league's
 *    official schedule under their own strip), JV games, Player stats, Roster, JV roster;
 *  - rail (beside the main column from 768px, after it below): the division's standings with this
 *    team's row bold, Last 5 games (form, streak, home and away records), the postseason picture,
 *    the opponents not beaten yet (only when there is one), the Elo rating (`#elo`), Elsewhere.
 *
 * A team with no results still gets this whole page: the header without figures, the schedule, the
 * official-schedule fixtures and every empty line (DESIGN §8).
 *
 * `id="player-stats"` comes BEFORE `id="roster"` and both are on every team page, in every league:
 * `buildPlayerStatsView` / `buildRosterView` return null only for a slug the data files do not
 * hold, which a registry team never is, and each prints one honest line when it has nothing. The
 * meta description names player stats and the roster only for a team whose page lists them. The
 * roster section links /clubs on every team page, empty rosters included (the clubs pages are not
 * in the nav).
 *
 * League-aware copy (SPEC §10.5), by the league's `postseason.kind`: the postseason block's heading
 * is `CCS picture` for a CCS league, `MCAL tournament picture` for MCAL and `Super Regional
 * picture` for the EAL, and the meta description ends the same way. An MCAL page carries no CCS
 * concept inside `<main>` (SPEC §10.9). The standings link goes to `/standings/<league>#<division>`,
 * and the official-schedule link (Elsewhere) to the division's own official schedule, which a
 * league that publishes none (the EAL) does not get. The postseason block's anchor is `#postseason`
 * on every page, so no MCAL URL carries a CCS concept either.
 *
 * A Southern Section independent (DESIGN §24.10) gets the same page as a league team: its table is
 * the group's (its games against the other four).
 */

/** All 99 prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getTeamSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/teams/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) return { title: 'Team not found' };
  const { team, standing, hasResults } = view;
  const record =
    hasResults && standing
      ? `${recordString(standing.computed)} in ${view.scopeLabel} (${ordersByRecord(leagueOfDivision(team.division).rules) ? orderValueShort(leagueOfDivision(team.division).rules, standing.computed) : plural(standing.computed.pts, 'pt', 'pts')})`
      : `${view.scopeLabel} — no results reported`;
  const extras = rosterExtras(
    buildPlayerStatsView(team.slug, [...view.leagueLog, ...view.nonLeagueLog]),
    buildRosterView(team.slug),
  );
  return {
    // With the mascot, as the school's teams are known and searched ("Fremont Firebirds"): the bare
    // name is ambiguous for a school named for its city (Fremont, Christopher, Prospect).
    title: `${team.name} ${team.mascot} ${SPORT.noun}`,
    description: `${team.name} ${team.mascot} ${SPORT_AUDIENCE} (${view.league.shortName}), unofficial: ${record}. Schedule, results, ${extras}${SCORE_UNIT} margins and ${postseasonDescription(view)}.`,
    alternates: { canonical: `/teams/${team.slug}` },
    openGraph: {
      ...OG_BASE,
      title: `${team.name} — ${record}`,
      description: `Scores, schedule and standings for ${team.name} ${SPORT_AUDIENCE}.`,
      url: `/teams/${team.slug}`,
    },
  };
}

export default async function TeamPage({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) notFound();

  const { team, leagueLog, nonLeagueLog, officialFixtures } = view;
  // Last season's row, the roster, JV and player-stats views (components/teams/team-page-view.ts).
  const parts = buildTeamPageParts(view);
  const { roster, jv, jvStanding, jvRoster, playerStats, rosterCount } = parts;

  // ONE schedule: every game of the team's, oldest first.
  const schedule = [...leagueLog, ...nonLeagueLog].sort(byDateThenId);
  // The division's table, as /standings and the Scores rail draw it.
  const table = buildOverviewDivision({
    division: team.division,
    standings: getStandings(team.division),
    teams: getTeams(),
    throughDate: getLastLeagueResultDate({ division: team.division }),
  });
  const next = view.nextCard.kind === 'game' ? view.nextCard.game : null;
  const bracketHref = next && gameKind(next) === 'postseason' ? (view.postseasonLine?.href ?? null) : null;

  return (
    <div className="pb-section-lg">
      <JsonLd data={teamJsonLd(team, getLeague(team.league))} />
      <TeamIdentity view={view} knownSlugs={getTeamSlugs()} />

      {/* The page's one tab row and its one sticky bar, on the page's own paper. Full-bleed on a
          phone, so rows scrolling under it are covered edge to edge. */}
      <nav
        aria-label="Team sections"
        className="sx-chrome-top sx-print-hide sticky top-topbar z-10 -mx-gutter bg-bg px-gutter md:top-topbar-lg md:mx-0 md:px-0"
      >
        <ul className="sx-tabs">
          <li>
            <a href="#schedule" className="sx-tab">
              Schedule
            </a>
          </li>
          <li>
            <a href="#standings" className="sx-tab">
              Standings
            </a>
          </li>
          <li>
            <a href="#roster" className="sx-tab">
              Roster
            </a>
          </li>
          <li>
            <a href="#player-stats" className="sx-tab">
              Stats
            </a>
          </li>
        </ul>
      </nav>

      <LeagueHealthNote leagueId={team.league} className="mt-4" />

      <div className="sx-cols">
        <div className="min-w-0">
          <TeamNextGame card={view.nextCard} teamName={team.name} league={view.league} bracketHref={bracketHref} />

          <section id="schedule" className="sx-section sx-target" aria-labelledby="schedule-heading">
            <SectionHeader id="schedule-heading" kicker="Schedule" meta={schedule.length > 0 ? plural(schedule.length, 'game') : undefined} />
            <TeamGameLog games={schedule} perspective={team.slug} emptyHeading="No games listed" />
            {officialFixtures.length > 0 ? (
              <>
                <SectionHeader
                  strip
                  kicker={`On ${view.league.shortName}’s schedule only`}
                  meta={plural(officialFixtures.length, 'game')}
                  className="mt-4"
                />
                <TeamOfficialFixtures
                  fixtures={officialFixtures}
                  slug={team.slug}
                  division={team.division}
                  today={view.today}
                />
              </>
            ) : null}
          </section>

        </div>

        <aside className="sx-rail min-w-0" aria-label={`${team.name} standings and season`}>
          <section id="standings" className="sx-section sx-target" aria-labelledby="standings-heading">
            <h2 id="standings-heading">{view.divisionHeading ? `${view.divisionHeading} standings` : view.standingsLabel}</h2>
            <StandingsTable
              division={table.division}
              rows={table.rows}
              gdDomain={0}
              variant="mini"
              caption={table.caption}
              berthRuleAfter={table.ladderLine?.after}
              self={team.slug}
              notes="none"
            />
            <ul className="sx-linkrow">
              <li>
                <Link href={view.standingsHref} prefetch={false} className="sx-action">
                  Full standings
                </Link>
              </li>
            </ul>
          </section>

          <section className="sx-section" aria-labelledby="form-heading">
            <h2 id="form-heading">Last 5 games</h2>
            <TeamSplits view={view} />
          </section>

          <section id="postseason" className="sx-section sx-target" aria-labelledby="postseason-heading">
            <h2 id="postseason-heading">{postseasonKicker(view)}</h2>
            <TeamPlayoffLine view={view} />
          </section>

          <TeamUnbeaten view={view} />

          <TeamElo elo={view.elo} />

          <TeamElsewhere
            team={team}
            sblive={parts.sblive}
            history={parts.history}
            historySize={parts.historySize}
            historyScope={parts.historyScope}
            officialSchedule={
              view.officialScheduleUrl ? { href: view.officialScheduleUrl, leagueShort: view.league.shortName } : null
            }
          />
        </aside>
      </div>

      {/* Below the rail the page is one column again, full width: the two-column grid ends where the
          rail does, so the right third is never blank for thousands of pixels. On a phone the rail
          (standings, last 5, the playoff picture) therefore comes before the long lists. */}
      {/* The JV list comes after the varsity schedule and before the players: it is the same
          school's other team, and none of its games feeds a varsity figure. */}
      {jv ? (
        <section id="jv" className="sx-section sx-target" aria-labelledby="jv-heading">
          <SectionHeader
            id="jv-heading"
            kicker="JV games"
            meta={jvStanding?.line ?? (jv.rows.length > 0 && jv.record ? jv.record.overall : undefined)}
            action={jvStanding ? { href: jvStanding.href, label: 'JV standings' } : undefined}
          />
          <TeamJvGames view={jv} />
        </section>
      ) : null}

      {playerStats ? (
        <section id="player-stats" className="sx-section sx-target" aria-labelledby="player-stats-heading">
          <SectionHeader
            id="player-stats-heading"
            kicker="Player stats"
            action={{ href: `/leaders#players${regionIdSuffix(regionOf(team.league))}`, label: 'Leaders' }}
          />
          <TeamPlayerStats view={playerStats} />
        </section>
      ) : null}

      {roster ? (
        <section id="roster" className="sx-section sx-target" aria-labelledby="roster-heading">
          <SectionHeader
            id="roster-heading"
            kicker="Roster"
            meta={rosterCount > 0 ? plural(rosterCount, 'player') : undefined}
            action={HAS_RECRUITING ? { href: '/clubs', label: 'Club teams' } : undefined}
          />
          <TeamRoster view={roster} />
        </section>
      ) : null}

      {/* The JV roster, last: only a school some source lists JV players for has the section. */}
      {jvRoster ? (
        <section id="jv-roster" className="sx-section sx-target" aria-labelledby="jv-roster-heading">
          <SectionHeader
            id="jv-roster-heading"
            kicker="JV roster"
            meta={jvRoster.rows.length > 0 ? plural(jvRoster.rows.length, 'player') : undefined}
          />
          {/* Optional data, closed by default: the school's other team, as long as the varsity list. */}
          <details className="sx-disclosure">
            <summary>Show JV roster</summary>
            <TeamJvRoster view={jvRoster} />
          </details>
        </section>
      ) : null}
    </div>
  );
}
