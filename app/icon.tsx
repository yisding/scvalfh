import { monogramImage } from '../components/layout/monogram-image';

/**
 * The favicon: a plain `FH` monogram (DESIGN §7.1's language, applied to the site itself).
 * Generated at build with no font download and no bitmap asset in the repo.
 *
 * 32px, the size Next's own docs use for this convention: the browser paints it at 16-32px, and
 * the 512px version it used to be was an 8KB PNG fetched to draw a 16px glyph. The installable
 * icon is a separate concern — app/manifest.ts points at /icon-192 and /icon-512, and iOS reads
 * app/apple-icon.tsx.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return monogramImage(size.width);
}
