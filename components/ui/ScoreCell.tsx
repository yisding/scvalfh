import { EN_DASH } from '../../lib/format';
import type { Game, TeamSlug } from '../../lib/types';

import { describeGame, type SideView } from './game-view';

/**
 * The never-0-0 rule, rendered (DESIGN §5.2, §5.3).
 *
 * A real `0` is the mono glyph `0` in full-strength ink. A `null` is an en dash in muted ink,
 * aria-hidden, with the visually hidden words "score not reported" beside it. No cell is ever
 * blank and no cell ever coerces — the pipeline has no default anywhere.
 *
 * Winner-by-weight (DESIGN §6.5 channel 3, R-19): the winner's number is 600 weight in
 * `--sx-text`, the loser's 400 in `--sx-text-2`, so who won survives total desaturation with no
 * chip at all.
 */
export interface ScoreGlyphProps {
  side: SideView;
  size?: 'score' | 'board' | 'meta';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<ScoreGlyphProps['size']>, string> = {
  meta: 'text-meta',
  score: 'text-score',
  board: 'text-[2rem] leading-9',
};

const WEIGHT_CLASS: Record<SideView['weight'], string> = {
  winner: 'font-semibold text-ink',
  loser: 'font-normal text-ink-2',
  level: 'font-normal text-ink',
};

export function ScoreGlyph({ side, size = 'score', className }: ScoreGlyphProps) {
  const weight = side.hasScore ? WEIGHT_CLASS[side.weight] : 'font-normal text-ink-3';
  return (
    <span className={`sx-num ${SIZE_CLASS[size]} ${weight}${className ? ` ${className}` : ''}`}>
      <span aria-hidden={side.hasScore ? undefined : 'true'}>{side.glyph}</span>
      {side.hasScore ? null : <span className="sr-only">score not reported</span>}
    </span>
  );
}

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
    <span className={`inline-flex items-baseline gap-1${className ? ` ${className}` : ''}`}>
      <ScoreGlyph side={first} size={size} />
      <span className="sx-num text-ink-3" aria-hidden="true">
        {EN_DASH}
      </span>
      <ScoreGlyph side={second} size={size} />
    </span>
  );
}

export default ScoreCell;
