import Link from 'next/link';

/**
 * The house rule (DESIGN §8): say what is true, say when it changes.
 *
 * A lead line, one sentence, at most one action. No illustrations, no icons, no dashed borders,
 * and never a greyed-out skeleton — a skeleton reads as real data.
 *
 * `variant="card"` (default) is its own `.sx-card`; `variant="plain"` is for an empty state that
 * already sits inside another card. The lead line is a `<p>`, not a heading, so it never disturbs
 * the page's heading order.
 */
export interface EmptyStateProps {
  heading: string;
  children?: React.ReactNode;
  action?: { href: string; label: string; external?: boolean };
  /** Default `card`. Use `plain` inside another card. */
  variant?: 'card' | 'plain';
  className?: string;
}

export function EmptyState({
  heading,
  children,
  action,
  variant = 'card',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`${variant === 'plain' ? 'py-2' : 'sx-card p-5 md:p-6'}${
        className ? ` ${className}` : ''
      }`}
    >
      <p className="m-0 text-lead text-ink">{heading}</p>
      {children ? <p className="mt-1 mb-0 max-w-[52ch] text-meta text-ink-2">{children}</p> : null}
      {action ? (
        /* The one action is a 44px pill: alone in its own paragraph it is not a word in a
           sentence, so WCAG 2.5.8's inline exception does not reach it, and on a team page with no
           results, where every section is an empty state, these are the only links on the page. */
        <p className="mt-4 mb-0">
          {action.external ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="sx-pill min-h-11"
            >
              {action.label} <span aria-hidden="true">&#8599;</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href={action.href} className="sx-pill min-h-11">
              {action.label}
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}

export default EmptyState;
