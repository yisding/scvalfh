/**
 * One team's form line (SPEC §13.3): every counted-division contest in date order with its margin and
 * outcome, the data the MarginStrip draws. Pure: the caller passes the snapshot's games
 * (lib/queries/teams.ts getTeamForm resolves the team reference).
 */

import type { Game, GameStatus, Outcome } from '@/lib/model/game';
import type { ContestId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { byDateLocal, involvesTeam, sideOutcome } from '@/lib/shared/game';

export interface FormGame {
  contestId: ContestId;
  date: string;
  opponent: string;
  opponentSlug: TeamSlug | null;
  site: Game['site'];
  status: GameStatus;
  /** goals for − goals against; null unless the game is a counted final. */
  margin: number | null;
  outcome: Outcome | null;
  /** Forfeits have no goal margin and are excluded from MarginStrip (DESIGN §5.7). */
  excludedFromMargin: boolean;
}

export interface TeamForm {
  /** Every counted-division contest in date order, played or not, for the MarginStrip axis. */
  leagueGames: FormGame[];
}

/** `games` is any list of games (the snapshot's); the team's own are picked out and put in date order. */
export function teamForm(games: readonly Game[], team: Team): TeamForm {
  const all = games.filter((g) => involvesTeam(g, team)).sort(byDateLocal);
  const allGames: FormGame[] = all.map((g) => {
    const isHome = g.home.teamId === team.id;
    const mine = isHome ? g.home : g.away;
    const theirs = isHome ? g.away : g.home;
    const counted =
      g.status === 'final' && mine.score !== null && theirs.score !== null && !g.isForfeit;
    // sideOutcome: a shootout win (decider 'SO', level on goals: an EAL 1 v 1 win, a San Diego shootout) is the flagged side's win.
    const outcome: Outcome | null = sideOutcome(g, isHome ? 'home' : 'away');
    return {
      contestId: g.contestId,
      date: g.dateKey,
      opponent: theirs.name,
      opponentSlug: theirs.slug,
      site: g.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
      status: g.status,
      margin: counted ? (mine.score as number) - (theirs.score as number) : null,
      outcome,
      excludedFromMargin: g.isForfeit,
    };
  });
  const leagueGames = allGames.filter((_, i) => all[i].countsFor !== null);
  return { leagueGames };
}
