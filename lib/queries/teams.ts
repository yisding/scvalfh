/**
 * Teams in the snapshot (SPEC §13.3): the team list, a slug-or-GUID lookup, the search index and the
 * head-to-head record of two teams.
 */

import { DATA_QUALITY, LEAGUES, getSection } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { getSnapshot } from '@/lib/datasets/snapshot';
import { recordString } from '@/lib/format/numbers';
import type { Game, Record3 } from '@/lib/model/game';
import type { DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';
import { sideOutcome } from '@/lib/shared/game';
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

// ---------------------------------------------------------------- head to head

export interface HeadToHead {
  a: Team;
  b: Team;
  games: Game[];
  /** Record from A's point of view. */
  aRecord: Record3;
  bRecord: Record3;
  aGoals: number;
  bGoals: number;
  summary: string;
}

export function getHeadToHead(aRef: string, bRef: string): HeadToHead | undefined {
  const a = resolveTeamRef(aRef);
  const b = resolveTeamRef(bRef);
  if (!a || !b || a.id === b.id) return undefined;
  const games = snapshot.games
    .filter((g) => {
      const ids = [g.home.teamId, g.away.teamId];
      return ids.includes(a.id) && ids.includes(b.id);
    })
    .sort((x, y) => x.dateLocal.localeCompare(y.dateLocal));

  const aRecord: Record3 = { w: 0, l: 0, t: 0 };
  const bRecord: Record3 = { w: 0, l: 0, t: 0 };
  let aGoals = 0;
  let bGoals = 0;
  for (const g of games) {
    if (g.status !== 'final' || g.home.score === null || g.away.score === null) continue;
    const aIsHome = g.home.teamId === a.id;
    const aScore = aIsHome ? g.home.score : g.away.score;
    const bScore = aIsHome ? g.away.score : g.home.score;
    if (!g.isForfeit) {
      aGoals += aScore;
      bGoals += bScore;
    }
    // sideOutcome: a shootout win (decider 'SO', level on goals: an EAL 1 v 1 win, a San Diego shootout) is the flagged side's win.
    const outcome = sideOutcome(g, aIsHome ? 'home' : 'away');
    if (outcome === 'W') {
      aRecord.w += 1;
      bRecord.l += 1;
    } else if (outcome === 'L') {
      aRecord.l += 1;
      bRecord.w += 1;
    } else {
      aRecord.t += 1;
      bRecord.t += 1;
    }
  }
  return {
    a,
    b,
    games,
    aRecord,
    bRecord,
    aGoals,
    bGoals,
    summary: `${a.shortName} ${recordString(aRecord)} vs ${b.shortName}`,
  };
}
