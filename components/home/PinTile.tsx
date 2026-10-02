'use client';

import Link from 'next/link';

import TeamMonogram from '../ui/TeamMonogram';
import { usePinnedTeam } from '../ui/use-pinned-team';

import type { PinTileView } from './home-types';

/**
 * One tile of a league panel's "Teams in <SHORT>" grid (SPEC §10.1).
 *
 * Before hydration — and with JavaScript off, or storage blocked — it is a LINK to the team page,
 * never a dead button. After hydration it is a pin button whose accessible name is `pinLabel`
 * (`Pin Leigh, Mt. Hamilton · BVAL`, lib/pin-label.ts), which contains the visible short name
 * (WCAG 2.5.3). Pinning also remembers the team's league and moves focus to the My-team heading
 * (`focus: 'card'`), because this grid hides the moment a team is pinned.
 *
 * `data-pin-tile` marks the control so an unpin can hand focus back to this tile when it is
 * rendered (components/home/MyTeamCard.tsx).
 *
 * 48px borderless surface-2 key at every width. Below 360px the tile's own padding drops to 4px,
 * which hands the NAME back the pixels it needs at 320px: every short name fits whole or breaks at
 * its space or soft hyphen (`pickerName`, measured in tests/ui/pin-label.test.ts). Two lines, never
 * `truncate`: names in a picker have to be distinguishable.
 */
const TILE =
  'sx-tap flex h-12 w-full min-w-0 items-center gap-1.5 rounded-card bg-surface-2 px-1 text-left ' +
  'min-[360px]:px-2 hover:bg-surface-3';
const TILE_NAME = 'sx-clamp-2 min-w-0 flex-1 hyphens-auto break-words text-micro text-ink';

export interface PinTileProps {
  tile: PinTileView;
}

export function PinTile({ tile }: PinTileProps) {
  const { ready, available, pin } = usePinnedTeam();
  const face = (
    <>
      <span className="hidden shrink-0 min-[480px]:inline-flex">
        {/* TeamMonogram takes a registry TeamColors; it never reads the provenance field. */}
        <TeamMonogram
          team={{ abbr: tile.abbr, name: tile.name, colors: { ...tile.colors, source: 'placeholder' } }}
          size={20}
        />
      </span>
      <span className={TILE_NAME}>{tile.pickerName}</span>
    </>
  );
  if (ready && available) {
    return (
      <button
        type="button"
        data-pin-tile={tile.slug}
        onClick={() => pin(tile.slug, tile.leagueId, { focus: 'card' })}
        aria-label={tile.pinLabel}
        className={TILE}
      >
        {face}
      </button>
    );
  }
  return (
    <Link href={`/teams/${tile.slug}`} prefetch={false} data-pin-tile={tile.slug} className={`${TILE} no-underline`}>
      {face}
      {/* The pin label's tail (`Mt. Hamilton · BVAL`, `MCAL`) after the visible name. */}
      <span className="sr-only">, {tile.pinLabel.slice(tile.pinLabel.lastIndexOf(', ') + 2)}</span>
    </Link>
  );
}

export default PinTile;
