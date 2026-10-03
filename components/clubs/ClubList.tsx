import Link from 'next/link';

import { listWords } from '../../lib/format';
import type { ClubIndexRow } from './club-view';

/**
 * One region's clubs on /clubs (DESIGN §17.5): the display name linking the club's page, then the
 * full name and city, how many tracked players a public page ties to it (current and earlier
 * stated apart), and their schools.
 *
 * A list, not a table (DESIGN §10.8): four short lines reflow at 320px / 400% zoom, and a club with
 * no tied player simply has fewer of them. The rows sit in one card with divider rules, in the
 * same row-major grid as the team roster (components/teams/TeamRoster.tsx): one column on a phone,
 * two from 640px, three from 1024px.
 *
 * The name link is the main way into thirteen pages from a phone, so it is 44px tall there and
 * 32px from 768px (the SectionHeader action's size), at the 600 weight of a TeamTile name. It
 * carries `prefetch={false}` for the reason every per-row link does (tests/ui/prefetch-policy):
 * Next 16 would otherwise download each club page as the list scrolls into view. Nothing here
 * wraps without a break: the full names, HTC's long city and the school list must reflow.
 */
export function ClubList({ clubs }: { clubs: ClubIndexRow[] }) {
  return (
    <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => (
        <li
          key={club.slug}
          // A rule on top of every row except the first in each column (TeamRoster's rule).
          className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
        >
          <span className="block">
            <Link
              href={club.href}
              prefetch={false}
              className="sx-action min-h-11 text-body font-semibold text-accent hover:underline md:min-h-8"
            >
              {club.name}
            </Link>
          </span>
          {club.subline ? <span className="block text-meta text-ink-2">{club.subline}</span> : null}
          <span className="block text-meta text-ink-2">{club.countLine}</span>
          {club.schools.length > 0 ? (
            <span className="block text-meta text-ink-3">Schools: {listWords(club.schools)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default ClubList;
