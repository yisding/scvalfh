/**
 * The mono micro-tag: `NL`, `OT`, `2 OT`, `SO`, `F`, a league code (`SCVAL`), `this game`
 * (DESIGN §7.16). A game's postseason chip is a phrase ("San Diego Section playoffs") that no fixed
 * track holds, so GameRow's GameChips draws it as a wrapping capsule, not a Tag.
 * A tag is a 1–2 word code — never a hue on its own. It is the one place mono caps survive:
 * 12px, weight 600, 0.06em (all from `text-kicker`), and it never wraps: 20px tall, ink-2 on
 * surface-3.
 *
 * A postseason status such as "Automatic qualifier" is a phrase, not a code, so it is the
 * sentence-case StatusChip (components/ui/StatusChip.tsx), not a Tag.
 *
 * The † beside a si.com score is not a Tag either: StatusLabel's SourceMark prints it as a sans
 * footnote mark.
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
      // `.sx-tag` (app/globals.css) is the look, one class instead of eleven utilities: a game
      // row carries two to four tags, and /schedule/<league> renders every row twice. The corner
      // stays the `rounded-tag` utility because it is also the HOOK GameRow's SummaryLead
      // tightens tags by (`[&_.rounded-tag]:px-1`, `[&_.rounded-tag]:h-4`), as it does the
      // postseason capsule's.
      className={['sx-tag rounded-tag', className].filter(Boolean).join(' ')}
    >
      <span aria-hidden={label ? 'true' : undefined}>{children}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Tag;
