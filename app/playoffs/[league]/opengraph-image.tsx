import { notFound } from 'next/navigation';

import { ogPng } from '@/components/og/png';
import { TOURNAMENT_CARD_ALT, TournamentCard } from '@/components/og/TournamentCard';
import { getLeagueTournament } from '@/lib/queries/postseason';
import { getTeamBySlug } from '@/lib/registry/teams';
import { tournamentCardModel } from '@/views/playoffs/tournament';
import { tournamentParam, tournamentStaticParams } from '@/views/playoffs/tournament-route';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';

/**
 * The `/playoffs/<league>` OG card (SPEC §8.4): "MCAL tournament", the six seeds, the round dates,
 * drawn by components/og/TournamentCard.tsx. TEXT ONLY, like every card on this site (DESIGN §12.4).
 *
 * `dynamicParams` does not reach a metadata route (see app/teams/[slug]/opengraph-image.tsx), so this
 * file states its own `generateStaticParams` — the page's own `tournamentStaticParams` — and checks
 * the param with the page's `tournamentParam` (views/playoffs/tournament-route.ts) BEFORE
 * `getLeagueTournament`, which throws for a CCS league: `/playoffs/scval/opengraph-image` and
 * `/playoffs/nope/opengraph-image` answer 404 (SPEC §8.1). The round titles are the page's
 * `ROUND_TITLES` and a shared seat reads `A, B or C` as on the page (views/playoffs/tournament.ts
 * `tournamentCardModel`). The alt is static: a per-league alt would need `generateImageMetadata`,
 * which changes the image URL shape.
 */
export const alt = TOURNAMENT_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams(): { league: string }[] {
  return tournamentStaticParams();
}

export default async function Image({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentParam(league);
  if (!found) notFound();
  const model = tournamentCardModel({
    ps: found.ps,
    projection: getLeagueTournament(league),
    teamOf: getTeamBySlug,
    shortName: found.summary.shortName,
  });
  return ogPng(<TournamentCard model={model} />);
}
