/**
 * The Zod contract for data/soccer/prior-commits.json and data/basketball/prior-commits.json: which of
 * LAST season's (2025-26) varsity sophomores and juniors a public page says have committed to, signed with
 * or joined a college team, in their own sport or any other, and those colleges.
 *
 * The files are the 2026-11-18 research record. The commitments of their players who are on a 2026-27 roster were
 * copied into data/soccer/commits.json on 2026-11-21 as ordinary commitments (merged into data/commitments.json on
 * 2026-11-26), and the pages read that file, not these. They are research, written by hand like data/commitments.json, under its rules (README "College
 * commitments"), with two differences:
 *
 *   - The players are last season's, not this season's roster rows. A commitment names its player by
 *     the player registry's id (data/players.json, `playerId`), which outlasts MaxPreps' per-season
 *     athlete ids and is the one key that follows a player from last season's rows into this season's.
 *     `grade` is the player's 2025-26 grade (10 or 11), so the class is 2028 or 2027.
 *   - (Until 2026-11-21 only these files took a two-year college's level; COLLEGE_DIVISIONS has njcaa and cccaa now.)
 *   - A player the registry has never seen (on a team whose 2025-26 stat sheet MaxPreps does not have,
 *     and on no roster since) is named by `careerId` and the season's MaxPreps roster page instead.
 *
 * Invariants (the file-level ones are checkPriorCommitsFile, the join is joinPriorCommits):
 *   1. college slugs are unique, and a college has at most one program per sport
 *   2. every commitment names a college in colleges[] with a program in its sport
 *   3. a player (playerId) has at most one commitment
 *   4. every college and every program has a commitment, and no `asOf` is after `capturedAt`
 *   5-8. as data/commitments.json's (https only, social media only as an official account's post, a source
 *      for every record, quotes of 1-300 characters, `asOf` a day, month or year): the shared pieces
 *      of lib/players/commits-schema.ts
 *   9. the join (joinPriorCommits), against the registry: a player named by `careerId` and `seasonRoster`
 *      (no `playerId`) is one the registry does not know, on its team's MaxPreps roster page of the season; any
 *      other exists in the registry (by id or a former id),
 *      has a varsity stint in the file's sport at `teamSlug` in the file's season or the next, is
 *      known under `fullName`, carries `careerId` when one is given, and agrees with `grade` (the
 *      season's stint grade, the next season's grade minus one, the registry's class year and every
 *      class year a source states)
 *
 * Kept apart from lib/players/registry-file.ts (the one module that reads the registry): the join takes
 * the registry as an argument.
 */

import { z } from 'zod';

import {
  COLLEGE_DIVISIONS,
  COMMIT_CONFIDENCES,
  COMMIT_SPORTS,
  COMMIT_STATUSES,
  CollegeProgramSchema,
  CollegeSchema,
  CommitSourceSchema,
  isCommitDate,
} from './commits-schema';
import type { PlayersFile } from './registry-schema';
import { sourceUrl } from './clubs-schema';
import { calendarDateKey, playerId, slugId } from '../schema-primitives';

/** COLLEGE_DIVISIONS, which has held the two-year colleges' levels (njcaa, cccaa) itself since 2026-11-21. */
export const PRIOR_COLLEGE_DIVISIONS = COLLEGE_DIVISIONS;
export type PriorCollegeDivision = (typeof PRIOR_COLLEGE_DIVISIONS)[number];

/** The sports whose builds have a prior-commits file, and the season its players played. */
export const PRIOR_COMMIT_FILE_SPORTS = ['soccer', 'basketball'] as const;

const text = z.string().min(1);

export const PriorCollegeProgramSchema = CollegeProgramSchema.extend({
  division: z.enum(PRIOR_COLLEGE_DIVISIONS),
});

export const PriorCollegeSchema = CollegeSchema.extend({
  programs: z.array(PriorCollegeProgramSchema).min(1, 'a college needs at least one program'),
});

