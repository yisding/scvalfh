import { ImageResponse } from 'next/og';

import { OG_SIZE } from '../../components/layout/og-theme';
import { RegionCard, standingsCardProps } from '../../components/layout/og-region-card';
import { SITE_NAME } from '../../components/layout/site';

/**
 * The /standings OG card (SPEC §8.4; DESIGN-socal §2.4): SITE_WORDMARK as a small uppercase eyebrow,
 * "Standings — every league" at 44px, then the root card's two region columns — one row per league,
 * `SCVAL  De Anza: St. Ignatius 18 pts · El Camino: Los Gatos 21 pts` (short name and points;
 * co-leaders at most two names joined with " & ", then ` +<n>`; `No league results yet` before a
 * league's first result). Layout and words: components/layout/og-region-card.tsx, shared with the
 * root card so the two cannot drift; render-tested with every leader line at its longest.
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). Division labels only through `divisionHeading()` (the summaries' own
 * `heading`): the single-division leagues print none.
 */
export const alt = `${SITE_NAME} — standings for every league: each division’s leaders with points`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function StandingsOpengraphImage() {
  return new ImageResponse(<RegionCard {...standingsCardProps()} />, { ...OG_SIZE });
}
