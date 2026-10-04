/**
 * The mono micro-tag: `NL`, `OT`, `2 OT`, `SO`, `F`, `†` (DESIGN §7.16).
 * A tag is a 1–2 word code — never a hue on its own. It is the one place mono caps survive:
 * 12px, weight 600, 0.06em (all from `text-kicker`), and it never wraps: 20px tall, ink-2 on
 * surface-3.
 *
 * A postseason status such as "Automatic qualifier" is a phrase, not a code, so it is the
 * sentence-case StatusChip (components/ui/StatusChip.tsx), not a Tag.
 */
export interface TagProps {
  children: React.ReactNode;
  /** A sentence for a screen reader, when the glyph alone would not read. */
  label?: string;
  className?: string;
}

export function Tag({ children, label, className }: TagProps) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-tag font-mono text-kicker uppercase h-5 px-1.5 bg-surface-3 text-ink-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden={label ? 'true' : undefined}>{children}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Tag;
