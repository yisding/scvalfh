import { ogPng } from '@/components/og/png';
import { RegionCard } from '@/components/og/RegionCard';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';
import { rootCardProps } from '@/views/site/region-card';
import { ROOT_OG_ALT } from '@/views/site/site';

/**
 * The root OG card (SPEC §8.4; DESIGN-socal §2.4). TEXT ONLY: no logo file, no school colors and no
 * third-party image request — the same constraint that made TeamMonogram a color square instead of a
 * hotlinked mascot.
 *
 * `NorCal HS Field Hockey · 2026` at 44px, then two region columns (Northern California, Southern
 * California), each with one row per league in config order: `SCVAL  De Anza: St. Ignatius 18 pts ·
 * El Camino: Los Gatos 21 pts` — the leader(s) of each division with their points. A single-division
 * league has no division label (`PCAL  Stevenson 18 pts`). Co-leaders: at most two names joined with
 * " & ", then ` +<n>`. A league with no counted result reads `No league results yet`. No league hue.
 * The layout is shared with the /standings card (components/og/RegionCard.tsx, which says why nine
 * rows needed two columns), and so are the words (views/site/region-card.ts); the fit is
 * render-tested with every leader line at its longest (tests/components/og/RegionCard.test.ts).
 */
export const alt = ROOT_OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
  return ogPng(<RegionCard {...rootCardProps()} />);
}
