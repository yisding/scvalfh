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
 * rendered on demand by the server instead.
 *
 * The page families are EXACT, derived from the build's input, data/snapshot.json (or
 * SCVAL_SNAPSHOT), never from its output: `standings/<id>` and `schedule/<id>` for each
 * `season.leagues` id, `playoffs/<id>` for each league with `postseasonKind: 'league-tournament'`
 * (never read from the built sitemap, which would be circular), `game/<param>` for every game plus
 * one stub per `supersededGames` key (param = lib/game-id.ts gameIdToParam: `sblive:N` → `sblive-N`),
 * `scores/<date>` for every distinct game date, `teams/<slug>` for the 43 teams. No prerendered path
 * may contain ':'. Every family with an image has OG/page parity BY NAME (`game/X.html` ⇔
 * `game/X/opengraph-image.route`, and the same for standings, schedule, playoffs, teams, scores),
 * never by count. The prerendered sitemap must list exactly the prerendered pages, except the
 * superseded stubs, which it must not list (SPEC §8.1, §12.3).
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

const cloudflare = process.argv.includes('--cloudflare');

const dir = 'dist/server/prerendered-routes';
const { routes } = JSON.parse(fs.readFileSync('dist/server/vinext-prerender.json', 'utf8'));
const notRendered = routes.filter((r) => r.status !== 'rendered');
if (notRendered.length) throw new Error('not prerendered: ' + notRendered.map((r) => `${r.route} (${r.status})`).join(', '));
const revalidating = routes.filter((r) => r.revalidate !== false);
if (revalidating.length) throw new Error('revalidates at runtime: ' + revalidating.map((r) => `${r.route} (${r.revalidate})`).join(', '));
const problems = [];
const fail = (msg) => problems.push(msg);
const files = fs.readdirSync(dir, { recursive: true }).map((f) => f.split(path.sep).join('/'));
const fileSet = new Set(files);

// A raw contest id in a URL: `sblive:123` must be prerendered as `sblive-123` (lib/game-id.ts).
const colon = files.filter((f) => f.includes(':'));
if (colon.length) fail(`prerendered paths contain ':' (raw contest id in a URL): ${colon.slice(0, 5).join(', ')}`);

const pages = ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'leaders', 'history/2025-26'];
const metadata = ['icon', 'apple-icon', 'icon-192', 'icon-512', 'opengraph-image', 'standings/opengraph-image',
  'manifest.webmanifest', 'sitemap.xml', 'robots.txt'];
const missing = [
  ...pages.map((p) => `${p}.html`).filter((f) => !fileSet.has(f)),
  ...metadata.map((m) => `${m}.route`).filter((f) => !fileSet.has(f)),
];
if (missing.length) fail('not prerendered: ' + missing.join(', '));

// The expected families come from the build's INPUT, the snapshot, never from its output (the
// prerendered sitemap would make the check circular). League ids are season.leagues in config
// order; the /playoffs/[league] family is the league-tournament leagues (MCAL). `gameIdToParam`
// of lib/game-id.ts, restated: `sblive:<digits>` → `sblive-<digits>`, a GUID unchanged.
const snapshot = JSON.parse(fs.readFileSync(process.env.SCVAL_SNAPSHOT ?? 'data/snapshot.json', 'utf8'));
const gameIdToParam = (id) => id.replace(/^sblive:(\d+)$/, 'sblive-$1');
const leagueIds = snapshot.season.leagues.map((l) => l.id);
const tournamentIds = snapshot.season.leagues.filter((l) => l.postseasonKind === 'league-tournament').map((l) => l.id);
const gameParams = snapshot.games.map((g) => gameIdToParam(g.contestId));
const stubParams = Object.keys(snapshot.supersededGames ?? {}).map(gameIdToParam);
const dates = [...new Set(snapshot.games.map((g) => g.dateKey))];
const slugs = snapshot.teams.map((t) => t.slug);
if (slugs.length !== 43) fail(`the snapshot has ${slugs.length} teams, expected 43`);

const sample = (list) => list.slice(0, 5).join(', ') + (list.length > 5 ? `, … (${list.length})` : '');
const without = (a, b) => { const bs = new Set(b); return a.filter((x) => !bs.has(x)); };
/** The `.html` pages directly inside `<family>/`, by name. */
const pagesIn = (family) => files.filter((f) => f.startsWith(`${family}/`) && f.endsWith('.html') && !f.slice(family.length + 1).includes('/'))
  .map((f) => f.slice(family.length + 1, -'.html'.length));
