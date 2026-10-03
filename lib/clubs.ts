/**
 * The read API for data/clubs.json — the youth field hockey clubs, and which players on the 43
 * tracked varsity rosters a public page ties to one (SPEC §1.1j2, DESIGN §17).
 *
 * The file is research, written by hand and checked twice; no script rebuilds it (see
 * lib/clubs-schema.ts). It is imported so the build bundles it, for the reason lib/rosters.ts
 * gives: a Worker has no project filesystem. It is validated once at module scope — the schema,
 * then the join to the rosters the schema cannot see — so a bad file fails at import time rather
 * than half-way through a render.
 *
 * There is no env override. lib/rosters.ts has one because a script rewrites those files and a
 * child-process test swaps them; nothing writes clubs.json, and the tests that need a bad file
 * build one in memory and pass it to `loadClubs`. So this module reads no file of its own.
 *
 * The join, on team slug + MaxPreps athleteId, is against the MERGED rosters
 * (`getAllEnrichedRosters`): a merged row already carries the grade the team page shows (MaxPreps',
 * else the overlay's) and the overlay's `level`, so the checks below see what a reader sees.
 * Every affiliation must:
 *   1. join to a row of that team, under the row's own fullName
 *   2. not be a JV row (the overlay's `level`): clubs list varsity rows only
 *   3. agree with every class year a source states, when the row has a grade (a player with no
 *      grade anywhere has nothing to check)
 * and the file's `season` must be rosters.json's.
 *
 * A roster refetch can break this. If `pnpm fetch-rosters` drops a tied player's row or respells
 * the name, or a season rollover changes `season`, this module throws at import — and so `pnpm
 * test` and the build fail — naming the team, the player and the club. That is the posture of
 * data/rosters-enrichment.json, and right for research data: re-check that affiliation's sources,
 * then edit or drop it by hand. Never prune it automatically.
 */

import bundled from '../data/clubs.json';
import {
  CLUB_REGIONS,
  ClubsFileSchema,
  type Club,
  type ClubAffiliation,
  type ClubRegion,
  type ClubsFile,
} from './clubs-schema';
import { classOf, getAllEnrichedRosters, getRosters, type MergedPlayer, type MergedTeamRoster } from './rosters';
import type { TeamSlug } from './types';

export type {
  AffiliationConfidence,
  AffiliationSource,
  AffiliationStatus,
  Club,
  ClubAffiliation,
  ClubProgram,
  ClubRegion,
  ClubSource,
  ClubSourceKind,
  ClubsFile,
} from './clubs-schema';

/**
 * Parse `raw` against the contract, then check the join the schema cannot see (see the header).
 * Throws on the first failure: a schema failure lists the first ten issues with their paths, a
 * join failure reads `clubs: <team> / <player> (<club>): <what>`. Runs once at module scope on the
 * bundled file; the tests call it on files built in memory.
 */
export function loadClubs(
  raw: unknown,
  teams: readonly MergedTeamRoster[] = getAllEnrichedRosters(),
  season: string = getRosters().season,
): ClubsFile {
  const parsed = ClubsFileSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`clubs failed validation:\n${lines.join('\n')}`);
  }
  const file = parsed.data;
  if (file.season !== season) {
    throw new Error(`clubs.json is for season ${file.season}, rosters for ${season}`);
  }
  const fail = (team: string, who: string, club: string, what: string): never => {
    throw new Error(`clubs: ${team} / ${who} (${club}): ${what}`);
  };
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  for (const a of file.affiliations) {
    const team = bySlug.get(a.teamSlug);
    if (!team) fail(a.teamSlug, a.fullName, a.club, 'no such team in rosters.json');
    const row = team!.players.find((p) => p.athleteId === a.athleteId);
    if (!row) fail(a.teamSlug, a.fullName, a.club, `athleteId ${a.athleteId} is not a MaxPreps row of this team`);
    if (a.fullName !== row!.fullName) fail(a.teamSlug, a.fullName, a.club, `MaxPreps spells this player "${row!.fullName}"`);
    if (row!.level === 'jv') fail(a.teamSlug, a.fullName, a.club, 'a JV row: clubs list varsity rows only');
    const grade = row!.grade;
    for (const s of a.sources) {
      if (s.statedClassYear !== null && grade !== null && s.statedClassYear !== classOf(season, grade)) {
        fail(a.teamSlug, a.fullName, a.club, `${s.kind} source says class of ${s.statedClassYear}, the roster shows grade ${grade}`);
      }
    }
  }
  return file;
}

const playerKey = (teamSlug: string, athleteId: string) => `${teamSlug} ${athleteId}`;

