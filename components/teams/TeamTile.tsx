import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamTileData } from './team-view';

/**
 * One tile on /teams (DESIGN §3.6, modernization brief §4.19): a card at least 72px tall with a
 * 40px monogram on the left, then the school name (14px/600, at most two lines) over the LEAGUE
 * record in 13px mono. The whole card is the link, and it lifts on hover (shadow only).
 *
 * The pinned state comes entirely from the global `.sx-card[data-team-slug][data-pinned]` rule,
 * which composes the 3px accent rule WITH the card ring — so this element must never carry a
 * `shadow-*` or `border` utility, or the pin (or the card edge) would be erased.
 *
 * Wilcox's record is an em dash, never `0-0-0`: it is a full De Anza member in the official
 * SCVAL grid and absent from every data source, and a zeroed record would read as "played and
 * lost nothing" (DESIGN §8, BYLAWS-ADDENDUM §4).
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx): sixteen
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
        className="sx-card sx-lift sx-tap flex min-h-[4.5rem] items-center gap-3 p-3 no-underline md:p-4"
      >
        <span className="sr-only">
          <span className="sx-pin-note">Your team. </span>
          {label}
        </span>
        <TeamMonogram team={team} size={40} />
        <span className="min-w-0">
          <span className="sx-clamp-2 block text-meta font-semibold text-ink" aria-hidden="true">
            {team.shortName}
          </span>
          <span className="sx-num block text-cell text-ink-2" aria-hidden="true">
            {record}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default TeamTile;