export const PriorCommitmentSchema = z.object({
  /** The 2025-26 team (a registry team slug of this sport). */
  teamSlug: slugId,
  /**
   * The player registry's id (data/players.json): the join key. Null only for a player the registry
   * has never seen (a team whose 2025-26 stat sheet MaxPreps does not have, and who is on no roster
   * since): such a commitment names the player by `careerId` and `seasonRoster` instead.
   */
  playerId: playerId.nullable(),
  /** MaxPreps' career id: checked against the registry's, and the key when `playerId` is null. */
  careerId: text.nullable(),
  /**
   * The team's MaxPreps roster page for the file's season (`…/<yy-yy>/roster/`), listing the player
   * at `grade`: what a commitment with no `playerId` rests on. Null when `playerId` is set.
   */
  seasonRoster: sourceUrl.nullable(),
  /** As the registry knows the player (one of its `names`). */
  fullName: text,
  /** The player's grade in the file's season: 10 (class of 2028) or 11 (class of 2027). Seniors are out of scope. */
  grade: z.union([z.literal(10), z.literal(11)]),
  college: slugId,
  sport: z.enum(COMMIT_SPORTS),
  status: z.enum(COMMIT_STATUSES),
  asOf: z.string().refine(isCommitDate, 'expected YYYY-MM-DD, YYYY-MM or YYYY').nullable(),
  confidence: z.enum(COMMIT_CONFIDENCES),
  sources: z.array(CommitSourceSchema).min(1, 'a commitment needs at least one source'),
  /** What the match rests on, for maintainers. */
  basis: text,
}).superRefine((c, ctx) => {
  if (c.playerId === null) {
    if (c.careerId === null) issue(ctx, ['careerId'], 'a player the registry does not know needs a career id');
    if (c.seasonRoster === null) issue(ctx, ['seasonRoster'], 'a player the registry does not know needs the season roster page');
  } else if (c.seasonRoster !== null) {
    issue(ctx, ['seasonRoster'], 'only a player the registry does not know cites the season roster page');
  }
});

const PriorCommitsFileObject = z.object({
  builtBy: text,
  capturedAt: calendarDateKey,
  /** The season the players played ("25-26"): data/<sport>/prior-players.json's. */
  season: z
    .string()
    .regex(/^\d{2}-\d{2}$/, 'expected a season like 25-26')
    .refine((v) => (Number(v.slice(0, 2)) + 1) % 100 === Number(v.slice(3)), 'a season runs over two consecutive years'),
  sport: z.enum(PRIOR_COMMIT_FILE_SPORTS),
  notes: z.array(text),
  colleges: z.array(PriorCollegeSchema),
  commitments: z.array(PriorCommitmentSchema),
});

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Invariants 1-4. */
function checkPriorCommitsFile(f: z.infer<typeof PriorCommitsFileObject>, ctx: Ctx): void {
  const slugs = new Set<string>();
  const programs = new Set<string>();
  f.colleges.forEach((c, i) => {
    if (slugs.has(c.slug)) issue(ctx, ['colleges', i, 'slug'], `duplicate college slug ${c.slug}`);
    slugs.add(c.slug);
    c.programs.forEach((p, j) => {
      const key = `${c.slug} ${p.sport}`;
      if (programs.has(key)) issue(ctx, ['colleges', i, 'programs', j, 'sport'], `${c.slug} has two ${p.sport} programs`);
      programs.add(key);
    });
  });
  const players = new Set<string>();
  const committedTo = new Set<string>();
  f.commitments.forEach((c, i) => {
    if (!slugs.has(c.college)) {
      issue(ctx, ['commitments', i, 'college'], `${c.college} is not a college in colleges[]`);
    } else if (!programs.has(`${c.college} ${c.sport}`)) {
      issue(ctx, ['commitments', i, 'sport'], `${c.college} has no ${c.sport} program in colleges[]`);
    }
    committedTo.add(c.college);
    committedTo.add(`${c.college} ${c.sport}`);
    if (c.asOf !== null && c.asOf > f.capturedAt.slice(0, c.asOf.length)) {
      issue(ctx, ['commitments', i, 'asOf'], `${c.asOf} is after the research date ${f.capturedAt}`);
    }
    // A player outside the registry is one career, whatever team the record names.
    const key = c.playerId ?? `career ${c.careerId}`;
    if (players.has(key)) issue(ctx, ['commitments', i], `a second commitment for ${c.fullName}: a player has one`);
    players.add(key);
  });
  f.colleges.forEach((c, i) => {
    if (!committedTo.has(c.slug)) {
      issue(ctx, ['colleges', i], `no commitment names ${c.slug}: drop the college record`);
      return;
    }
    c.programs.forEach((p, j) => {
      if (!committedTo.has(`${c.slug} ${p.sport}`)) {
        issue(ctx, ['colleges', i, 'programs', j], `no ${p.sport} commitment names ${c.slug}: drop the program`);
      }
    });
  });
}

export const PriorCommitsFileSchema = PriorCommitsFileObject.superRefine(checkPriorCommitsFile);

export type PriorCollege = z.infer<typeof PriorCollegeSchema>;
export type PriorCommitment = z.infer<typeof PriorCommitmentSchema>;
export type PriorCommitsFile = z.infer<typeof PriorCommitsFileSchema>;

