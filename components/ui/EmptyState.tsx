import Link from 'next/link';

import ExternalLink from './ExternalLink';

/**
 * The house rule (DESIGN §8): say what is true, say when it changes.
 *
 * One plain line (`<p className="sx-empty">`) under the section's own heading, with at most one
 * inline link. No illustrations, no icons, no card, and never a greyed-out skeleton — a skeleton
 * reads as real data. The line is a `<p>`, not a heading, so it never disturbs the heading order.
 */
export interface EmptyStateProps {
  heading: string;
  /** @deprecated One line only: pages should stop passing a second sentence. It follows the first in the same paragraph. */
  children?: React.ReactNode;
  action?: { href: string; label: string; external?: boolean };
  /** @deprecated There is no card; both values render the same. */
  variant?: 'card' | 'plain';
  className?: string;
}

export function EmptyState({ heading, children, action, className }: EmptyStateProps) {
  // ONE plain paragraph (DESIGN §33): what is true, then at most one inline link. No card, no
  // lead-plus-body pair, no button. `children` (the old second sentence) still follows in the same
  // paragraph until the pages stop passing it; `variant` is ignored.
  return (
    <p className={['sx-empty', className].filter(Boolean).join(' ')}>
      {heading}
      {children ? <> {children}</> : null}
      {action ? (
        <>
          {' '}
          {action.external ? (
            <ExternalLink href={action.href} className="sx-link">
              {action.label}
            </ExternalLink>
          ) : (
            // `prefetch={false}`: rendered per league inside a `.map()` (tests/ui/prefetch-policy.test.ts).
            <Link href={action.href} prefetch={false} className="sx-link">
              {action.label}
            </Link>
          )}
        </>
      ) : null}
    </p>
  );
}

export default EmptyState;
