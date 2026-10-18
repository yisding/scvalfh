/**
 * The selected-state check of a selector chip or pill (DESIGN §15.4, §26.1: inverse ink AND a
 * check, never colour alone): the league and region chips (components/layout/LeagueSwitcher.tsx)
 * and the schedule filter pills (components/schedule/ScheduleFilters.tsx).
 *
 * Drawn, not typed. U+2713 is not in the latin subset of Geist that next/font serves, so a `✓`
 * came from whatever system font had it, and its advance varied by OS: 10.6px at 12px in Linux's
 * DejaVu Sans, other widths on a Mac or a phone. A chip that always lays out its check (so a
 * selection never changes its width) still took its width from that font. The SVG is
 * 0.6667em square (8px in a 12px chip, 9.3px in a 14px pill) on every platform, scales with text
 * zoom like the glyph did, and inherits the chip's ink through `currentColor`. aria-hidden: the
 * state is announced by `aria-pressed` / `aria-current`, never by a glyph.
 *
 * No hooks and no `'use client'`: it is a plain leaf the client chip modules import.
 */
export function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={['shrink-0', className].filter(Boolean).join(' ')}
      width="0.6667em"
      height="0.6667em"
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 4.3 3.1 6.4 7 1.6" />
    </svg>
  );
}

export default CheckMark;
