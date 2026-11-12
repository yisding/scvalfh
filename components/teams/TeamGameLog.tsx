import type { Game, TeamSlug } from '../../lib/types';
import { GameLogRow } from '../game-row/GameLogRow';

/**
 * The team's schedule (DESIGN §33): ONE log, league, non-league and postseason games together in
 * date order, each a `GameLogRow` (`Nov 7 [W] 2-0 vs Gilroy`) that is one link to the game. The
 * date, the W / L / T chip and the score or start time are fixed columns, so the results line up
 * down the list. A row that is not a league game says so in its note (`Non-league`, or the round),
 * so the league record above the list is never contradicted by an unlabelled result.
 */
export interface TeamGameLogProps {
  /** In the order to print (the page passes date order). */
  games: readonly Game[];
  perspective: TeamSlug;
  /** The one line printed when there is no game at all. */
  emptyHeading?: string;
  /** @deprecated One line only; ignored. */
  emptyBody?: string;
}

export function TeamGameLog({ games, perspective, emptyHeading = 'No games listed' }: TeamGameLogProps) {
  if (games.length === 0) return <p className="sx-empty">{emptyHeading}</p>;
  return (
    <ol className="sx-list">
      {games.map((game) => (
        <li key={game.contestId}>
          <GameLogRow game={game} perspective={perspective} />
        </li>
      ))}
    </ol>
  );
}

export default TeamGameLog;
