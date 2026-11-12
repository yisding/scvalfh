import Link from 'next/link';

import ExternalLink from './ExternalLink';

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
  /** @deprecated There is no card; both values render the same. */
  variant?: 'card' | 'plain';
  className?: string;
}

export function EmptyState({ heading, children, action, className }: EmptyStateProps) {
  // No card (DESIGN §33): a heading, one line, and at most one button. `variant` is accepted and ignored.
  return (
    <div className={['py-2', className].filter(Boolean).join(' ')}>
      <p className="m-0 text-lead text-ink">{heading}</p>
      {children ? <p className="mt-1 mb-0 max-w-prose text-meta text-ink-2">{children}</p> : null}
      {action ? (
        /* The one action is a button-sized link: alone in its own paragraph it is not a word in a
           sentence, so WCAG 2.5.8's inline exception does not reach it. */
        <p className="mt-3 mb-0">
          {action.external ? (
            <ExternalLink href={action.href} className="sx-btn">
              {action.label}
            </ExternalLink>
          ) : (
            // `prefetch={false}`: LeaguePanel renders one of these per league inside app/page.tsx's
            // panels.map(), each pointing at a different /schedule/<league> page
            // (tests/ui/prefetch-policy.test.ts).
            <Link href={action.href} prefetch={false} className="sx-btn">
              {action.label}
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}

export default EmptyState;
