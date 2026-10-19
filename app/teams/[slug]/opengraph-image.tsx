import { notFound } from 'next/navigation';

import { ogPng } from '@/components/og/png';
import { TEAM_CARD_ALT, TeamCard } from '@/components/og/TeamCard';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';
import { teamCardModel } from '@/views/teams/team-card';
import { teamStaticParams } from '@/views/teams/team-route';
import { buildTeamPageView } from '@/views/teams/team-view';

/**
 * The per-team OG card (DESIGN §1.1, §3.7), drawn by components/og/TeamCard.tsx from
 * views/teams/team-card.ts.
 *
 * TEXT ONLY, like the root card: no logo file, no mascot image, no third-party request. The one
 * school-color concession is the monogram square, drawn with the cron's measured `onPrimary` ink —
 * the same guardrail TeamMonogram uses, never a hue picked by eye (DESIGN §7.1, §12.4).
 *
 * The card carries the facts a link preview can usefully hold: the identity line (mascot · division
 * heading · league · city), the place in the team's table, league record, points, games counted,
 * goals, streak, the last result and the next game (SPEC §8.4). A team with no reported results says so instead of
 * showing `0-0-0` — a shared link is the most damaging place to get the never-0-0 rule wrong
 * (DESIGN §5.3). Both game lines come from `gameHeadline`, which is built on `describeGame`, so
 * this image cannot disagree with the page it belongs to.
 *
 * `alt` is a static export (TEAM_CARD_ALT), so it describes what every card CONTAINS rather than
 * naming one team.
 */
export const alt = TEAM_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return teamStaticParams();
}

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  // buildTeamPageView guards with teamParam (views/teams/team-route.ts): null for an unknown slug.
  const view = buildTeamPageView(slug);
  if (!view) notFound();
  return ogPng(<TeamCard model={teamCardModel(view)} />);
}
