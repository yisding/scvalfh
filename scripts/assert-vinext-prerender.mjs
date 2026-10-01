/**
 * The vinext counterpart of CI's "Assert every route is static" (the `next build` check): every
 * route of a vinext build was prerendered, so the server answers from the build and never renders
 * a page, metadata route or Route Handler on demand. Exits non-zero, naming what is wrong.
 *
 * Run it from the repo root after a build:
 *
 *   pnpm build:vinext && node scripts/assert-vinext-prerender.mjs                  # Node target
 *   pnpm build:cloudflare && node scripts/assert-vinext-prerender.mjs --cloudflare # Workers target
 *
 * Both targets record each route in dist/server/vinext-prerender.json and write the pages (.html,
 * .rsc) and the metadata routes and Route Handlers (.route) under dist/server/prerendered-routes:
 * `vinext start` seeds its cache from there, and the Workers build stages its prerender there
 * before packaging it. A skipped or errored route, or one with a revalidate lifetime, would be
 * rendered on demand by the server instead. The prerendered sitemap must list exactly the
 * prerendered pages.
 *
 * `--cloudflare` also checks what the Worker actually ships, because a Worker has no filesystem to
 * seed a cache from: staticAssetsAdapter() (vite.config.ts) copies each prerendered file into the
 * Workers Static Assets output under /_vinext/static-cache/ and lists it in index.json, and the
 * Worker reads only what is listed. So every staged file must be listed, kind for kind (a Route
 * Handler body left out was rendered per request, see patches/@vinext__cloudflare@1.0.0.patch);
 * `_headers` must hold a /_next/static/* rule giving it the immutable Cache-Control (no Node
 * server sets it on Workers); and no .br/.gz/.zst copy may ship, since precompress is the Node
 * target's option and those files would be public assets with no Content-Type.
 */

import fs from 'node:fs';
import path from 'node:path';

const cloudflare = process.argv.includes('--cloudflare');

const dir = 'dist/server/prerendered-routes';
const { routes } = JSON.parse(fs.readFileSync('dist/server/vinext-prerender.json', 'utf8'));
const notRendered = routes.filter((r) => r.status !== 'rendered');
if (notRendered.length) throw new Error('not prerendered: ' + notRendered.map((r) => `${r.route} (${r.status})`).join(', '));
const revalidating = routes.filter((r) => r.revalidate !== false);
if (revalidating.length) throw new Error('revalidates at runtime: ' + revalidating.map((r) => `${r.route} (${r.revalidate})`).join(', '));
const pages = ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'history/2025-26'];
const metadata = ['icon', 'apple-icon', 'icon-192', 'icon-512', 'opengraph-image', 'standings/opengraph-image',
  'manifest.webmanifest', 'sitemap.xml', 'robots.txt'];
const missing = [
  ...pages.map((p) => `${p}.html`).filter((f) => !fs.existsSync(`${dir}/${f}`)),
  ...metadata.map((m) => `${m}.route`).filter((f) => !fs.existsSync(`${dir}/${f}`)),
];
if (missing.length) throw new Error('not prerendered: ' + missing.join(', '));
const count = (sub, test) => fs.readdirSync(`${dir}/${sub}`, { recursive: true }).filter(test).length;
const html = (f) => f.endsWith('.html');
const og = (f) => f.endsWith('/opengraph-image.route');
const games = count('game', html), dates = count('scores', html), teams = count('teams', html);
const gameCards = count('game', og), dateCards = count('scores', og), teamCards = count('teams', og);
console.log(`prerendered: ${routes.length} routes; ${games} game, ${dates} date, ${teams} team pages; ` +
  `${gameCards} game, ${dateCards} date, ${teamCards} team OG images`);
