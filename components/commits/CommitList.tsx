import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import type { CommitRow } from './commit-view';

/**
 * One class's commitments on /commits (DESIGN §21.1): each a player on the tracked varsity rosters,
 * the college, the status in words, and the public pages it rests on.
 *
 * Privacy (DESIGN §21.2, the clubs pages' posture): a row is a roster row of this site, by its own
 * spelling, and shows what the team page already shows (name, school, grade) plus the college, the
 * status and the links. The quotes, the basis and the confidence the data file keeps are not in the
 * view at all (components/commits/commit-view.ts), so nothing here can print them.
 *
 * Each row is the club page's player row (components/clubs/ClubPlayers.tsx), the same card and
 * row-major grid as the team roster:
 *   - the name;
 *   - the school, linking that team's roster, then the grade, kept whole with a no-break space
 *     before its dot (the AwardsBlock rule);
 *   - the college: its display name, the official name when that is a short one, and the division,
 *     each part wrapping on its own;
 *   - the status on its own line;
 *   - the sources, each an off-site link whose accessible name leads with the player ("Pat
 *     Example: SportsRecruits profile").
 * The row's id is commitAnchor() (team slug + MaxPreps athleteId, never a name): a team page's
 * commitment line links it (html's scroll-padding keeps the target clear of the sticky header).
 * Every link stands alone in its row, so each carries the 24px `sx-action` box (WCAG
 * 2.5.8), with the sr-only name and the label in ONE span, as ClubPlayers explains.
 */
function Row({ row }: { row: CommitRow }) {
  return (
    <li
      id={row.anchor}
      className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
    >
      <span className="block text-body text-ink">{row.name}</span>
      <span className="block text-meta text-ink-2">
        {/* `prefetch={false}`: one link per row, to a static team page (tests/ui/prefetch-policy). */}
        <Link href={row.school.href} prefetch={false} className="sx-action text-accent hover:underline">
          <span>
            {row.school.name}
            <span className="sr-only"> roster</span>
          </span>
        </Link>
        {row.facts.map((fact, i) => (
          <span key={i}>
            &nbsp;&middot; <span className="whitespace-nowrap">{fact}</span>
          </span>
        ))}
      </span>
      <span className="block text-meta text-ink-2">
        <span className="font-semibold text-ink">{row.college.name}</span>
        {row.college.fullName ? <>&nbsp;&middot; {row.college.fullName}</> : null}
        &nbsp;&middot; <span className="whitespace-nowrap">{row.college.division}</span>
      </span>
      <span className="block text-meta text-ink-2">{row.status}</span>
      <span className="block text-meta text-ink-2">
        <span className="text-ink-3">Sources:</span>&nbsp;
        {row.sources.map((source, i) => (
          <span key={source.url}>
            {i > 0 ? <>&nbsp;&middot; </> : null}
            <ExternalLink href={source.url} className="sx-action gap-1 whitespace-nowrap">
              <span>
                <span className="sr-only">{row.name}: </span>
                {source.label}
              </span>
            </ExternalLink>
          </span>
        ))}
      </span>
    </li>
  );
}

export function CommitList({ rows }: { rows: CommitRow[] }) {
  return (
    <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </ul>
  );
}

export default CommitList;
