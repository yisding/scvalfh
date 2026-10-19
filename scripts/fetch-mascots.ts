#!/usr/bin/env tsx
/**
 * Download every registry school's MaxPreps mascot and write it to public/mascots/ as the square
 * WebP tiles `TeamMonogram` draws (DESIGN §12.4): `<slug>-<px>.webp` for every px in
 * lib/config/mascots.ts' MASCOT_FILE_SIZES, i.e. each tile size (20–64px) at 1× and 2×, so the browser
 * shows each file pixel for pixel. Each size is resized from the full source, then lightly
 * sharpened, since a downscale to 20–48px softens every edge.
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
 * address the standings and schedule feeds publish as `schoolMascotUrl` / `mascotUrl`, without its
 * size query (see `mascotUrl`). A school MaxPreps has no mascot for answers 404, which fails the run
 * rather than writing a placeholder. A school whose MaxPreps mascot is too small or blurred to draw
 * well takes the same mark from SOURCE_OVERRIDES instead, each entry naming its source and why.
 *
 * Every MaxPreps gif is an opaque logo on white (an override with transparency is flattened onto
 * white the same way). The tile keeps the white (a logo drawn for a white page loses its outline on
 * a dark one), trims the white margin around the art, and re-centres it with an even inset so the
 * tile's rounded corners never clip it. A logo on a solid colour block (Leigh, Del Mar, Westview)
 * or a full-bleed square (Bishop's, Canyon Crest) is drawn to the edge instead; see `framing`.
 *
 * Node's built-in fetch ignores HTTPS_PROXY; behind a proxy run it with NODE_USE_ENV_PROXY=1.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp, { type Sharp } from 'sharp';

import { type FlagSpec, parseFlags } from '@/lib/cli/flags';
import { MASCOT_FILE_SIZES } from '@/lib/config/mascots';
import type { Team } from '@/lib/model/team';
import { TEAMS } from '@/lib/registry/teams';
import { CHROME_USER_AGENT, HttpClient } from '@/lib/sources/http';
import { runCli } from './cli';

const USAGE = 'Usage: pnpm fetch-mascots [--only <slug>]... [--dry-run]';

const MASCOT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'mascots');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
/** The art's inset on each side, as a fraction of the tile: clears a quarter-side corner radius. */
const INSET = 0.08;

const SBLIVE = 'https://assets.scorebooklive.com/uploads/production';

/**
 * Schools drawn from another source than MaxPreps, by slug. Only for a MaxPreps mascot that does
 * not hold up as a 128px tile, and only from a source carrying the SAME mark: SBLive / si.com
 * (already a data source, DESIGN §12.8) has many schools' logos at 750–1536px, or the school's own
 * site. Where SBLive's logo is a different design from MaxPreps', it is not used here: which mark a
 * school goes by is not this script's call (Lassen and Patrick Henry are the owner's choices). Nor is
 * a sharper copy whose art is wider (Sage Creek): it draws smaller in a 24px row tile, where most
 * tiles are. Some MaxPreps
 * uploads are distorted (squeezed into a square, or narrowed): where SBLive has the same mark at its
 * true proportions it is used (Huntington Beach); Lassen, Mira Mesa, Redwood and Saratoga use the
 * school's own site, as Monta Vista does.
 */
