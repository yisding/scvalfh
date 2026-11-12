/**
 * The micro-tag: `OT`, `2 OT`, `SO`, `F`, a league code (`SCVAL`), `Non-league`, `this game`
 * (DESIGN §7.16; §33 for the face). Text only: 11px, weight 700, caps, ink-2, no fill and no box.
 * It is a 1–2 word code, never a hue, and it never wraps. The one FILLED label on the site is
 * `Flag` (components/ui/Flag.tsx), for "your team" and a live game.
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
      // `.sx-tag` (app/globals.css) is the look; `rounded-tag` stays as the hook older call sites select by.
      className={['sx-tag rounded-tag', className].filter(Boolean).join(' ')}
    >
      <span aria-hidden={label ? 'true' : undefined}>{children}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Tag;
