import Link from 'next/link';

/**
 * The rule-and-kicker (DESIGN §7.2, R-9) — a 1px hairline with an 11px tracked mono kicker
 * sitting on it, optional meta beside it, and a right-aligned action link. It opens every
 * section on every page and it is the entire visual signature.
 */
export interface SectionHeaderProps {
  /** "LATEST SCORES" — uppercased by CSS, so pass it sentence-free. */
  kicker: string;
  /**
   * "Thu Sep 24", "all times PT", "League games only · through Mon Sep 28" — sits right of the
   * kicker.
   *
   * A `ReactNode`, not a string, so a caller can keep a TOKEN together without this component
   * deciding for everyone: /history's "2025-26" split into "2025-" / "26" here, but
   * /standings' meta is a whole clause that has to be free to wrap or it pushes the page sideways
   * at 320px. Whoever knows which one they are passing says so.
   */
  meta?: React.ReactNode;
  action?: { href: string; label: string };
  as?: 'h2' | 'h3';
  /** An id for a `#de-anza` style anchor target. */
  id?: string;
  className?: string;
}

export function SectionHeader({
  kicker,
  meta,
  action,
  as: Heading = 'h2',
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={`sx-kicker${className ? ` ${className}` : ''}`} id={id}>
      <Heading className="m-0 text-kicker font-mono font-semibold tracking-[0.10em] uppercase text-ink-3">
        {kicker}
      </Heading>
      {meta ? <span className="normal-case tracking-normal text-ink-3">{meta}</span> : null}
      <span className="sx-kicker-rule" aria-hidden="true" />
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and almost every section on every page has one of these. Navigation still
          fetches on click. */}
      {action ? (
        <Link href={action.href} prefetch={false} className="shrink-0 hover:underline">
          {action.label} <span aria-hidden="true">&rarr;</span>
        </Link>
      ) : null}
    </div>
  );
}

export default SectionHeader;
