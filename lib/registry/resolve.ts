/**
 * Name resolution against the registry: any spelling a source prints (a MaxPreps GUID, our slug, a
 * name, an alias, a globally unique acronym; a league's official-grid token) to a Team, the withdrawn
 * schools a league's grid still lists, and the cross-source join keys (SPEC §5.7). The sources, the
 * official parsers and the pipeline import this module; the team list itself is the door's
 * (lib/registry/teams.ts), and the keys are the alias index's (lib/registry/acronyms.ts).
 */

import { LEAGUES, findLeague } from '@/lib/config/leagues';
import type { LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';

import { ALIAS_INDEX, normalizeTeamKey } from './acronyms';
import { getTeamById, getTeamBySlug } from './teams';

/**
 * One side of a game as the cross-source join key (SPEC §5.7): its registry slug, else `name:` and
 * the name lower-cased with everything but a-z and 0-9 removed. Every source joined to MaxPreps
 * (si.com in lib/pipeline/reconcile/sblive-crosscheck.ts and lib/sources/sblive/games.ts, the official schedules in
 * lib/official/match.ts, the school calendars in lib/sources/vnn-ics.ts) keys a side with this, so
 * the two halves of a join agree exactly.
 */
export function sideJoinKey(side: { slug: string | null; name: string }): string {
  return side.slug ?? `name:${side.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

/** Two side keys as one order-independent pair key, `a~b` sorted: the pair half of the cross-source join key (SPEC §5.7). */
export function unorderedPairKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

/**
 * Resolve a MaxPreps GUID, our slug, a name, an alias, or an acronym that is
 * globally unique, to a Team.
 */
export function resolveTeam(nameOrId: string | null | undefined): Team | undefined {
  if (!nameOrId) return undefined;
  return getTeamById(nameOrId) ?? ALIAS_INDEX.get(normalizeTeamKey(nameOrId));
}

/**
 * League-scoped official-grid token or spelling: the league's `officialCodes` (exact token, then
 * case-insensitive), its `officialNames`, then the global resolver restricted to that league.
 * Grid codes never enter the global resolver.
 */
export function resolveOfficialName(leagueId: LeagueId, token: string): Team | undefined {
  const league = findLeague(leagueId);
  const raw = token.trim();
  if (!league || !raw) return undefined;
  const scoped = (slug: string | undefined): Team | undefined => {
    const t = slug ? getTeamBySlug(slug) : undefined;
    return t && t.league === league.id ? t : undefined;
  };
  const exact = scoped(league.officialCodes[raw] ?? league.officialNames[raw]);
  if (exact) return exact;
  const upper = raw.toUpperCase();
  for (const [code, slug] of Object.entries(league.officialCodes)) {
    if (code.toUpperCase() === upper) return scoped(slug);
  }
  const key = normalizeTeamKey(raw);
  for (const [name, slug] of Object.entries(league.officialNames)) {
    if (normalizeTeamKey(name) === key) return scoped(slug);
  }
  const t = resolveTeam(raw);
  return t && t.league === league.id ? t : undefined;
}

const WITHDRAWN_KEYS: ReadonlyMap<LeagueId, ReadonlySet<string>> = new Map(
  LEAGUES.map((l) => [l.id, new Set(l.withdrawnNames.map(normalizeTeamKey))]),
);

/**
 * Schools a league's official grid still lists that are NOT fielding a varsity team (Wilcox in
 * SCVAL, York in PCAL, Red Bluff in the EAL, which MaxPreps' table still lists), and the rows
 * MaxPreps lists in a San Diego table for a school with no 2026 varsity game (Madison in City
 * Eastern, Santana in its "Grossmont" table: LEAGUES city and metro withdrawnNames). Their grid fixtures are dropped at parse time; they are not in the
 * registry, so they appear nowhere on the site. Reads every league's `withdrawnNames` when
 * `leagueId` is omitted.
 */
export function isWithdrawnSchool(name: string | null | undefined, leagueId?: LeagueId): boolean {
  if (!name) return false;
  const key = normalizeTeamKey(name);
  if (!key) return false;
  if (leagueId !== undefined) return WITHDRAWN_KEYS.get(leagueId)?.has(key) ?? false;
  for (const keys of WITHDRAWN_KEYS.values()) if (keys.has(key)) return true;
  return false;
}
