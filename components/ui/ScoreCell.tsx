import { EN_DASH } from '../../lib/format';
import type { Game, TeamSlug } from '../../lib/types';

import { describeGame } from './game-view';
import { SCORE_SIZE_CLASS as SIZE_CLASS, ScoreGlyph } from './ScoreGlyph';

/** ScoreGlyph lives in its own client-safe module (SPEC §10.4); re-exported for server callers. */
export { ScoreGlyph, nameClass, NAME_CLASS } from './ScoreGlyph';
export type { ScoreGlyphProps } from './ScoreGlyph';

/**
 * The inline pair — `7 – 0`, or `— – —` for an unreported game. Used by dense contexts such as
 * a team-page game log. `perspective` puts that team's goals first.
 */
export interface ScoreCellProps {
  game: Game;
  perspective?: TeamSlug | null;
  size?: 'score' | 'board' | 'meta';
  className?: string;
}

export function ScoreCell({ game, perspective, size = 'score', className }: ScoreCellProps) {
  const display = describeGame(game, perspective);
  if (!display.showScores) {
    return (
      <span className={`sx-num text-ink-3 ${SIZE_CLASS[size]}${className ? ` ${className}` : ''}`}>
        <span aria-hidden="true">{EN_DASH}</span>
        <span className="sr-only">no score</span>
      </span>
    );
  }
  const mineIsHome = perspective ? game.home.slug === perspective : true;
  const [first, second] = mineIsHome
    ? [display.home, display.away]
    : [display.away, display.home];
  return (
    <span className={['inline-flex items-baseline gap-1', className].filter(Boolean).join(' ')}>
      <ScoreGlyph side={first} size={size} />
      <span className="sx-num text-ink-3" aria-hidden="true">
        {EN_DASH}
      </span>
      <ScoreGlyph side={second} size={size} />
    </span>
  );
}

export default ScoreCell;
