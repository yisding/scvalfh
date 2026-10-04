/**
 * The Zod contract for data/player-stats.json — each team's MaxPreps season player stats, joined
 * to data/rosters.json on the career id (SPEC §1.1k).
 *
 * Separate from lib/player-stats.ts (the read API, which imports the file) so
 * scripts/fetch-player-stats.ts can validate what it is about to write without importing what it
 * is about to overwrite — the same split as lib/rosters-schema.ts / lib/rosters.ts.
 *
 * Player stats cover every registry team, all five leagues, like the rosters they join to: slugs
 * and team ids are checked against the 49-team registry, and the file holds exactly one entry per
 * team.
 *
 * Invariants:
 *   1. exactly one team per registry team (49), unique slugs, each with its registry id
 *   2. a stat the team does not track is null for every player; a tracked one is a number or null
 *      (null only when the player is missing from the table that carries it)
 *   3. a team's status says what its players[] are: read this run, published nothing, carried
 *      forward after a failure, nothing at all after a failure, or nothing yet because no run
 *      has covered the team ('pending')
 *   4. counts are recomputed from the rows, never trusted from the file
 */

import { z } from 'zod';

import { contentKey } from './fetch-scope';
import { httpUrl, slugId } from './schema-primitives';
import { TEAMS, getTeamBySlug } from './teams';

/** Player stats cover every registry team, all five leagues: one entry per team of TEAMS. */
const STATS_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));
/** How many teams a player-stats file holds: TEAMS.length (49). */
export const PLAYER_STATS_TEAM_COUNT = STATS_SLUGS.size;

/** What a field player's line can hold, in display order. */
export const FIELD_STAT_KEYS = [
  'gamesPlayed',
  'minutes',
  'goals',
  'assists',
  'points',
  'shots',
  'shotsOnGoal',
  'gameWinningGoals',
  'steals',
] as const;

/** What a goalkeeper's line can hold, in display order. */
export const GOALIE_STAT_KEYS = [
  'gamesPlayed',
  'minutes',
  'overtimeMinutes',
  'opponentShotsOnGoal',
  'saves',
  'goalsAgainst',
  'shutouts',
  'wins',
  'losses',
  'ties',
] as const;

export type FieldStatKey = (typeof FIELD_STAT_KEYS)[number];
export type GoalieStatKey = (typeof GOALIE_STAT_KEYS)[number];
export type FieldStats = Record<FieldStatKey, number | null>;
export type GoalieStats = Record<GoalieStatKey, number | null>;

const teamSlug = slugId.refine((slug) => STATS_SLUGS.has(slug), 'not a registry team slug');

const stat = z.number().min(0).nullable();
const fieldKey = z.enum(FIELD_STAT_KEYS);
const goalieKey = z.enum(GOALIE_STAT_KEYS);

export const FieldStatsSchema = z.object(
  Object.fromEntries(FIELD_STAT_KEYS.map((k) => [k, stat])) as Record<string, typeof stat>,
);
export const GoalieStatsSchema = z.object(
  Object.fromEntries(GOALIE_STAT_KEYS.map((k) => [k, stat])) as Record<string, typeof stat>,
);

export const PlayerStatLineSchema = z.object({
  /** The `?careerid=` key: the join to data/rosters.json. */
  careerId: z.string().min(1).nullable(),
  careerUrl: httpUrl.nullable(),
  /** The roster row's per-season id, when the join found one. */
  athleteId: z.string().min(1).nullable(),
  /** The roster's spelling when joined, else the stats sheet's short form. */
  fullName: z.string().min(1),
  /** As the stats sheet prints it: "K. Tsiagkas". */
  shortName: z.string().min(1),
  /** The stats sheet's number. */
  jersey: z.string().min(1).nullable(),
  /** false when the stats sheet names a player the roster does not list. */
  onRoster: z.boolean(),
  field: FieldStatsSchema.nullable(),
  goalkeeping: GoalieStatsSchema.nullable(),
});

export const TeamPlayerStatsStatus = z.enum(['ok', 'none', 'carried-forward', 'error', 'pending']);

