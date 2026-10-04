/**
 * The read API for data/commits.json — which players on the tracked varsity rosters a public
 * page says have committed to play a sport in college (field hockey or any other), and those
 * colleges with the team in each sport a player committed to (SPEC §1.1j3, DESIGN §21).
 *
 * The file is research, written by hand and checked twice; no script rebuilds it (see
 * lib/commits-schema.ts). It is imported so the build bundles it, for the reason lib/rosters.ts
 * gives: a Worker has no project filesystem. It is validated once at module scope — the schema,
 * then the join to the rosters the schema cannot see — so a bad file fails at import time rather
 * than half-way through a render. There is no env override, for lib/clubs.ts' reason: nothing
 * writes the file, and the tests that need a bad one build it in memory and pass it to `loadCommits`.
 *
 * The join, on team slug + MaxPreps athleteId, is against the MERGED rosters
 * (`getAllEnrichedRosters`), so the checks see the grade and level a reader sees. Every commitment
 * must:
 *   1. join to a row of that team, under the row's own fullName
 *   2. not be a JV row (the overlay's `level`): the pages list varsity rows only
 *   3. agree with every class year a source states: with the row's grade when it has one, else
 *      with each other, and be a class a high school roster of the season can hold (a player with
 *      no grade anywhere still gets one class year, or none)
 * and the file's `season` must be rosters.json's.
 *
 * A roster refetch can break this, as it can data/clubs.json. If `pnpm fetch-rosters` drops a
 * committed player's row or respells the name, or a season rollover changes `season`, this module
 * throws at import — and so `pnpm test` and the build fail — naming the team, the player and the
 * college. Re-check that commitment's sources, then edit or drop it by hand. Never prune it
 * automatically. (A rollover is also when the seniors graduate: the file is redone for the new
 * season, not carried.)
 */

import bundled from '../data/commits.json';
import {
  COLLEGE_DIVISIONS,
  CommitsFileSchema,
  type College,
  type CollegeProgram,
  type Commitment,
  type CommitsFile,
} from './commits-schema';
import { classOf, getAllEnrichedRosters, getRosters, type MergedPlayer, type MergedTeamRoster } from './rosters';
import { getTeamBySlug } from './teams';
import type { TeamSlug } from './types';

export type {
  College,
  CollegeDivision,
  CollegeProgram,
  CollegeSource,
  CommitConfidence,
  CommitSource,
  CommitSourceKind,
  CommitSport,
  CommitStatus,
  Commitment,
  CommitsFile,
} from './commits-schema';

/**
 * Parse `raw` against the contract, then check the join the schema cannot see (see the header).
 * Throws on the first failure: a schema failure lists the first ten issues with their paths, a
 * join failure reads `commits: <team> / <player> (<college>): <what>`. Runs once at module scope on
 * the bundled file; the tests call it on files built in memory.
 */
export function loadCommits(
  raw: unknown,
  teams: readonly MergedTeamRoster[] = getAllEnrichedRosters(),
  season: string = getRosters().season,
): CommitsFile {
  const parsed = CommitsFileSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`commits failed validation:\n${lines.join('\n')}`);
  }
  const file = parsed.data;
  if (file.season !== season) {
    throw new Error(`commits.json is for season ${file.season}, rosters for ${season}`);
  }
  const fail = (team: string, who: string, college: string, what: string): never => {
    throw new Error(`commits: ${team} / ${who} (${college}): ${what}`);
  };
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  for (const c of file.commitments) {
    const team = bySlug.get(c.teamSlug);
    if (!team) fail(c.teamSlug, c.fullName, c.college, 'no such team in rosters.json');
    const row = team!.players.find((p) => p.athleteId === c.athleteId);
    if (!row) fail(c.teamSlug, c.fullName, c.college, `athleteId ${c.athleteId} is not a MaxPreps row of this team`);
    if (c.fullName !== row!.fullName) fail(c.teamSlug, c.fullName, c.college, `MaxPreps spells this player "${row!.fullName}"`);
    if (row!.level === 'jv') fail(c.teamSlug, c.fullName, c.college, 'a JV row: commitments list varsity rows only');
    const grade = row!.grade;
    const stated = [...new Set(c.sources.flatMap((s) => (s.statedClassYear === null ? [] : [s.statedClassYear])))];
    if (grade !== null) {
      for (const s of c.sources) {
        if (s.statedClassYear !== null && s.statedClassYear !== classOf(season, grade)) {
          fail(c.teamSlug, c.fullName, c.college, `${s.kind} source says class of ${s.statedClassYear}, the roster shows grade ${grade}`);
        }
      }
    } else if (stated.length > 1) {
      fail(c.teamSlug, c.fullName, c.college, `sources disagree on the class year (${stated.join(', ')}) and the roster has no grade`);
    } else if (stated.length === 1 && (stated[0] < classOf(season, 12) || stated[0] > classOf(season, 9))) {
      // A roster row is a 9th- to 12th-grader: any other class year is a graduate, or someone else.
      fail(c.teamSlug, c.fullName, c.college, `a source says class of ${stated[0]}, not a class on a ${season} high school roster`);
    }
  }
  return file;
}

const playerKey = (teamSlug: string, athleteId: string) => `${teamSlug} ${athleteId}`;

const TEAMS_MERGED = getAllEnrichedRosters();
const SEASON = getRosters().season;
const file = loadCommits(bundled, TEAMS_MERGED, SEASON);

/** The merged roster row each committed player joined to at load time, by `playerKey`. */
const ROW_BY_PLAYER = new Map<string, MergedPlayer>();
{
  const wanted = new Set(file.commitments.map((c) => playerKey(c.teamSlug, c.athleteId)));
  for (const team of TEAMS_MERGED) {
    for (const p of team.players) {
      if (p.athleteId !== null && wanted.has(playerKey(team.slug, p.athleteId))) {
        ROW_BY_PLAYER.set(playerKey(team.slug, p.athleteId), p);
      }
    }
  }
}

