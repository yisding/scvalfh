import { ImageResponse } from 'next/og';

import { OG_SIZE } from '../components/layout/og-theme';
import { RegionCard, rootCardProps } from '../components/layout/og-region-card';
import { ROOT_OG_ALT } from '../components/layout/site';

/**
 * The root OG card (SPEC §8.4; DESIGN-socal §2.4). TEXT ONLY: no logo file, no school colors and no
 * third-party image request — the same constraint that made TeamMonogram a color square instead of a
 * hotlinked mascot.
 *
 * `California HS Field Hockey · 2026` at 44px, then two region columns (Northern California, Southern
 * California), each with one row per league in config order: `SCVAL  De Anza: St. Ignatius 18 pts ·
 * El Camino: Los Gatos 21 pts` — the leader(s) of each division with their points. A single-division
 * league has no division label (`PCAL  Stevenson 18 pts`). Co-leaders: at most two names joined with
 * " & ", then ` +<n>`. A league with no counted result reads `No league results yet`. No league hue.
 * The layout, the words and the row are shared with the /standings card
 * (components/layout/og-region-card.tsx), which says why nine rows needed two columns; the fit is
 * render-tested with every leader line at its longest (tests/ui/og-region-card.test.ts).
 */
export const alt = ROOT_OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(<RegionCard {...rootCardProps()} />, { ...OG_SIZE });
}
