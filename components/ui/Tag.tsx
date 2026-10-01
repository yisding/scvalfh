/**
 * The mono micro-tag: `NL`, `OT`, `2 OT`, `SO`, `F`, `†` (DESIGN §7.16).
 * A tag is a word or a letter — never a hue on its own.
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
      className={`inline-flex items-center rounded-tag bg-surface-3 px-1 py-px font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3${
        className ? ` ${className}` : ''
      }`}
    >
      <span aria-hidden={label ? 'true' : undefined}>{children}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Tag;
