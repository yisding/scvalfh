import { notFound } from 'next/navigation';

import { getLeagueIds, getLeagueSummary } from '../../../lib/data';

import { leagueStandingsCard } from '../../standings/[league]/og-card';

/**
 * The `/schedule/<league>` OG card: the same card as `/standings/<league>` (SPEC §8.4), rendered
 * by the shared function in `app/standings/[league]/og-card.tsx`.
 *
 * Same rules as its sibling (SPEC §8.1): `generateStaticParams` EXACTLY the page's, the param
 * validated before any accessor that can throw (`notFound()` for an unknown league), a static alt.
 */
export const alt = 'League standings card: each division’s leaders with points and W-L-T';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams(): { league: string }[] {
  return getLeagueIds().map((league) => ({ league }));
}

export default async function Image({ params }: PageProps<'/schedule/[league]'>) {
  const { league } = await params;
  if (!getLeagueSummary(league)) notFound();
  return leagueStandingsCard(league);
}
