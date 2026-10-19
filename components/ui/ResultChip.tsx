import type { ChipKind } from '@/views/shared/game-display-client';

/**
 * A square with the LETTER inside (DESIGN §7.5, §6.5).
 *
 * The letter is channel 1 — it survives grayscale, CVD, forced-colors and a screenshot pasted
 * into a group text. Hue is channel 4 and the only optional one. There is exactly ONE visual
 * treatment: wash ground, 1px ring at the mark hue, glyph in the ink token (5.80–8.28:1
 * everywhere). No `solid` variant, so the raw loss mark never becomes a fill under a letter.
 * No `title` attribute — a touch device never sees one.
 *
 * `pending` (a game played with no score published) is the empty outline DESIGN §7.5 asks for,
 * but drawn as a DASHED CIRCLE: an empty solid-ringed rounded square beside a monogram read as an
 * unticked checkbox — an input — rather than "no result". The shape differs from every lettered
 * square, so it never needs hue to be told apart.
 */
export interface ResultChipProps {
  kind: ChipKind;
  /**
   * 20 = standings form strip, 24 = game row, 28 = a hero mark. 16 stays in the union for
   * compatibility only: its 10px letter is under the site's 12px floor, so no visible surface
   * should use it.
   */
  size?: 16 | 20 | 24 | 28;
  className?: string;
}

/**
 * The kind's colours, as a class (`.sx-chip-win` …, app/globals.css): wash ground, ring at the
 * mark hue, glyph in the ink token. Cancelled and postponed share the tie's hueless set.
 */
const KIND_CLASS: Record<Exclude<ChipKind, 'none'>, string> = {
  W: 'sx-chip-win',
  L: 'sx-chip-loss',
  T: 'sx-chip-tie',
  pending: 'sx-chip-pending',
  cancelled: 'sx-chip-tie',
  postponed: 'sx-chip-tie',
};

/**
 * The side and letter size per chip size (`.sx-chip-20` …, app/globals.css): 16 → 10px,
 * 20 → 12px (the smallest letter any visible surface uses), 24 → 13px, 28 → 14px.
 */
const SIZE_CLASS: Record<16 | 20 | 24 | 28, string> = {
  16: 'sx-chip-16',
  20: 'sx-chip-20',
  24: 'sx-chip-24',
  28: 'sx-chip-28',
};

const GLYPH: Record<Exclude<ChipKind, 'none'>, string> = {
  W: 'W',
  L: 'L',
  T: 'T',
  pending: '',
  cancelled: '⊘',
  postponed: '↻',
};

export const CHIP_LABEL: Record<Exclude<ChipKind, 'none'>, string> = {
  W: 'Win',
  L: 'Loss',
  T: 'Tie',
  pending: 'Score not reported',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

export function ResultChip({ kind, size = 20, className }: ResultChipProps) {
  if (kind === 'none') {
    return <span className={`sx-chip-slot ${SIZE_CLASS[size]}`} />;
  }
  return (
    <span
      className={['sx-chip', SIZE_CLASS[size], KIND_CLASS[kind], className].filter(Boolean).join(' ')}
      /* The three colours are CUSTOM PROPERTIES set by the kind class and consumed by `.sx-chip`
         in globals.css, never a `background` / `border-color` / `color` in a `style` attribute:
         that would outrank every stylesheet rule, including the `forced-colors` block — the chip
         would then ignore a high-contrast palette entirely while still suppressing the browser's
         own substitution. The size is a class as well: a `style` on every chip was ~140 bytes,
         sent once in the markup and again in the RSC payload. */
      role="img"
      aria-label={CHIP_LABEL[kind]}
    >
      {/* The `⊘` / `↻` glyph is decorative: role="img" + aria-label carry the meaning, and
          the written status label sits beside the chip in the row. */}
      <span aria-hidden="true">{GLYPH[kind]}</span>
    </span>
  );
}

export default ResultChip;
