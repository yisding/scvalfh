import Link from 'next/link';

import type { TeamRef } from './festival-model';

/**
 * A festival team's name with its follow mark (DESIGN §35 §7): the wrapper carries `data-fest-team`, and the
 * generated stylesheet (follow-css.ts) makes a followed team's name bold and shows the star after it. The star is
 * the site's `.sx-pin-note` and carries the word "Following", so the mark is never colour or shape alone. One
 * team per wrapper; wrappers never nest.
 *
 * `link` false prints the name only (a row whose own link already goes to the team).
 */
export function FestivalTeamName({
  team,
  link = true,
  className,
  linkClassName,
}: {
  team: Pick<TeamRef, 'slug' | 'name' | 'href'>;
  link?: boolean;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <span data-fest-team={team.slug} className={['min-w-0', className].filter(Boolean).join(' ')}>
      {link ? (
        <Link href={team.href} prefetch={false} className={linkClassName ?? 'sx-link'}>
          {team.name}
        </Link>
      ) : (
        team.name
      )}
      <span className="sx-pin-note" hidden>
        Following
      </span>
    </span>
  );
}

export default FestivalTeamName;
