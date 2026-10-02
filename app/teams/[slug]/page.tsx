import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import TeamGameLog from '@/components/teams/TeamGameLog';
import TeamIdentity from '@/components/teams/TeamIdentity';
import TeamNextGame from '@/components/teams/TeamNextGame';
import TeamOfficialFixtures from '@/components/teams/TeamOfficialFixtures';
import TeamPlayerStats from '@/components/teams/TeamPlayerStats';
import TeamPlayoffLine from '@/components/teams/TeamPlayoffLine';
import TeamRoster from '@/components/teams/TeamRoster';
import TeamSplits from '@/components/teams/TeamSplits';
import TeamStatTiles from '@/components/teams/TeamStatTiles';
import TeamUnbeaten from '@/components/teams/TeamUnbeaten';
import { buildPlayerStatsView } from '@/components/teams/player-stats-view';
import { buildRosterView } from '@/components/teams/roster-view';
import { buildTeamPageView } from '@/components/teams/team-view';
import EmptyState from '@/components/ui/EmptyState';
import ExternalLink from '@/components/ui/ExternalLink';
import FormStrip from '@/components/ui/FormStrip';
import { GameCard, GameRow } from '@/components/ui/GameRow';
import MarginStrip from '@/components/ui/MarginStrip';
import SectionHeader from '@/components/ui/SectionHeader';
import { OG_BASE } from '@/components/layout/site-url';
import { getTeamSlugs } from '@/lib/data';
import { ordinal, recordString, shortDate } from '@/lib/format';
import { getHistoryFor, getHistorySeason, getHistoryStandings } from '@/lib/history';
import { DIVISION_LABELS } from '@/lib/season';

/**
 * /teams/[slug] — "How is MY team doing?" (DESIGN §3.7).
 *
 * Fifteen static pages, one per member of the official SCVAL alignment. There is ONE source order
 * at every width, so the DOM order matches the visual order at every breakpoint (DESIGN §10.5):
 * identity (whose meta line states the place: "where do we stand") → Last ("what just happened")
 * → Next ("when is the next one") → the stat tiles and their disclosure → Form / Margin → the
 * rest. The tiles used to sit between the identity card and Last, which pushed the Next game's
 * date and opponent off the first phone screen on every team.
 *
 * Layout (modernization brief §5.7): the identity hero card, then ONE grid whose children stay in
 * that DOM order. One column on a phone. From 768px Last and Next pair up (both cards stretch to
 * the row, so the pair ends level) and every section after them takes both columns until 1024px.
 * Rows are separated by space, never by a rule. From 768px the Last card is the `GameCard` (time,
 * both teams, recap, Game page link) instead of the phone's expanded `GameRow`, so it fills its
 * half of the row like the Next card does.
 *
 * At 1024px+ a strict pairing left 250–350px holes beside every tall section (Form beside Margin,
 * Who we haven't beaten beside the League game log). So the two tallest sections SPAN two rows
 * and the short ones stack beside them, still by plain auto-placement (no `dense`, no explicit
 * order), so reading order = DOM order = row-major visual order:
 *
 *     Last           | Next
 *     Stat tiles (both columns; one 6-up band from 1280px)
 *     Form           | Margin (2 rows)
 *     Splits         |   ″
 *     CCS picture    | Who we haven't beaten
 *     League log (2) | On SCVAL's schedule only
 *        ″           | Non-league
 *     Elsewhere (both columns, or under Non-league — see `logOutweighs` below)
 *     Player stats (both columns)
 *     Roster (both columns)
 *
 * The League log spans only when the official-only fixtures card exists and there are league
 * results. Without results the log is a short empty state and the official-fixtures list
 * is the long one (14 rows), so a list of more than six fixtures takes BOTH columns instead of
 * leaving a ~600px hole beside it; the short Non-league card then sits under it.
 *
 * With no official-only fixtures the cell beside the League log is Non-league alone. When the log
 * outweighs it by four rows or more (`logOutweighs`) that left a blank column of 200–500px with
 * Elsewhere stranded full-width under the log. So Non-league and Elsewhere (adjacent in the DOM)
 * share one wrapper, `display: contents` below 1024px and a flex column from there, and Elsewhere
 * moves up into the hole, still after Non-league in both reading and visual order:
 *
 *     CCS picture    | Who we haven't beaten
 *     League log     | Non-league
 *        ″           | Elsewhere
 *
 * A team with no results still gets this whole page: identity, links, the CCS line, the
 * official-schedule fixtures and every empty state (DESIGN §8).
 *
 * The player stats and the roster come after every game section: they answer "who is on this
 * team, and who is scoring?", which is not one of the parent's three questions, and at up to 30
 * rows each they would push those below the fold. Stats lead, since they change after every game.
 */

