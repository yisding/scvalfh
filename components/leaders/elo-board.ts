/**
 * The `#elo-rating` board (DESIGN §20; `#elo-rating-socal` for SoCal), the last school board on /leaders
 * and the one each team page reads its place from, so the two cannot disagree.
 *
 * Elo is ONE fit over every registry team (lib/ratings.ts computeRatings, unchanged): each region's board
 * shows its own teams' numbers from that one table, so a NorCal and a SoCal rating are on one scale. What
 * links the two regions is the finals between them, few so far, so the board's method says how many (this
 * season's from the snapshot, last season's from data/prior-season.json, both counted at build time, never
 * typed in). The board's minimum counts the games its fit counts this season, by the rule of
 * ranking.ts qualifyingMinimum; a team under it is still rated on its own page, as provisional. The ratings
 * start from last season's (data/prior-season.json); synthetic sources without one start every team at
 * average.
 */

import { regionOf } from '@/lib/config/leagues';
import { getSnapshot } from '@/lib/data';
import { plural } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { RegionId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { getPriorSeason } from '@/lib/prior-season';
import type { PriorSeason } from '@/lib/prior-season-schema';
import {
  ELO_BASE,
  ELO_PER_GOAL,
  MARGIN_CAP,
  getRatings,
  ratingGames,
  type RatingTable,
  type TeamRating,
} from '@/lib/ratings';
import { num, schoolBoard } from './board-kit';
import { byName, qualifyingMinimum } from './ranking';
import { AND_INDEPENDENTS, LEAGUE_COUNT, regionScope } from './scope';
import type { CrossRegionFinals, LeaderBoard } from './types';

/**
 * What an Elo number means, without trailing punctuation: the board's note and the team page's
 * Elo disclosure (components/teams/TeamElo.tsx) both say it, so the two always read the same.
 */
export const ELO_SCALE = `${ELO_BASE} is an average team and ${ELO_PER_GOAL} points is about a goal`;

export interface EloBoardView {
  /** The `#elo-rating` board (`#elo-rating-socal` for SoCal): the top 10 places among the teams past the minimum. */
  board: LeaderBoard;
  /** Every rated team of the board's teams, by slug (provisional and preseason ones included). */
  ratingBySlug: Map<TeamSlug, TeamRating>;
  /** The season the ratings start from ("2025-26"); null when every team starts at average. */
  seededFrom: string | null;
  /** The board's minimum: half the median of its rated teams' counted games. */
  minimum: { min: number; median: number };
  /** "Del Mar (1)": teams that have played this season but fewer than the minimum, fewest first. */
  below: string[];
}

/**
 * The finals that link the two regions on the Elo scale: this season's that the fit counts
 * (lib/ratings.ts ratingGames: finals with a score between two registry teams, forfeits left out) between
 * a NorCal and a SoCal team, and last season's (data/prior-season.json) between two registry teams of
 * different regions, as the fit's starts read them. Teams outside the configured leagues have no region
 * and count in neither.
 */
export function crossRegionFinals(
  teams: readonly Team[],
  games: readonly Game[],
  prior: PriorSeason | null,
): CrossRegionFinals {
  const regionById = new Map(teams.map((t) => [t.id, regionOf(t.league)]));
  const across = (a: string, b: string) => {
    const ra = regionById.get(a);
    const rb = regionById.get(b);
    return ra !== undefined && rb !== undefined && ra !== rb;
  };
  const thisSeason = ratingGames(teams, games).filter((g) => across(g.home.teamId!, g.away.teamId!)).length;
  const lastSeason = prior ? prior.games.filter((g) => across(g.homeId, g.awayId)).length : 0;
  return {
    thisSeason,
    lastSeason,
    sentence:
      `The ratings are on one scale across all ${LEAGUE_COUNT} leagues${AND_INDEPENDENTS}; comparisons between NorCal and SoCal rest on ` +
      `${plural(thisSeason, 'game')} between the regions this season and ${lastSeason} last season, so treat them as rough.`,
  };
}

/**
 * The Elo board of `teams` (one region's, or every team for a single-board caller), read off `table`, the
 * ONE fit over every registry team: a board never refits, so its numbers are the unified table's and a
 * NorCal and a SoCal rating can be compared. The minimum is the board's own teams'. `region` sets the
 * board's id suffix and caption scope (default NorCal, today's `#elo-rating`); `crossRegion`, when given,
 * adds the sentence that says how few finals link the regions. getEloBoard is the bundled instance.
 */
export function buildEloBoard(
  teams: readonly Team[],
  table: RatingTable,
  opts: { region?: RegionId; crossRegion?: CrossRegionFinals | null; fitTeams?: number } = {},
): EloBoardView {
  const scope = regionScope(opts.region ?? 'norcal').board;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const lines = table.ratings.flatMap((rating) => {
    const team = teamById.get(rating.teamId);
    return team ? [{ team, rating }] : [];
  });
  const minimum = qualifyingMinimum(lines.map((l) => l.rating.games));
  // A team with no counted final last season (new to the registry, or only forfeits and unscored
  // games then) has no rating from it and starts at average: say so only when there is one, so
  // the note never claims a start a team did not have.
  const unseeded = lines.some((l) => !l.rating.seeded);
  const seeded = table.seededFrom
    ? ` Each team started the season from its ${table.seededFrom} rating (worked out the same way from last season’s ${plural(table.priorGames, 'game')})${unseeded ? `, or from average if it had no counted ${table.seededFrom} game` : ''}; that start counts for one game and fades as this season’s results come in.`
    : '';
  const homeEdge = table.homeEdge > 0 ? `, allowing a home edge of ${plural(table.homeEdge, 'point')}` : '';
  // The fit spans every registry team, not just this board's: say how many it spans.
  const fitTeams = opts.fitTeams ?? teams.length;
  const across = opts.crossRegion ? ` ${opts.crossRegion.sentence}` : '';
  const board = schoolBoard(
    {
      id: 'elo-rating',
      title: 'Highest Elo rating',
      navLabel: 'Elo rating',
      meta: `At least ${plural(minimum.min, 'game')}`,
      sorted: lines
        .filter((l) => l.rating.games >= minimum.min)
        .sort((a, b) => b.rating.elo - a.rating.elo || byName(a.team.name, b.team.name)),
      same: (a, b) => a.rating.elo === b.rating.elo,
      columns: [
        { key: 'gp', label: 'GP', title: 'Games counted', cell: (l) => num(l.rating.games) },
        { key: 'elo', label: 'Elo', title: 'Elo rating', cell: (l) => ({ text: String(l.rating.elo) }) },
      ],
      rankedBy: 1,
      anchor: '#elo',
      note:
        `Every completed game between two of the ${plural(fitTeams, 'team')}, league or not, rated together. ` +
        `${ELO_SCALE}, so a team rated 400 points higher is about a 10-to-1 favorite.`,
      method:
        `The ratings are the ones that best explain each game’s goal margin, counted up to ${MARGIN_CAP} goals${homeEdge}.` +
        `${seeded}${across} Forfeits and games against schools outside the ${LEAGUE_COUNT} leagues${AND_INDEPENDENTS} are left out.`,
      empty: lines.some((l) => l.rating.games > 0)
        ? `No team has played ${plural(minimum.min, 'game')} yet.`
        : `No completed game between two of the ${plural(fitTeams, 'team')} yet this season.`,
    },
    scope,
  );
  return {
    board,
    ratingBySlug: new Map(lines.map((l) => [l.team.slug, l.rating])),
    seededFrom: table.seededFrom,
    minimum,
    below: lines
      .filter((l) => l.rating.games > 0 && l.rating.games < minimum.min)
      .sort((a, b) => a.rating.games - b.rating.games || byName(a.team.name, b.team.name))
      .map((l) => `${l.team.name} (${l.rating.games})`),
  };
}

// ---------------------------------------------------------------- the bundled instances

const bundledBoards = new Map<RegionId, EloBoardView>();
let bundledCrossRegion: CrossRegionFinals | null = null;

/** The cross-region counts over the bundled snapshot and prior season, once per process. */
export function getCrossRegionFinals(): CrossRegionFinals {
  if (!bundledCrossRegion) {
    const snapshot = getSnapshot();
    bundledCrossRegion = crossRegionFinals(snapshot.teams, snapshot.games, getPriorSeason());
  }
  return bundledCrossRegion;
}

/**
 * One region's Elo board over the bundled snapshot and prior season (lib/ratings.ts getRatings: the one
 * fit over every team), built once per process: what /leaders prints for the region and what each of its
 * team pages reads its place from. Defaults to NorCal, the board `/leaders#elo-rating` has always been.
 */
export function getEloBoard(region: RegionId = 'norcal'): EloBoardView {
  let view = bundledBoards.get(region);
  if (!view) {
    const teams = getSnapshot().teams;
    view = buildEloBoard(
      teams.filter((t) => regionOf(t.league) === region),
      getRatings(),
      { region, crossRegion: getCrossRegionFinals(), fitTeams: teams.length },
    );
    bundledBoards.set(region, view);
  }
  return view;
}

/**
 * The Elo board a team's page reads its place from: its own region's (DESIGN-socal §2.3). Its board link is
 * `/leaders#elo-rating` for NorCal and `/leaders#elo-rating-socal` for SoCal (`board.id`).
 */
export function getEloBoardForTeam(team: Pick<Team, 'league'>): EloBoardView {
  return getEloBoard(regionOf(team.league));
}
