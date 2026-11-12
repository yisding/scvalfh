import { mascotFile, type MascotTileSize } from '../../lib/schools/mascots';
import type { Team } from '../../lib/types';

/**
 * A school's logo (DESIGN §7.1, §12.4; §33): the real file, drawn straight on the page. No tile, no
 * border, no padding, no filter, in either theme; a 2px corner (`img.sx-monogram`).
 *
 * The mascot is MaxPreps' own school logo, downloaded once by `pnpm fetch-mascots` into
 * public/mascots/ and served from this site, so no page makes a third-party image request and
 * none depends on MaxPreps being up. Every registry team has a file for every tile size at 1× and
 * 2× (lib/schools/mascots.ts, tests/mascots.test.ts), so the browser never resamples one: `src` is the 1×
 * file and `srcSet` the 2× one. Each file is an opaque square (most on white), so on the dark page
 * and on the band it is its own small square.
 *
 * Sizes in use: 24 (game rows, tables, log rows, brackets, finder results, leaders), 32 (the live
 * board), 56 (the game header), 64 (the team header; CSS draws it at 48px below 768). A school this
 * site does not track keeps GhostMonogram's letters.
 */
export interface TeamMonogramProps {
  /** `slug` names the files; `name` is the accessible name when the tile is not decorative. */
  team: Pick<Team, 'slug' | 'name'>;
  /** 20/24 = rows, 28/32 = compact cards, 40/48 = tiles, 56/64 = heroes (MASCOT_TILE_SIZES). */
  size?: MascotTileSize;
  /** Default true → an empty alt, because the school name is adjacent. */
  decorative?: boolean;
  className?: string;
}

/**
 * GhostMonogram's letter size per tile size (a school we do not track keeps two letters). Initials
 * are decorative and aria-hidden beside the name, so they are exempt from the 12px floor.
 */
export const LETTER_SIZE: Record<NonNullable<TeamMonogramProps['size']>, number> = {
  20: 12,
  24: 12,
  28: 12,
  32: 12,
  40: 15,
  48: 17,
  56: 20,
  64: 22,
};

/** @deprecated The logo's corner is 2px at every size (`.sx-monogram`, app/globals.css). */
export function monogramRadius(size: number): number {
  void size;
  return 2;
}

export function TeamMonogram({
  team,
  size = 24,
  decorative = true,
  className,
}: TeamMonogramProps) {
  return (
    // A static, pre-sized square from public/: next/image would add a loader and markup for nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={['sx-monogram', className].filter(Boolean).join(' ')}
      src={mascotFile(team.slug, size)}
      srcSet={`${mascotFile(team.slug, size * 2)} 2x`}
      width={size}
      height={size}
      alt={decorative ? '' : team.name}
      // Heroes are above the fold on every page that has one; row tiles may be far below it.
      loading={size >= 56 ? undefined : 'lazy'}
    />
  );
}

export default TeamMonogram;
