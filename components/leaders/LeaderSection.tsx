import type { RegionId } from '../../lib/types';
import LeaderBoardTable from './LeaderBoardTable';
import type { LeaderBoard } from './types';

/**
 * One region's Players or Teams section on /leaders (DESIGN §16, §33): its h2 and its boards in a
 * grid (`.sx-boards`: one column on a phone, two from 768px, three from 1024px), every board
 * visible at once.
 *
 * The section is a block that carries `data-region-scope`; the grid is the element inside it.
 * `titleHidden`: the section directly under the page's Players / Teams tab row keeps its h2 for
 * the outline but does not draw it, since the tab row above it has just said the same word.
 */
export interface LeaderSectionProps {
  id: string;
  /** The region-scope stylesheet shows the reader's region. */
  region: RegionId;
  /** 'Players' | 'Teams' */
  title: string;
  /** "Team leaders, Northern California": the section's accessible name. */
  label: string;
  boards: readonly LeaderBoard[];
  /** Keep the h2 for the outline, visually hidden. */
  titleHidden?: boolean;
  className?: string;
}

export function LeaderSection({ id, region, title, label, boards, titleHidden = false, className }: LeaderSectionProps) {
  return (
    <section
      id={id}
      data-region-scope={region}
      aria-label={label}
      className={['sx-section min-w-0', className].filter(Boolean).join(' ')}
    >
      <h2 className={titleHidden ? 'sr-only' : undefined}>{title}</h2>
      <div className="sx-boards">
        {boards.map((board) => (
          <LeaderBoardTable key={board.id} board={board} />
        ))}
      </div>
    </section>
  );
}

export default LeaderSection;
