/**
 * The `/teams/[slug]` params (contract: views/site/route-contract.ts): which slugs the route
 * prerenders, and the team one of them names. The page, its opengraph-image and the sitemap all
 * list the same slugs.
 */

import type { Team } from '@/lib/model/team';
import { getTeams } from '@/lib/queries/teams';
import { getTeamBySlug } from '@/lib/registry/teams';
import type { StaticParams } from '@/views/site/route-contract';

/** One param per registry team, in snapshot order. */
export function teamStaticParams(): StaticParams<'slug'> {
  return getTeams().map((team) => ({ slug: team.slug }));
}

/** The registry team a URL segment names, or null for a slug that is not one. */
export function teamParam(raw: string): Team | null {
  return getTeamBySlug(raw) ?? null;
}
