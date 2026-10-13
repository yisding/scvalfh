#!/usr/bin/env tsx
/**
 * Download every registry school's MaxPreps mascot and write it to public/mascots/ as the two
 * square WebP tiles `TeamMonogram` draws (DESIGN §12.4):
 *
 *   public/mascots/<slug>-64.webp    for tiles up to 32px (2× density)
 *   public/mascots/<slug>-128.webp   for tiles from 40px (cards and heroes)
 *
 *   pnpm fetch-mascots                 every team
 *   pnpm fetch-mascots --only <slug>   one team (repeatable)
 *   pnpm fetch-mascots --dry-run       fetch and process, write nothing
 *
 * Self-hosted, never hotlinked: the site makes no third-party image request. The files are
 * committed, so a page never depends on MaxPreps being up. Run it when a team joins the registry
 * (tests/mascots.test.ts fails until its tiles exist) or a school changes its logo; the twice-daily
 * cron never runs it.
 *
 * The source URL is MaxPreps' own: `image.maxpreps.io/school-mascot/{a}/{b}/{c}/{id}.gif`, where
 * `id` is the registry's MaxPreps GUID and `a b c` are its first three characters — the exact
 * address the standings and schedule feeds publish as `schoolMascotUrl` / `mascotUrl`. A school
 * MaxPreps has no mascot for answers 404, which fails the run rather than writing a placeholder.
 *
 * Every source gif is an opaque logo on white. The tile keeps the white (a logo drawn for a white
 * page loses its outline on a dark one), trims the white margin MaxPreps leaves around it, and
 * re-centres it with an even inset so the tile's rounded corners never clip the art. A full-bleed
 * logo (a dark square edge to edge: Bishop's, Canyon Crest, Westmont) is drawn to the edge instead,
 * because a white frame around a dark square reads as a second border.
 *
 * Node's built-in fetch ignores HTTPS_PROXY; behind a proxy run it with NODE_USE_ENV_PROXY=1.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp, { type Sharp } from 'sharp';

import { HttpClient } from '../lib/sources/http';
import { TEAMS } from '../lib/teams';
import type { Team } from '../lib/types';
import { runCli } from './cli';

const USAGE = 'Usage: pnpm fetch-mascots [--only <slug>]... [--dry-run]';

const MASCOT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'mascots');
/** The two tile sizes, in pixels. Must match `mascotSrc` in components/ui/TeamMonogram.tsx. */
const MASCOT_SIZES = [64, 128] as const;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
/** The art's inset on each side, as a fraction of the tile: clears a quarter-side corner radius. */
const INSET = 0.08;

function mascotUrl(teamId: string): string {
  const id = teamId.toLowerCase();
  return `https://image.maxpreps.io/school-mascot/${id[0]}/${id[1]}/${id[2]}/${id}.gif?width=512&height=512`;
}

interface Args {
  only: string[];
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { only: [], dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--only' && argv[i + 1]) args.only.push(argv[(i += 1)]);
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  return args;
}

/**
 * True when the art runs to the edge of its own box: under a fifth of the trimmed image's border
 * pixels are near-white. Only then is the logo drawn without an inset.
 */
async function isFullBleed(img: Sharp): Promise<boolean> {
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width === 0 || height === 0) return false;
  const ratio = width / height;
  if (ratio < 0.85 || ratio > 1.18) return false;
  let edge = 0;
  let white = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const o = (y * width + x) * channels;
      edge += 1;
      if (data[o] > 235 && data[o + 1] > 235 && data[o + 2] > 235) white += 1;
    }
  }
  return white / edge < 0.2;
}

/** One gif → the square WebP tiles, in MASCOT_SIZES order. */
async function mascotTiles(gif: Uint8Array): Promise<Buffer[]> {
  // First frame only, flattened onto white (a few gifs carry a transparent index), white margin cut.
  const flat = await sharp(gif, { animated: false })
    .flatten({ background: WHITE })
    .trim({ background: '#ffffff', threshold: 24 })
    .toBuffer();
  const art = sharp(flat);
  const fullBleed = await isFullBleed(art);
  return Promise.all(
    MASCOT_SIZES.map((size) => {
      const pad = fullBleed ? 0 : Math.round(size * INSET);
      const inner = size - 2 * pad;
      return sharp(flat)
        .resize(inner, inner, { fit: 'contain', background: WHITE, kernel: 'lanczos3' })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: WHITE })
        .webp({ quality: 88, effort: 6 })
        .toBuffer();
    }),
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const unknown = args.only.filter((s) => !TEAMS.some((t) => t.slug === s));
  if (unknown.length > 0) throw new Error(`not a registry slug: ${unknown.join(', ')}`);
  const teams: readonly Team[] = args.only.length > 0 ? TEAMS.filter((t) => args.only.includes(t.slug)) : TEAMS;

  const http = new HttpClient({ onLog: (line) => console.log(`  ${line}`) });
  const results = await Promise.all(
    teams.map(async (team) => {
      const res = await http.bytes(mascotUrl(team.id), 'image/gif,image/*');
      if (!res.contentType?.startsWith('image/')) {
        throw new Error(`${team.slug}: ${res.url} answered ${res.contentType ?? 'no content type'}`);
      }
      return { team, tiles: await mascotTiles(res.body) };
    }),
  );

  if (!args.dryRun) mkdirSync(MASCOT_DIR, { recursive: true });
  let bytes = 0;
  for (const { team, tiles } of results) {
    tiles.forEach((tile, i) => {
      bytes += tile.length;
      if (!args.dryRun) writeFileSync(path.join(MASCOT_DIR, `${team.slug}-${MASCOT_SIZES[i]}.webp`), tile);
    });
    console.log(`${team.slug.padEnd(24)} ${tiles.map((t) => `${t.length} B`).join(' · ')}`);
  }
  console.log(
    `${args.dryRun ? 'would write' : 'wrote'} ${results.length * MASCOT_SIZES.length} tiles for ${results.length} teams (${bytes} bytes)`,
  );
  return 0;
}

void runCli(main);
