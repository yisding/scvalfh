import Link from 'next/link';

import TeamElo from '@/components/teams/TeamElo';
import TeamJvGames from '@/components/teams/TeamJvGames';
import TeamNextGame from '@/components/teams/TeamNextGame';
import TeamOfficialFixtures from '@/components/teams/TeamOfficialFixtures';
import TeamPlayerStats from '@/components/teams/TeamPlayerStats';
import TeamPlayoffLine from '@/components/teams/TeamPlayoffLine';
import TeamRoster from '@/components/teams/TeamRoster';
import TeamSplits from '@/components/teams/TeamSplits';
import TeamStatTiles from '@/components/teams/TeamStatTiles';
import TeamUnbeaten from '@/components/teams/TeamUnbeaten';
import Arrow from '@/components/ui/Arrow';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { regionIdSuffix, regionOf } from '@/lib/config/leagues';
import { plural } from '@/lib/format/words';
import type { TeamJvView } from '@/views/teams/jv';
import type { PlayerStatsView } from '@/views/teams/player-stats';
import type { RosterView } from '@/views/teams/roster';
import type { TeamLastSeason, TeamPageBundle, TeamPageLayout } from '@/views/teams/team-page';
import { postseasonKicker, type TeamPageView } from '@/views/teams/team-view';

import TeamElsewhere from './TeamElsewhere';
import TeamFormAndMargin from './TeamFormAndMargin';
import TeamLastGame from './TeamLastGame';
import TeamLeagueLog from './TeamLeagueLog';
import TeamNonLeague from './TeamNonLeague';

/**
 * /teams/[slug] — "How is MY team doing?" (DESIGN §3.7).
 *
 * One static page per registry team (each league's official alignment). There is ONE source order
 * at every width, so the DOM order matches the visual order at every breakpoint (DESIGN §10.5):
 * identity (whose second meta line states the place: "where do we stand") → Last ("what just
 * happened") → Next ("when is the next one") → the stat tiles and their disclosure, the Elo rating
 * (collapsed, DESIGN §20.2), and the standings and official-schedule links → Form / Margin → the
 * rest. The tiles used to sit between
 * the identity card and Last, which pushed the Next game's date and opponent off the first phone
 * screen on every team.
 *
 * app/teams/[slug]/page.tsx renders the identity card and the health note and hands this component
 * everything below them (views/teams/team-page.ts builds the bundle and the layout facts).
 *
 * Layout (modernization brief §5.7): the identity hero card and the league's health note, then ONE
 * grid whose children stay in that DOM order. One column on a phone. From 768px Last and Next pair
 * up (both cards stretch to the row, so the pair ends level) and every section after them takes
 * both columns until 1024px. Rows are separated by space, never by a rule. From 768px the Last
 * card is the `GameCard` (time, both teams, recap, and the Next card's own 44px pills: Full game
 * page / MaxPreps box score / NFHS stream) instead of the phone's expanded `GameRow`, so it fills
 * its half of the row like the Next card does and both cards word and style their links alike.
 *
 * At 1024px+ a strict pairing left 250–350px holes beside every tall section (Form beside Margin,
 * Who we haven't beaten beside the League game log). So the two tallest sections SPAN two rows
 * and the short ones stack beside them, still by plain auto-placement (no `dense`, no explicit
 * order), so reading order = DOM order = row-major visual order:
 *
 *     Last           | Next
 *     Stat tiles, the collapsed Elo rating and the standings / official-schedule links (both columns)
 *     Form           | Margin (2 rows)
 *     Splits         |   ″
 *     Postseason     | Who we haven't beaten
 *     League log (2) | On <SHORT>’s schedule only
 *        ″           | Non-league
 *     Elsewhere (both columns, or under Non-league — see `logOutweighs` below)
 *     JV games (both columns)
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
 *     Postseason     | Who we haven't beaten
 *     League log     | Non-league
 *        ″           | Elsewhere
 *
 * A team with no results still gets this whole page: identity, links, the postseason line, the
 * official-schedule fixtures and every empty state (DESIGN §8).
 *
 * The player stats and the roster come after every game section: they answer "who is on this
 * team, and who is scoring?", which is not one of the parent's three questions, and at up to 30
 * rows each they would push those below the fold. Stats lead, since they change after every game.
 * Both sections appear on every team page, in every league: `buildPlayerStatsView` /
 * `buildRosterView` return null only for a slug the data files do not hold, which a registry team
 * never is. The empty states are honest about why: MaxPreps lists no players, the coach entered no
 * stats, the last update failed with nothing to fall back on, or no update has covered the team
 * yet. The meta description names player stats and the roster only for a team whose page lists
 * them. The roster section links /clubs on every team page, empty rosters included (its header
 * action, "Club teams": the clubs pages are not in the nav, DESIGN §17.4); a rostered player a
 * public page ties to a club also gets a club line in the list itself (TeamRoster). A rostered
 * player a public page says has committed to a college gets a commitment line linking their row on
 * /commits, with a footnote (TeamRoster, DESIGN §21.5); /commits adds no header action, so the
 * Roster header keeps its one.
 *
 * League-aware copy (SPEC §10.5), by the league's `postseason.kind`: the postseason section's
 * kicker is `CCS picture` for a CCS league, `MCAL tournament picture` for MCAL and `Super Regional
 * picture` for the EAL, and the meta description ends `… goal margins and CCS picture.`, `… and MCAL
 * tournament picture.` or `… and Super Regional picture.` An MCAL page carries no CCS concept
 * inside `<main>` (SPEC §10.9). The standings link goes to `/standings/<league>#<division>`, and
 * the official-schedule link to the division's own official schedule (config), which a league that
 * publishes none (the EAL) does not get. The postseason section's anchor is `#postseason` on
 * every page, so no MCAL URL carries a CCS concept either.
 *
 * A Southern Section independent (DESIGN §24.10) gets the same page as a league team: its table is the
 * group's (its games against the other four), so "League" here means those games, as the standings page says.
 */