/** The names X with a prerendered `<family>/X/opengraph-image`. */
const cardsIn = (family) => files.filter((f) => f.startsWith(`${family}/`) && f.endsWith('/opengraph-image.route'))
  .map((f) => f.slice(family.length + 1, -'/opengraph-image.route'.length)).filter((x) => x && !x.includes('/'));
const counts = [];
/** EXACT page set per family, then OG/page parity BY NAME (never by count). */
function family(name, expected, og = true) {
  const got = pagesIn(name);
  const absent = without(expected, got), extra = without(got, expected);
  if (absent.length) fail(`${name}/: expected page(s) not prerendered: ${sample(absent)}`);
  if (extra.length) fail(`${name}/: unexpected page(s) prerendered: ${sample(extra)}`);
  counts.push(`${name} ${got.length}/${expected.length}`);
  if (!og) return;
  const cards = cardsIn(name);
  const noCard = without(got, cards), noPage = without(cards, got);
  if (noCard.length) fail(`${name}/: page without its opengraph-image: ${sample(noCard)}`);
  if (noPage.length) fail(`${name}/: opengraph-image without its page: ${sample(noPage)}`);
}
family('standings', leagueIds);
family('schedule', leagueIds);
family('playoffs', tournamentIds);
family('game', [...gameParams, ...stubParams]);
family('scores', dates);
family('teams', slugs);
family('history', ['2025-26'], false);
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
if (problems.length) throw new Error(problems.join('\n'));

if (cloudflare) {
  // The Worker's Static Assets directory, wherever this build-output version puts it: the one
  // holding the static cache's index.
  const index = '_vinext/static-cache/index.json';
  const found = fs.readdirSync('.cloudflare/output', { recursive: true })
    .map((f) => f.split(path.sep).join('/')).filter((f) => f === index || f.endsWith(`/${index}`));
  if (found.length !== 1) throw new Error(`expected one ${index} under .cloudflare/output, found ${found.length}`);
  const assets = path.join('.cloudflare/output', found[0].slice(0, -index.length));
  const indexed = JSON.parse(fs.readFileSync(path.join(assets, index), 'utf8'));
  const listed = Object.values(indexed);
  const kinds = ['html', 'rsc', 'route'];
  const packaged = Object.fromEntries(kinds.map((k) => [k, listed.filter((e) => e.kind === k).length]));
  const staged = Object.fromEntries(kinds.map((k) => [k, files.filter((f) => f.endsWith(`.${k}`)).length]));
  console.log(`static cache: ${listed.length} entries (${kinds.map((k) => `${k} ${packaged[k]}`).join(', ')}); ` +
    `staged: ${kinds.map((k) => `${k} ${staged[k]}`).join(', ')}`);
  const short = kinds.filter((k) => packaged[k] !== staged[k]);
  if (short.length) throw new Error('static cache does not match the prerender: ' + short.map((k) => `${k} ${packaged[k]} of ${staged[k]}`).join(', '));
  // Each index entry is the file <key>.<kind> beside index.json (static-assets-adapter.build.js).
  const cacheDir = path.join(assets, path.dirname(index));
  const listedFiles = new Set(Object.entries(indexed).map(([key, entry]) => `${key}.${entry.kind}`));
  const absent = [...listedFiles].filter((f) => !fs.existsSync(path.join(cacheDir, f)));
  if (absent.length) throw new Error(`${absent.length} files listed in ${index} are missing: ${absent.slice(0, 5).join(', ')}`);
  const strays = fs.readdirSync(cacheDir).filter((f) => f !== 'index.json' && !listedFiles.has(f));
  if (strays.length) throw new Error(`${strays.length} files in ${path.dirname(index)} are not in its index: ${strays.slice(0, 5).join(', ')}`);
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
  // Top-level names .assetsignore keeps out of the upload (gitignore syntax; vinext writes bare
  // names, and the file itself is never uploaded).
  const ignorePath = path.join(assets, '.assetsignore');
  const ignored = new Set(['.assetsignore', ...(fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/) : [])
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^\/|\/$/g, ''))]);
  const shipped = fs.readdirSync(assets).filter((f) => !ignored.has(f) && !['_headers', '_next', '_vinext'].includes(f));
  if (shipped.length) throw new Error(`would be served publicly from the top level of ${assets}: ${shipped.join(', ')}`);
  console.log(`assets: top level ${fs.readdirSync(assets).filter((f) => !ignored.has(f)).join(', ')}; kept out by .assetsignore: ${[...ignored].join(', ')}`);
}
