/**
 * The registry-bound primitives the per-team data files share: a slug that names a registry team,
 * and how many teams the registry holds. Rosters, player stats, JV, clubs and commits each carry
 * one entry (or one reference) per team of TEAMS, so they validate against these two declarations
 * and a file's slug check and its "one entry per registry team" count can never drift apart.
 *
 * Kept apart from lib/schema/primitives.ts so the plain primitives (the snapshot and history
 * contracts take them) load no registry.
 */

import { TEAMS } from '@/lib/registry/teams';

import { slugId } from './primitives';

const REGISTRY_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));

/** A slug that names a registry team (any of the nine leagues' teams and the independents). */
export const registryTeamSlug = slugId.refine((slug) => REGISTRY_SLUGS.has(slug), 'not a registry team slug');

/** How many teams the registry holds: TEAMS.length (102), what a per-team file's `teams` must count. */
export const REGISTRY_TEAM_COUNT = TEAMS.length;
