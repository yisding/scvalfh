import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import JsonLd from '@/components/layout/JsonLd';
import TeamIdentity from '@/components/teams/TeamIdentity';
import TeamPageGrid from '@/components/teams/TeamPageGrid';
import LeagueHealthNote from '@/components/ui/LeagueHealthNote';
import { getLeague } from '@/lib/config/leagues';
import { getToday } from '@/lib/datasets/snapshot';
import { recordString } from '@/lib/format/numbers';
import { plural } from '@/lib/format/words';
import { getTeamSlugs } from '@/lib/queries/teams';
import { missingMetadata, pageMetadata } from '@/views/site/page-metadata';
import { teamJsonLd } from '@/views/site/structured-data';
import { buildTeamPageBundle, teamPageLayout } from '@/views/teams/team-page';
import { teamStaticParams } from '@/views/teams/team-route';
import { postseasonDescription, rosterExtras } from '@/views/teams/team-view';

/**
 * /teams/[slug] — "How is MY team doing?" (DESIGN §3.7).
 *
 * One static page per registry team (each league's official alignment): the identity card, the
 * league's health note, then the grid. The grid, its spans and the reasoning for their order live
 * in components/teams/TeamPageGrid.tsx; what it shows is built by views/teams/team-view.ts and
 * views/teams/team-page.ts.
 */

/** Every registry team prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return teamStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/teams/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const bundle = buildTeamPageBundle(slug);
  if (!bundle) return missingMetadata('Team not found');
  const { view, playerStats, roster } = bundle;
  const { team, standing, hasResults } = view;
  const record =
    hasResults && standing
      ? `${recordString(standing.computed)} in ${view.scopeLabel} (${plural(standing.computed.pts, 'pt', 'pts')})`
      : `${view.scopeLabel} — no results reported`;
  const extras = rosterExtras(playerStats, roster);
  return pageMetadata({
    path: `/teams/${team.slug}`,
    // With the mascot, as the school's teams are known and searched ("Fremont Firebirds"): the bare
    // name is ambiguous for a school named for its city (Fremont, Christopher, Prospect).
    title: `${team.name} ${team.mascot} field hockey`,
    description: `${team.name} ${team.mascot} girls varsity field hockey (${view.league.shortName}), unofficial: ${record}. Schedule, results, ${extras}goal margins and ${postseasonDescription(view)}.`,
    ogTitle: `${team.name} — ${record}`,
    ogDescription: `Scores, schedule and standings for ${team.name} girls varsity field hockey.`,
    card: 'own',
  });
}

export default async function TeamPage({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  const bundle = buildTeamPageBundle(slug);
  if (!bundle) notFound();

  const { view, ...rest } = bundle;
  const { team } = view;

  return (
    <div className="pb-section-lg">
      <JsonLd data={teamJsonLd(team, getLeague(team.league))} />
      <TeamIdentity view={view} knownSlugs={getTeamSlugs()} />

      <LeagueHealthNote leagueId={team.league} className="mt-4" />

      <TeamPageGrid view={view} {...rest} layout={teamPageLayout(bundle, getToday())} />
    </div>
  );
}
