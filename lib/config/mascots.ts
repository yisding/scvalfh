/**
 * The self-hosted mascot tiles in public/mascots/ (DESIGN §7.1, §12.4): which sizes exist and what
 * each file is called. Shared by `TeamMonogram`, which picks a file, scripts/fetch-mascots.ts,
 * which writes them, and tests/data/mascots.test.ts, which checks they are all there.
 *
 * Every tile size has a file drawn at exactly its pixel size, at 1× and at 2× density, so the
 * browser shows the pixels as drawn instead of resampling a larger file down (which blurred a 24px
 * row tile). A 3× screen scales the 2× file up by half.
 */

/** The CSS sizes a tile is drawn at: 20/24 = rows, 28/32 = compact cards, 40/48 = tiles, 56/64 = heroes. */
export const MASCOT_TILE_SIZES = [20, 24, 28, 32, 40, 48, 56, 64] as const;
export type MascotTileSize = (typeof MASCOT_TILE_SIZES)[number];

/** Every file size, in pixels: each tile size at 1× and 2×, without repeats (20, 24, … 112, 128). */
export const MASCOT_FILE_SIZES: readonly number[] = [
  ...new Set(MASCOT_TILE_SIZES.flatMap((s) => [s, s * 2])),
].sort((a, b) => a - b);

/** The public path of one school's tile drawn at `px` pixels. */
export function mascotFile(slug: string, px: number): string {
  return `/mascots/${slug}-${px}.webp`;
}
