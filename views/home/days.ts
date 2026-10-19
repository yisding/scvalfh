/**
 * The home panel's day blocks (views/home/league-panel.ts): one league's games on one day ("Latest
 * scores", the unreported day, the next slate), the first day after a slate with a league game, and
 * the last played day with nothing reported. Kickoff order everywhere (`byKickoff`), so a slate is
 * stable between builds.
 */

import { getDivision } from '@/lib/config/leagues';
import type { Game } from '@/lib/model/game';
import type { LeagueId } from '@/lib/model/ids';
import { getGameDates, getGames, getUpcoming } from '@/lib/queries/games';
import { gameKind } from '@/views/shared/describe-game';

/** Kickoff order, then away name, so a slate is stable between builds. */
export function byKickoff(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name);
}

export interface HomeDay {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Every contest that day with at least one side in the league, kickoff order. */
  games: Game[];
  total: number;
  isToday: boolean;
}

export function leagueDay(
  league: LeagueId,
  date: string,
  today: string,
  opts: { playable?: boolean; finalsFirst?: boolean } = {},
): HomeDay {
  const all = getGames({ league, date }).sort(byKickoff);
  const games = opts.playable
    ? all.filter((g) => g.status !== 'final')
    : opts.finalsFirst
      ? // A results block leads with results: an unreported game of the same day follows them.
        [...all.filter((g) => g.status === 'final'), ...all.filter((g) => g.status !== 'final')]
      : all;
  return { date, games, total: games.length, isToday: date === today };
}

/** A contest that counts in one of this league's tables. */
function countsInLeague(game: Game, league: LeagueId): boolean {
  return game.countsFor !== null && getDivision(game.countsFor).leagueId === league;
}

/**
 * The first day AFTER `after` with a league game for this league, so a slate of non-league games
 * can say when league play resumes. Read from EVERY upcoming playable game of the league rather
 * than the slate's own day, so a long run of non-league dates cannot hide it. `games` is that
 * day's league games only, in kickoff order; `total` counts every contest of the league that day,
 * which is what the panel's other `All N on <date>` counts and the /scores page list; `postseason`
 * is how many of those are postseason contests (no table, a bracket), so the card can split the
 * rest the way its own meta does.
 */
export interface NextLeagueDay extends HomeDay {
  postseason: number;
  /** Non-league contests that day (neither counted in a table nor postseason), every status. */
  nonLeague: number;
}

export function nextLeagueDay(league: LeagueId, after: string, today: string): NextLeagueDay | null {
  const date = getUpcoming(Number.MAX_SAFE_INTEGER, { league }).find(
    (g) => countsInLeague(g, league) && g.dateKey > after,
  )?.dateKey;
  if (!date) return null;
  const day = leagueDay(league, date, today, { playable: true });
  const all = getGames({ league, date });
  return {
    ...day,
    games: day.games.filter((g) => countsInLeague(g, league)),
    total: all.length,
    postseason: all.filter((g) => gameKind(g) === 'postseason').length,
    // Counted directly rather than as `total − league − postseason`: `games` holds only the
    // PLAYABLE league games, so a league game already final that day would otherwise be
    // mis-counted as non-league.
    nonLeague: all.filter((g) => gameKind(g) === 'non-league').length,
  };
}

/** The most recent played day with nothing reported for this league, or null (the common case). */
export function unreportedDay(league: LeagueId, today: string, latest: string | null): string | null {
  const candidates = getGameDates({ league }).filter((d) => d < today && (!latest || d > latest));
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const games = getGames({ league, date: candidates[i] });
    if (games.length > 0 && games.every((g) => g.status !== 'final')) return candidates[i];
  }
  return null;
}
