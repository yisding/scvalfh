import Link from 'next/link';

import TeamMonogram from '../ui/TeamMonogram';
import type { Team } from '../../lib/types';

/**
 * A champion as one row (spec §5.6; it was a card): the logo, the name (a link to the team page when
 * the school is one this site follows), the plain label that says of what ("Division 1 champion"),
 * then how the final went. `prefetch={false}`: every route is static, and Next's `auto` would download
 * each linked team page as the row scrolls into view.
 */
export default function ChampionRow({
  team,
  name,
  label,
  detail,
}: {
  team: Team | undefined;
  /** The name as the archive prints it (the registry's, not the source's spelling). */
  name: string;
  /** 'Division 1 champion' */
  label: string;
  /** 'Beat Saint Francis 3-0 in the final' */
  detail?: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 px-2 py-2" data-team-slug={team?.slug}>
      {team ? <TeamMonogram team={team} size={24} /> : null}
      {team ? (
        <Link href={`/teams/${team.slug}`} prefetch={false} className="sx-teamlink text-body font-bold text-ink">
          {name}
        </Link>
      ) : (
        <span className="text-body font-bold text-ink">{name}</span>
      )}
      <span className="text-cell text-ink-2">{label}</span>
      {detail ? <span className="text-cell text-ink-2 sm:ml-auto">{detail}</span> : null}
    </li>
  );
}