/** "25-26" → "26-27". */
export function nextSeasonYear(season: string): string {
  const m = /^(\d{2})-(\d{2})$/.exec(season);
  if (!m) throw new Error(`prior-commits: cannot read season "${season}"`);
  const pad = (n: number) => String(n % 100).padStart(2, '0');
  return `${pad(Number(m[1]) + 1)}-${pad(Number(m[2]) + 1)}`;
}

/** The graduation year of a `grade`-th grader in `season` ("25-26", 12 → 2026). */
export function priorClassOf(season: string, grade: number): number {
  const m = /^\d{2}-(\d{2})$/.exec(season);
  if (!m) throw new Error(`prior-commits: cannot read season "${season}"`);
  return 2000 + Number(m[1]) + (12 - grade);
}

/**
 * Invariant 9: every commitment joins to the registry. Throws on the first failure, as
 * `prior-commits: <team> / <player> (<college>): <what>`; returns each commitment's registry record id
 * (the current one, when the file names a former id), for the commitments that name one.
 *
 * `teamPages` maps each tracked team of the file's sport to its MaxPreps team page for the current
 * season (data/<sport>/rosters.json's `rosterUrl` without `roster/`): every commitment's team must be
 * one, and a `seasonRoster` must be that team's page for the file's season (`<team page><season>/roster/`).
 */
export function joinPriorCommits(
  file: PriorCommitsFile,
  registry: PlayersFile,
  teamPages: ReadonlyMap<string, string>,
): Map<string, string> {
  const byId = new Map<string, PlayersFile['players'][number]>();
  for (const p of registry.players) {
    byId.set(p.id, p);
    for (const old of p.formerIds) byId.set(old, p);
  }
  const next = nextSeasonYear(file.season);
  const joined = new Map<string, string>();
  const current = new Set<string>();
  for (const c of file.commitments) {
    const fail = (what: string): never => {
      throw new Error(`prior-commits: ${c.teamSlug} / ${c.fullName} (${c.college}): ${what}`);
    };
    const teamPage = teamPages.get(c.teamSlug) ?? fail(`${c.teamSlug} is not a tracked ${file.sport} team`);
    const cls = priorClassOf(file.season, c.grade);
    for (const s of c.sources) {
      if (s.statedClassYear !== null && s.statedClassYear !== cls) {
        fail(`${s.kind} source says class of ${s.statedClassYear}, grade ${c.grade} in ${file.season} is ${cls}`);
      }
    }
    if (c.playerId === null) {
      // Named by career id and the season's roster page: the registry must not know the player, or the
      // commitment names its id like every other.
      const known = registry.players.find((p) => p.identifiers.some((i) => i.kind === 'maxpreps-career' && i.careerId === c.careerId));
      if (known) fail(`the registry knows career ${c.careerId} as ${known.id}: name the player by playerId`);
      const expected = `${teamPage.replace(/\/*$/, '/')}${file.season}/roster/`;
      if (c.seasonRoster !== expected) fail(`seasonRoster is not ${c.teamSlug}'s ${file.season} roster page (${expected})`);
      continue;
    }
    const p = byId.get(c.playerId) ?? fail(`${c.playerId} is not a player in the registry`);
    const stints = p.stints.filter((s) => s.sport === file.sport && s.team === c.teamSlug && s.level === 'varsity');
    const then = stints.find((s) => s.season === file.season);
    const now = stints.find((s) => s.season === next);
    if (!then && !now) fail(`no ${file.sport} varsity stint at ${c.teamSlug} in ${file.season} or ${next}`);
    if (!p.names.includes(c.fullName)) fail(`the registry knows this player as ${p.names.map((n) => `"${n}"`).join(', ')}`);
    if (c.careerId !== null && !p.identifiers.some((i) => i.kind === 'maxpreps-career' && i.careerId === c.careerId)) {
      fail(`career id ${c.careerId} is not this player's`);
    }
    if (then && then.grade !== null && then.grade !== c.grade) fail(`the registry has grade ${then.grade} in ${file.season}`);
    if (now && now.grade !== null && now.grade !== c.grade + 1) fail(`the registry has grade ${now.grade} in ${next}`);
    if (p.classOf !== null && p.classOf !== cls) fail(`the registry has class of ${p.classOf}, grade ${c.grade} is ${cls}`);
    // A former id and the current one are one player: a second commitment for either is refused.
    if (current.has(p.id)) fail(`a second commitment for registry player ${p.id}: a player has one`);
    current.add(p.id);
    joined.set(c.playerId, p.id);
  }
  return joined;
}
