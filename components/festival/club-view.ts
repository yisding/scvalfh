import type { FestivalGame } from '../../lib/festival/festival';
import { listWords, plural } from '../../lib/format';
import {
  byDayAndSlot,
  clubHref,
  festivalModel,
  placementPath,
  playingTeamIds,
  poolTable,
  teamCard,
  teamGame,
  teamGames,
  type DayModel,
  type FestivalModel,
  type PlacementPathModel,
  type PoolTableModel,
  type TeamCardModel,
  type TeamGameModel,
} from './festival-model';
import { siteClubInfo, type SiteClubLookup } from './site-clubs';

/**
 * /festival/clubs/[club] (DESIGN §35 §6): everything a parent following one club needs. The club's teams in one
 * summary table; every game of every one of them merged by day and time (one club often has teams on three
 * fields at once); then each team's own section: its games, its pool table with the team marked, and its
 * Saturday placement path.
 */
export interface ClubTeamSectionModel {
  card: TeamCardModel;
  /** 'team-u16-agh-1': the section's anchor. */
  anchor: string;
  games: TeamGameModel[];
  pool: PoolTableModel;
  path: PlacementPathModel;
}

export interface ClubViewModel {
  slug: string;
  name: string;
  region: string | null;
  california: boolean;
  curated: boolean;
  site: { name: string; href: string } | null;
  /**
   * The other festival clubs that are the same club on this site (spec §3: USA Field Hockey lists HTC's East Coast
   * U16 team and its California U19 team as two clubs, "HTC" and "HTC CA", and so does festival-clubs.json). Each
   * page links the other, California first, with the divisions so a reader can tell them apart.
   */
  siblings: { slug: string; name: string; href: string; divisions: string }[];
  /** '7 teams', 'U12, U14 11v11, U16 and U19'. */
  meta: string[];
  teams: ClubTeamSectionModel[];
  /** Every team slug: the "Follow all" control's list. */
  slugs: string[];
  /** Every game of the club's teams, once each, by venue day and start time. */
  schedule: DayModel<TeamGameModel>[];
  games: number;
  finals: number;
}

export function buildClubView(slug: string, m: FestivalModel = festivalModel(), site: SiteClubLookup = siteClubInfo): ClubViewModel | null {
  const club = m.clubBySlug.get(slug);
  if (!club) return null;
  const info = club.siteClub ? site(club.siteClub) : null;
  const ids = new Set(club.teamIds);
  const divisionsOf = (teamIds: readonly string[]) => [
    ...new Set(teamIds.map((id) => m.divisionByKey.get(m.teamById.get(id)!.divisionKey)!.short)),
  ];
  const divisions = divisionsOf(club.teamIds);
  const siblings = club.siteClub
    ? m.clubs
        .filter((c) => c.slug !== slug && c.siteClub === club.siteClub)
        .sort((a, b) => Number(b.california) - Number(a.california))
        .map((c) => ({ slug: c.slug, name: c.name, href: clubHref(c.slug), divisions: listWords(divisionsOf(c.teamIds)) }))
    : [];
  // A game between two of the club's teams appears once, read from the side TourneyMachine lists first. Sides as
  // they resolve (playingTeamIds), so a placement game a final pool table settled is the club's before
  // TourneyMachine fills it in, with its score and chip.
  const clubTeamOf = (g: FestivalGame) => playingTeamIds(m, g).find((id) => ids.has(id));
  const games = m.file.games.filter((g) => clubTeamOf(g) !== undefined);
  const schedule = byDayAndSlot(games, (g) => teamGame(m, g, clubTeamOf(g)!));
  return {
    slug,
    name: club.name,
    region: info?.regionLabel ?? club.region,
    california: club.california,
    curated: club.curated,
    site: info ? { name: info.name, href: info.href } : null,
    siblings: info ? siblings : [],
    meta: [plural(club.teamIds.length, 'team'), listWords(divisions)],
    teams: club.teamIds.map((id) => {
      const team = m.teamById.get(id)!;
      return {
        card: teamCard(m, id),
        anchor: `team-${team.slug}`,
        games: teamGames(m, id),
        pool: poolTable(m, team.poolId, club.teamIds),
        path: placementPath(m, id),
      };
    }),
    slugs: club.teamIds.map((id) => m.teamById.get(id)!.slug),
    schedule,
    games: games.length,
    finals: games.filter((g) => g.status === 'final').length,
  };
}