const SOURCE_OVERRIDES: Readonly<Record<string, { url: string; why: string }>> = {
  'monta-vista': {
    // The school's own site footer logo (1788×1371 PNG, the matador with "MV").
    url: 'https://mvhs.fuhsd.org/uploaded/themes/default_17/images/monta_vista_footer.png',
    why: "MaxPreps' mascot is a 68×68 gif on a purple gradient, blurred at every tile size",
  },
  'rancho-bernardo': {
    url: `${SBLIVE}/team/458945-v3/image/Rancho_Bernardo__CA__Broncos_Logo.png`,
    why: "MaxPreps' bronco is 146×133 with a blurred gradient; SBLive's is the same bronco at 800px",
  },
  'la-costa-canyon': {
    url: `${SBLIVE}/team/459043-v3/image/La_Costa_Canyon__CA__Mavericks_Logo.png`,
    why: "MaxPreps' is a dithered 136×131 gif; SBLive's is the same mark at 1240px",
  },
  saratoga: {
    // The school site's footer logo (300×300 PNG, transparent).
    url: 'https://wordpress-multisite-production-public.s3.amazonaws.com/wp-content/uploads/sites/269/2025/04/FOOTER-LOGO.png',
    why: "MaxPreps' is 196×161 on a textured navy square; the school site has the same falcon on its own",
  },
  marina: {
    url: `${SBLIVE}/school/11317/image/marina__ca__vikings_logo_720.png`,
    why: "MaxPreps' is a 413×212 wide lockup with a grey border line; SBLive's stacks the same viking and wordmark square at 720px",
  },
  'huntington-beach': {
    url: `${SBLIVE}/school/11316/image/Huntington_Beach__CA__Oilers_Logo.png`,
    why: "MaxPreps' derrick is squashed into a 387×382 square with a blurred halo; SBLive's keeps its proportions",
  },
  'mira-mesa': {
    // The school site's footer logo (300×300 PNG, transparent).
    url: 'https://wordpress-multisite-production-public.s3.amazonaws.com/wp-content/uploads/sites/383/2025/07/FOOTER-LOGO-24.png',
    why: "MaxPreps' M and wordmark are squeezed horizontally (about 0.8× the school site's width at the same height)",
  },
  redwood: {
    // The Tamalpais district's own Redwood logo (125×140; f_auto serves a PNG for this Accept).
    url: 'https://resources.finalsite.net/images/f_auto,q_auto/v1697390927/tamdistrictorg/qpfipyp1egiheycbyy2p/RedwoodLogo.png',
    why: "the school district's official copy of the R and redwood, cleaner than MaxPreps' gif",
  },
  lassen: {
    // The school's own "We Are Lassen" bear (1200×1200), the same design MaxPreps carries squeezed.
    url: 'https://cmsv2-assets.apptegy.net/uploads/24330/logo/27143/We_are_Lassen-web.png',
    why: "MaxPreps' copy of the bear is squeezed to about 0.85× its width; the school site's is not",
  },
  'patrick-henry': {
    // The school site's footer emblem (300×300 PNG, transparent): the crest it uses on its site and
    // social media, chosen by the site owner. MaxPreps' patriot head is squeezed out of proportion.
    url: 'https://wordpress-multisite-production-public.s3.amazonaws.com/wp-content/uploads/sites/364/2025/07/FOOTER-LOGO-2.png',
    why: "MaxPreps' patriot head is squeezed; the school uses this crest on its site and social media",
  },
  'live-oak': {
    url: `${SBLIVE}/school/12140/image/acorn.png`,
    why: "MaxPreps' is 150×122; SBLive's is the same acorn at 245×208",
  },
};

function mascotUrl(team: Pick<Team, 'id' | 'slug'>): string {
  const override = SOURCE_OVERRIDES[team.slug];
  if (override) return override.url;
  const id = team.id.toLowerCase();
  // No width/height query: with both, MaxPreps crops a non-square logo to fill the square (cover,
  // not contain), which cut the sides off Cupertino's 1012×903 logo and pushed the art off centre.
  // The bare URL serves the file at its native size and sharp does the resizing.
  return `https://image.maxpreps.io/school-mascot/${id[0]}/${id[1]}/${id[2]}/${id}.gif`;
}

interface Args {
  only: string[];
  dryRun: boolean;
  help: boolean;
}

const FLAGS: FlagSpec<Args> = [
  { flags: '--dry-run', toggle: (a) => { a.dryRun = true; } },
  { flags: ['--help', '-h'], toggle: (a) => { a.help = true; } },
  { flags: '--only', value: 'string', set: (a, v) => { a.only.push(v); } },
];

function parseArgs(argv: readonly string[]): Args {
  // `--only` with nothing after it is reported as an unknown argument (it matches only with a value),
  // and its value may be anything non-empty, a `--flag` included.
  return parseFlags(argv, FLAGS, {
    init: () => ({ only: [], dryRun: false, help: false }),
    allowEmptyValue: false,
    allowFlagValue: true,
    unknown: (flag) => `unknown argument ${flag}\n${USAGE}`,
    needsValue: (flag) => `unknown argument ${flag}\n${USAGE}`,
  });
}

interface Framing {
  /** Inset the art by INSET (false: draw it to the tile's edge). */
  pad: boolean;
  /** What fills the tile around the art. */
  background: { r: number; g: number; b: number; alpha: number };
}

