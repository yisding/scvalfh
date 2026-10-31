import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';

import type { BoardLine, BoardRow } from './board-view';

/**
 * "Where every league stands" (board-view.ts; DESIGN §32.2): one row per league of a region, at the top of the
 * region's block on /playoffs. The league's name links to its section on the page; the row says what the league's
 * postseason is, its latest result and what is next, each line one link to the game page or the event's place.
 * A list in a card, no table: on a phone each row stacks, name and path over the two lines. Server component.
 */
export interface PostseasonBoardProps {
  rows: readonly BoardRow[];
  /** 'board-norcal' | 'board-socal' */
  id: string;
  className?: string;
}

function Line({ term, line }: { term: string; line: BoardLine }) {
  const words = `${line.when} · ${line.text}`;
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="w-12 shrink-0 text-micro font-semibold text-ink-3">{term}</span>
      {line.href ? (
        <Link href={line.href} prefetch={false} className="sx-action min-w-0 text-body text-ink hover:underline">
          {words}
        </Link>
      ) : (
        <span className="min-w-0 text-body text-ink">{words}</span>
      )}
      {line.label ? <span className="sx-badge">{line.label}</span> : null}
    </p>
  );
}

export function PostseasonBoard({ rows, id, className }: PostseasonBoardProps) {
  if (rows.length === 0) return null;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <SectionHeader id={`${id}-heading`} kicker="Where every league stands" />
      <ul className="sx-card m-0 list-none divide-y divide-divider p-0">
        {rows.map((row) => (
          <li key={row.leagueId} className="px-gutter py-4 md:grid md:grid-cols-[14rem_1fr] md:gap-6 md:px-5">
            <div className="min-w-0">
              <Link href={row.href} prefetch={false} className="sx-action text-lead font-semibold text-ink hover:underline">
                {row.shortName}
              </Link>
              <p className="m-0 text-meta text-ink-2">{row.path}</p>
            </div>
            {row.latest || row.next ? (
              <div className="mt-2 flex min-w-0 flex-col gap-1 md:mt-0">
                {row.latest ? <Line term="Latest" line={row.latest} /> : null}
                {row.next ? <Line term="Next" line={row.next} /> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PostseasonBoard;
