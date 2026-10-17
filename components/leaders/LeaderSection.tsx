import type { ReactNode } from 'react';

import type { RegionId } from '../../lib/types';
import SectionHeader from '../ui/SectionHeader';
import LeaderBoardTable from './LeaderBoardTable';
import type { LeaderBoard } from './types';

/**
 * One region's Schools or Players section on /leaders (DESIGN §16, §28): the h2, an index of its
 * boards, the boards in a grid (one column on a phone, two from 1024px), and the section's notes as
 * the grid's last cell, so they sit beside the last board when the count is odd rather than below a
 * hole in the grid.
 *
 * The index is a row of canvas pills, one per board (`#best-record`, `#most-saves-socal`, …), so a
 * phone reader can reach the sixth board without scrolling past five 600px tables. It is plain
 * fragment links (zero JavaScript) and screen-only (`sx-print-hide`), like LeagueJumpLinks.
 */
export interface LeaderSectionProps {
  id: string;
  /** The region-scope stylesheet shows the reader's region. */
  region: RegionId;
  /** 'Schools' | 'Players' */
  title: string;
  /** "School leaders, Northern California": the section's accessible name. */
  label: string;
  meta: string;
  boards: readonly LeaderBoard[];
  /** The notes' heading: "Who qualifies". */
  notesTitle: string;
  /** null leaves the cell out: nothing to say yet. */
  notes: ReactNode | null;
  className?: string;
}

export function LeaderSection({
  id,
  region,
  title,
  label,
  meta,
  boards,
  notesTitle,
  notes,
  className = '',
}: LeaderSectionProps) {
  return (
    <section id={id} data-region-scope={region} aria-label={label} className={`min-w-0 ${className}`}>
      <SectionHeader size="lg" kicker={title} meta={meta} />
      <nav aria-label={`${label}: boards`} className="sx-print-hide mt-4">
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {boards.map((board) => (
            <li key={board.id}>
              <a href={`#${board.id}`} className="sx-pill sx-pill-ring">
                {board.navLabel}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-section grid gap-y-section lg:grid-cols-2 lg:gap-x-10">
        {boards.map((board) => (
          <LeaderBoardTable key={board.id} board={board} />
        ))}
        {notes ? (
          <div className="min-w-0">
            <SectionHeader as="h3" kicker={notesTitle} />
            <div className="mt-3 max-w-prose space-y-2 text-meta text-ink-3">{notes}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default LeaderSection;
