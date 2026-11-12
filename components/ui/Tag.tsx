/**
 * A short code or word beside something: `OT`, `SO`, `F`, a league code (`SCVAL`), `Non-league`,
 * `this game` (DESIGN §33). Plain 14px text in natural case (`.sx-tag`): no fill, no box, no hue.
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
