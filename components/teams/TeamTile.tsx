import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamTileData } from './team-view';

/**
 * One tile on /teams (DESIGN §3.6): 116px tall, a 40px monogram, the school name at 13px/600
 * over at most two lines, and the LEAGUE record in 13px mono. The whole tile is the link.
 *
 * A team with no reported results shows an em dash, never `0-0-0`: a zeroed record would read as
 * "played and lost nothing" (DESIGN §8, BYLAWS-ADDENDUM §4).
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx): fifteen
 * static team routes in one viewport is 16 full route payloads nobody asked for.
 */
export function TeamTile({ data }: { data: TeamTileData }) {
  const { team, standing, hasResults } = data;
  const record = hasResults && standing ? recordString(standing.computed) : EM_DASH;
  const label = hasResults && standing
    ? `${team.name}, ${recordString(standing.computed)} in league play`
    : `${team.name}, no results reported`;

  return (
    <li>
      {/* `data-team-slug` sits on the TILE, not the <li>: the tile paints an opaque surface, so
          an inset rule on its parent would be hidden behind it. The end-of-body script in
          app/layout.tsx matches this attribute to draw the pinned-team rule (DESIGN §3.6
          "[HM] ▓") — the pin is in localStorage, so the server cannot know it and this page
          stays completely static. */}
      <Link
        href={`/teams/${team.slug}`}
        prefetch={false}
        data-team-slug={team.slug}
        className="sx-tap flex h-[7.25rem] w-full flex-col items-center justify-center gap-1.5 border border-hairline bg-surface px-2 text-center no-underline"
      >
        <span className="sr-only">
          <span className="sx-pin-note">Your team. </span>
          {label}
        </span>
        <TeamMonogram team={team} size={40} />
        <span className="sx-clamp-2 text-meta font-semibold text-ink" aria-hidden="true">
          {team.shortName}
        </span>
        <span className="sx-num text-meta text-ink-2" aria-hidden="true">
          {record}
        </span>
      </Link>
    </li>
  );
}

export default TeamTile;
