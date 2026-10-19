# The vinext patch

`patches/vinext@1.0.0.patch` is applied by pnpm at install (`patchedDependencies` in
`pnpm-workspace.yaml`), so `node_modules/vinext` is never the stock package. It closes eleven
vinext 1.0.0 gaps that broke this site's contract with `next build`/`next start` or kept one of
the two vinext targets from building or serving it; each fix carries a comment citing the
behaviour it matches, and `pnpm-workspace.yaml` lists them (file paths below are under
`node_modules/vinext/dist/`):

- **Header source parsing** (`config/config-matchers.js`): a nested group such as
  `/:path((?!_next/static/).*)` was mis-parsed, so the Cache-Control rule matched only paths
  starting with `/.`, none of this site's routes.
- **`notFound()` in a metadata route** (`server/metadata-route-response.js`): the per-game, date
  and team OG images answered an unknown param with a 500 instead of a 404.
- **ISR lifetime** (`build/prerender.js`, `server/app-page-response.js`): the prerender read the
  `s-maxage=300` rule back as each page's revalidate time, so `vinext start` re-rendered every
  "static" page after five minutes; pages are `revalidate: false`, as on Next.
- **404 caching** (`server/app-rsc-response-finalizer.js`, `server/app-fallback-renderer.js`):
  the same rule overwrote the no-store header on 404 pages, so a CDN could cache a 404. A Route
  Handler's own 404 keeps its headers, as on Next.
- **ETags** (`server/prod-server.js`, `server/app-page-cache.js`): pages served from the cache
  had no validator, so revalidation never got a 304; they now carry Next's FNV-1a ETag. Cached
  Route Handler and metadata route bodies get none, as on Next.
- **Metadata and Route Handler prerendering** (`build/prerender.js`,
  `server/metadata-route-response.js`, `server/app-route-handler-*.js`, `server/seed-cache.js`):
  only `"use cache"` metadata routes were prerendered and no Route Handler was, so the icons,
  every OG image, the manifest, sitemap and robots rendered per request. A Route Handler with a
  numeric `revalidate` keeps it as its ISR lifetime, as on Next.
- **`dynamicParams = false` misses** (`server/app-page-dispatch.js`,
  `server/app-fallback-renderer.js`): an unknown param rendered the 404 inside the matched route,
  pointing its `og:image` at that segment's OG image for the bad param (itself a 404); it now gets
  the root not-found, as on Next.
- **One config, two targets** (`index.js`): with `cloudflare.config.ts` in the repo, vinext
  refused every build that lacked the `cloudflare()` plugin, so `pnpm build:vinext` could not run
  at all. A Vite config that imports `cloudflare` from `@cloudflare/vite-plugin` and calls it now
  chooses per build (found by the same text scan `vinext-cloudflare deploy` uses); the guard still
  stops a project whose Cloudflare config never wired the plugin in (no import, a type-only import,
  or a binding never called). A `vinext-cloudflare deploy` build that leaves the plugin out (no
  `--env cloudflare`) is refused too, since `cf deploy` would then upload a stale Workers build.
- **Build metadata in the Workers upload** (`index.js`): vinext's `.assetsignore` listed only
  `.vite`, so Workers Static Assets served `vinext-client-entry-manifest.json` (build-only
  metadata) publicly, where `vinext start` and Next answer 404. It is now listed too.
- **`.wasm` in the Cloudflare prerender** (`build/prerender-cloudflare-loader.js`): the
  prerender runs the Worker bundle in Node, which could not import next/og's `.wasm` modules the
  workerd way, so `pnpm build:cloudflare` died on the first OG image or icon. A loader hook now
  loads each one as a compiled `WebAssembly.Module`, as workerd does.
- **The Worker's cache marker and 304s** (`server/app-rsc-response-finalizer.js`,
  `server/app-router-entry.js`): only the Node server removed the internal
  `x-vinext-app-page-cache` header and answered a revalidation, so the Worker sent the header on
  every cached page and never a 304. The shared finalizer now strips it on every target, and the
  Worker entry answers a matching `If-None-Match` with 304, as `vinext start`.

`patches/@vinext__cloudflare@1.0.0.patch` makes one change, in
`node_modules/@vinext/cloudflare/dist/cache/static-assets-adapter.build.js`:
`staticAssetsAdapter()` packaged the prerendered pages and metadata routes but not Route
Handlers, so the Worker rendered `/icon-192` and `/icon-512` with satori/resvg on every request.
It now packages them as it does metadata routes, under the cache key the Worker reads.

Both patches are pinned to exact versions (`package.json` pins vinext 1.0.0 and
`@vinext/cloudflare` 1.0.0, and the `patchedDependencies` keys name them), so a version bump
means re-checking each hunk against upstream: drop the ones upstream has fixed and re-port the
rest. Drop each patch entirely once upstream ships all of its fixes. The Cloudflare tooling is
pre-release and pinned exactly too: `@cloudflare/vite-plugin` 2.0.0-beta.sha-ad79608dd and `cf`
1.0.0-beta.6 share miniflare, `@cloudflare/config` and the workerd that `cloudflare.config.ts`'s
compatibility date follows, so bump the two together and re-run the Workers build, preview and
`--dry-run` (`pnpm-workspace.yaml` has the details).
