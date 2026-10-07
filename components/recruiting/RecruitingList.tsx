import { Clubs, Commitment, Profiles } from '../teams/TeamRoster';
import type { RecruitingRow } from './recruiting-view';

/**
 * One school's listed players on /recruiting: each a row of the school's own roster, with the
 * commitment line, the club line and the profile links the team page shows for it, drawn by the
 * same components (components/teams/TeamRoster.tsx), so the two pages never word a row apart.
 *
 * A list, not a table (DESIGN §10.8), in the roster's card and row-major grid: one column on a
 * phone, two from 640px, three from 1024px. The facts are plain text: the † the team page puts on
 * a value from another source is explained there, on the page the school's heading links.
 */
export interface RecruitingListProps {
  rows: RecruitingRow[];
}

export function RecruitingList({ rows }: RecruitingListProps) {
  return (
    <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li
          key={row.key}
          // A rule on top of every row except the first in each column (TeamRoster's rule).
          className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
        >
          <span className="block text-body text-ink">{row.name}</span>
          {row.facts.length > 0 ? (
            <span className="block text-meta text-ink-2">
              {row.facts.map((fact, i) => (
                <span key={i}>
                  {/* A no-break space BEFORE each dot, so a line never starts with one (TeamRoster's rule). */}
                  {i > 0 ? <>&nbsp;&middot; </> : null}
                  <span className="whitespace-nowrap">{fact}</span>
                </span>
              ))}
            </span>
          ) : null}
          {row.commitment ? <Commitment row={row} /> : null}
          {row.clubs.length > 0 ? <Clubs row={row} /> : null}
          {row.profiles.length > 0 ? <Profiles row={row} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default RecruitingList;
