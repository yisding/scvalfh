# Deploy notes

Every route is prerendered at build time — no database, no request-time data fetching, and no
Route Handlers beyond the OG-image generators and the `/icon-192` and `/icon-512` icons, all
prerendered too. It is NOT `output: 'export'`, though: serving it needs Next.js's own server, a
host adapter that provides one, `vinext start` or vinext's Cloudflare Worker (see "vinext" and
"Cloudflare Workers" below), because the 404s for unknown dynamic params and the metadata routes
(`/icon`, `/apple-icon`, `/opengraph-image`, `/robots.txt`, `/sitemap.xml`) are served by the
framework.

Copy `.env.example` to `.env` (or set the same variables in the host's dashboard) and set
`SITE_URL` before the first production build.

- **Vercel / Netlify / Cloudflare Pages:** connect the GitHub repo, build command `pnpm build`,
  output is the framework-default `.next` (all three have first-party Next.js App Router
  support, including static prerendering and `generateStaticParams` route trees). Set the
  `SITE_URL` environment variable to your production domain before the first build — it drives
  `metadataBase`, `robots.txt` and every absolute URL in `sitemap.xml`. Each of these hosts
  redeploys automatically on a push to `main`, which is exactly what `update-data.yml`'s commit
  triggers.
- **Self-host:** `pnpm build && pnpm start` runs Next.js's own production server behind any
  reverse proxy that can talk to a Node process. Set `SITE_URL` the same way. Pair with the cron
  line under docs/DATA-PIPELINE.md "Self-hosting the cron" to keep data fresh without GitHub Actions at all.
  `dynamicParams = false` does not reach the OG images, so `next start` renders the card of an
  unknown param (`/standings/nope/opengraph-image`) on request, answers 404 and caches that 404
  under `.next/server/app` (a 0-byte `.body` and a `.meta`), one entry per distinct URL a crawler
  asks for, with no upper bound. They are safe to delete at any time (the next request renders the
  404 again), every new build starts without them, and `pnpm assert:prerender` ignores them.
- **vinext:** `pnpm build:vinext && pnpm start:vinext` on Node, or `pnpm deploy:cloudflare` to
  Cloudflare Workers, which `.github/workflows/deploy-cloudflare.yml` runs after every green `ci`
  run and snapshot refresh on `main` once an account is connected. See "vinext" and "Cloudflare
  Workers" below.

`SITE_URL` defaults to `http://localhost:3000` (`views/site/site.ts`) when unset, so
`metadataBase`, `robots.txt` and `sitemap.xml` will point at localhost until it's set in the
deploy environment — no production domain is hardcoded anywhere in the repo. `.env.example` lists
it and the six optional variables; copy it to `.env` for a local production build.

## vinext

The same source also builds and serves on [vinext](https://github.com/cloudflare/vinext) 1.0.0, a
reimplementation of the Next.js API surface on Vite 8, wired in by `vite.config.ts`. It runs
beside the Next toolchain, not instead of it, with two targets: vinext's Node server, here, and
Cloudflare Workers (next section).

```bash
pnpm build:vinext && pnpm start:vinext   # vite build into dist/, then vinext start on port 3000
```

Run it behind any reverse proxy that can talk to a Node process, as with `next start`. `dist/` is
the whole build output and the snapshot is bundled into it, so `vinext start` no longer needs
`data/` beside it. The `SCVAL_*` file overrides (see docs/DEVELOPMENT.md "Local development") still swap in another
file through `node:fs` wherever the data modules load (the prerender, and `vinext start` for what
it renders on request), so a server given one should get the file the build had. `SITE_URL` and `SCVAL_BUILD_AT`
are fixed at build time on both vinext targets: `vite.config.ts` reads them with Vite's `loadEnv`
(the process environment first, then the mode's `.env` files) and inlines them with `define`, so
the prerendered pages and whatever is rendered on request (every 404) carry the same values,
whatever the server's environment says. An unset `SITE_URL` keeps the `http://localhost:3000`
fallback; an unset `SCVAL_BUILD_AT` becomes the instant the build ran. Only `next start` still
reads both at run time, so it needs the values `next build` had. `vite build` and `vinext start`
both load `.env` the way Next does. The Workers build empties `dist/` (it stages its prerender
there), so after `pnpm build:cloudflare` run `pnpm build:vinext` again before `pnpm start:vinext`.

`vite.config.ts` sets `prerender: { routes: '*' }`, so `pnpm build:vinext` prerenders everything
`next build` does — about 539 pages plus a 404 with the current snapshot, clubs and commitments
files (540 .html on 2026-10-04, 17 of them the clubs pages and one `/commits`; the exact counts are
derived from `data/snapshot.json` and `data/clubs.json` by `scripts/ci/assert-vinext-prerender.ts`),
all `revalidate: false` in `dist/server/vinext-prerender.json`: every page (HTML and RSC payload)
plus a 404 page, and every icon, apple-icon, `/icon-192`, `/icon-512`, OG image (root,
`/standings`, one per league, game, date and team), `manifest.webmanifest`, `sitemap.xml` and
`robots.txt`, under `dist/server/prerendered-routes/`. `vinext start` seeds its cache from them at
startup ("Seeded N pre-rendered routes into memory cache") and serves each one as built. None of
them renders per request; a 404, which no prerendered route covers, is what the server renders on
request (see above).

The response-header contract is the same on all three servers — `next start`, `vinext start` and
the Worker: every page, metadata route and OG image carries the `next.config.ts` `headers()` rule,
`public, max-age=0, must-revalidate` (every cache asks again on every use, and the ETag makes an
unchanged page a 304; see `next.config.ts`); hashed `/_next/static/**` assets keep
`public, max-age=31536000, immutable` (served from build-time gzip/brotli/zstd files under
`vinext start`, `precompress: true` in `vite.config.ts`, because it does not compress them on the
fly); 404 pages are `private, no-cache, no-store, max-age=0, must-revalidate`, so no shared cache
keeps one; HTML pages carry an ETag and answer a matching `If-None-Match` with 304; and no server
sends `X-Powered-By`. `scripts/ci/smoke-server.sh <base-url> <next|node|workers>` checks all of it,
on every page the sitemap lists, against whichever server you started (its header shows the three
commands), and names the few checks that differ by target; CI runs it on all three. One known
difference: `OPTIONS` on a Route Handler (`/icon-192`, `/icon-512`) is a 204 under vinext and a
405 under Next.

## Cloudflare Workers

vinext's second target runs the same build as a Cloudflare Worker. One `vite.config.ts` serves
both: `--mode cloudflare` adds `@cloudflare/vite-plugin` and swaps `precompress` for vinext's
static-assets cache, and `cloudflare.config.ts` declares the Worker for the plugin and for
`cf deploy`.

```bash
pnpm build:cloudflare     # vite build --mode cloudflare into .cloudflare/output/
pnpm preview:cloudflare   # that build, run locally in workerd (Vite's preview port, 4173)
pnpm deploy:cloudflare    # vinext-cloudflare deploy --env cloudflare: build, then cf deploy
```

`pnpm build:cloudflare` prerenders the same routes as `pnpm build:vinext` (all
`revalidate: false`; the prerender runs the Worker bundle in Node) and writes a Cloudflare Build
Output to `.cloudflare/output/v0/`: the Worker bundle and its `worker.config.json` under
`workers/default/`, and its Workers Static Assets. A Worker has no filesystem to seed a cache
from, so `staticAssetsAdapter()` (from `@vinext/cloudflare`) packages the prerender into those
assets under `/_vinext/static-cache/`, with an `index.json` the Worker looks them up in: every HTML
page and the 404 with one RSC payload per page, and every metadata route and Route Handler
body. vinext also writes a `_headers` file giving `/_next/static/*` the immutable Cache-Control.
At run time Workers Static Assets serves `/_next/static/**` itself; every page URL misses it
(`notFoundHandling: 'none'`) and reaches the Worker, which answers from the static cache through
its `ASSETS` binding; and `runWorkerFirst` keeps the raw `/_vinext/static-cache/*` files from being
fetched directly (they are 404s). The Worker renders only 404s on request. `cloudflare.config.ts`
names the Worker `scvalfh`, turns on `nodejs_compat`, pins the compatibility date to the workerd
release the plugin bundles and declares no vars: `SITE_URL` and `SCVAL_BUILD_AT` are inlined at
build time (see "vinext"), and the `SCVAL_*` file overrides need a filesystem a Worker does not
have. `--mode cloudflare` loads `.env`, `.env.local`, `.env.cloudflare` and
`.env.cloudflare.local`, never `.env.production`, so put the Worker build's `SITE_URL` in the
environment or in `.env.cloudflare`.

`pnpm preview:cloudflare` serves `.cloudflare/output/` as built, without rebuilding, in workerd
(the runtime Cloudflare runs Workers on) through the Cloudflare Vite plugin, with the `ASSETS`
binding; it takes `vite preview`'s `--port`, `--strictPort` and `--host`. The response contract
above holds there, ETag and 304 included (the patched Worker entry answers the 304 as
`vinext start` does), with these intended differences:

- **Compression is the edge's.** The Worker compresses nothing and ships no precompressed copies
  (they would be public assets with no Content-Type), so under `vite preview` nothing carries a
  `Content-Encoding`; in production Cloudflare's edge compresses after the Worker. The Worker's
  ETag comparison is weak, so a page still revalidates once the edge weakens its tag.
- **Revalidating through `vite preview`** needs a `Cache-Control` on the request (a browser sends
  `max-age=0`): the preview proxy adds `Cache-Control: no-cache` to a bare conditional request,
  and a no-cache request never gets a 304, as on Next.js.
- **`/_next/static/**`** carries the asset layer's strong ETag rather than Node's weak one.
- **`x-vinext-build-id`** appears on the two Route Handler bodies, `/icon-192` and `/icon-512`,
  and on nothing else.
- **Image bytes.** The OG images and icons are prerendered by the Worker bundle, with next/og's
  WebAssembly renderer, so their PNGs are not byte-identical to the Node build's: same size and
  layout, with about 1-2% of pixels differing slightly in anti-aliasing.

**Deploying.** `pnpm deploy:cloudflare` loads `vite.config.ts` in mode `cloudflare`, builds and
prerenders, then runs `cf deploy --prebuilt --mode cloudflare`, which uploads the Worker and its
Static Assets (several hundred files) and promotes the new version. `--dry-run` validates the
setup without building or uploading, by existence and text checks only: `cloudflare.config.ts`
is there, `cf` and the plugin are installed, and `vite.config.ts` imports and calls
`cloudflare()` (the config is first parsed by the build); `--skip-build` uploads the existing
`.cloudflare/output/`. Always deploy through `pnpm deploy:cloudflare` (or pass
`--env cloudflare`): a bare `vinext-cloudflare deploy` builds in mode `production`, where
`vite.config.ts` leaves `cloudflare()` out, and the patched vinext refuses that build rather than
let `cf deploy` upload a stale `.cloudflare/output/` (see docs/VINEXT-PATCHES.md "The vinext patch").
A real deploy needs:

- a Cloudflare account with a workers.dev subdomain (the Worker is then served at
  `https://scvalfh.<subdomain>.workers.dev`) or a custom domain (`domains` in `defineWorker`);
- `CLOUDFLARE_API_TOKEN`, a token made from the "Edit Cloudflare Workers" template (or
  `pnpm exec cf auth login` on a workstation);
- `CLOUDFLARE_ACCOUNT_ID`, or a top-level `accountId` in `cloudflare.config.ts`;
- the Worker name, `scvalfh`, which is set in `cloudflare.config.ts` (`--name` is refused for a
  `cloudflare.config.ts` project);
- `SITE_URL` set to the Worker's public origin in the build environment, since it is baked in at
  build time.

`.github/workflows/deploy-cloudflare.yml` runs that deploy from GitHub Actions. It follows the `ci`
and `update-data` workflows (`workflow_run`, on `main`) rather than `push`, because `update-data`
pushes its snapshot commit with `GITHUB_TOKEN`, and a push made with `GITHUB_TOKEN` starts no
`push` workflow. Every run deploys `main`'s tip, and only when the code there has passed `ci` on
`main`: it walks down from the tip past `update-data`'s data commits (by the bot, one parent, a
`data: refresh snapshot`, `data: refresh player stats` or `data: refresh JV games` message, nothing
but the snapshot, its meta file, `data/player-stats.json` and `data/jv.json`, tested by that job
before it pushed) to the commit whose
code ships, and deploys only if that commit has a successful `ci` run on `main` and nothing but the
data changed above it. `tests/arch/workflows.test.ts` holds the two workflows to the same messages and
files.
Otherwise it skips, and that commit's own `ci` run deploys once it passes; a red one never
ships, even when a data refresh is rebased on top of it. Each successful deploy is recorded as a
GitHub Deployment (environment `cloudflare`) for the commit it shipped, and a run skips a tip that
already has one: so a green `ci` run on `main` (never a pull request's) deploys the commit it
tested, plus any snapshot since, an `update-data` run deploys its new snapshot, and a run that
finds the tip undeployed deploys it whatever happened to the run queued before it (GitHub keeps
one pending run per workflow, so a displaced run loses nothing). Deploying the tip means an older
build never overwrites a newer one, and `workflow_dispatch` deploys `main`'s tip by hand under the
same `ci` check, recorded or not. It needs the `CLOUDFLARE_API_TOKEN` secret, a
`CLOUDFLARE_ACCOUNT_ID` variable (or secret) and a `SITE_URL` variable holding a bare origin
(Settings → Secrets and variables → Actions). Without the token every run is a green no-op with a
notice saying so; a token without the other two fails, naming what is missing. Its build does not
pin `SCVAL_BUILD_AT`, so the footer's stale-snapshot notice measures from the instant the deploy
really built. Cloudflare's own Git integration (Workers Builds) could run `pnpm deploy:cloudflare`
on each push instead; that path has not been tried here.

No upload was made while this target was developed, since no Cloudflare account was available:
what was verified is the dry run, the local workerd smoke and axe passes, and a full
`pnpm deploy:cloudflare` that builds and prerenders and then stops at `cf deploy`'s "No
authentication token found". CI's `cloudflare` job checks the same without credentials (see
docs/DEVELOPMENT.md "Local development").
