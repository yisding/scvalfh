/**
 * The Season record written into every snapshot (SPEC §5.9). Server-only: it reads the league
 * config and the registry, so it is NOT part of lib/config/season.ts, which stays a
 * constants leaf (importing only the base-URL leaf) that client modules reach through lib/shared/dates.ts.
 */

import { LEAGUES, SECTIONS } from '@/lib/config/leagues';
import {
  ALL_SEASON_ID, GENDER_SPORT, SEASON_LABEL, SEASON_YEAR, SPORT_SEASON_ID, TEAM_LEVEL,
} from '@/lib/config/season';
import type { Game, GameSide } from '@/lib/model/game';
import type { LeagueId } from '@/lib/model/ids';
import type { Season, SeasonLeague, SeasonWindow } from '@/lib/model/season';
import { teamOfSide } from '@/lib/registry/teams';

/** The registry league of one side, by MaxPreps GUID first, then by slug; null for a non-member. */
function leagueOfSide(side: GameSide): LeagueId | null {
  return teamOfSide(side)?.league ?? null;
}

const maxOf = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (b > a ? b : a));
const minOf = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (b < a ? b : a));

/** The season window, computed from the games and never hardcoded (SPEC §5.8). */
export function seasonWindowOf(games: readonly Game[]): SeasonWindow {
  const dates = games.map((g) => g.dateLocal).sort();
  const leagueDates = games.filter((g) => g.isLeague).map((g) => g.dateLocal).sort();
  return {
    firstGame: dates[0] ?? null,
    lastGame: dates[dates.length - 1] ?? null,
    lastLeagueGame: leagueDates[leagueDates.length - 1] ?? null,
  };
}

/**
 * One league's window: over games with at least one registry side in the league AND
 * `postseason === null` (crossover, play-in, MCAL tournament, EAL Super Regional, San Diego Section playoff
 * and CCS games never extend it).
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
  // Same key order as seasonWindowOf.
  return {
    firstGame: minOf(dates),
    lastGame: maxOf(dates),
    lastLeagueGame: maxOf(
      inScope.filter((g) => g.countsFor !== null && divisions.has(g.countsFor)).map((g) => g.dateLocal),
    ),
  };
}

/** Global window (the original single-league semantics, unchanged, via seasonWindowOf) + per-league windows over non-postseason games + postseasonKind (§5.9). */
export function buildSeason(games: readonly Game[]): Season {
  const leagues: SeasonLeague[] = LEAGUES.map((l) => ({
    id: l.id,
    sectionId: l.sectionId,
    name: l.name,
    shortName: l.shortName,
    divisions: l.divisions.map((d) => ({
      id: d.id,
      label: d.label,
      // null for a division MaxPreps has no table for (the San Diego Section's Valley), as in config.
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
