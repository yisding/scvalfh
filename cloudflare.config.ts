import { bindings, defineConfig, defineWorker } from 'cf/config';

/**
 * The Cloudflare Workers target (see vite.config.ts): read by @cloudflare/vite-plugin under
 * `--mode cloudflare` and by `cf deploy`, both of which require this exact file name at the repo
 * root. Its presence does not change the Node build (patches/vinext@1.0.0.patch, index.js).
 *
 * - entrypoint: vinext's Worker fetch handler (server/app-router-entry.js).
 * - compatibilityDate: pinned to the workerd release the plugin bundles (1.20260926.1), not the
 *   day `vinext init` ran; a date past the runtime's is refused or downgraded with a warning.
 * - nodejs_compat: node:fs/node:crypto imports (lib/data.ts keeps node:fs for its Node-only
 *   SCVAL_SNAPSHOT override) and process.env.
 * - assets: Workers Static Assets serves /_next/static/** directly (vinext writes a `_headers` file
 *   giving it the immutable Cache-Control). Every page URL misses (notFoundHandling 'none'), so it
 *   reaches the Worker, which reads the prerendered body from /_vinext/static-cache/ through
 *   ASSETS. runWorkerFirst keeps those raw cache files from being fetched directly (they 404).
 * - No vars: SITE_URL and SCVAL_BUILD_AT are inlined at build time (vite.config.ts). Never set
 *   SCVAL_SNAPSHOT or SCVAL_HISTORY here: a Worker has no filesystem to read them from.
 * - No accountId: a deploy takes it from CLOUDFLARE_ACCOUNT_ID (README "Cloudflare Workers").
 * - name: one Worker per sport, as each sport is its own build (lib/sports/current.ts). Field hockey
 *   keeps the original name, so its Worker and workers.dev URL are unchanged; SCVAL_SPORT picks the
 *   others, and an unknown sport throws here as lib/sports/current.ts does.
 */
const WORKER_NAMES: Record<string, string> = {
  'field-hockey': 'scvalfh',
  soccer: 'scvalfh-soccer',
  basketball: 'scvalfh-basketball',
};
const sport = process.env.SCVAL_SPORT || 'field-hockey';
const name = WORKER_NAMES[sport];
if (!name) throw new Error(`cloudflare.config.ts: SCVAL_SPORT=${sport} has no Worker name`);

export default defineConfig({
  worker: defineWorker({
    name,
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-09-26',
    compatibilityFlags: ['nodejs_compat'],
    assets: { notFoundHandling: 'none', runWorkerFirst: ['/_vinext/static-cache/*'] },
    env: { ASSETS: bindings.assets() },
  }),
});
