import { notFound } from 'next/navigation';

import { OG_SIZE } from '../../../components/layout/og-theme';
import { LEAGUE_STANDINGS_CARD_ALT, leagueStandingsCard } from '../../../components/standings/league-standings-card';
import { getLeagueIds, getLeagueSummary } from '../../../lib/data';

/**
 * The `/standings/<league>` OG card (SPEC §8.4), rendered by
 * `components/standings/league-standings-card.tsx`.
 *
 * `dynamicParams` cannot reach a metadata route (Next's metadata-route loader drops it; see
 * app/teams/[slug]/opengraph-image.tsx), so this file states its own `generateStaticParams` —
 * EXACTLY the page's — and validates the param before any accessor that can throw, answering an
 * unknown league with a 404 (SPEC §8.1). The alt is static: a per-league alt would need
 * `generateImageMetadata`, which changes the image URL shape.
 */
export const alt = LEAGUE_STANDINGS_CARD_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export default async function Image({ params }: PageProps<'/standings/[league]'>) {
  const { league } = await params;
  if (!getLeagueSummary(league)) notFound();
  return leagueStandingsCard(league);
}