export default function TeamPageGrid({
  view,
  roster,
  jv,
  jvStanding,
  playerStats,
  history,
  layout,
}: {
  view: TeamPageView;
  roster: RosterView | null;
  jv: TeamJvView | null;
  jvStanding: TeamPageBundle['jvStanding'];
  playerStats: PlayerStatsView | null;
  history: TeamLastSeason | null;
  layout: TeamPageLayout;
}) {
  const { team, officialFixtures } = view;
  const { leagueLogSpans, fixturesSpan, logOutweighs, maxprepsAction } = layout;

  return (
    <div className="mt-6 grid gap-y-section md:grid-cols-2 md:gap-x-6 lg:gap-x-10 lg:gap-y-section-lg">
      {/* LAST and NEXT: the two questions a parent on the turf actually has. "All games" jumps
          to the full league log (`#league-log`), otherwise seven sections further down. */}
      <TeamLastGame view={view} maxprepsAction={maxprepsAction} />

      <TeamNextGame card={view.nextCard} teamName={team.name} league={view.league} />

      {/* The tiles, the collapsed Elo rating and the two league links are one grid item, so the
          links keep their 16px under the tiles instead of a section gap. Both columns from 768px. */}
      <div className="min-w-0 md:col-span-2">
        <TeamStatTiles view={view} className="min-w-0" />
        <TeamElo elo={view.elo} />
        {/* On the canvas, so the pills take the card's surface and ring (surface-2 on hover):
            the grey pill fill all but vanished there in light mode. */}
        <p className="mt-4 mb-0 flex flex-wrap gap-2">
          <Link
            href={view.standingsHref}
            prefetch={false}
            className="sx-pill sx-pill-ring"
          >
            {view.standingsLabel} <Arrow />
          </Link>
          {view.officialScheduleUrl ? (
            <ExternalLink
              href={view.officialScheduleUrl}
              className="sx-pill sx-pill-ring"
            >
              Official {view.league.shortName} schedule
            </ExternalLink>
          ) : null}
        </p>
      </div>

      {/* A team with no reported results gets ONE empty state here, not an empty form strip
          beside an empty chart (DESIGN §8). */}
      <TeamFormAndMargin view={view} layout={layout} />

      <section className="min-w-0 md:max-lg:col-span-2">
        <SectionHeader kicker="Splits" />
        <TeamSplits view={view} />
      </section>

      <section id="postseason" className="min-w-0 md:max-lg:col-span-2">
        <SectionHeader kicker={postseasonKicker(view)} meta="Not official" />
        <TeamPlayoffLine view={view} />
      </section>

      <section className="min-w-0 md:max-lg:col-span-2">
        <SectionHeader
          kicker="Who we haven’t beaten"
          meta={`${view.scopeLabel} only`}
        />
        <TeamUnbeaten view={view} />
      </section>

      <TeamLeagueLog view={view} leagueLogSpans={leagueLogSpans} />

      {officialFixtures.length > 0 ? (
        <section
          className={fixturesSpan ? 'min-w-0 md:col-span-2' : 'min-w-0 md:max-lg:col-span-2'}
        >
          <SectionHeader
            kicker={`On ${view.league.shortName}’s schedule only`}
            meta={plural(officialFixtures.length, 'fixture')}
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
        <TeamNonLeague view={view} />

        <TeamElsewhere team={team} history={history} logOutweighs={logOutweighs} />
      </div>

      {/* The JV list comes after every varsity game section and before the players: it is the
          same school's other team, and none of its games feeds the varsity sections above. Its
          header names the team's JV place when its division's JV table is shown, and links that
          table. Both columns from 768px, like the lists below it. */}
      {jv ? (
        <section className="min-w-0 md:col-span-2" id="jv">
          <SectionHeader
            kicker="JV games"
            meta={layout.jvMeta}
            action={jvStanding ? { href: jvStanding.href, label: 'JV standings' } : undefined}
          />
          <TeamJvGames view={jv} perspective={team.slug} />
        </section>
      ) : null}

      {/* Player stats, then the roster, after every game section (see the docblock). Both take
          both columns at every width from 768px: a 30-row table in half a column is not a table
          anyone scans. */}
      {playerStats ? (
        <section className="min-w-0 md:col-span-2" id="player-stats">
          <SectionHeader
            kicker="Player stats"
            meta="This season, from MaxPreps"
            action={{ href: `/leaders#players${regionIdSuffix(regionOf(team.league))}`, label: 'Site leaders' }}
          />
          <TeamPlayerStats view={playerStats} />
        </section>
      ) : null}

      {roster ? (
        <section className="min-w-0 md:col-span-2" id="roster">
          <SectionHeader
            kicker="Roster"
            meta={layout.rosterCount > 0 ? plural(layout.rosterCount, 'player') : undefined}
            action={{ href: '/clubs', label: 'Club teams' }}
          />
          <TeamRoster view={roster} />
        </section>
      ) : null}
    </div>
  );
}
