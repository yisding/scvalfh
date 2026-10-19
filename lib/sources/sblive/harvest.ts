/** The si.com team web-path harvest: a manual research path, never run by the cron (DATA-SOURCES §5.3). */

import { LEAGUES } from '@/lib/config/leagues';
import type { TeamSlug } from '@/lib/model/ids';
import { type SbliveResolution, resolveSbliveSide, sbliveIdFromWebPath } from './identity';
import { requireBlock } from './props';
import { StandingsPropsSchema, TeamGamesPropsSchema } from './schemas';

/**
 * si.com league standings slugs, from config (`LEAGUES[].sblive.leagueSlugs`) — used ONLY to harvest
 * team web paths, never for membership. The harvest (`SBLIVE_LEAGUE_SLUGS`, then
 * `parseStandingsTeamRefs` and `harvestTeamWebPaths`) is a manual research path for recovering
 * registry team ids: the cron never runs it (DATA-SOURCES §5.3).
 */
export const SBLIVE_LEAGUE_SLUGS: readonly string[] = LEAGUES.flatMap((l) => l.sblive.leagueSlugs);

export interface SbliveTeamRef {
  sbliveTeamId: string;
  name: string;
  webPath: string;
  slug: TeamSlug | null;
  via?: SbliveResolution['via'];
}

/**
 * Harvest `{id, name, webPath}` from a league standings page. The RECORDS on that page are
 * deliberately ignored — only the web paths are usable, because SBLive's league buckets are wrong
 * (SPEC §1.2 caveat 1). This is how the si.com team slugs are recovered instead of guessed.
 */
export function parseStandingsTeamRefs(html: string, url = ''): SbliveTeamRef[] {
  const props = StandingsPropsSchema.parse(requireBlock(html, 'organizations/Standings', url));
  const out: SbliveTeamRef[] = [];
  for (const row of props.query.organization.teamStandings) {
    const webPath = row.team.webPath ?? null;
    const id = sbliveIdFromWebPath(webPath) ?? (row.team.id === undefined ? null : String(row.team.id));
    if (!id || !webPath) continue;
    const r = resolveSbliveSide({ name: row.team.name, webPath, rawId: row.team.id, image: row.team.image });
    out.push({ sbliveTeamId: id, name: row.team.name, webPath, slug: r.slug, via: r.via });
  }
  return out;
}

/** Every opponent web path a team page mentions — the other half of the slug harvest. */
export function harvestTeamWebPaths(html: string, url = ''): SbliveTeamRef[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const seen = new Map<string, SbliveTeamRef>();
  const add = (name: string | undefined, webPath: string | null | undefined, image: string | null | undefined) => {
    const id = sbliveIdFromWebPath(webPath);
    if (!id || !name || !webPath) return;
    if (!seen.has(id)) {
      const r = resolveSbliveSide({ name, webPath, image });
      seen.set(id, { sbliveTeamId: id, name, webPath, slug: r.slug, via: r.via });
    }
  };
  add(props.query.team.name, props.query.team.webPath, props.query.team.image);
  for (const node of props.query.team.games.nodes) {
    add(node.featured.team?.name, node.featured.team?.webPath, node.featured.team?.image);
    add(node.opponent.team.name, node.opponent.team.webPath, node.opponent.team.image);
  }
  return [...seen.values()];
}
