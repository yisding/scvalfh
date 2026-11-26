import {
  divisionHref,
  festivalModel,
  placementPath,
  poolTable,
  teamCard,
  teamGames,
  type FestivalModel,
  type PlacementPathModel,
  type PoolTableModel,
  type TeamCardModel,
  type TeamGameModel,
} from './festival-model';

/**
 * /festival/teams/[team] (DESIGN §35 §6): one team's record and place, every game it plays (pool games, and a
 * placement game once TourneyMachine names it or its finished pool puts it alone at the place: gamesOfTeam), its
 * pool table with the team marked, and where each final pool place sends it on Saturday.
 */
export interface TeamViewModel {
  card: TeamCardModel;
  /** 'U-16 Girls 11v11'. */
  divisionName: string;
  divisionHref: string;
  games: TeamGameModel[];
  pool: PoolTableModel;
  path: PlacementPathModel;
  /** TourneyMachine's results page (the feed has no per-team page). */
  resultsUrl: string;
}

export function buildTeamView(slug: string, m: FestivalModel = festivalModel()): TeamViewModel | null {
  const team = m.teamBySlug.get(slug);
  if (!team) return null;
  const division = m.divisionByKey.get(team.divisionKey)!;
  return {
    card: teamCard(m, team.id),
    divisionName: division.name,
    divisionHref: divisionHref(division.slug),
    games: teamGames(m, team.id),
    pool: poolTable(m, team.poolId, [team.id]),
    path: placementPath(m, team.id),
    resultsUrl: m.file.tournament.resultsUrl,
  };
}
