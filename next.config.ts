import type { NextConfig } from 'next';

/**
 * The site is static route families built from one JSON snapshot — pages `/`, `/standings`,
 * `/standings/[league]`, `/schedule`, `/schedule/[league]`, `/scores/[date]`, `/game/[id]`, `/teams`,
 * `/teams/[slug]`, `/playoffs`, `/playoffs/[league]`, `/leaders`, `/history/2025-26`, `/about`, `/clubs`,
 * `/clubs/[slug]` and `/commits` (the last three from data/clubs.json and data/commits.json, not the
 * snapshot), plus the OG
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
   * Measured after `pnpm build:vinext` on 2026-10-04 (49 teams in five leagues, 396 games, 57 game
   * days; SPEC §12.3): dist/server/prerendered-routes holds 163,011,433 bytes — 537 .html
   * (93,899,335), 536 .rsc (49,602,676) and 522 .route bodies (19,509,422; the OG images, icons,
   * manifest, sitemap and robots, which vinext seeds into the same cache). The rule is at least 2 ×
   * that total (326,022,866 bytes); 384 MB (2.5 ×) still meets it and covers the rest of the season,
   * whose game, date and recap pages are still to come. (On 2026-10-02, with 43 teams and 364 games,
   * it was 127,990,691 bytes.) Actual use is bounded by the content size, not by this ceiling.
   */
  cacheMaxMemorySize: 384 * 1024 * 1024,

  /**
   * DESIGN §13: HTML is `s-maxage=300, stale-while-revalidate=86400`.
   *
   * Next's default for a fully prerendered page is `s-maxage=31536000` with NO revalidation
   * directive, which is the wrong contract for this site: the whole premise is a snapshot commit
   * once or twice a day, so a shared cache that does not purge on deploy would serve one afternoon's
   * scoreboard for the rest of the season. Five minutes of shared cache with a day of
   * stale-while-revalidate keeps the CDN doing its job while guaranteeing it comes back to ask.
   *
   * The other half of §13 — "immutable hashed assets" — is the reason this is not a bare `/:path*`.
   * The headers doc says Next's `public, max-age=31536000, immutable` on immutable assets "cannot be
   * overridden" (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/
   * headers.md), but it says that about static image imports, and a bare `/:path*` DOES override it
   * on the build's own hashed chunks: `curl -D- /_next/static/chunks/<hash>.css` came back with
   * `s-maxage=300` on a filename that can never change its bytes, i.e. five-minute revalidation on
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
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
