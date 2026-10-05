import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/components/layout/site';

/**
 * /robots.txt. Everything is crawlable — every route family is static public scores — and the
 * sitemap (app/sitemap.ts) is advertised, so a crawler finds every prerendered page without guessing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    // `Sitemap` is defined to be an absolute URL; `Host` is a Yandex extension that takes a bare
    // hostname with an optional port, so it must not carry the scheme. Next passes the string
    // through verbatim (the type is just `host?: string`), so nothing catches this at build.
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: new URL(SITE_URL).host,
  };
}
