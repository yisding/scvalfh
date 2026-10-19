/**
 * What app/teams/[slug]/page.tsx renders besides `TeamPageView` (views/teams/team-view.ts): the
 * roster, the JV games and place, the player stats and last season's row, bundled once per slug
 * (`buildTeamPageBundle`), and the layout facts components/teams/TeamPageGrid.tsx branches on
 * (`teamPageLayout`). generateMetadata and the page both read the bundle, so the description names
 * player stats and the roster from the very objects the page then renders, and each is built once
 * per team instead of twice.
 */

import { getHistoryFor, getHistorySeason, getHistoryStandings } from '@/lib/datasets/history';
import type { Game } from '@/lib/model/game';
import type { DivisionId } from '@/lib/model/ids';
import { teamJvStanding } from '@/views/standings/jv';
import { buildTeamJvView, type TeamJvView } from './jv';
import { buildPlayerStatsView, type PlayerStatsView } from './player-stats';
import { buildRosterView, type RosterView } from './roster';
import { buildTeamPageView, lastSeasonScope, type TeamPageView } from './team-view';

/**
 * Last season's varsity row from the league's own 2025-26 standings (SCVAL's PDF, BVAL's sheet;
 * PCAL, MCAL and the EAL are unavailable, so their slugs have no rows), and the size of that
 * division as it was then (the alignment can change between seasons: Leland played in Santa
 * Teresa in 2025-26 and is in Mt. Hamilton now).
 */
export interface TeamLastSeason {
  /** '2025-26' */
  season: string;
  /** The division the row sat in then, which the history page anchors by. */
  division: DivisionId;
  place: number;
  /** How many rows that division's varsity table had. */
  size: number;
  /** `lastSeasonScope`: the division heading, league-prefixed when it is another league's. */
  scope: string;
  /** The record exactly as the league's standings printed it. */
  record: string;
}

export interface TeamPageBundle {
  view: TeamPageView;
  /** Both exist for every registry team; an empty or pending team gets a stated empty state. */
  roster: RosterView | null;
  /** The school's JV games (MaxPreps, supplemented by si.com): listed apart from every varsity count. */
  jv: TeamJvView | null;
  /** Its JV place, when its division's JV table is shown (lib/engine/jv/standings.ts), and that table's anchor. */
  jvStanding: { line: string | null; href: string } | null;
  playerStats: PlayerStatsView | null;
  history: TeamLastSeason | null;
}

/** The datasets are static for a build or a Worker's life, so a bundle never goes stale. */
const bundles = new Map<string, TeamPageBundle | null>();

function lastSeasonOf(view: TeamPageView): TeamLastSeason | null {
  const { team } = view;
  const found = getHistoryFor(team.slug).find((entry) => entry.level === 'varsity');
  if (!found) return null;
  return {
    season: getHistorySeason(),
    division: found.division,
    place: found.row.place,
    size: getHistoryStandings(found.division).length,
    scope: lastSeasonScope(found.division, team.league),
    record: found.row.leagueRecord,
  };
}

/** null for a slug that is not a registry team. Memoized per slug. */
export function buildTeamPageBundle(slug: string): TeamPageBundle | null {
  if (bundles.has(slug)) return bundles.get(slug) ?? null;
  const view = buildTeamPageView(slug);
  const bundle: TeamPageBundle | null = view
    ? {
        view,
        roster: buildRosterView(view.team.slug),
        jv: buildTeamJvView(view.team.slug),
        jvStanding: teamJvStanding(view.team.slug),
        playerStats: buildPlayerStatsView(view.team.slug, [...view.leagueLog, ...view.nonLeagueLog]),
        history: lastSeasonOf(view),
      }
    : null;
  bundles.set(slug, bundle);
  return bundle;
}

export interface TeamPageLayout {
  /**
   * A team whose every league game is still to come (Metro South Bay before Oct 7, Newport Harbor before
   * Oct 13) has no league result for MaxPreps to have either, so its empty state names the first game
   * instead of "MaxPreps may have results we have not picked up yet" (review 2026-10-06). That hedge stays
   * for a league game dated on or before the snapshot's Pacific day that has no score.
   */
  firstLeagueGame: Game | null;
  hasPlayedLeagueGames: boolean;
  /** The League log spans two rows at 1024px+ (see TeamPageGrid's docblock). */
  leagueLogSpans: boolean;
  /** More than six official-only fixtures and no spanning log: they take both columns. */
  fixturesSpan: boolean;
  /** The League log outweighs Non-league by four rows or more: Elsewhere moves up beside it. */
  logOutweighs: boolean;
  maxprepsAction: { href: string; label: string; external: true } | undefined;
  /** The JV header's meta line; undefined when the team has no JV games listed. */
  jvMeta: string | undefined;
  /** Rows of a roster that is not an error state. */
  rosterCount: number;
}

/** `today` is getToday(): the snapshot's Pacific day, never the clock. */
export function teamPageLayout(
  { view, jv, jvStanding, roster }: Pick<TeamPageBundle, 'view' | 'jv' | 'jvStanding' | 'roster'>,
  today: string,
): TeamPageLayout {
  const { team, leagueLog, nonLeagueLog, marginEntries, officialFixtures } = view;
  const earliestLeague = leagueLog.reduce<(typeof leagueLog)[number] | null>(
    (first, g) => (first === null || g.dateLocal < first.dateLocal ? g : first),
    null,
  );
  const hasPlayedLeagueGames = marginEntries.some(
    (entry) => entry.margin !== null && !entry.excludedFromMargin,
  );
  const leagueLogSpans = hasPlayedLeagueGames && officialFixtures.length > 0;
  return {
    firstLeagueGame: earliestLeague !== null && earliestLeague.dateKey > today ? earliestLeague : null,
    hasPlayedLeagueGames,
    leagueLogSpans,
    fixturesSpan: !leagueLogSpans && officialFixtures.length > 6,
    logOutweighs:
      hasPlayedLeagueGames && officialFixtures.length === 0 && leagueLog.length - nonLeagueLog.length >= 4,
    maxprepsAction: team.external.maxprepsScheduleUrl
      ? { href: team.external.maxprepsScheduleUrl, label: 'Check MaxPreps', external: true }
      : undefined,
    jvMeta: jv
      ? (jvStanding?.line ??
        (jv.rows.length > 0
          ? [
              `${jv.played} played`,
              jv.toCome > 0 ? `${jv.toCome} to come` : null,
              jv.noScore > 0 ? `${jv.noScore} no score` : null,
            ]
              .filter((part) => part !== null)
              .join(' · ')
          : undefined))
      : undefined,
    rosterCount: roster && roster.status !== 'error' ? roster.rows.length : 0,
  };
}
