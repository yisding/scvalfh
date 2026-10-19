import { ogPng } from '@/components/og/png';
import { RegionCard, STANDINGS_CARD_ALT } from '@/components/og/RegionCard';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';
import { standingsCardProps } from '@/views/site/region-card';

/**
 * The /standings OG card (SPEC §8.4; DESIGN-socal §2.4): SITE_WORDMARK as a small uppercase eyebrow,
 * "Standings — every league" at 44px, then the root card's two region columns — one row per league,
 * `SCVAL  De Anza: St. Ignatius 18 pts · El Camino: Los Gatos 21 pts` (short name and points;
 * co-leaders at most two names joined with " & ", then ` +<n>`; `No league results yet` before a
 * league's first result). Layout: components/og/RegionCard.tsx; words: views/site/region-card.ts;
 * both shared with the root card so the two cannot drift; render-tested with every leader line at
 * its longest.
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). Division labels only through `divisionHeading()` (the summaries' own
 * `heading`): the single-division leagues print none.
 */
export const alt = STANDINGS_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function StandingsOpengraphImage() {
  return ogPng(<RegionCard {...standingsCardProps()} />);
}
