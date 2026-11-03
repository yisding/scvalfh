/**
 * public/mascots/ — the self-hosted mascot tiles `TeamMonogram` draws (DESIGN §12.4), written by
 * `pnpm fetch-mascots`. A team added to the registry fails here until its tiles are fetched.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { JV_OUTSIDE_TEAMS } from '../lib/jv-teams';
import { MASCOT_FILE_SIZES, MASCOT_TILE_SIZES, mascotFile } from '../lib/mascots';
import { TEAMS } from '../lib/teams';

/** Every tile stem: the registry's slugs, then each JV slot team's (York, lib/jv-teams.ts). */
const STEMS = [...TEAMS.map((t) => t.slug), ...Object.values(JV_OUTSIDE_TEAMS).map((t) => t.mascot)];

const PUBLIC = path.resolve(import.meta.dirname, '..', 'public');
const DIR = path.join(PUBLIC, 'mascots');

describe('mascot tiles', () => {
  it('has a file for every tile size at 1× and 2×', () => {
    for (const size of MASCOT_TILE_SIZES) {
      expect(MASCOT_FILE_SIZES).toContain(size);
      expect(MASCOT_FILE_SIZES).toContain(size * 2);
    }
    expect(MASCOT_FILE_SIZES).toEqual([20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128]);
  });

  it('every registry team and JV slot team has every file, a square WebP of exactly its size', async () => {
    for (const stem of STEMS) {
      for (const px of MASCOT_FILE_SIZES) {
        const file = path.join(PUBLIC, mascotFile(stem, px));
        expect(existsSync(file), `${file} missing — run \`pnpm fetch-mascots --only ${stem}\``).toBe(true);
        const meta = await sharp(file).metadata();
        expect([meta.format, meta.width, meta.height], file).toEqual(['webp', px, px]);
      }
    }
  });

  it('holds no file for a team the registry no longer has, or a size no tile draws', () => {
    const expected = new Set(STEMS.flatMap((s) => MASCOT_FILE_SIZES.map((px) => `${s}-${px}.webp`)));
    expect(readdirSync(DIR).filter((f) => !expected.has(f))).toEqual([]);
  });

  it('names a file by slug and pixel size', () => {
    expect(mascotFile('los-altos', 24)).toBe('/mascots/los-altos-24.webp');
    expect(mascotFile('los-altos', 128)).toBe('/mascots/los-altos-128.webp');
  });
});
