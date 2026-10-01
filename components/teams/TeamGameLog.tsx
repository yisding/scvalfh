import type { Game, TeamSlug } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import { GameLogRow } from '../ui/GameRow';

/**
 * A dense game log (DESIGN §3.7): `Sep 24 (L) 0–7 vs Saint Francis FINAL`, 52px a row, the whole
 * row a link to the game page.
 *
 * League and non-league games are rendered by TWO of these under separate section headers and are
 * NEVER interleaved (DESIGN §5.4), so `0-4-0 in league` is never contradicted by a `(W)` in the
 * list beneath it. The non-league rows still carry the `NL` tag and the 2px left rule, because a
 * reader who lands mid-page should not have to remember which list they are in.
 */
export interface TeamGameLogProps {
  games: Game[];
  perspective: TeamSlug;
  /** Rendered when the list is empty — Saratoga has played no non-league games at all. */
  emptyHeading: string;
  emptyBody?: string;
}

export function TeamGameLog({ games, perspective, emptyHeading, emptyBody }: TeamGameLogProps) {
  if (games.length === 0) {
    return <EmptyState heading={emptyHeading}>{emptyBody}</EmptyState>;
  }
  return (
    <ol className="sx-list sx-bleed border-y border-hairline bg-surface md:border">
      {games.map((game) => (
        <li key={game.contestId}>
          <GameLogRow game={game} perspective={perspective} />
        </li>
      ))}
    </ol>
  );
}

export default TeamGameLog;
