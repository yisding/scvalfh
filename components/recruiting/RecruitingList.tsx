import { Clubs, Commitment, Profiles } from '../teams/TeamRoster';
import GridRowFiller from '../ui/GridRowFiller';
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
    <ul className="sx-card sx-flush sx-bleed my-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li
          key={row.key}
          // A rule on top of every row except the first in each column (TeamRoster's rule).
          className="sx-gridcell"
        >
          <span className="block text-body text-ink">{row.name}</span>
          {row.facts.length > 0 ? (
            <span className="block text-meta text-ink-2">
              {row.facts.map((fact, i) => (
                <span key={i}>
                  {/* Each dot inside the nowrap span of the fact before it, so a line never starts
                      with one (TeamRoster's rule). */}
                  {i > 0 ? ' ' : null}
                  <span className="whitespace-nowrap">
                    {fact}
                    {i < row.facts.length - 1 ? <>&nbsp;&middot;</> : null}
                  </span>
                </span>
              ))}
            </span>
          ) : null}
          {row.commitment ? <Commitment row={row} /> : null}
          {row.clubs.length > 0 ? <Clubs row={row} /> : null}
          {row.profiles.length > 0 ? <Profiles row={row} /> : null}
        </li>
      ))}
      <GridRowFiller count={rows.length} columns={{ sm: 2, lg: 3 }} />
    </ul>
  );
}

export default RecruitingList;
