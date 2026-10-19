/**
 * The first-visit "Latest" block (components/home/CrossLeagueLatest.tsx): one region's latest results
 * day across its leagues, at most two rows per league, each game filed under one league on every
 * page (DESIGN-socal §2.4).
 */

import { getDivision, getLeague } from '@/lib/config/leagues';
import type { Game } from '@/lib/model/game';
import type { LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { getGames, getLatestResultsDate } from '@/lib/queries/games';
import { teamOfSide } from '@/lib/registry/teams';

import { byKickoff } from './days';

/** The league a game is filed under on the home page: its counted division's, else the first side's in config order. */
function homeLeagueOf(game: Game, leagueIds: readonly LeagueId[]): LeagueId | null {
  if (game.countsFor !== null) return getDivision(game.countsFor).leagueId;
  const sides = [game.home, game.away]
    .map(teamOfSide)
    .filter((t): t is Team => t !== undefined);
  for (const id of leagueIds) if (sides.some((t) => t.league === id)) return id;
  return null;
}

export interface CrossLeagueLatest {
  date: string;
  /** Every contest that day. */
  total: number;
  groups: Array<{ leagueId: LeagueId; shortName: string; games: Game[]; total: number }>;
}

/** Rows per league in the first-visit "Latest" block. */
const CROSS_LEAGUE_ROWS = 2;

/**
 * The latest results day of `regionLeagues` (one region's leagues), with at most two rows per league.
 * `allLeagueIds` is every league in config order, so a game between a NorCal and a SoCal team is filed
 * under the same league on every page (its counted division's, else its first side's league in config
 * order: the NorCal one) and appears in one region's block only. `total` counts that region's games of
 * the day, which is what this block says ("All N").
 */
export function crossLeagueLatest(
  regionLeagues: readonly LeagueId[],
  allLeagueIds: readonly LeagueId[],
): CrossLeagueLatest | null {
  const dates = regionLeagues
    .map((id) => getLatestResultsDate({ league: id }))
    .filter((d): d is string => d !== null)
    .sort();
  const date = dates.length > 0 ? dates[dates.length - 1] : null;
  if (!date) return null;
  const mineOf = (g: Game) => {
    const id = homeLeagueOf(g, allLeagueIds);
    return id !== null && regionLeagues.includes(id) ? id : null;
  };
  const games = getGames({ date })
    .filter((g) => mineOf(g) !== null)
    .sort(byKickoff);
  const groups = regionLeagues
    .map((id) => {
      const mine = games.filter((g) => mineOf(g) === id);
      // Finals first: this block is about results.
      const ordered = [...mine.filter((g) => g.status === 'final'), ...mine.filter((g) => g.status !== 'final')];
      return { leagueId: id, shortName: getLeague(id).shortName, games: ordered.slice(0, CROSS_LEAGUE_ROWS), total: mine.length };
    })
    .filter((g) => g.total > 0);
  return { date, total: games.length, groups };
}
