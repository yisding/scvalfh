import { type MascotTileSize, mascotFile } from '@/lib/config/mascots';
import type { Team } from '@/lib/model/team';

/**
 * A school's mascot tile (DESIGN §7.1, §12.4).
 *
 * The mascot is MaxPreps' own school logo, downloaded once by `pnpm fetch-mascots` into
 * public/mascots/ and served from this site, so no page makes a third-party image request and
 * none depends on MaxPreps being up. Every registry team has a file for every tile size at 1× and
 * 2× (lib/config/mascots.ts, tests/data/mascots.test.ts), so the browser never resamples one: `src` is the 1×
 * file and `srcSet` the 2× one. Each is an opaque logo on white with the art inset clear of the
 * rounded corners, so it reads the same on the light and the dark theme; the hairline is
 * `img.sx-monogram`'s inset outline, which unlike a border leaves the image its full size.
 *
 * School colors are no longer drawn here: they stay in the data (DESIGN §7.1) but a tile is now the
 * logo itself. A school this site does not track keeps GhostMonogram's letters.
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
  20: 10,
  24: 11,
  28: 12,
  32: 12,
  40: 15,
  48: 17,
  56: 20,
  64: 22,
};

/**
 * The tile's corner: a quarter of its side, so a 24px row tile is 6px and a 56px hero is 14px. The
 * mascot tile gets the same corner from `.sx-monogram`'s `border-radius: 25%` in app/globals.css.
 */
export function monogramRadius(size: number): number {
  return Math.round(size / 4);
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
