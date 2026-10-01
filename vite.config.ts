import vinext from 'vinext';
import { defineConfig } from 'vite';

/**
 * vinext (Vite + the Next.js API surface) runs alongside `next`: `pnpm build:vinext` builds into
 * dist/ and `pnpm start:vinext` serves it, reading the same app/ and next.config.ts.
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
export default defineConfig({
  plugins: [
    vinext({
      prerender: { routes: '*' },
      /**
       * `vinext start` compresses rendered responses on the fly but serves /_next/static/** only
       * from build-time .br/.gz/.zst siblings, and writes none by default, so without this every
       * hashed JS and CSS file went out uncompressed (no Content-Encoding, no Vary) where `next
       * start` gzips them (measured: a 39125-byte stylesheet sent at 39125 bytes for gzip, br and
       * identity alike). vinext's `precompress` option (dist/index.d.ts) is "not useful" only on
       * edge platforms that compress at the CDN; this is the Node target.
       */
      precompress: true,
    }),
  ],
});