/**
 * The merged roster row a commitment joined to at load time: the name, grade and level the team
 * page shows. Every commitment has one (loadCommits checked), so this throws only for a team and
 * athleteId no commitment names.
 */
export function getCommittedPlayer(c: Pick<Commitment, 'teamSlug' | 'athleteId'>): MergedPlayer {
  const row = ROW_BY_PLAYER.get(playerKey(c.teamSlug, c.athleteId));
  if (!row) throw new Error(`lib/commits.ts: no roster row for ${c.teamSlug} / ${c.athleteId}`);
  return row;
}

/**
 * The class a committed player graduates with: the roster grade's (MaxPreps', else the overlay's),
 * else the one class year the sources state (loadCommits checked they agree), else null.
 */
export function commitClassOf(c: Commitment): number | null {
  const grade = getCommittedPlayer(c).grade;
  if (grade !== null) return classOf(SEASON, grade);
  return c.sources.find((s) => s.statedClassYear !== null)?.statedClassYear ?? null;
}

/** The name a college goes by on this site: its short name when it has one ("Stanford"), else its name. */
export function collegeDisplayName(college: Pick<College, 'name' | 'shortName'>): string {
  return college.shortName ?? college.name;
}

const BY_SLUG = new Map<string, College>(file.colleges.map((c) => [c.slug, c]));
const BY_COLLEGE = new Map<string, Commitment[]>(file.colleges.map((c) => [c.slug, []]));
const BY_PLAYER = new Map<string, Commitment>();
for (const c of file.commitments) {
  BY_COLLEGE.get(c.college)!.push(c);
  BY_PLAYER.set(playerKey(c.teamSlug, c.athleteId), c);
}

const schoolName = (slug: string) => getTeamBySlug(slug)?.name ?? slug;
const sortName = (p: MergedPlayer) => p.lastName ?? p.fullName;

/**
 * Display order (DESIGN §21.1): the earliest class first (class year unknown last), then school,
 * then the roster's own name order (lib/rosters.ts sortedPlayers' byName). /commits, and the order
 * a college's players are named in.
 */
const ORDERED: readonly Commitment[] = [...file.commitments]
  .map((c) => ({ c, cls: commitClassOf(c), school: schoolName(c.teamSlug), p: getCommittedPlayer(c) }))
  .sort(
    (x, y) =>
      (x.cls ?? Number.POSITIVE_INFINITY) - (y.cls ?? Number.POSITIVE_INFINITY) ||
      x.school.localeCompare(y.school) ||
      sortName(x.p).localeCompare(sortName(y.p)) ||
      x.p.fullName.localeCompare(y.p.fullName),
  )
  .map(({ c }) => c);

/** A college's highest level across its programs: the index in COLLEGE_DIVISIONS (0 = Division I). */
const topLevel = (college: College) => Math.min(...college.programs.map((p) => COLLEGE_DIVISIONS.indexOf(p.division)));

/**
 * Colleges in display order: the most committed players first, then the highest level of any of its
 * programs here (Division I first), then display name.
 */
const COLLEGES_ORDERED: readonly College[] = [...file.colleges].sort(
  (a, b) =>
    BY_COLLEGE.get(b.slug)!.length - BY_COLLEGE.get(a.slug)!.length ||
    topLevel(a) - topLevel(b) ||
    collegeDisplayName(a).localeCompare(collegeDisplayName(b)),
);

/** The whole file: capturedAt, notes and builtBy, as well as the records. */
export function getCommitsFile(): CommitsFile {
  return file;
}

/**
 * The last day anything /commits shows was checked: the research date (`capturedAt`) or, when later,
 * a college record's `checkedOn` (the college facts were read after the commitments). YYYY-MM-DD.
 * The sitemap's `lastModified` for /commits, so the page never claims to predate what it shows.
 */
export function getCommitsLastChecked(): string {
  return [file.capturedAt, ...file.colleges.map((c) => c.checkedOn)].sort().at(-1)!;
}

/** Every commitment, in display order (DESIGN §21.1). */
export function getCommitments(): readonly Commitment[] {
  return ORDERED;
}

/** Every college, in display order: most players, then division, then name. */
export function getColleges(): readonly College[] {
  return COLLEGES_ORDERED;
}

export function getCollege(slug: string): College | undefined {
  return BY_SLUG.get(slug);
}

/**
 * The college team a commitment is to: its college's program in the commitment's sport, which
 * carries the level and conference of that sport. Every commitment has one (the schema checked).
 */
export function commitProgram(c: Pick<Commitment, 'college' | 'sport'>): { college: College; program: CollegeProgram } {
  const college = BY_SLUG.get(c.college);
  const program = college?.programs.find((p) => p.sport === c.sport);
  if (!college || !program) throw new Error(`lib/commits.ts: no ${c.sport} program at ${c.college}`);
  return { college, program };
}

/** The commitments to one college, in display order; [] for an unknown slug. */
export function getCollegeCommitments(slug: string): readonly Commitment[] {
  return ORDERED.filter((c) => c.college === slug);
}

/** Every commitment of one team's players, in display order. */
export function getTeamCommitments(teamSlug: TeamSlug): readonly Commitment[] {
  return ORDERED.filter((c) => c.teamSlug === teamSlug);
}

/** One player's commitment, or null for a player no source says has committed — most rows. */
export function getPlayerCommitment(teamSlug: TeamSlug, athleteId: string): Commitment | null {
  return BY_PLAYER.get(playerKey(teamSlug, athleteId)) ?? null;
}
