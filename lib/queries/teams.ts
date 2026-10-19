/**
 * Teams in the snapshot (SPEC §13.3): the team list, a slug-or-GUID lookup, the search index, and the
 * head-to-head record and form line of teams (the pure engines lib/engine/head-to-head.ts and form.ts).
 */

import { DATA_QUALITY, LEAGUES, getSection } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { getSnapshot } from '@/lib/datasets/snapshot';
import { teamForm } from '@/lib/engine/form';
import type { TeamForm } from '@/lib/engine/form';
import { headToHead } from '@/lib/engine/head-to-head';
import type { HeadToHead } from '@/lib/engine/head-to-head';
import type { DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';
import { buildSearchIndex } from '@/lib/shared/search';
import type { SearchIndex } from '@/lib/shared/search';

const snapshot = getSnapshot();

/** All 102 (registry order), one division (a bare id), or `{ league?, division? }`. */
export function getTeams(filter?: DivisionId | { league?: LeagueId; division?: DivisionId }): readonly Team[] {
  if (filter === undefined) return snapshot.teams;
  const f = typeof filter === 'string' ? { division: filter } : filter;
  return snapshot.teams.filter(
    (t) => (!f.league || t.league === f.league) && (!f.division || t.division === f.division),
  );
}

/**
 * Accepts a slug or a MaxPreps GUID. Reads the registry (getTeamBySlug, getTeamById), which the
 * snapshot's teams equal by checkAgainstConfig #1.
 */
export function resolveTeamRef(ref: string): Team | undefined {
  return getTeamBySlug(ref) ?? getTeamById(ref);
}

export function getTeamSlugs(): TeamSlug[] {
  return snapshot.teams.map((t) => t.slug);
}

let searchIndex: SearchIndex | null = null;

/** The pre-serialized 102-team search index (SPEC §9.1), in LEAGUES then registry order. Built once. */
export function getTeamSearchIndex(): SearchIndex {
  if (searchIndex) return searchIndex;
  const teams = LEAGUES.flatMap((l) => snapshot.teams.filter((t) => t.league === l.id)).map((t) => ({
    slug: t.slug,
    name: t.name,
    shortName: t.shortName,
    abbr: t.abbr,
    city: t.city,
    mascot: t.mascot,
    aliases: [...t.aliases],
    leagueId: t.league,
    division: t.division,
  }));
  const leagues = LEAGUES.map((l) => ({
    id: l.id,
    shortName: l.shortName,
    name: l.name,
    sectionShort: getSection(l.sectionId).shortName,
    ...(l.independents ? { independent: true } : {}),
    divisions: l.divisions.map((d) => ({
      id: d.id,
      label: d.label,
      heading: divisionHeading(d.id),
      searchAliases: d.searchAliases,
      teamCount: getTeams(d.id).length,
    })),
  }));
  searchIndex = buildSearchIndex(teams, leagues, DATA_QUALITY.notCovered);
  return searchIndex;
}

// ---------------------------------------------------------------- head to head and form

/** Two teams' meetings and record (lib/engine/head-to-head.ts); undefined for an unknown reference or one team twice. */
export function getHeadToHead(aRef: string, bRef: string): HeadToHead | undefined {
  const a = resolveTeamRef(aRef);
  const b = resolveTeamRef(bRef);
  if (!a || !b || a.id === b.id) return undefined;
  return headToHead(snapshot.games, a, b);
}

/** One team's form line (lib/engine/form.ts); undefined for an unknown reference. */
export function getTeamForm(ref: string): TeamForm | undefined {
  const team = resolveTeamRef(ref);
  return team ? teamForm(snapshot.games, team) : undefined;
}
