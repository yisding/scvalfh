/**
 * The /leaders page (DESIGN §16, §23, §28): leaderboards over every covered league and the independents,
 * built once per region (NorCal, then SoCal: DESIGN-socal §2.3, §2.4), derived from the two files the rest
 * of the site already reads. Pure, so tests/ui/leaders-view.test.ts can assert it over the committed data
 * and over synthetic games.
 *
 * This module only assembles; each part lives in its own:
 * - school-boards.ts: records, goals per game (raw and Elo-adjusted), goals allowed, clean sheets;
 * - player-boards.ts: points (raw and Elo-adjusted), assists, saves, clean sheets;
 * - elo-board.ts: the Elo board, which the team pages read their place from too;
 * - ranking.ts: shared places and the qualifying minimum; scope.ts: the words for a region's leagues.
 *
 * Per region. Each region gets its own boards, minimums and notes (`RegionLeadersView`): a NorCal board
 * ranks NorCal teams and players, a SoCal board SoCal ones, and each board's ids carry the region's suffix
 * ('' for NorCal, so its anchors stay what they always were; '-socal' for SoCal: `#elo-rating-socal`), so
 * the page can render both regions on one page (JavaScript off shows both) without a duplicate id. The two
 * regions' calendars and numbers of games differ too much for one minimum: San Diego's divisions play 6 to
 * 12 league games, the Sunset has no fixed schedule, and Metro South Bay's first league game is Oct 7.
 */

import { computeAdjustedScoring, getAdjustedScoring, type AdjustedScoring } from '@/lib/adjusted-scoring';
import { getSnapshot } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { REGIONS, regionOf } from '@/lib/leagues';
import { getAllPlayerStatsWithNotes } from '@/lib/player-stats';
import { getPriorSeason } from '@/lib/prior-season';
import { getAllEnrichedRosters } from '@/lib/rosters';
import { computeRatings, getRatings } from '@/lib/ratings';
import type { TeamPlayerStats } from '@/lib/player-stats-schema';
import type { Game, RegionId, Standing, Team, TeamId } from '@/lib/types';
import { buildEloBoard, crossRegionFinals, getCrossRegionFinals, getEloBoard, type EloBoardView } from './elo-board';
import { buildPlayerBoards } from './player-boards';
import { buildSchoolBoards } from './school-boards';
import { regionScope } from './scope';
import type { LeaderSources, LeadersView, RegionLeadersView, RosterSource } from './types';

function defaultSources(): LeaderSources {
  const snapshot = getSnapshot();
  return {
    teams: snapshot.teams,
    stats: getAllPlayerStatsWithNotes(),
    standings: snapshot.standings,
    games: snapshot.games,
    prior: getPriorSeason(),
    rosters: getAllEnrichedRosters(),
  };
}

/** "Fri Oct 2": the last day with a final among `games`, or null before the first one. */
function lastFinal(games: readonly Game[]): string | null {
  let last: string | null = null;
  for (const g of games) if (g.status === 'final' && (last === null || g.dateKey > last)) last = g.dateKey;
  return last === null ? null : shortDate(last);
}

interface RegionInput {
  region: RegionId;
  /** The region's teams (registry order). */
  teams: readonly Team[];
  stats: readonly TeamPlayerStats[];
  standings: readonly Standing[];
  games: readonly Game[];
  rosters: readonly RosterSource[];
  elo: EloBoardView;
  /** lib/adjusted-scoring.ts over the same one Elo table, by team id. */
  adjusted: ReadonlyMap<TeamId, AdjustedScoring>;
}

/** One region's boards and notes: the /leaders page over the region's teams only. */
function buildRegion(input: RegionInput): RegionLeadersView {
  const { region, teams, stats, standings, games, rosters, elo, adjusted } = input;
  const scope = regionScope(region);
  const unadjusted = [...adjusted.values()].some((a) => !a.adjusted);
  const players = buildPlayerBoards({
    teams,
    stats,
    games,
    rosters,
    adjusted,
    factorMin: elo.minimum.min,
    unadjusted,
    scope: scope.board,
  });
  const schools = buildSchoolBoards({ teams, standings, games, elo, adjusted, unadjusted, scope: scope.board });
  const teamIds = new Set(teams.map((t) => t.id));
  const suffix = scope.board.suffix;
  return {
    region,
    name: scope.config.name,
    shortName: scope.config.shortName,
    idSuffix: suffix,
    schoolsId: `schools${suffix}`,
    playersId: `players${suffix}`,
    leagueCount: scope.leagues,
    independentCount: scope.independents,
    scopeWords: scope.sectionWords,
    players: players.boards,
    schools: schools.boards,
    playerNotes: players.notes,
    lagging: players.lagging,
    schoolNotes: schools.notes,
    statTeams: players.statTeams,
    teamCount: teams.length,
    resultsThrough: lastFinal(
      games.filter((g) => [g.home.teamId, g.away.teamId].some((id) => id !== null && teamIds.has(id))),
    ),
  };
}

/**
 * The /leaders page, from the bundled data by default or from `sources` (tests): one `RegionLeadersView` per
 * region with teams in the sources, NorCal first, plus the cross-region counts the Elo notes print. The Elo
 * table is fitted once over every team in the sources and each region's board reads it; the bundled build
 * reuses the per-process instances the team pages read, so the two cannot disagree.
 */
export function buildLeadersView(sources?: LeaderSources): LeadersView {
  const bundled = sources === undefined;
  const src = sources ?? defaultSources();
  const { teams, stats, standings, games, rosters = [] } = src;
  const prior = bundled ? getPriorSeason() : (src.prior ?? null);
  const table = bundled ? getRatings() : computeRatings(teams, games, prior);
  const crossRegion = bundled ? getCrossRegionFinals() : crossRegionFinals(teams, games, prior);
  const adjusted = bundled ? getAdjustedScoring() : computeAdjustedScoring(teams, games, table, src.goalModelIterations);
  const teamsByRegion = REGIONS.map((config) => ({
    region: config.id,
    teams: teams.filter((t) => regionOf(t.league) === config.id),
  })).filter((r) => r.teams.length > 0);
  // Both regions present: the Elo notes say how few finals link them. One region alone (a synthetic
  // source): there is nothing to compare across, so no such sentence.
  const both = teamsByRegion.length === REGIONS.length;
  const regions = teamsByRegion.map(({ region, teams: regionTeams }) => {
    const elo = bundled
      ? getEloBoard(region)
      : buildEloBoard(regionTeams, table, { region, crossRegion: both ? crossRegion : null, fitTeams: teams.length });
    return buildRegion({ region, teams: regionTeams, stats, standings, games, rosters, elo, adjusted });
  });
  return { regions, crossRegion, teamCount: teams.length, resultsThrough: lastFinal(games) };
}
