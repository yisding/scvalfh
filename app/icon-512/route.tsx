import { monogramImage } from '@/components/layout/monogram-image';

/**
 * `/icon-512` — the large installable-app icon (splash screen and app list), referenced from
 * app/manifest.ts. See app/icon-192/route.tsx for why these are routes rather than `icon` files.
 */
export const dynamic = 'force-static';

export function GET() {
  return monogramImage(512);
}
