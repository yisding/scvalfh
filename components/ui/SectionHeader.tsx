import Link from 'next/link';

/**
 * The section heading (DESIGN §7.2, R-9). An 18→20px sans h2 sitting on clear canvas, with
 * optional meta beside it and a right-aligned action link. There is no rule above it and no mono
 * kicker on it any more: space separates sections, lines only separate rows. The wrapper keeps
 * its historical `.sx-kicker` class (tests assert it), and the `kicker` prop keeps its name.
 *
 * Sizes:
 * - `section` (default for h2): 18→20px, every page section;
 * - `as="h3"` without a size: 18px `text-lead`;
 * - `lg`: 24px `text-title`, long-form h2s (About, History);
 * - `label`: 12px semibold ink-3, an in-card label ("Last", "Next", "Details").
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
  as?: 'h2' | 'h3';
  /** Defaults to `section`, or the h3 style when `as="h3"`. */
  size?: 'section' | 'lg' | 'label';
  /** An id for a `#de-anza` style anchor target. */
  id?: string;
  className?: string;
}

const HEADING = {
  section: 'm-0 text-section text-ink',
  h3: 'm-0 text-lead text-ink',
  lg: 'm-0 text-title text-ink',
  label: 'm-0 text-micro font-semibold text-ink-3',
} as const;

export function SectionHeader({
  kicker,
  meta,
  action,
  as: Heading = 'h2',
  size,
  id,
  className,
}: SectionHeaderProps) {
  const headingClass = HEADING[size ?? (Heading === 'h3' ? 'h3' : 'section')];
  return (
    <div
      className={`sx-kicker${size === 'label' ? ' sx-kicker-label' : ''}${
        className ? ` ${className}` : ''
      }`}
      id={id}
    >
      <Heading className={headingClass}>{kicker}</Heading>
      {meta ? <span className="text-meta font-normal tracking-normal text-ink-3">{meta}</span> : null}
      <span className="sx-kicker-rule" aria-hidden="true" />
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and almost every section on every page has one of these. Navigation still
          fetches on click. The negative margins let the 44px (phone) / 32px (desktop) pill grow
          around the text without moving the heading's baseline. */}
      {action ? (
        <Link
          href={action.href}
          prefetch={false}
          className="-my-2 -mr-3 inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 font-medium text-accent no-underline hover:bg-surface-2 md:min-h-8"
        >
          {action.label}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 2.5 8 6l-3.5 3.5" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}

export default SectionHeader;