if (games < 100 || dates < 30 || teams < 16) throw new Error('a generateStaticParams route came back short');
if (gameCards < 100 || dateCards < 30 || teamCards < 16) throw new Error('an opengraph-image below a dynamic segment came back short');
// Every game, date and team page has exactly one OG image beside it, so the two counts must agree.
if (gameCards !== games || dateCards !== dates || teamCards !== teams) throw new Error('page and opengraph-image counts disagree');
// The prerendered sitemap lists exactly the prerendered pages (every page but the 404), one for one:
// a page left out of either is one a crawler never finds or one the server renders on request.
const sitemapPaths = [...fs.readFileSync(`${dir}/sitemap.xml.route`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(([, loc]) => new URL(loc).pathname);
const pageFiles = new Set(fs.readdirSync(dir, { recursive: true })
  .filter((f) => html(f) && f !== '404.html').map((f) => f.split(path.sep).join('/')));
const sitemapFiles = sitemapPaths.map((p) => (p === '/' ? 'index' : p.slice(1)) + '.html');
const unlisted = [...pageFiles].filter((f) => !sitemapFiles.includes(f));
const unrendered = sitemapFiles.filter((f) => !pageFiles.has(f));
console.log(`sitemap: ${sitemapPaths.length} URLs; prerendered pages: ${pageFiles.size}`);
if (unrendered.length) throw new Error('in the sitemap but not prerendered: ' + unrendered.slice(0, 5).join(', '));
if (unlisted.length) throw new Error('prerendered but not in the sitemap: ' + unlisted.slice(0, 5).join(', '));
if (new Set(sitemapFiles).size !== sitemapFiles.length) throw new Error('the sitemap lists a URL twice');

if (cloudflare) {
  // The Worker's Static Assets directory, wherever this build-output version puts it: the one
  // holding the static cache's index.
  const index = '_vinext/static-cache/index.json';
  const found = fs.readdirSync('.cloudflare/output', { recursive: true })
    .map((f) => f.split(path.sep).join('/')).filter((f) => f === index || f.endsWith(`/${index}`));
  if (found.length !== 1) throw new Error(`expected one ${index} under .cloudflare/output, found ${found.length}`);
  const assets = path.join('.cloudflare/output', found[0].slice(0, -index.length));
  const listed = Object.values(JSON.parse(fs.readFileSync(path.join(assets, index), 'utf8')));
  const kinds = ['html', 'rsc', 'route'];
  const packaged = Object.fromEntries(kinds.map((k) => [k, listed.filter((e) => e.kind === k).length]));
  const staged = Object.fromEntries(kinds.map((k) => [k, count('.', (f) => f.endsWith(`.${k}`))]));
  console.log(`static cache: ${listed.length} entries (${kinds.map((k) => `${k} ${packaged[k]}`).join(', ')}); ` +
    `staged: ${kinds.map((k) => `${k} ${staged[k]}`).join(', ')}`);
  const short = kinds.filter((k) => packaged[k] !== staged[k]);
  if (short.length) throw new Error('static cache does not match the prerender: ' + short.map((k) => `${k} ${packaged[k]} of ${staged[k]}`).join(', '));
  // _headers is a list of rules: an unindented URL pattern, then its indented `Name: value` lines.
  const rules = new Map();
  let rule;
  for (const line of fs.readFileSync(path.join(assets, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.set((rule = line.trim()), rules.get(line.trim()) ?? {});
    else if (rule && line.includes(':')) rules.get(rule)[line.slice(0, line.indexOf(':')).trim().toLowerCase()] = line.slice(line.indexOf(':') + 1).trim();
  }
  if (rules.get('/_next/static/*')?.['cache-control'] !== 'public, max-age=31536000, immutable') {
    throw new Error(`${path.join(assets, '_headers')} has no 'public, max-age=31536000, immutable' Cache-Control rule for /_next/static/*`);
  }
  const compressed = fs.readdirSync(assets, { recursive: true }).filter((f) => /\.(br|gz|zst)$/.test(f));
  if (compressed.length) throw new Error(`precompressed copies would ship as assets: ${compressed.slice(0, 5).map((f) => path.join(assets, f)).join(', ')}`);
}