const TEAMS_MERGED = getAllEnrichedRosters();
const file = loadClubs(bundled, TEAMS_MERGED);

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const BY_SLUG = new Map<string, Club>(file.clubs.map((c) => [c.slug, c]));
/** Every club has an entry, an empty one when no tracked player is tied to it. File order. */
const BY_CLUB = new Map<string, ClubAffiliation[]>(file.clubs.map((c) => [c.slug, []]));
const BY_TEAM = new Map<string, ClubAffiliation[]>();
const BY_PLAYER = new Map<string, ClubAffiliation[]>();
for (const a of file.affiliations) {
  push(BY_CLUB, a.club, a);
  push(BY_TEAM, a.teamSlug, a);
  push(BY_PLAYER, playerKey(a.teamSlug, a.athleteId), a);
}

/**
 * A player's clubs: current first, then unknown, then past (file order within each), so a reader
 * meets what is true now before what was only listed, or what was.
 */
const STATUS_RANK: Record<ClubAffiliation['status'], number> = { current: 0, unknown: 1, past: 2 };
for (const list of BY_PLAYER.values()) list.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

/** The merged roster row each tied player joined to at load time, by `playerKey`. */
const ROW_BY_PLAYER = new Map<string, MergedPlayer>();
for (const team of TEAMS_MERGED) {
  for (const p of team.players) {
    if (p.athleteId !== null && BY_PLAYER.has(playerKey(team.slug, p.athleteId))) {
      ROW_BY_PLAYER.set(playerKey(team.slug, p.athleteId), p);
    }
  }
}

/** The name a club goes by on this site: its short name when it has one ("SF Hawks"), else its name. */
export function clubDisplayName(club: Pick<Club, 'name' | 'shortName'>): string {
  return club.shortName ?? club.name;
}

/**
 * Display order (DESIGN §17.5): region in CLUB_REGIONS order, then the most tied players
 * first, then display name. /clubs, the sitemap and generateStaticParams all use it, so the first
 * club page is the fullest one.
 */
const ORDERED: readonly Club[] = [...file.clubs].sort(
  (a, b) =>
    CLUB_REGIONS.indexOf(a.region) - CLUB_REGIONS.indexOf(b.region) ||
    BY_CLUB.get(b.slug)!.length - BY_CLUB.get(a.slug)!.length ||
    clubDisplayName(a).localeCompare(clubDisplayName(b)),
);

/** The whole file: capturedAt, notes and builtBy, as well as the records. */
export function getClubsFile(): ClubsFile {
  return file;
}

/** Every club, in display order (DESIGN §17.5). */
export function getClubs(): readonly Club[] {
  return ORDERED;
}

export function getClub(slug: string): Club | undefined {
  return BY_SLUG.get(slug);
}

/** Every club slug, in display order: generateStaticParams and the sitemap. */
export function getClubSlugs(): string[] {
  return ORDERED.map((c) => c.slug);
}

/** The affiliations tied to one club, in file order (the view sorts); [] for an unknown slug. */
export function getClubAffiliations(slug: string): readonly ClubAffiliation[] {
  return BY_CLUB.get(slug) ?? [];
}

/** Every affiliation of one team's players, in file order. */
export function getTeamClubAffiliations(teamSlug: TeamSlug): readonly ClubAffiliation[] {
  return BY_TEAM.get(teamSlug) ?? [];
}

/** One player's clubs: current, then unknown, then past. [] for a player no source ties to a club. */
export function getPlayerClubs(teamSlug: TeamSlug, athleteId: string): readonly ClubAffiliation[] {
  return BY_PLAYER.get(playerKey(teamSlug, athleteId)) ?? [];
}

/**
 * The merged roster row an affiliation joined to at load time: the name, grade and level the team
 * page shows. Every affiliation has one (loadClubs checked), so this throws only for a team and
 * athleteId no affiliation names.
 */
export function getAffiliatedPlayer(a: Pick<ClubAffiliation, 'teamSlug' | 'athleteId'>): MergedPlayer {
  const row = ROW_BY_PLAYER.get(playerKey(a.teamSlug, a.athleteId));
  if (!row) throw new Error(`lib/clubs.ts: no roster row for ${a.teamSlug} / ${a.athleteId}`);
  return row;
}

/** The areas notes[] says were swept for clubs; /clubs names those that hold none. */
export const SEARCHED_REGIONS: readonly ClubRegion[] = [
  'san-francisco',
  'peninsula',
  'south-bay',
  'east-bay',
  'marin',
  'central-coast',
];
