import Link from 'next/link';

/**
 * A heading row (DESIGN §33). Two faces:
 *
 * - default, a SECTION head (`.sx-kicker`): the heading (an h2 is 22px in the condensed face, from
 *   the base rule), an optional fact beside it, and an optional action link pushed to the right.
 *   There is no rule above or below it: space separates sections, lines only separate rows. The
 *   `kicker` prop and the `.sx-kicker` / `.sx-kicker-rule` names are historical (tests assert them).
 * - `strip`, a GROUP head inside a section (`.sx-strip`): a 36px tint strip with the name at the
 *   left (15px/700) and, together at the right end, the fact (`meta`: "Semifinals", "3 games") and
 *   one link (`action`: "Bracket"). For a competition on a day, a division's table in a rail or an
 *   overview, a date in a long list, a leaders board.
 *
 * Pass `meta` only when it is a fact the heading lacks; never one that restates the content.
 *
 * Sizes (default face): `section` (h2), the h3 style for `as="h3"` / `as="h4"`, `lg` (= section),
 * `label` (a 13px in-block label).
 */
export interface SectionHeaderProps {
  /** "Latest scores": sentence case, rendered as written. */
  kicker: string;
  /**
   * "Thu Sep 24", "all times PT", "League games only · through Mon Sep 28": sits right of the
   * heading in 14px ink-3.
   *
   * A `ReactNode`, not a string, so a caller can keep a TOKEN together without this component
   * deciding for everyone: /history's "2025-26" split into "2025-" / "26" here, but
   * /standings' meta is a whole clause that has to be free to wrap or it pushes the page sideways
   * at 320px. Whoever knows which one they are passing says so.
   */
  meta?: React.ReactNode;
  /** Sentence case with its context: "All 3 games", "Full table", "Change team". */
  action?: { href: string; label: string };
  /** 'h4' takes the h3 style: a round inside a section that is itself an h3 (the MCAL tournament on /playoffs). */
  as?: 'h2' | 'h3' | 'h4';
  /** Defaults to `section`, or the h3 style when `as="h3"`. */
  size?: 'section' | 'lg' | 'label';
  /** An id for a `#de-anza` style anchor target. */
  id?: string;
  /**
   * The group-strip face: the heading at the left of a tint strip, `meta` and `action` at its right
   * end. The heading is an h3 unless `as` says otherwise.
   */
  strip?: boolean;
  className?: string;
}

const HEADING = {
  section: 'm-0 text-section text-ink',
  h3: 'm-0 text-lead text-ink',
  lg: 'm-0 text-title text-ink',
  label: 'm-0 text-micro font-semibold text-ink-2',
} as const;

export function SectionHeader({
  kicker,
  meta,
  action,
  as,
  size,
  id,
  strip = false,
  className,
}: SectionHeaderProps) {
  const Heading = as ?? (strip ? 'h3' : 'h2');
  // `prefetch={false}` for the reason the nav and the standings rows carry it: every route here is
  // STATIC, so Next's `auto` downloads the whole linked route the moment the link scrolls into
  // view, and almost every section on every page has one of these.
  const link = action ? (
    <Link href={action.href} prefetch={false} className="sx-action">
      {action.label}
    </Link>
  ) : null;
  if (strip) {
    return (
      <div className={['sx-strip', className].filter(Boolean).join(' ')} id={id}>
        <Heading className={HEADING.h3}>{kicker}</Heading>
        {meta || link ? (
          <div className="sx-strip-end">
            {meta ? <span>{meta}</span> : null}
            {link}
          </div>
        ) : null}
      </div>
    );
  }
  const headingClass = HEADING[size ?? (Heading === 'h2' ? 'section' : 'h3')];
  return (
    <div className={['sx-kicker', className].filter(Boolean).join(' ')} id={id}>
      {/* The heading and its meta wrap TOGETHER, inside their own box, and the action sits beside
          that box: when all three overflow a phone row, the meta drops under the heading and the
          action stays on the heading's line. DOM order: heading, meta, rule, action. */}
      <div>
        <Heading className={headingClass}>{kicker}</Heading>
        {meta ? <span className="text-cell font-normal text-ink-2">{meta}</span> : null}
      </div>
      <span className="sx-kicker-rule" aria-hidden="true" />
      {link}
    </div>
  );
}

export default SectionHeader;
