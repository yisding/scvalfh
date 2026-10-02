import type { Metadata } from 'next';

/**
 * The site's own origin, used by `metadataBase`, `robots.txt` and `sitemap.xml`.
 *
 * There is no production domain committed to the repo yet, so the honest fallback is localhost:
 * set `SITE_URL` in the deploy environment and every absolute URL follows. Returning a made-up
 * domain would put a wrong canonical and wrong OG URLs into the HTML.
 */
export const SITE_URL: string = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const SITE_NAME = 'SCVAL Field Hockey';
export const SITE_TAGLINE = 'Santa Clara Valley Athletic League girls varsity field hockey';
export const SITE_DESCRIPTION =
  'Scores, standings, schedules and CCS playoff picture for the 15 De Anza and El Camino girls varsity field hockey teams. Rebuilt nightly from MaxPreps; unofficial.';

/**
 * The `openGraph` fields every page has to repeat.
 *
 * Next REPLACES the whole `openGraph` object at the nearest segment that declares one — it does
 * not merge its keys (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-metadata.md:1348: "All `openGraph` fields from `app/layout.js` are **replaced** …"). A
 * page that declared nothing but `url` therefore shipped with no og:type, no og:site_name and no
 * og:locale at all, which is eight of the ten route families. Spread this first and override what
 * differs (/game/[id] is `type: 'article'`).
 */
export const OG_BASE = {
  type: 'website',
  siteName: SITE_NAME,
  locale: 'en_US',
} as const;

/**
 * The root card, for the routes with NO `opengraph-image.tsx` of their own: /schedule, /teams,
 * /playoffs, /about and /history/2025-26. Without it those five pages carried
 * `twitter:card=summary_large_image` and no image of any kind.
 *
 * Never spread this into a segment that HAS its own image file. Next attaches a file-based image
 * only when that segment's metadata does not declare `openGraph.images`
 * (node_modules/next/dist/lib/metadata/resolve-metadata.js: "file based metadata is specified and
 * current level metadata openGraph.images is not specified"), so naming the root card on
 * /standings or /teams/[slug] would swap that page's specific card for the generic one. The
 * dimensions and alt text are repeated from app/opengraph-image.tsx, which is the only way to
 * state them for a route that is not the image's own segment.
 */
export const ROOT_OG_IMAGE: Pick<NonNullable<Metadata['openGraph']>, 'images'> = {
  images: [
    {
      url: '/opengraph-image',
      width: 1200,
      height: 630,
      alt: `${SITE_NAME} — 2026 standings, scores and CCS playoffs`,
      type: 'image/png',
    },
  ],
};
