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
 * Unlike `next build`, vinext 1.0.0 does NOT prerender metadata routes (the OG images, icon,
 * apple-icon, manifest, sitemap, robots) or Route Handlers (/icon-192, /icon-512): it only
 * prerenders a metadata route whose default export is `"use cache"`, which needs
 * `cacheComponents` (off here — see next.config.ts), and it skips Route Handlers outright. They
 * render per request, from data/snapshot.json and SITE_URL as `vinext start` sees them, so start
 * it with the same SITE_URL and snapshot the build used.
 */
export default defineConfig({
  plugins: [vinext({ prerender: { routes: '*' } })],
});
