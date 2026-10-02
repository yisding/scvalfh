import type { ChipKind } from './game-view';

/**
 * A square with the LETTER inside (DESIGN §7.5, §6.5).
 *
 * The letter is channel 1 — it survives grayscale, CVD, forced-colors and a screenshot pasted
 * into a group text. Hue is channel 4 and the only optional one. There is exactly ONE visual
 * treatment: wash ground, 1px ring at the mark hue, glyph in the ink token (5.80–8.28:1
 * everywhere). No `solid` variant, so the raw loss mark never becomes a fill under a letter.
 * No `title` attribute — a touch device never sees one.
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

const STYLES: Record<Exclude<ChipKind, 'none'>, { bg: string; ring: string; ink: string }> = {
  W: { bg: 'var(--sx-win-wash)', ring: 'var(--sx-win)', ink: 'var(--sx-win-ink)' },
  L: { bg: 'var(--sx-loss-wash)', ring: 'var(--sx-loss)', ink: 'var(--sx-loss-ink)' },
  T: { bg: 'var(--sx-tie-wash)', ring: 'var(--sx-tie)', ink: 'var(--sx-tie-ink)' },
  pending: { bg: 'transparent', ring: 'var(--sx-border-strong)', ink: 'var(--sx-text-3)' },
  cancelled: { bg: 'var(--sx-tie-wash)', ring: 'var(--sx-tie)', ink: 'var(--sx-tie-ink)' },
  postponed: { bg: 'var(--sx-tie-wash)', ring: 'var(--sx-tie)', ink: 'var(--sx-tie-ink)' },
};

/** Letter size per chip size, px. 20 → 12 is the smallest letter any visible surface uses. */
const LETTER: Record<16 | 20 | 24 | 28, number> = { 16: 10, 20: 12, 24: 13, 28: 14 };

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
    return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
  }
  const s = STYLES[kind];
  return (
    <span
      className={`sx-chip inline-flex shrink-0 items-center justify-center rounded-tag border font-sans font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      /* The three colours go out as CUSTOM PROPERTIES, consumed by `.sx-chip` in globals.css.
         Setting `background` / `border-color` / `color` here directly would outrank every
         stylesheet rule, including the `forced-colors` block — the chip would then ignore a
         high-contrast palette entirely while still suppressing the browser's own substitution. */
      style={
        {
          width: size,
          height: size,
          '--sx-chip-bg': s.bg,
          '--sx-chip-ring': s.ring,
          '--sx-chip-ink': s.ink,
          fontSize: LETTER[size],
        } as React.CSSProperties
      }
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
