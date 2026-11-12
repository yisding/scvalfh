import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';

import type { BoardRow } from './board-view';

/**
 * "Where every league stands" (board-view.ts; DESIGN §32.2): one compact row per postseason of a region. A
 * working export that no page renders since the refresh (/playoffs opens on the bracket and the league row
 * reaches every section, spec §5.6). The name links to the section; the row says what the postseason is and,
 * dated, what is next (one link). A plain description list on hairlines: on a phone a row is two or three
 * short lines; from 768px the three facts sit in columns. Server component.
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
      <dl className="m-0">
        {rows.map((row) => (
          <div
            key={row.key}
            className="border-t border-divider px-2 py-2 first:border-t-0 md:grid md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.5fr)] md:items-baseline md:gap-6"
          >
            <dt className="min-w-0">
              <Link href={row.href} prefetch={false} className="sx-rowlink text-body font-semibold text-ink">
                {row.names}
              </Link>
            </dt>
            <dd className="m-0 min-w-0 text-cell text-ink-2">{row.path}</dd>
            {row.next ? (
              <dd className="m-0 min-w-0 text-cell">
                <span className="text-ink-2">{`${row.next.term}: `}</span>
                <Link href={row.next.href} prefetch={false} className="sx-link">
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