/** All 15 prerendered; anything else is a 404 rather than a runtime render. */
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
      ? `${recordString(standing.computed)} in ${view.divisionLabel} (${standing.computed.pts} pts)`
      : `${view.divisionLabel} division — no results reported`;
  return {
    title: `${team.name} field hockey`,
    description: `${team.name} ${team.mascot} girls varsity field hockey: ${record}. Schedule, results, goal margins, CCS picture, player stats and roster. Unofficial, rebuilt nightly from MaxPreps.`,
    alternates: { canonical: `/teams/${team.slug}` },
    openGraph: {
      ...OG_BASE,
      title: `${team.name} — ${record}`,
      description: `Scores, schedule and standings for ${team.name} girls varsity field hockey.`,
      url: `/teams/${team.slug}`,
    },
  };
}

export default async function TeamPage({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) notFound();

  const {
    team,
    last,
    leagueLog,
    nonLeagueLog,
    marginEntries,
    formEntries,
    officialFixtures,
    leaguePlayed,
    leagueScheduled,
  } = view;
  // Last season's varsity row from the 2025-26 SCVAL standings PDF, and the size of that
  // division as it was then (the alignment can change between seasons).
  const history = getHistoryFor(team.slug).find((entry) => entry.level === 'varsity');
  const historySize = history ? getHistoryStandings(history.division).length : 0;
  const sblive = team.external.sbliveGamesUrl;
  const roster = buildRosterView(team.slug);
  const playerStats = buildPlayerStatsView(team.slug, [...leagueLog, ...nonLeagueLog]);
  const rosterCount = roster && roster.status !== 'error' ? roster.rows.length : 0;
  const hasPlayedLeagueGames = marginEntries.some(
    (entry) => entry.margin !== null && !entry.excludedFromMargin,
  );

  const leagueLogSpans = hasPlayedLeagueGames && officialFixtures.length > 0;
  const fixturesSpan = !leagueLogSpans && officialFixtures.length > 6;
  const logOutweighs =
    hasPlayedLeagueGames &&
    officialFixtures.length === 0 &&
    leagueLog.length - nonLeagueLog.length >= 4;

  const maxprepsAction = team.external.maxprepsScheduleUrl
    ? { href: team.external.maxprepsScheduleUrl, label: 'Check MaxPreps', external: true }
    : undefined;

  return (
    <div className="pb-section-lg">
      <TeamIdentity view={view} knownSlugs={getTeamSlugs()} />

      <div className="mt-6 grid gap-y-section md:grid-cols-2 md:gap-x-6 lg:gap-x-10 lg:gap-y-section-lg">
        {/* LAST and NEXT: the two questions a parent on the turf actually has. "All games" jumps
            to the full league log (`#league-log`), otherwise seven sections further down. */}
        <section className="flex min-w-0 flex-col">
          <SectionHeader
            kicker="Last"
            meta={
              last
                ? `${shortDate(last.dateLocal)} · ${last.isLeague ? 'League' : 'Non-league'}`
                : undefined
            }
            action={{ href: '#league-log', label: 'All games' }}
          />
          {last ? (
            <>
              <div className="sx-card sx-flush sx-bleed md:hidden">
                <GameRow game={last} perspective={team.slug} defaultExpanded showTime={false} />
              </div>
              <div className="hidden md:flex md:flex-1 md:flex-col">
                <GameCard game={last} perspective={team.slug} className="flex-1" />
              </div>
            </>
          ) : (
            <EmptyState heading={`No results reported for ${team.name}.`} action={maxprepsAction}>
              Their schedule is below, and MaxPreps may have results we have not picked up yet.
            </EmptyState>
          )}
        </section>

        <TeamNextGame card={view.nextCard} teamName={team.name} />

        <TeamStatTiles view={view} className="min-w-0 md:col-span-2" />

        {/* A team with no reported results gets ONE empty state here, not an empty form strip
            beside an empty chart (DESIGN §8). */}
        {hasPlayedLeagueGames ? (
          <>
            <section className="min-w-0 md:max-lg:col-span-2">
              <SectionHeader kicker="Form" meta="League, oldest to newest" />
              {/* 24px chips fill more of their 40px tap boxes, so the five read as one sequence;
                  the direction is in the heading's meta, and the non-league count gets its own
                  line instead of trailing off the end of the strip. */}
              <div className="sx-card p-4 md:p-5">
                <div className="flex min-h-11 items-center">
                  <FormStrip
                    entries={formEntries}
                    size={24}
                    label={`${team.name} last ${formEntries.length} league games`}
                  />
                </div>
                {nonLeagueLog.length > 0 ? (
                  <p className="mt-2 mb-0 text-meta text-ink-3">
                    {`+ ${nonLeagueLog.length} non-league ${nonLeagueLog.length === 1 ? 'game' : 'games'}, not counted here`}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="min-w-0 md:max-lg:col-span-2 lg:row-span-2">
              <SectionHeader kicker="Margin by league game" meta={`${leaguePlayed} played`} />
              {/* `slots`: the team's real league slate (12 in De Anza, 14 in El Camino). */}
              <div className="sx-card p-4 md:p-5">
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  slots={leagueScheduled}
                  className="hidden md:block"
                  height={200}
                />
                <MarginStrip
                  entries={marginEntries}
                  teamName={team.name}
                  slots={leagueScheduled}
                  className="md:hidden"
                  height={160}
                />
              </div>
            </section>
          </>
        ) : (
          <section className="min-w-0 md:col-span-2">
            <SectionHeader kicker="Form and goal margin" />
            <EmptyState
              heading={`No league results reported for ${team.name}.`}
              action={maxprepsAction}
            >
              Their schedule is below, and MaxPreps may have results we have not picked up yet. We
              do not fill the gap with zeroes.
            </EmptyState>
          </section>
        )}

        <section className="min-w-0 md:max-lg:col-span-2">
          <SectionHeader kicker="Splits" />
          <TeamSplits view={view} />
        </section>

        <section id="ccs" className="min-w-0 md:max-lg:col-span-2">
          <SectionHeader kicker="CCS picture" meta="Not official" />
          <TeamPlayoffLine view={view} />
        </section>

        <section className="min-w-0 md:max-lg:col-span-2">
          <SectionHeader
            kicker="Who we haven't beaten"
            meta={`${DIVISION_LABELS[team.division]} only`}
          />
          <TeamUnbeaten view={view} />
        </section>

        <section
          id="league-log"
          className={
            leagueLogSpans
              ? 'min-w-0 md:max-lg:col-span-2 lg:row-span-2'
              : 'min-w-0 md:max-lg:col-span-2'
          }
        >
          <SectionHeader
            kicker="League game log"
            meta={`${leaguePlayed} of ${leagueScheduled}`}
            action={{ href: `/standings#${team.division}`, label: 'Standings' }}
          />
          <TeamGameLog
            games={leagueLog}
            perspective={team.slug}
            emptyHeading={`No league games are published for ${team.name}.`}
            emptyBody={`The official ${DIVISION_LABELS[team.division]} schedule has ${leagueScheduled} division games for them; none of those fixtures has a contest in any data source.`}
          />
        </section>

        {officialFixtures.length > 0 ? (
          <section
            className={fixturesSpan ? 'min-w-0 md:col-span-2' : 'min-w-0 md:max-lg:col-span-2'}
          >
            <SectionHeader
              kicker="On SCVAL's schedule only"
              meta={`${officialFixtures.length} fixture${officialFixtures.length === 1 ? '' : 's'}`}
            />
            <TeamOfficialFixtures
              fixtures={officialFixtures}
              slug={team.slug}
              division={team.division}
              today={view.today}
            />
          </section>
        ) : null}

        {/* Non-league + Elsewhere: two grid items, or (logOutweighs) one lg column beside the
            League log. `contents` keeps them two grid items below 1024px either way. */}
        <div className={logOutweighs ? 'contents lg:flex lg:flex-col lg:gap-y-section-lg' : 'contents'}>
          <section className="min-w-0 md:max-lg:col-span-2">
            <SectionHeader kicker="Non-league" meta={`${nonLeagueLog.length} games`} />
            <TeamGameLog
              games={nonLeagueLog}
              perspective={team.slug}
              emptyHeading={`${team.name} has no non-league games this season.`}
              emptyBody="Every game on their schedule counts toward the division record."
            />
          </section>

          <section
            className={logOutweighs ? 'min-w-0 md:max-lg:col-span-2' : 'min-w-0 md:col-span-2'}
          >
            <SectionHeader kicker="Elsewhere" />
            {/* Pills (40px), not bare text links: three standalone links stacked at text height
                were 17px tall and 21px apart, which axe reported as a serious WCAG 2.5.8 failure
                on /teams/st-ignatius. A link inside a sentence stays as it is; these are not. They
                sit on the canvas, not in a card, where the grey pill fill barely differs from it
                and the capsules disappeared in light mode, so they take the card's surface and
                ring (surface-2 on hover). */}
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {team.external.maxprepsTeamUrl ? (
                <li>
                  <ExternalLink
                    href={team.external.maxprepsTeamUrl}
                    className="sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
                  >
                    MaxPreps: {team.name} field hockey
                  </ExternalLink>
                </li>
              ) : null}
              {team.external.maxprepsScheduleUrl ? (
                <li>
                  <ExternalLink
                    href={team.external.maxprepsScheduleUrl}
                    className="sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
                  >
                    MaxPreps schedule &amp; scores
                  </ExternalLink>
                </li>
              ) : null}
              {sblive ? (
                <li>
                  <ExternalLink
                    href={sblive}
                    className="sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
                  >
                    SBLive / SI: {team.name}
                  </ExternalLink>
                </li>
              ) : null}
            </ul>
            {/* Last season in one line, record exactly as the 2025-26 SCVAL PDF printed it ("1-13":
                that division's table has no tie column). The site-wide disclaimer that sat here
                is the footer's, so it is no longer repeated on every team page. */}
            {history ? (
              <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
                Last season ({getHistorySeason()}): {ordinal(history.row.place)} of {historySize} in{' '}
                {DIVISION_LABELS[history.division]}, {history.row.leagueRecord} &mdash;{' '}
                <Link href={`/history/2025-26#${history.division}`} prefetch={false}>
                  full {getHistorySeason()} standings
                </Link>
              </p>
            ) : null}
          </section>
        </div>

        {/* Player stats, then the roster, after every game section (see the docblock). Both take
            both columns at every width from 768px: a 30-row table in half a column is not a table
            anyone scans. */}
        {playerStats ? (
          <section className="min-w-0 md:col-span-2" id="player-stats">
            <SectionHeader kicker="Player stats" meta="This season, from MaxPreps" />
            <TeamPlayerStats view={playerStats} />
          </section>
        ) : null}

        {roster ? (
          <section className="min-w-0 md:col-span-2" id="roster">
            <SectionHeader
              kicker="Roster"
              meta={rosterCount > 0 ? `${rosterCount} player${rosterCount === 1 ? '' : 's'}` : undefined}
            />
            <TeamRoster view={roster} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
