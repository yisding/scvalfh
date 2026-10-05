import { monogramImage } from '../components/layout/monogram-image';

/**
 * The iOS home-screen tile. iOS Add-to-Home-Screen does NOT read the web manifest's `icons`
 * array, so without this route a tile fell back to a screenshot of the page — which undercuts
 * `display: 'standalone'` in app/manifest.ts. Same `FH` monogram as /icon, at Apple's 180px.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return monogramImage(size.width);
}
