import type { MetadataRoute } from 'next';

import { THEME_COLOR } from '@/components/head/theme-script';
import { SEASON_CALENDAR_YEAR } from '@/lib/config/season';
import { SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME } from '@/views/site/site';

/**
 * /manifest.webmanifest (DESIGN §1.1). Installable, standalone, and themed to `--sx-bg` so the
 * splash matches the page in either mode. Every icon is the generated `FH` monogram — there are no
 * bitmap assets in this repo (the Create-Next-App favicon.ico was deleted at integration) and no
 * third-party image requests anywhere on the site. No `orientation` member: locking the installed
 * app to portrait would fail WCAG 1.3.4 (Orientation), and every page works in landscape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SEASON_CALENDAR_YEAR}`,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The one theme constant the layout and the head scripts read too (DESIGN §7.14).
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    categories: ['sports'],
    // `display: 'standalone'` is only honoured if the manifest is installable, and that needs a
    // LARGE icon: /icon is the 32px favicon and /apple-icon is iOS's 180px tile, so on their own
    // this manifest declared nothing at or above Chromium's threshold. /icon-192 and /icon-512 are
    // the pair Next's own PWA guide lists, generated from the same monogram
    // (components/og/monogram-image.tsx) and referenced from here only — they are routes rather
    // than `icon` files precisely so no page's head asks a browser to fetch a 512px PNG for a 16px
    // tab glyph.
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
