#!/usr/bin/env tsx
/**
 * Mascot tiles of initials, for the schools no source gives a logo for: the VAL's middle schools
 * (lib/registry/val-soccer/val.ts), whose league publishes neither logos nor colors. Each tile is the school's two
 * letters (`Seed.abbr`) in white on the registry's neutral placeholder color, written to public/mascots/ at every
 * file size TeamMonogram reads (lib/schools/mascots.ts MASCOT_FILE_SIZES), so the badge draws as every other school's
 * does and no page shows a broken image.
 *
 *   pnpm exec tsx scripts/build-initials-tiles.ts        writes public/mascots/<slug>-<px>.webp for each VAL school
 *
 * The letters are drawn by librsvg through sharp; the output is committed, so a build never runs this.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { VAL_SOCCER_SEEDS } from '../lib/registry/val-soccer/val';
import { MASCOT_FILE_SIZES, mascotFile } from '../lib/schools/mascots';
import { runCliIfMain } from './cli';

/** The tile as SVG: a square of the school's color with its letters centered, sized for `px`. */
function tileSvg(letters: string, fill: string, px: number): string {
  const size = Math.round(px * 0.44);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
<rect width="${px}" height="${px}" fill="#${fill}"/>
<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#FFFFFF">${letters}</text>
</svg>`;
}

export async function main(): Promise<number> {
  const out = path.join(process.cwd(), 'public');
  mkdirSync(path.join(out, 'mascots'), { recursive: true });
  let n = 0;
  for (const seed of VAL_SOCCER_SEEDS) {
    for (const px of MASCOT_FILE_SIZES) {
      const webp = await sharp(Buffer.from(tileSvg(seed.abbr, seed.colors[0], px)))
        .webp({ quality: 90, effort: 6 })
        .toBuffer();
      writeFileSync(path.join(out, mascotFile(seed.slug, px)), webp);
      n += 1;
    }
  }
  console.log(`build-initials-tiles: wrote ${n} tiles for ${VAL_SOCCER_SEEDS.length} schools`);
  return 0;
}

runCliIfMain(import.meta.url, main);
