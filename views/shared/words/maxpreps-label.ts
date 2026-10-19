import type { GameStatus } from '@/lib/model/game';

/**
 * The words on a link to a game's MaxPreps contest page. Only a final has a box score behind it;
 * an unplayed, live or unreported game's page is just the contest, so it is 'MaxPreps game' (the
 * same words `resultLinksFor` in views/game/game-view.ts uses for a contest with no score).
 */
export function maxPrepsLabel(status: GameStatus): string {
  return status === 'final' ? 'MaxPreps box score' : 'MaxPreps game';
}
