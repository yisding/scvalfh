import { Fragment } from 'react';
import Link from 'next/link';

import { listWords } from '../../lib/format';
import type { ClubIndexRow } from './club-view';

/**
 * One region's clubs on /clubs (DESIGN §33): the clubs a public page ties a tracked player to, each
 * an entry (the display name linking the club's page, the full name and city, how many players,
 * current and earlier stated apart, and their schools), in `sx-auto` columns with a hairline under
 * each. The clubs with no tied player follow in ONE plain line of names, each still a link to its
 * page: an entry apiece would be a column of "none found".
 *
 * The name link is the main way into every club page, so it is 44px tall on a touch screen. It
 * carries `prefetch={false}` for the reason every per-row link does (tests/ui/prefetch-policy):
 * Next would otherwise download each club page as the list scrolls into view. Nothing here is
 * nowrap: the full names, HTC's long city and the school list must reflow at 320px.
 */
export interface ClubListProps {
  clubs: ClubIndexRow[];
}

const NAME_LINK = 'sx-teamlink inline-flex min-h-7 items-center text-body font-semibold text-ink pointer-coarse:min-h-11';

export function ClubList({ clubs }: ClubListProps) {
  const tied = clubs.filter((club) => club.current + club.other > 0);
  const rest = clubs.filter((club) => club.current + club.other === 0);
  return (
    <>
      {tied.length > 0 ? (
        <ul className="sx-auto m-0 list-none p-0">
          {tied.map((club) => (
            <li key={club.slug} className="min-w-0 border-b border-hairline py-1.5">
              <Link href={club.href} prefetch={false} className={NAME_LINK}>
                {club.name}
              </Link>
              {club.subline ? (
                <span className="flex flex-wrap gap-x-3 text-cell text-ink-2">
                  {club.subline.split(' · ').map((part) => (
                    <span key={part}>{part}</span>
                  ))}
                </span>
              ) : null}
              <span className="block text-cell text-ink">{club.countLine}</span>
              {club.schools.length > 0 ? (
                <span className="block text-cell text-ink-2">Schools: {listWords(club.schools)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rest.length > 0 ? (
        <p className="sx-note max-w-prose">
          {rest[0].countLine}:{' '}
          {rest.map((club, i) => (
            <Fragment key={club.slug}>
              {i > 0 ? ', ' : null}
              <Link href={club.href} prefetch={false}>
                {club.name}
              </Link>
            </Fragment>
          ))}
        </p>
      ) : null}
    </>
  );
}

export default ClubList;
