import type { NextConfig } from 'next';

/**
 * The site is static route families built from one JSON snapshot — pages `/`, `/standings`,
 * `/standings/[league]`, `/schedule`, `/schedule/[league]`, `/scores/[date]`, `/game/[id]`, `/teams`,
 * `/teams/[slug]`, `/playoffs`, `/playoffs/[league]`, `/leaders`, `/history/2025-26`, `/about`, `/clubs`,
 * `/clubs/[slug]`, `/commits` and `/recruiting` (the last four from data/clubs.json, data/commits.json
 * and the roster files, not the snapshot), plus the OG
 * images beside them and the metadata routes (icons, manifest, sitemap, robots) — every one
 * prerendered (`dynamicParams = false` on each dynamic segment, SPEC §8.1), so there is nothing to
 * configure for data. Notably absent, on purpose:
 *
 *  - `cacheComponents` stays OFF. Every page is prerendered from the snapshot at build time, so
 *    there is no request-time cache to tune, and turning it on would change the rendering model
 *    for zero benefit here.
 *  - No `images` config: the site makes no image requests at all (school identity is a color
 *    monogram, not a hotlinked mascot — DESIGN §12.4), so next/image never appears.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Nothing about this site benefits from advertising the framework.
  poweredByHeader: false,

  /**
   * The in-memory cache that `vinext start` seeds with every prerendered route at startup (vinext
   * reads this key from next.config too; `next start` serves the same pages from disk). When the
   * prerender outgrows it, the handler evicts the earliest-seeded routes (/about, /schedule, every
   * /game page, …) while seeding, and their first request renders on demand instead of serving the
   * build, which scripts/smoke-server.sh catches as `x-nextjs-cache: MISS`.
   *
   * Measured after `pnpm build:vinext` on 2026-10-06 (the Southern California amendment, DESIGN §24:
   * 99 teams in nine leagues, 871 games, 64 game days; SPEC §12.3): dist/server/prerendered-routes
   * holds 367,917,653 bytes — 1,081 .html (212,432,952), 1,080 .rsc (112,804,113) and 1,062 .route
   * bodies (42,680,588; the OG images, icons, manifest, sitemap and robots, which vinext seeds into
   * the same cache). The rule is at least 2 × that total (735,835,306 bytes), rounded UP to a
   * multiple of 128 MB: 768 MB (805,306,368 bytes, 2.19 ×). The old 384 MB is 1.09 ×: it still
   * holds today's folder, but it is under the rule and leaves almost nothing for the season's game,
   * date and recap pages still to come. Actual use is bounded by the content size, not by this ceiling; the next
   * measurement to take is the same `du` once the San Diego Section playoffs (Nov 2–14) add their
   * games.
   *
   * Earlier measurements, same method: 163,011,433 bytes on 2026-10-04 (49 teams in five leagues,
   * 396 games, 57 game days: 537 .html, 536 .rsc, 522 .route; 384 MB was 2.47 ×) and 127,990,691
   * bytes on 2026-10-02 (43 teams, 364 games). scripts/smoke-server.sh (`x-nextjs-cache: MISS`) is
   * the check that the setting is enough.
   */
  cacheMaxMemorySize: 768 * 1024 * 1024,

  /**
   * HTML (and every other route below) is `public, max-age=0, must-revalidate`: any cache may store
   * it, and none may use it again without asking the server first. The ETag every page carries makes
   * that question cheap (a 304 with no body when nothing changed), and the answer is the new
   * snapshot from the first request after a deploy.
   *
   * Next's default for a fully prerendered page is `s-maxage=31536000` with NO revalidation
   * directive, which is the wrong contract for this site: the whole premise is a snapshot commit
   * once or twice a day. DESIGN §13 first answered that with `s-maxage=300,
   * stale-while-revalidate=86400`, which was wrong for browsers: Vercel forwards a next.config
   * Cache-Control on a prerendered page as is (checked on the production deploy on 2026-10-08), and
   * `stale-while-revalidate` is not a shared-cache-only directive, so it let a browser show a page up
   * to a day old while it revalidated in the background. Opening the site after the evening refresh
   * showed the morning's scores until a manual reload, which always revalidates. Nothing here needs
   * a shared-cache lifetime to stay fast: Vercel serves the prerender from its own per-deployment
   * cache, and the Worker and `vinext start` serve it from the build.
   *
   * This is also Next's and Vercel's own default for a page that must revalidate, and vinext does not
   * read it as non-cacheable (no `no-store`, `no-cache` or `private`), so its prerendered pages are
   * still served from the build (`x-nextjs-cache: HIT`, scripts/smoke-server.sh).
   *
   * The open-tab half of freshness is not this header's: the client router reuses a prefetched
   * static page for `x-nextjs-stale-time` (five minutes) without a request.
   *
   * The other half of §13 — "immutable hashed assets" — is the reason this is not a bare `/:path*`.
   * The headers doc says Next's `public, max-age=31536000, immutable` on immutable assets "cannot be
   * overridden" (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/
   * headers.md), but it says that about static image imports, and a bare `/:path*` DOES override it
   * on the build's own hashed chunks: `curl -D- /_next/static/chunks/<hash>.css` came back with
   * the page rule on a filename that can never change its bytes, i.e. revalidation on every use of
   * the one class of file that should be cached for a year. Hence the negative lookahead, which is
   * the WHOLE fix: excluded from this rule, `/_next/static/**` falls through to Next's own
   * `public, max-age=31536000, immutable` (verified on a chunk, a stylesheet and a woff2).
   *
   * There is deliberately no second rule re-asserting that long header. `next build` warns on any
   * `headers()` source beginning `/_next/` that sets Cache-Control ("Setting a custom Cache-Control
   * header can break Next.js development behavior" — node_modules/next/dist/lib/
   * load-custom-routes.js), and re-stating a value Next already sets bought a build warning for
   * nothing.
   *
   * What the rule does cover is every route AND the OG image routes AND /manifest.webmanifest AND
   * the four icon routes, all built from the same snapshot and all wanting the same freshness.
   */
  async headers() {
    return [
      {
        source: '/:path((?!_next/static/).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
