import { monogramImage } from '../../components/layout/monogram-image';

/**
 * `/icon-192` — the installable-app icon Chromium's install prompt requires, referenced from
 * app/manifest.ts (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md lists 192
 * and 512 as the manifest pair).
 *
 * A ROUTE, not another `icon.tsx`: the `icon` file convention also emits a `<link rel="icon">` into
 * every page's head, and a 192px or 512px PNG is not what a browser should fetch to draw a 16px tab
 * glyph — that is what the 32px app/icon.tsx is for. Only the manifest points here.
 *
 * `force-static` so it is prerendered with the rest of the site; nothing here reads the request.
 */
export const dynamic = 'force-static';

export function GET() {
  return monogramImage(192);
}
