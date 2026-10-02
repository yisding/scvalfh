import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamTileData } from './team-view';

/**
 * One tile on /teams (DESIGN §3.6, modernization brief §4.19): a card at least 72px tall with a
 * 40px monogram on the left, then the school name (600, at most two lines; 14px on a phone, 16px
 * from 640px) over the LEAGUE record in 13px mono. The whole card is the link, and it lifts on
 * hover (shadow only).
 *
 * Below 380px the monogram STACKS above the name. Side by side, a 2-up tile at 320–379px leaves
 * the name 62–88px, and a single long word ("Presentation" is 89px at 14px/600) cannot wrap, so
 * the clamp cut it mid-word. Stacked, the name gets the tile's full inner width. `h-full` makes
 * every tile in a grid row the same height when one name wraps.
 *
 * The lift eases its shadow AND the `.sx-tap` press colour: both base rules set `transition`, and
 * the later `.sx-tap` one wins the cascade, so the shadow used to snap. The utility below lists
 * both properties (and the global reduced-motion rule still neutralises it).
 *
 * The pinned state comes entirely from the global `.sx-card[data-team-slug][data-pinned]` rule,
 * which composes the 3px accent rule WITH the card ring — so this element must never carry a
 * `shadow-*` or `border` utility, or the pin (or the card edge) would be erased.
 *
 * A team with no reported results shows an em dash, never `0-0-0`: a zeroed record would read as
 * "played and lost nothing" (DESIGN §8, BYLAWS-ADDENDUM §4).
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx): 43 static
 * team routes on one page would be 43 full route payloads nobody asked for.
 *
 * The `<li>` carries `data-team-tile={slug}`: /teams' TeamFinder (filter mode) toggles `hidden`
 * on it, so a filtered-out tile leaves no empty list item behind for a screen reader (SPEC §9.3).
 * While a search is active (`search[data-searching]` anywhere inside the `[data-teams-page]`
 * wrapper) the tile also shows a small league chip, because the results then mix leagues; with no
 * query the section headings already say which league a tile is in, and the chip is not painted.
 */
export function TeamTile({ data }: { data: TeamTileData }) {
  const { team, standing, hasResults } = data;
  const record = hasResults && standing ? recordString(standing.computed) : EM_DASH;
  const label = hasResults && standing
    ? `${team.name}, ${recordString(standing.computed)} in league play`
    : `${team.name}, no results reported`;

  return (
    <li data-team-tile={team.slug}>
      {/* `data-team-slug` sits on the TILE, not the <li>: the tile paints an opaque surface, so
          an inset rule on its parent would be hidden behind it. The end-of-body script in
          app/layout.tsx matches this attribute to draw the pinned-team rule (DESIGN §3.6
          "[HM] ▓") — the pin is in localStorage, so the server cannot know it and this page
          stays completely static. */}
      <Link
        href={`/teams/${team.slug}`}
        prefetch={false}
        data-team-slug={team.slug}
        className="sx-card sx-lift sx-tap flex h-full min-h-[4.5rem] items-center gap-3 p-3 no-underline transition-[box-shadow,background-color] duration-(--sx-dur-ui) ease-(--sx-ease) max-[379px]:flex-col max-[379px]:items-start max-[379px]:gap-2 md:p-4"
      >
        <span className="sr-only">
          <span className="sx-pin-note">Your team. </span>
          {label}
        </span>
        <TeamMonogram team={team} size={40} />
        <span className="min-w-0 max-[379px]:w-full">
          <span
            className="sx-clamp-2 block text-meta font-semibold text-ink sm:text-body"
            aria-hidden="true"
          >
            {team.shortName}
          </span>
          <span className="flex flex-wrap items-center gap-x-2" aria-hidden="true">
            <span className="sx-num block text-cell text-ink-2">{record}</span>
            {data.leagueShort ? (
              <span className="hidden rounded-tag bg-surface-3 px-1.5 text-micro font-semibold text-ink-2 [[data-teams-page]:has(search[data-searching])_&]:inline-block">
                {data.leagueShort}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default TeamTile;