/**
 * How a trimmed logo sits in its square tile, from the pixels on its border:
 *
 *  - A logo printed on a solid colour block (Leigh's green, Del Mar's and Westview's black) has a
 *    near-uniform, non-white border. It is drawn to the edge and its own border colour fills the
 *    letterbox, so a wide block reads as a full tile rather than a band across a white one.
 *  - Art that otherwise runs to the edge of a near-square box (under a fifth of the border
 *    near-white: a multi-coloured full-bleed square) is drawn to the edge on white.
 *  - Everything else is inset on white, clear of the rounded corners.
 */
async function framing(img: Sharp): Promise<Framing> {
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const inset: Framing = { pad: true, background: WHITE };
  if (width === 0 || height === 0) return inset;
  const edge: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const o = (y * width + x) * channels;
      edge.push([data[o], data[o + 1], data[o + 2]]);
    }
  }
  const median = (c: 0 | 1 | 2) => edge.map((p) => p[c]).sort((a, b) => a - b)[edge.length >> 1];
  const [r, g, b] = [median(0), median(1), median(2)];
  const nearMedian = edge.filter((p) => Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b) <= 60);
  const medianIsWhite = r > 235 && g > 235 && b > 235;
  if (!medianIsWhite && nearMedian.length / edge.length >= 0.85) {
    return { pad: false, background: { r, g, b, alpha: 1 } };
  }
  const white = edge.filter((p) => p[0] > 235 && p[1] > 235 && p[2] > 235).length;
  const ratio = width / height;
  if (ratio >= 0.85 && ratio <= 1.18 && white / edge.length < 0.2) return { pad: false, background: WHITE };
  return inset;
}

/** One source image (a MaxPreps gif or an override) → the square WebP tiles, in MASCOT_FILE_SIZES order. */
async function mascotTiles(source: Uint8Array): Promise<Buffer[]> {
  // First frame only, flattened onto white (a few gifs carry a transparent index, an override PNG
  // may be transparent throughout), white margin cut.
  const flat = await sharp(source, { animated: false })
    .flatten({ background: WHITE })
    .trim({ background: '#ffffff', threshold: 24 })
    .toBuffer();
  const frame = await framing(sharp(flat));
  return Promise.all(
    MASCOT_FILE_SIZES.map((size) => {
      const pad = frame.pad ? Math.round(size * INSET) : 0;
      const inner = size - 2 * pad;
      return sharp(flat)
        .resize(inner, inner, { fit: 'contain', background: frame.background, kernel: 'lanczos3' })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: frame.background })
        .toBuffer()
        // Sharpened after the resize, as its own pass: chained onto it, sharp would sharpen first.
        // `smartSubsample` keeps thin coloured strokes from bleeding at 20–48px.
        .then((tile) =>
          sharp(tile).sharpen({ sigma: 0.5, m1: 0.5, m2: 1.5 }).webp({ quality: 90, effort: 6, smartSubsample: true }).toBuffer(),
        );
    }),
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const unknown = [...args.only, ...Object.keys(SOURCE_OVERRIDES)].filter((s) => !TEAMS.some((t) => t.slug === s));
  if (unknown.length > 0) throw new Error(`not a registry slug: ${unknown.join(', ')}`);
  const teams: readonly Team[] = args.only.length > 0 ? TEAMS.filter((t) => args.only.includes(t.slug)) : TEAMS;

  const onLog = (line: string) => console.log(`  ${line}`);
  const http = new HttpClient({ onLog });
  // SBLive's asset CDN 403s a non-browser User-Agent, like si.com itself (lib/sources/sblive.ts).
  const sblive = new HttpClient({ onLog, userAgent: CHROME_USER_AGENT });
  const results = await Promise.all(
    teams.map(async (team) => {
      const url = mascotUrl(team);
      const res = await (url.startsWith(SBLIVE) ? sblive : http).bytes(url, 'image/gif,image/png,image/*');
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
      if (!args.dryRun) writeFileSync(path.join(MASCOT_DIR, `${team.slug}-${MASCOT_FILE_SIZES[i]}.webp`), tile);
    });
    const override = SOURCE_OVERRIDES[team.slug];
    console.log(
      `${team.slug.padEnd(24)} ${tiles.length} tiles, ${tiles.reduce((n, t) => n + t.length, 0)} B${override ? `  (override: ${override.why})` : ''}`,
    );
  }
  console.log(
    `${args.dryRun ? 'would write' : 'wrote'} ${results.length * MASCOT_FILE_SIZES.length} tiles for ${results.length} teams (${bytes} bytes)`,
  );
  return 0;
}

void runCli(main);
