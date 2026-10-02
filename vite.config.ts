import { cloudflare } from '@cloudflare/vite-plugin';
import { staticAssetsAdapter } from '@vinext/cloudflare/cache/static-assets-adapter';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';

/**
 * vinext (Vite + the Next.js API surface) runs alongside `next`, reading the same app/ and
 * next.config.ts, with two deploy targets chosen by the Vite mode:
 *
 * - Node (any mode but `cloudflare`): `pnpm build:vinext` builds into dist/, `pnpm start:vinext`
 *   serves it.
 * - Cloudflare Workers (`--mode cloudflare`): `pnpm build:cloudflare` builds a Worker into
 *   .cloudflare/output/ (configured by cloudflare.config.ts), `pnpm preview:cloudflare` runs it in
 *   workerd and `pnpm deploy:cloudflare` uploads it. `cloudflare` is the mode
 *   `vinext-cloudflare deploy --env cloudflare` builds in and hands to `cf deploy`, which refuses
 *   a build made in any other mode.
 *
 * One file rather than a vite.cloudflare.config.ts: `vinext-cloudflare deploy` only reads the
 * default vite.config.* (it looks for the cloudflare() call in it and builds with it). Stock vinext
 * refuses a build without that plugin whenever cloudflare.config.ts exists, which is every Node
 * build here; patches/vinext@1.0.0.patch (index.js) lets a config that calls the plugin choose,
 * except under `vinext-cloudflare deploy`, which refuses a mode that leaves cloudflare() out.
 * Both targets clean and reuse dist/ (the Workers build stages its prerender there), so run
 * `pnpm build:vinext` again before `pnpm start:vinext` after a Workers build.
 *
 * `prerender: { routes: '*' }` renders every page route to dist/server/prerendered-routes/ at build
 * time — all ten families, the dynamic ones from their `generateStaticParams` — and `vinext start`
 * serves them from that cache, the counterpart of `next build`'s static HTML.
 *
 * The metadata routes (icon, apple-icon, manifest, sitemap, robots, the root and standings OG
 * images, and one OG image per game, date and team from each segment's `generateStaticParams`) and
 * the two `force-static` Route Handlers (/icon-192, /icon-512) are prerendered as well, one
 * `.route` file per URL, as `next build` writes its `.body` files under .next/server/app. Stock
 * vinext 1.0.0 prerenders a metadata route only when its default export is `"use cache"` (which
 * needs `cacheComponents`, off here — see next.config.ts) and skips every Route Handler, so each
 * one rendered per request, the images through satori/resvg; patches/vinext@1.0.0.patch closes
 * that gap (see pnpm-workspace.yaml).
 */
export default defineConfig(({ mode }) => {
  const workers = mode === 'cloudflare';
  /**
   * SITE_URL and SCVAL_BUILD_AT are read at module scope (components/layout/site-url.ts,
   * build-instant.ts). They are inlined here, once per build, so the prerendered pages and anything
   * rendered on request (every 404) carry the same values on both vinext targets. On a Worker,
   * process.env holds only Worker vars and the clock reads the Unix epoch at module scope, so
   * without this a request-time 404 said "Last updated 20726 days ago" and pointed og:image at
   * http://localhost:3000. `undefined` keeps site-url.ts's own localhost fallback when SITE_URL is
   * unset. loadEnv reads .env.[mode][.local] as vinext does, with process.env winning; it is called
   * here because `vinext-cloudflare deploy` builds without the vite CLI. Next reads both variables
   * at run time, as before.
   */
  const env = loadEnv(mode, process.cwd(), '');
  const buildAt = env.SCVAL_BUILD_AT ?? new Date().toISOString();
  return {
    define: {
      'process.env.SCVAL_BUILD_AT': JSON.stringify(buildAt),
      'process.env.SITE_URL':
        env.SITE_URL === undefined ? 'undefined' : JSON.stringify(env.SITE_URL),
    },
    plugins: [
      vinext({
        prerender: { routes: '*' },
        ...(workers
          ? {
              /**
               * The Worker has no filesystem to seed a cache from: staticAssetsAdapter() packages
               * every prerendered page, RSC payload, metadata route and Route Handler body under
               * /_vinext/static-cache/ in the Workers Static Assets upload and reads them back
               * through the ASSETS binding (cloudflare.config.ts). No precompress: Cloudflare's
               * edge compresses, and build-time .br/.gz/.zst copies would ship as public assets.
               */
              cache: { cdn: staticAssetsAdapter() },
            }
          : {
              /**
               * `vinext start` compresses rendered responses on the fly but serves /_next/static/**
               * only from build-time .br/.gz/.zst siblings, and writes none by default, so without
               * this every hashed JS and CSS file went out uncompressed (no Content-Encoding, no
               * Vary) where `next start` gzips them (measured: a 39125-byte stylesheet sent at
               * 39125 bytes for gzip, br and identity alike). vinext's `precompress` option
               * (dist/index.d.ts) is "not useful" only on edge platforms that compress at the CDN;
               * this is the Node target.
               */
              precompress: true,
            }),
      }),
      ...(workers
        ? [cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] } })]
        : []),
    ],
  };
});
