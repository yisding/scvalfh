/**
 * The vinext counterpart of CI's "Assert every route is static" (the `next build` check): every
 * route of a vinext build was prerendered, so the server answers from the build and never renders
 * a page, metadata route or Route Handler on demand. Collects every problem and prints each as a
 * `FAIL …` line before exiting 1, as scripts/assert-prerender.ts does; prints
 * `assert-vinext-prerender: ok` otherwise.
 *
 * Run it from the repo root after a build:
 *
 *   pnpm build:vinext && pnpm assert:vinext                    # Node target
 *   pnpm build:cloudflare && pnpm assert:vinext --cloudflare   # Workers target
 *
 * Both targets record each route in dist/server/vinext-prerender.json and write the pages (.html,
 * .rsc) and the metadata routes and Route Handlers (.route) under dist/server/prerendered-routes:
 * `vinext start` seeds its cache from there, and the Workers build stages its prerender there
 * before packaging it. A skipped or errored route, or one with a revalidate lifetime, would be
 * rendered on demand by the server instead.
 *
 * The page families are EXACT, derived from the build's input, never from its output (the built
 * sitemap would make the check circular), by scripts/lib/prerender-expectations.ts, which
 * scripts/assert-prerender.ts uses too: the snapshot as lib/data.ts loads it (data/snapshot.json or
 * SCVAL_SNAPSHOT), cross-checked against lib/leagues.ts and the team registry, gives
 * `standings/<id>` and `schedule/<id>` for each league, `playoffs/<id>` for each league
 * tournament, `game/<param>` for every game plus one stub per `supersededGames` key (param =
 * lib/game-id.ts gameIdToParam: `sblive:N` → `sblive-N`), `scores/<date>` for every distinct game
 * date and `teams/<slug>` for the registry's teams; data/clubs.json (DESIGN §17, SPEC §1.1j2,
 * through lib/clubs.ts) gives `clubs/<slug>` for exactly its slugs, with no OG card (they take the
 * root one); `clubs` and `commits` (DESIGN §21) are fixed pages with the root card.
 * No prerendered path may contain ':'. Every family with an image has
 * OG/page parity BY NAME (`game/X.html` ⇔ `game/X/opengraph-image.route`, and the same for
 * standings, schedule, playoffs, teams, scores), never by count. The prerendered sitemap must list
 * exactly the prerendered pages, except the superseded stubs, which it must not list (SPEC §8.1,
 * §12.3); the clubs pages are in it, so that check covers them too.
 *
 * `--cloudflare` also checks what the Worker actually ships, because a Worker has no filesystem to
 * seed a cache from: staticAssetsAdapter() (vite.config.ts) copies each prerendered file into the
 * Workers Static Assets output under /_vinext/static-cache/ and lists it in index.json, and the
 * Worker reads only what is listed. So every staged file must be listed, kind for kind (a Route
 * Handler body left out was rendered per request, see patches/@vinext__cloudflare@1.0.0.patch),
 * and every listed file must be there beside index.json, and nothing unlisted (a listed file that
 * is missing is a payload the Worker renders on request); `_headers` must hold a /_next/static/*
 * rule giving it the immutable Cache-Control (no Node server sets it on Workers); no .br/.gz/.zst
 * copy may ship, since precompress is the Node target's option and those files would be public
 * assets with no Content-Type; and nothing else may sit at the top level of the upload, where
 * Static Assets serves it before the Worker runs: only `_headers`, `_next/` and `_vinext/`, plus
 * what `.assetsignore` keeps out (vinext lists `.vite` and its client-entry manifest there).
 */

import fs from 'node:fs';
import path from 'node:path';

import { getSnapshot } from '../lib/data';
import { FIXED_PAGES, expectedFamilies, makeFamilyChecker, sample } from './lib/prerender-expectations';

interface PrerenderRoute {
  route: string;
  status: string;
  revalidate: number | false;
}
interface CacheEntry {
  kind: string;
}

const cloudflare = process.argv.includes('--cloudflare');

