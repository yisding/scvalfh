/**
 * A side named in a sentence: a registry team renders by its short name; anyone else is a name and
 * nothing else. The day page's moved-game note (components/schedule/ScoresRegionBlock.tsx) and the JV
 * tables' uncounted-game note (components/jv/jv-standings-view.ts) share it. Server-only: it reads the
 * registry.
 */

import { getTeamBySlug } from '../../lib/teams';
import type { TeamSlug } from '../../lib/types';

export function shortNameOf(slug: TeamSlug | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.shortName : fallback;
}
