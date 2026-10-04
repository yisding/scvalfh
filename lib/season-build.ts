/**
 * The Season record written into every snapshot (SPEC §5.9). Server-only: it reads the league
 * config, the registry and lib/normalize, so it is NOT part of lib/season.ts, which stays a
 * dependency-free constants leaf that client modules reach through lib/format.
 */

import { LEAGUES, SECTIONS } from './leagues';
import { seasonWindowOf } from './normalize';
import {
  ALL_SEASON_ID, GENDER_SPORT, SEASON_LABEL, SEASON_YEAR, SPORT_SEASON_ID, TEAM_LEVEL,
} from './season';
import { getTeamById, getTeamBySlug } from './teams';
import type { Game, GameSide, LeagueId, Season, SeasonLeague, SeasonWindow } from './types';

/** The registry league of one side, by MaxPreps GUID first, then by slug; null for a non-member. */
function leagueOfSide(side: GameSide): LeagueId | null {
  const team = (side.teamId ? getTeamById(side.teamId) : undefined)
    ?? (side.slug ? getTeamBySlug(side.slug) : undefined);
  return team ? team.league : null;
}

const maxOf = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (b > a ? b : a));
const minOf = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (b < a ? b : a));

/**
 * One league's window: over games with at least one registry side in the league AND
 * `postseason === null` (crossover, play-in, MCAL tournament, EAL Super Regional and CCS games never
 * extend it).
 * `lastLeagueGame` = max dateLocal where `countsFor` is one of the league's divisions, any status.
 */
export function leagueWindowOf(games: readonly Game[], leagueId: LeagueId): SeasonWindow {
  const league = LEAGUES.find((l) => l.id === leagueId);
  const divisions = new Set<string>(league ? league.divisions.map((d) => d.id) : []);
  const inScope = games.filter(
    (g) => g.postseason === null
      && (leagueOfSide(g.home) === leagueId || leagueOfSide(g.away) === leagueId),
  );
  const dates = inScope.map((g) => g.dateLocal);
  // Same key order as lib/normalize seasonWindowOf.
  return {
    firstGame: minOf(dates),
    lastGame: maxOf(dates),
    lastLeagueGame: maxOf(
      inScope.filter((g) => g.countsFor !== null && divisions.has(g.countsFor)).map((g) => g.dateLocal),
    ),
  };
}

/** Global window (today's semantics, via lib/normalize seasonWindowOf) + per-league windows over non-postseason games + postseasonKind (§5.9). */
export function buildSeason(games: readonly Game[]): Season {
  const leagues: SeasonLeague[] = LEAGUES.map((l) => ({
    id: l.id,
    sectionId: l.sectionId,
    name: l.name,
    shortName: l.shortName,
    divisions: l.divisions.map((d) => ({
      id: d.id,
      label: d.label,
      maxprepsLeagueId: d.maxprepsLeagueId,
    })),
    postseasonKind: l.postseason.kind,
    window: leagueWindowOf(games, l.id),
  }));
  return {
    year: SEASON_YEAR,
    label: SEASON_LABEL,
    sportSeasonId: SPORT_SEASON_ID,
    allSeasonId: ALL_SEASON_ID,
    genderSport: GENDER_SPORT,
    teamLevel: TEAM_LEVEL,
    sections: SECTIONS.map((s) => ({
      id: s.id,
      name: s.name,
      maxprepsSectionId: s.maxprepsSectionId,
      holdsFieldHockeyChampionship: s.holdsFieldHockeyChampionship,
    })),
    leagues,
    window: seasonWindowOf(games),
  };
}
