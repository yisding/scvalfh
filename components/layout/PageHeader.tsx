/**
 * The page title block. It sits on the canvas (never in a card) and opens every route except
 * /game/[id], whose h1 stays sr-only beside the scoreboard, and the team page, whose TeamIdentity
 * hero card holds its own h1.
 *
 * Phone: eyebrow, h1 (28px), description, meta row, then the aside stacked underneath.
 * From 768px: the aside (steppers, inline DivisionTabs) moves to the right of the title block and
 * aligns to its bottom edge; the h1 grows to 36px.
 *
 * The first block after a PageHeader takes `mt-8 md:mt-10`; later sections take
 * `mt-section md:mt-section-lg`.
 *
 * Class strings are built with `[…].filter(Boolean).join(' ')`, never `md:pt-10${…}`: Tailwind's
 * scanner does not extract a candidate that runs straight into a template interpolation, so the
 * glued class is silently never generated. tests/ui/class-join.test.ts holds the rule site-wide.
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  /** Appended inside the h1 as sr-only text (e.g. " — scores, standings and the CCS playoff picture"). */
  srTitle?: string;
  /** A 14px ink-3 line above the title (e.g. the weekday on /scores/[date]). */
  eyebrow?: React.ReactNode;
  /** 16px ink-2 lede under the title, capped at `max-w-prose`. */
  description?: React.ReactNode;
  /** A row under the title: `sx-badge` pills or a one-line status. */
  meta?: React.ReactNode;
  /** Right side from md (steppers, inline DivisionTabs); below the title on phone. */
  aside?: React.ReactNode;
  /** Extra classes for the aside wrapper, e.g. `hidden md:block` when it is desktop-only. */
  asideClassName?: string;
  className?: string;
}

export function PageHeader({
  title,
  srTitle,
  eyebrow,
  description,
  meta,
  aside,
  asideClassName,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={['pt-6 md:flex md:items-end md:justify-between md:gap-8 md:pt-10', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="m-0 mb-1 text-meta font-medium text-ink-3">{eyebrow}</p> : null}
        <h1 className="m-0 text-h1 text-ink">
          {title}
          {srTitle ? <span className="sr-only">{srTitle}</span> : null}
        </h1>
        {description ? (
          <p className="mt-2 mb-0 max-w-prose text-body text-ink-2">{description}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {aside ? (
        <div className={['mt-4 shrink-0 md:mt-0', asideClassName].filter(Boolean).join(' ')}>
          {aside}
        </div>
      ) : null}
    </header>
  );
}

export default PageHeader;