export const TeamPlayerStatsSchema = z
  .object({
    slug: teamSlug,
    teamId: z.string().min(1),
    name: z.string().min(1),
    maxprepsTeamId: z.string().min(1).nullable(),
    /** MaxPreps' human-facing stats page for the team. */
    statsUrl: httpUrl.nullable(),
    /**
     * ok              rows were read this run
     * none            MaxPreps answered "No data was found": the coach has entered no stats
     * carried-forward this run failed for this team; players[] are the previous file's rows
     * error           this run failed and there was nothing to carry forward
     * pending         no run has covered this team yet (a league left out of a `--leagues` run, or
     *                 a team added to the registry since the file was built): nothing was
     *                 fetched, so nothing is claimed — not even "the coach entered no stats"
     */
    status: TeamPlayerStatsStatus,
    /** MaxPreps' own "last updated" stamp (naive local time). */
    lastUpdated: z.string().min(1).nullable(),
    tracked: z.object({ field: z.array(fieldKey), goalkeeping: z.array(goalieKey) }),
    totals: z.object({
      field: z.partialRecord(fieldKey, z.number().min(0)),
      goalkeeping: z.partialRecord(goalieKey, z.number().min(0)),
    }),
    players: z.array(PlayerStatLineSchema),
    warnings: z.array(z.string()),
    /** When THESE rows were read — older than the file's stamp when carried forward. */
    fetchedAt: z.string().nullable(),
    error: z.string().nullable(),
  })
  .refine((t) => t.status !== 'ok' || t.players.length > 0, 'status ok needs players')
  .refine(
    (t) => (t.status !== 'none' && t.status !== 'error' && t.status !== 'pending') || t.players.length === 0,
    'status none / error / pending cannot have players',
  )
  .refine(
    (t) => t.status !== 'pending' || (t.fetchedAt === null && t.maxprepsTeamId === null && t.lastUpdated === null),
    'status pending means nothing was read: no fetchedAt, no page id, no last-updated stamp',
  )
  .refine((t) => getTeamBySlug(t.slug)?.id === t.teamId, "teamId is not the registry team's")
  .refine(
    (t) => (t.status === 'carried-forward' || t.status === 'error') === (t.error !== null),
    'error is set exactly when the fetch failed',
  )
  .refine((t) => {
    const field = new Set<string>(t.tracked.field);
    const goalie = new Set<string>(t.tracked.goalkeeping);
    return t.players.every(
      (p) =>
        Object.entries(p.field ?? {}).every(([k, v]) => v === null || field.has(k)) &&
        Object.entries(p.goalkeeping ?? {}).every(([k, v]) => v === null || goalie.has(k)),
    );
  }, 'a stat the team does not track must be null for every player');

export const PlayerStatsCountsSchema = z.object({
  teams: z.number().int(),
  /** Teams with at least one player stat line. */
  teamsWithStats: z.number().int(),
  players: z.number().int(),
  goalkeepers: z.number().int(),
  /** Teams whose status is carried-forward or error. */
  errors: z.number().int(),
});

const PlayerStatsShape = z.object({
  season: z.string().min(1),
  /** ISO UTC, when the run started. */
  fetchedAt: z.string().min(1),
  source: z.object({
    id: z.literal('maxpreps-api'),
    builtBy: z.string().min(1),
    notes: z.array(z.string()),
  }),
  teams: z.array(TeamPlayerStatsSchema),
  counts: PlayerStatsCountsSchema,
});

/**
 * Any player-stats file whose teams are valid, unique and correctly counted — possibly not every
 * registry team. scripts/fetch-player-stats.ts reads the PREVIOUS file with this, so one written
 * before the other leagues were added (15 SCVAL teams), or before a team joined the registry,
 * still supplies the rows a failed team carries forward. The file the site loads is
 * PlayerStatsFileSchema.
 */
export const PlayerStatsPartialSchema = PlayerStatsShape
  .refine((f) => new Set(f.teams.map((t) => t.slug)).size === f.teams.length, 'team slugs are not unique')
  .refine((f) => {
    const c = countPlayerStats(f.teams);
    return (Object.keys(c) as Array<keyof typeof c>).every((k) => c[k] === f.counts[k]);
  }, 'counts do not match the rows');

/** The file the site loads: exactly one entry per registry team. */
export const PlayerStatsFileSchema = PlayerStatsPartialSchema.refine(
  (f) => f.teams.length === PLAYER_STATS_TEAM_COUNT,
  `expected one entry per registry team (${PLAYER_STATS_TEAM_COUNT})`,
);

export type PlayerStatLine = z.infer<typeof PlayerStatLineSchema>;
export type TeamPlayerStats = z.infer<typeof TeamPlayerStatsSchema>;
export type PlayerStatsCounts = z.infer<typeof PlayerStatsCountsSchema>;
export type PlayerStatsFile = z.infer<typeof PlayerStatsFileSchema>;

/** The one place the summary numbers are computed; the schema refuses a file that disagrees. */
export function countPlayerStats(teams: readonly TeamPlayerStats[]): PlayerStatsCounts {
  const players = teams.flatMap((t) => t.players);
  return {
    teams: teams.length,
    teamsWithStats: teams.filter((t) => t.players.length > 0).length,
    players: players.length,
    goalkeepers: players.filter((p) => p.goalkeeping !== null).length,
    errors: teams.filter((t) => t.status === 'carried-forward' || t.status === 'error').length,
  };
}

/**
 * The file's content with every `fetchedAt` and `error` dropped and keys sorted. Two files with the
 * same key differ only in when they were read and in a failure's message text (which can carry a
 * duration or request id), so scripts/fetch-player-stats.ts leaves the old one in place and the
 * scheduled refresh (.github/workflows/update-data.yml) has nothing to commit — the same job
 * data/snapshot.meta.json's `contentHash` does for the snapshot. A team's `status` stays in the
 * key, so a team going from ok to carried-forward still counts as a change.
 */
export function playerStatsContentKey(file: PlayerStatsFile): string {
  return contentKey(file, ['fetchedAt', 'error']);
}