const dir = 'dist/server/prerendered-routes';
const PRERENDER = 'dist/server/vinext-prerender.json';
if (!fs.existsSync(PRERENDER)) {
  console.error(`assert-vinext-prerender: ${PRERENDER} does not exist; run \`pnpm build:vinext\` (or \`pnpm build:cloudflare\`) first`);
  process.exit(1);
}

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

const { routes } = JSON.parse(fs.readFileSync(PRERENDER, 'utf8')) as { routes: PrerenderRoute[] };
const notRendered = routes.filter((r) => r.status !== 'rendered');
if (notRendered.length) fail('not rendered by the build: ' + notRendered.map((r) => `${r.route} (${r.status})`).join(', '));
const revalidating = routes.filter((r) => r.revalidate !== false);
if (revalidating.length) fail('revalidates at runtime: ' + revalidating.map((r) => `${r.route} (${r.revalidate})`).join(', '));
const files = (fs.readdirSync(dir, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'));
const fileSet = new Set(files);

// A raw contest id in a URL: `sblive:123` must be prerendered as `sblive-123` (lib/game-id.ts).
const colon = files.filter((f) => f.includes(':'));
if (colon.length) fail(`prerendered paths contain ':' (raw contest id in a URL): ${colon.slice(0, 5).join(', ')}`);

const metadata = ['icon', 'apple-icon', 'icon-192', 'icon-512', 'opengraph-image', 'standings/opengraph-image',
  'manifest.webmanifest', 'sitemap.xml', 'robots.txt'];
const missing = [
  ...FIXED_PAGES.map((p) => `${p}.html`).filter((f) => !fileSet.has(f)),
  ...metadata.map((m) => `${m}.route`).filter((f) => !fileSet.has(f)),
];
if (missing.length) fail('not prerendered: ' + missing.join(', '));

const expected = expectedFamilies(getSnapshot(), fail);
const { gameParams, stubParams } = expected;
const { allFamilies, counts } = makeFamilyChecker(files, { cardSuffix: '/opengraph-image.route', fail });
allFamilies(expected);
console.log(`prerendered: ${routes.length} routes; ${counts.join('; ')} ` +
  `(game = ${gameParams.length} games + ${stubParams.length} superseded stubs)`);

// The prerendered sitemap lists exactly the prerendered pages (every page but the 404 and the
// superseded-game stubs, which point at their MaxPreps game and are left out of the sitemap), one
// for one: a page left out of either is one a crawler never finds or one the server renders on request.
const sitemapPaths = fileSet.has('sitemap.xml.route')
  ? [...fs.readFileSync(`${dir}/sitemap.xml.route`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname)
  : [];
const stubFiles = new Set(stubParams.map((p) => `game/${p}.html`));
const pageFiles = new Set(files.filter((f) => f.endsWith('.html') && f !== '404.html' && !stubFiles.has(f)));
const sitemapFiles = sitemapPaths.map((p) => (p === '/' ? 'index' : p.slice(1)) + '.html');
const unlisted = [...pageFiles].filter((f) => !sitemapFiles.includes(f));
const unrendered = sitemapFiles.filter((f) => !pageFiles.has(f));
console.log(`sitemap: ${sitemapPaths.length} URLs; prerendered pages: ${pageFiles.size} (+ ${stubFiles.size} superseded stubs)`);
if (unrendered.length) fail('in the sitemap but not prerendered: ' + sample(unrendered));
if (unlisted.length) fail('prerendered but not in the sitemap: ' + sample(unlisted));
if (new Set(sitemapFiles).size !== sitemapFiles.length) fail('the sitemap lists a URL twice');
const listedStubs = sitemapFiles.filter((f) => stubFiles.has(f));
if (listedStubs.length) fail('superseded-game stubs listed in the sitemap: ' + sample(listedStubs));

if (cloudflare) checkCloudflare();

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-vinext-prerender: ok');

/** What the Worker ships (see the header): each check is independent and reports on its own. */
function checkCloudflare(): void {
  if (!fs.existsSync('.cloudflare/output')) {
    fail('.cloudflare/output does not exist; run `pnpm build:cloudflare` first');
    return;
  }
  // The Worker's Static Assets directory, wherever this build-output version puts it: the one
  // holding the static cache's index.
  const index = '_vinext/static-cache/index.json';
  const found = (fs.readdirSync('.cloudflare/output', { recursive: true }) as string[])
    .map((f) => f.split(path.sep).join('/')).filter((f) => f === index || f.endsWith(`/${index}`));
  if (found.length !== 1) {
    fail(`expected one ${index} under .cloudflare/output, found ${found.length}`);
    return;
  }
  const assets = path.join('.cloudflare/output', found[0].slice(0, -index.length));
  const indexed = JSON.parse(fs.readFileSync(path.join(assets, index), 'utf8')) as Record<string, CacheEntry>;
  const listed = Object.values(indexed);
  const kinds = ['html', 'rsc', 'route'];
  const packaged = Object.fromEntries(kinds.map((k) => [k, listed.filter((e) => e.kind === k).length]));
  const staged = Object.fromEntries(kinds.map((k) => [k, files.filter((f) => f.endsWith(`.${k}`)).length]));
  console.log(`static cache: ${listed.length} entries (${kinds.map((k) => `${k} ${packaged[k]}`).join(', ')}); ` +
    `staged: ${kinds.map((k) => `${k} ${staged[k]}`).join(', ')}`);
  const short = kinds.filter((k) => packaged[k] !== staged[k]);
  if (short.length) fail('static cache does not match the prerender: ' + short.map((k) => `${k} ${packaged[k]} of ${staged[k]}`).join(', '));
  // Each index entry is the file <key>.<kind> beside index.json (static-assets-adapter.build.js).
  const cacheDir = path.join(assets, path.dirname(index));
  const listedFiles = new Set(Object.entries(indexed).map(([key, entry]) => `${key}.${entry.kind}`));
  const absent = [...listedFiles].filter((f) => !fs.existsSync(path.join(cacheDir, f)));
  if (absent.length) fail(`${absent.length} files listed in ${index} are missing: ${absent.slice(0, 5).join(', ')}`);
  const strays = fs.readdirSync(cacheDir).filter((f) => f !== 'index.json' && !listedFiles.has(f));
  if (strays.length) fail(`${strays.length} files in ${path.dirname(index)} are not in its index: ${strays.slice(0, 5).join(', ')}`);
  // _headers is a list of rules: an unindented URL pattern, then its indented `Name: value` lines.
  const headersPath = path.join(assets, '_headers');
  if (!fs.existsSync(headersPath)) {
    fail(`${headersPath} is missing`);
  } else {
    const rules = new Map<string, Record<string, string>>();
    let rule: string | undefined;
    for (const line of fs.readFileSync(headersPath, 'utf8').split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) rules.set((rule = line.trim()), rules.get(line.trim()) ?? {});
      else if (rule && line.includes(':')) rules.get(rule)![line.slice(0, line.indexOf(':')).trim().toLowerCase()] = line.slice(line.indexOf(':') + 1).trim();
    }
    if (rules.get('/_next/static/*')?.['cache-control'] !== 'public, max-age=31536000, immutable') {
      fail(`${headersPath} has no 'public, max-age=31536000, immutable' Cache-Control rule for /_next/static/*`);
    }
  }
  const compressed = (fs.readdirSync(assets, { recursive: true }) as string[]).filter((f) => /\.(br|gz|zst)$/.test(f));
  if (compressed.length) fail(`precompressed copies would ship as assets: ${compressed.slice(0, 5).map((f) => path.join(assets, f)).join(', ')}`);
  // Top-level names .assetsignore keeps out of the upload (gitignore syntax; vinext writes bare
  // names, and the file itself is never uploaded).
  const ignorePath = path.join(assets, '.assetsignore');
  const ignored = new Set(['.assetsignore', ...(fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/) : [])
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^\/|\/$/g, ''))]);
  const shipped = fs.readdirSync(assets).filter((f) => !ignored.has(f) && !['_headers', '_next', '_vinext'].includes(f));
  if (shipped.length) fail(`would be served publicly from the top level of ${assets}: ${shipped.join(', ')}`);
  console.log(`assets: top level ${fs.readdirSync(assets).filter((f) => !ignored.has(f)).join(', ')}; kept out by .assetsignore: ${[...ignored].join(', ')}`);
}
