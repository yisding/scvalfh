import { Clubs, Commitment, Profiles } from '../teams/TeamRoster';
import type { RecruitingRow } from './recruiting-view';

/**
 * One school's listed players on /recruiting (DESIGN §33): each a row of the school's own roster,
 * with the commitment line, the club line and the profile links the team page shows for it, drawn by
 * the same components (components/teams/TeamRoster.tsx), so the two pages never word a row apart.
 *
 * A list, not a table: entries in `sx-auto` columns with a hairline under each, the team roster's
 * own layout. Each fact is its own element. The facts are plain text: the † the team page puts on a
 * value from another source is explained there, on the roster the school's strip links.
 */
export interface RecruitingListProps {
  rows: RecruitingRow[];
}

export function RecruitingList({ rows }: RecruitingListProps) {
  return (
    <ul className="sx-auto m-0 list-none p-0">
      {rows.map((row) => (
        <li key={row.key} className="min-w-0 border-b border-hairline py-1.5">
          <span className="block text-body font-semibold text-ink">{row.name}</span>
          {row.facts.length > 0 ? (
            <span className="flex flex-wrap gap-x-3 text-cell text-ink-2">
              {row.facts.map((fact, i) => (
                <span key={i} className="whitespace-nowrap">
                  {fact}
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
