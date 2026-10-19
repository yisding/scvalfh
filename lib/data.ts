/**
 * NOT a module to import: the snapshot is read through lib/datasets/snapshot.ts and the read API
 * over it is lib/queries/ (provenance, leagues, teams, games, standings, phase, postseason). This
 * file re-exports only the names the five metadata image routes still import through their
 * relative `../../../lib/data` specifier: app/playoffs/[league]/opengraph-image.tsx,
 * app/schedule/[league]/opengraph-image.tsx, app/scores/[date]/opengraph-image.tsx,
 * app/standings/[league]/opengraph-image.tsx and app/teams/[slug]/opengraph-image.tsx.
 *
 * Next prints a content hash of each metadata image file's OWN source into the URL every page
 * carries (`og:image` …/opengraph-image?<hash>), so repointing those imports would change the HTML
 * of every page under those routes. The files keep their bytes, and this module keeps their
 * specifier resolving, until the change that rewrites those routes anyway deletes it (with
 * lib/format.ts). eslint.config.mjs refuses any other import of it.
 */

import { LEAGUES } from './config/leagues';
import type { LeagueId } from './model/ids';

export { getFetchedAt } from './datasets/snapshot';
export { getGameDates, getGames } from './queries/games';
export { getLeagueSummary } from './queries/leagues';
export { getLeagueTournament } from './queries/postseason';
export { getTeamSlugs } from './queries/teams';
export { getTeamBySlug } from './registry/teams';

/** generateStaticParams for the /standings/[league] and /schedule/[league] cards: LEAGUE_IDS, as a fresh array. */
export function getLeagueIds(): LeagueId[] {
  return LEAGUES.map((l) => l.id);
}
