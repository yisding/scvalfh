/**
 * public/mascots/ — the self-hosted mascot tiles `TeamMonogram` draws (DESIGN §12.4), written by
 * `pnpm fetch-mascots`. A team added to the registry fails here until its tiles are fetched.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { mascotSrc } from '../components/ui/TeamMonogram';
import { TEAMS } from '../lib/teams';

const PUBLIC = path.resolve(import.meta.dirname, '..', 'public');
const DIR = path.join(PUBLIC, 'mascots');

describe('mascot tiles', () => {
  it('every registry team has a 64px and a 128px square WebP', async () => {
    for (const team of TEAMS) {
      for (const size of [64, 128]) {
        const file = path.join(DIR, `${team.slug}-${size}.webp`);
        expect(existsSync(file), `${file} missing — run \`pnpm fetch-mascots --only ${team.slug}\``).toBe(true);
        const meta = await sharp(file).metadata();
        expect([meta.format, meta.width, meta.height], file).toEqual(['webp', size, size]);
      }
    }
  });

  it('holds no tile for a team the registry no longer has', () => {
    const expected = new Set(TEAMS.flatMap((t) => [`${t.slug}-64.webp`, `${t.slug}-128.webp`]));
    expect(readdirSync(DIR).filter((f) => !expected.has(f))).toEqual([]);
  });

  it('a tile up to 32px reads the 64px file; a larger one the 128px file', () => {
    expect(mascotSrc('los-altos', 20)).toBe('/mascots/los-altos-64.webp');
    expect(mascotSrc('los-altos', 32)).toBe('/mascots/los-altos-64.webp');
    expect(mascotSrc('los-altos', 40)).toBe('/mascots/los-altos-128.webp');
    expect(mascotSrc('los-altos', 64)).toBe('/mascots/los-altos-128.webp');
    for (const t of TEAMS) expect(existsSync(path.join(PUBLIC, mascotSrc(t.slug, 24)))).toBe(true);
  });
});
