import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';

import type { BoardRow } from './board-view';

/**
 * "Where every league stands" (board-view.ts; DESIGN §32.2): one compact row per postseason of a region, at the top
 * of the region's block on /playoffs. The name links to the section; the row says what the postseason is and, dated,
 * what is next (one link). A description list in a card: on a phone a row is two or three short lines; from md the
 * three facts sit in columns. Server component.
 */
export interface PostseasonBoardProps {
  rows: readonly BoardRow[];
  /** 'board-norcal' | 'board-socal' */
  id: string;
  className?: string;
}

export function PostseasonBoard({ rows, id, className }: PostseasonBoardProps) {
  if (rows.length === 0) return null;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <SectionHeader id={`${id}-heading`} kicker="Where every league stands" />
      <dl className="sx-card m-0 divide-y divide-divider p-0">
        {rows.map((row) => (
          <div
            key={row.key}
            className="px-gutter py-3 md:grid md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.5fr)] md:items-baseline md:gap-6 md:px-5"
          >
            <dt className="min-w-0">
              <Link href={row.href} prefetch={false} className="sx-action text-body font-semibold text-ink hover:underline">
                {row.names}
              </Link>
            </dt>
            <dd className="m-0 min-w-0 text-meta text-ink-2">{row.path}</dd>
            {row.next ? (
              <dd className="m-0 mt-1 min-w-0 text-meta md:mt-0">
                <span className="text-ink-3">{`${row.next.term}: `}</span>
                <Link href={row.next.href} prefetch={false} className="sx-action text-ink hover:underline">
                  {row.next.text}
                </Link>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

export default PostseasonBoard;
