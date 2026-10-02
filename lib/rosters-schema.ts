/**
 * The Zod contract for data/rosters.json — the 16 teams' MaxPreps rosters (SPEC §1.1j).
 *
 * Separate from lib/rosters.ts (the read API, which imports the file) so scripts/fetch-rosters.ts
 * can validate what it is about to write without importing what it is about to overwrite — the
 * same split as lib/snapshot-schema.ts / lib/data.ts.
 *
 * Invariants:
 *   1. exactly 16 teams, unique slugs, one per registry team
 *   2. grade and its label are set together or null together, and agree
 *   3. position is exactly positions joined with ", " (what MaxPreps' table prints)
 *   4. height and heightInches are set together or null together
 *   5. a team's status says what its players[] are: read this run, empty upstream, carried forward
 *      from the previous file after a failure, or nothing at all
 *   6. counts are recomputed from the rows, never trusted from the file
 */

import { z } from 'zod';

const teamSlug = z.enum([
  'cupertino', 'fremont', 'homestead', 'los-altos', 'saint-francis',
  'st-ignatius', 'valley-christian', 'wilcox',
  'los-gatos', 'lynbrook', 'mitty', 'monta-vista',
  'palo-alto', 'presentation', 'santa-clara', 'saratoga',
]);

/** Same scheme check as lib/snapshot-schema.ts: these end up in an href. */
const httpUrl = z
  .string()
  .refine((v) => /^https?:\/\/\S+$/i.test(v), 'expected an http(s) URL');

export const GRADE_CLASSES = ['Fr.', 'So.', 'Jr.', 'Sr.'] as const;

export const RosterPlayerSchema = z
  .object({
    /** MaxPreps per-season athlete GUID. */
    athleteId: z.string().min(1).nullable(),
    /** MaxPreps per-season roster-membership GUID. */
    rosterId: z.string().min(1).nullable(),
    /** MaxPreps' stable person id. */
    careerProfileId: z.string().min(1).nullable(),
    /** The `?careerid=` short key in the career URL. */
    careerId: z.string().min(1).nullable(),
    firstName: z.string().min(1).nullable(),
    lastName: z.string().min(1).nullable(),
    fullName: z.string().min(1),
    /** A string on purpose: "00" and "21/88" occur. */
    jersey: z.string().min(1).nullable(),
    grade: z.number().int().min(9).max(12).nullable(),
    gradeClass: z.enum(GRADE_CLASSES).nullable(),
    positions: z.array(z.string().min(1)),
    position: z.string().min(1).nullable(),
    /** `5'7"`, as MaxPreps prints it. */
    height: z.string().regex(/^\d'\d{1,2}"$/, 'expected feet\'inches"').nullable(),
    heightInches: z.number().int().min(1).nullable(),
    isCaptain: z.boolean(),
    careerUrl: httpUrl.nullable(),
    /** When the row was created on MaxPreps (naive local time). */
    createdOn: z.string().nullable(),
  })
  .refine(
    (p) => (p.grade === null) === (p.gradeClass === null),
    'grade and gradeClass must be set together',
  )
  .refine(
    (p) => p.grade === null || GRADE_CLASSES[p.grade - 9] === p.gradeClass,
    'grade and gradeClass disagree',
  )
  .refine(
    (p) => (p.positions.length ? p.positions.join(', ') : null) === p.position,
    'position must be positions joined with ", "',
  )
  .refine(
    (p) => (p.height === null) === (p.heightInches === null),
    'height and heightInches must be set together',
  );

export const TeamRosterStatus = z.enum(['ok', 'empty', 'carried-forward', 'error']);

export const TeamRosterSchema = z
  .object({
    slug: teamSlug,
    /** The registry id (lib/teams.ts) — the join key to the snapshot. A placeholder for Wilcox. */
    teamId: z.string().min(1),
    /** The GUID the page itself reports; null when the page was not read. */
    maxprepsTeamId: z.string().min(1).nullable(),
    name: z.string().min(1),
    division: z.enum(['de-anza', 'el-camino']),
    rosterUrl: httpUrl.nullable(),
    /**
     * ok              rows were read from the page this run
     * empty           the page was read and MaxPreps publishes no athletes (Wilcox)
     * carried-forward this run failed for this team; players[] are the previous file's rows
     * error           this run failed and there was nothing to carry forward
     */
    status: TeamRosterStatus,
    /** MaxPreps' own count (excludes soft-deleted rows); null when the page was not read. */
    athleteCount: z.number().int().min(0).nullable(),
    staffCount: z.number().int().min(0).nullable(),
    players: z.array(RosterPlayerSchema),
    /** Soft-deleted rows dropped by the parser. */
    deletedRows: z.number().int().min(0),
    warnings: z.array(z.string()),
    /** When THESE rows were read — older than the file's stamp when carried forward. */
    fetchedAt: z.string().nullable(),
    error: z.string().nullable(),
  })
  .refine((t) => t.status !== 'ok' || t.players.length > 0, 'status ok needs players')
  .refine((t) => t.status !== 'empty' || t.players.length === 0, 'status empty cannot have players')
  .refine((t) => t.status !== 'error' || t.players.length === 0, 'status error cannot have players')
  .refine(
    (t) => (t.status === 'carried-forward' || t.status === 'error') === (t.error !== null),
    'error is set exactly when the fetch failed',
  )
  .refine(
    (t) => (t.status === 'ok' || t.status === 'empty') === (t.athleteCount !== null),
    'athleteCount is set exactly when the page was read',
  );

export const RosterCountsSchema = z.object({
  teams: z.number().int(),
  players: z.number().int(),
  withGrade: z.number().int(),
  withPosition: z.number().int(),
  withJersey: z.number().int(),
  withHeight: z.number().int(),
  captains: z.number().int(),
  /** Teams whose status is carried-forward or error. */
  errors: z.number().int(),
});

export const RostersSchema = z
  .object({
    season: z.string().min(1),
    /** ISO UTC, when the run started. */
    fetchedAt: z.string().min(1),
    source: z.object({
      id: z.literal('maxpreps-html'),
      builtBy: z.string().min(1),
      notes: z.array(z.string()),
    }),
    teams: z.array(TeamRosterSchema).length(16),
    counts: RosterCountsSchema,
  })
  .refine((r) => new Set(r.teams.map((t) => t.slug)).size === 16, 'team slugs are not unique')
  .refine((r) => {
    const c = countRosters(r.teams);
    return (Object.keys(c) as Array<keyof typeof c>).every((k) => c[k] === r.counts[k]);
  }, 'counts do not match the rows');

export type RosterPlayer = z.infer<typeof RosterPlayerSchema>;
export type TeamRoster = z.infer<typeof TeamRosterSchema>;
export type RosterCounts = z.infer<typeof RosterCountsSchema>;
export type Rosters = z.infer<typeof RostersSchema>;

/** The one place the summary numbers are computed; the schema refuses a file that disagrees. */
export function countRosters(teams: readonly TeamRoster[]): RosterCounts {
  const players = teams.flatMap((t) => t.players);
  return {
    teams: teams.length,
    players: players.length,
    withGrade: players.filter((p) => p.grade !== null).length,
    withPosition: players.filter((p) => p.position !== null).length,
    withJersey: players.filter((p) => p.jersey !== null).length,
    withHeight: players.filter((p) => p.height !== null).length,
    captains: players.filter((p) => p.isCaptain).length,
    errors: teams.filter((t) => t.status === 'carried-forward' || t.status === 'error').length,
  };
}
