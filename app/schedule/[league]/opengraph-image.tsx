import { notFound } from 'next/navigation';

import { LEAGUE_STANDINGS_CARD_ALT, leagueStandingsImage } from '@/components/og/LeagueStandingsCard';
import { leagueParam, leagueStaticParams } from '@/views/site/league-route';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';

/**
 * The `/schedule/<league>` OG card: the same card as `/standings/<league>` (SPEC §8.4), rendered
 * by the shared function in `components/og/LeagueStandingsCard.tsx`.
 *
 * Same rules as its sibling (SPEC §8.1): `generateStaticParams` EXACTLY the page's, the param
 * validated before any accessor that can throw (`notFound()` for an unknown league), a static alt.
 */
export const alt = LEAGUE_STANDINGS_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams(): { league: string }[] {
  return leagueStaticParams();
}

export default async function Image({ params }: PageProps<'/schedule/[league]'>) {
  const { league } = await params;
  const summary = leagueParam(league);
  if (!summary) notFound();
  return leagueStandingsImage(summary);
}
