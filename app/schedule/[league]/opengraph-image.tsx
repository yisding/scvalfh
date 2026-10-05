import { notFound } from 'next/navigation';

import { OG_SIZE } from '../../../components/layout/og-theme';
import { LEAGUE_STANDINGS_CARD_ALT, leagueStandingsCard } from '../../../components/standings/league-standings-card';
import { getLeagueIds, getLeagueSummary } from '../../../lib/data';

/**
 * The `/schedule/<league>` OG card: the same card as `/standings/<league>` (SPEC §8.4), rendered
 * by the shared function in `components/standings/league-standings-card.tsx`.
 *
 * Same rules as its sibling (SPEC §8.1): `generateStaticParams` EXACTLY the page's, the param
 * validated before any accessor that can throw (`notFound()` for an unknown league), a static alt.
 */
export const alt = LEAGUE_STANDINGS_CARD_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export default async function Image({ params }: PageProps<'/schedule/[league]'>) {
  const { league } = await params;
  if (!getLeagueSummary(league)) notFound();
  return leagueStandingsCard(league);
}
