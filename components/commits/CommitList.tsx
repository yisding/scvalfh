import Link from 'next/link';

import { SCHOOL_LINK, SchoolFace, SourcesLine } from '../clubs/ClubPlayers';
import type { CommitRow } from './commit-view';

/**
 * One class's commitments on /commits (DESIGN §33): each a player on the tracked varsity rosters,
 * the college, the status in words, and the public pages it rests on.
 *
 * Privacy (DESIGN §21.2, the clubs pages' posture): a row is a roster row of this site, by its own
 * spelling, and shows what the team page already shows (name, school, grade) plus the college, the
 * status and the links. The quotes, the basis and the confidence the data file keeps are not in the
 * view at all (components/commits/commit-view.ts), so nothing here can print them.
 *
 * An entry is the club page's player entry (components/clubs/ClubPlayers.tsx), in `sx-auto` columns
 * with a hairline under each:
 *   - the name;
 *   - the school with its logo, linking that team's roster, then the grade;
 *   - the college in the name's weight, then its official name when that is a short one, the sport
 *     and the division of the college's team in that sport, each its own element;
 *   - the status on its own line;
 *   - ONE sources line, each an off-site link whose accessible name leads with the player ("Pat
 *     Example: SportsRecruits profile").
 * The row's id is commitAnchor() (team slug + MaxPreps athleteId, never a name): a team page's
 * commitment line links it (html's scroll-padding keeps the target clear of the sticky header).
 */
function Row({ row }: { row: CommitRow }) {
  return (
    <li id={row.anchor} className="sx-target min-w-0 border-b border-hairline py-1.5">
      <span className="block text-body font-semibold text-ink">{row.name}</span>
      <span className="flex flex-wrap items-center gap-x-3 text-cell text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/ui/prefetch-policy). */}
        <Link href={row.school.href} prefetch={false} className={SCHOOL_LINK}>
          <SchoolFace school={row.school} />
        </Link>
        {row.facts.map((fact, i) => (
          <span key={i}>{fact}</span>
        ))}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 text-cell text-ink-2">
        <span className="font-semibold text-ink">{row.college.name}</span>
        {/* 'Vassar' beside 'Vassar College' says one thing twice; 'Cal' beside its full name does not. */}
        {row.college.fullName && !row.college.fullName.startsWith(row.college.name) ? <span>{row.college.fullName}</span> : null}
        <span className="whitespace-nowrap">{row.college.sport}</span>
        <span className="whitespace-nowrap">{row.college.division}</span>
      </span>
      {/* Every row on this page is a commitment: the status is printed only when it adds a date or differs. */}
      {row.status === 'Committed' ? null : <span className="block text-cell text-ink-2">{row.status}</span>}
      <SourcesLine name={row.name} sources={row.sources} />
    </li>
  );
}

export interface CommitListProps {
  rows: CommitRow[];
}

export function CommitList({ rows }: CommitListProps) {
  return (
    <ul className="sx-auto m-0 list-none p-0">
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </ul>
  );
}

export default CommitList;
