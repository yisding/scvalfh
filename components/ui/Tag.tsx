/**
 * The mono micro-tag: `NL`, `OT`, `2 OT`, `SO`, `F`, `AQ`, `PLAY-IN` (DESIGN §7.16).
 * A tag is a 1–2 word code — never a hue on its own. It is the one place mono caps survive:
 * 12px, weight 600, 0.06em (all from `text-kicker`), and it never wraps.
 *
 * `tone="accent"` is only for AQ (automatic qualifier), where the accent already means "berth";
 * it is accent-ink on the accent wash (6.5 / 7.55), never accent on the wash.
 */
export interface TagProps {
  children: React.ReactNode;
  /** A sentence for a screen reader, when the glyph alone would not read. */
  label?: string;
  /** Default `neutral` (ink-2 on surface-3). */
  tone?: 'neutral' | 'accent';
  /** Default `sm` (20px tall); `md` is 24px. */
  size?: 'sm' | 'md';
  className?: string;
}

export function Tag({ children, label, tone = 'neutral', size = 'sm', className }: TagProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-tag font-mono text-kicker uppercase ${
        size === 'md' ? 'h-6 px-2' : 'h-5 px-1.5'
      } ${tone === 'accent' ? 'bg-accent-wash text-accent-ink' : 'bg-surface-3 text-ink-2'}${
        className ? ` ${className}` : ''
      }`}
    >
      <span aria-hidden={label ? 'true' : undefined}>{children}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Tag;
