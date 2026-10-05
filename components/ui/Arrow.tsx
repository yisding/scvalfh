/**
 * The direction arrow at the end (or start) of a link's text: `→`, `←`, `↑` or `↓`, aria-hidden.
 *
 * The arrow is a cue for the eye, not part of the link's name: a screen reader should say "Full
 * De Anza table", never "Full De Anza table right arrow" (DESIGN §10 item 6, "screen-reader
 * sentences, not glyph soup"). So the glyph lives here and nowhere else, never baked into a data
 * string (lib/data.ts' `linkText`) or written bare in JSX text. The caller supplies the space
 * before it (`{label} <Arrow />`); the markup is `<span aria-hidden="true">→</span>`.
 *
 * Other link glyphs keep their own homes: ExternalLink's `↗`, the game page's `›` team pills and
 * SectionHeader's SVG chevron.
 */
export interface ArrowProps {
  /** Default 'right': the link leads on. 'up' and 'down' jump within the page. */
  dir?: 'right' | 'left' | 'up' | 'down';
  className?: string;
}

const GLYPH: Record<NonNullable<ArrowProps['dir']>, string> = {
  right: '→',
  left: '←',
  up: '↑',
  down: '↓',
};

export function Arrow({ dir = 'right', className }: ArrowProps) {
  return (
    <span aria-hidden="true" className={className}>
      {GLYPH[dir]}
    </span>
  );
}

export default Arrow;
