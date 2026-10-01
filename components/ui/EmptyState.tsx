import Link from 'next/link';

/**
 * The house rule (DESIGN §8): say what is true, say when it changes.
 *
 * A heading, one sentence, at most one action. No illustrations, no icons, no dashed borders,
 * and never a greyed-out skeleton — a skeleton reads as real data.
 */
export interface EmptyStateProps {
  heading: string;
  children?: React.ReactNode;
  action?: { href: string; label: string; external?: boolean };
  className?: string;
}

export function EmptyState({ heading, children, action, className }: EmptyStateProps) {
  return (
    <div className={`py-6${className ? ` ${className}` : ''}`}>
      <p className="m-0 text-body font-semibold text-ink">{heading}</p>
      {children ? <p className="mt-1 mb-0 max-w-[62ch] text-meta text-ink-2">{children}</p> : null}
      {action ? (
        /* `sx-action`: the one action of an empty state is alone in its own paragraph, so it is not
           a word in a sentence and WCAG 2.5.8's inline exception does not reach it. At `text-meta`
           the anchor's own box is 17px; `sx-action` gives it the 24px floor. It matters most on
           /teams/wilcox, where every section is an empty state and these are the only links on the
           page. */
        <p className="mt-3 mb-0 text-meta">
          {action.external ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="sx-action text-accent hover:underline"
            >
              {action.label} <span aria-hidden="true">&#8599;</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href={action.href} className="sx-action text-accent hover:underline">
              {action.label} <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}

export default EmptyState;
