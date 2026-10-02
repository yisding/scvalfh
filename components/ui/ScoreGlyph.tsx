import type { SideView } from './game-view';

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
 *
 * Client-safe (SPEC §10.4): this module imports only TYPES from game-view, so a client component
 * (the home My-team card) can render it without reaching lib/teams. ScoreCell re-exports it for
 * server callers.
 */
export interface ScoreGlyphProps {
  side: SideView;
  size?: 'score' | 'board' | 'meta';
  className?: string;
}

export const SCORE_SIZE_CLASS: Record<NonNullable<ScoreGlyphProps['size']>, string> = {
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
    <span className={`sx-num ${SCORE_SIZE_CLASS[size]} ${weight}${className ? ` ${className}` : ''}`}>
      <span aria-hidden={side.hasScore ? undefined : 'true'}>{side.glyph}</span>
      {side.hasScore ? null : <span className="sr-only">score not reported</span>}
    </span>
  );
}

export default ScoreGlyph;
