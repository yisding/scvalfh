/**
 * The Zod contract for data/jv.json — every registry school's JV games: MaxPreps' JV schedule
 * feeds, plus the scored si.com JV finals that lib/jv-merge.ts may supplement them with.
 *
 * Separate from lib/jv.ts (the read API, which imports the file) so scripts/fetch-jv.ts can
 * validate what it is about to write without importing what it is about to overwrite — the same
 * split as lib/player-stats-schema.ts / lib/player-stats.ts.
 *
 * The file stores what each source said, not a blend: `games` are MaxPreps' JV contests exactly as
 * lib/normalize.ts builds a varsity game from a schedule row, and `sblive` are si.com's scored JV
 * finals. What the site shows is `mergeJv(games, sblive, today)`, a pure function of the file, so
 * a failed feed's rows can be carried forward per source and the merge is decided again on every
 * load.
 *
 * Invariants:
 *   1. exactly one team per registry team (49), in registry order, each with its registry id
 *   2. every game is a valid Game (the snapshot's own GameSchema: never 0-0 on a non-final, a final
 *      has two numbers), a MaxPreps contest (never `sblive:`), unique, with a registry side
 *   3. every si.com row is a scored final, unique by si.com game id, with at least one side whose
 *      si.com JV team id is a registry school's, and two different teams
 *   4. a team's status says what the run did for it, per source; counts are recomputed, never trusted
 *   5. stored JV games are unclassified (countsFor and postseason null): the file holds what MaxPreps
 *      said, and lib/jv-standings.ts decides at load which JV table a game counts for, from its
 *      varsity counterpart
 */

import { z } from 'zod';

import { JV_SLUG_BY_SBLIVE_ID } from './jv-teams';
import { dateKey, httpUrl, slugId } from './schema-primitives';
import { GameSchema } from './snapshot-schema';
import { contentKey } from './stable-json';
import { TEAMS, getTeamBySlug } from './teams';

const JV_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));
/** How many teams a JV file holds: TEAMS.length (49). */
export const JV_TEAM_COUNT = JV_SLUGS.size;

const teamSlug = slugId.refine((slug) => JV_SLUGS.has(slug), 'not a registry team slug');

/**
 * One source's outcome for one team in the latest run:
 *   ok              read this run (an empty JV schedule is ok with rowCount 0)
 *   carried-forward this run failed for the team; its rows are the previous file's
 *   error           this run failed and there was nothing to carry forward
 *   pending         no run has covered the team yet (outside a `--leagues` run)
 *   unavailable     si.com only: the school has no JV team page there (JV_SBLIVE_PATHS)
 */
export const JvSourceStatus = z.enum(['ok', 'carried-forward', 'error', 'pending', 'unavailable']);

const sourceState = z
  .object({
    status: JvSourceStatus,
    /** Rows the source returned for this team (non-deleted MaxPreps contests, si.com game rows). */
    rowCount: z.number().int().min(0).nullable(),
    /** When THESE rows were read — older than the file's stamp when carried forward. */
    fetchedAt: z.string().nullable(),
    error: z.string().nullable(),
  })
  .refine(
    (s) => (s.status === 'carried-forward' || s.status === 'error') === (s.error !== null),
    'error is set exactly when the fetch failed',
  )
  .refine(
    (s) => (s.status === 'ok' || s.status === 'carried-forward') === (s.rowCount !== null && s.fetchedAt !== null),
    'rowCount and fetchedAt are set exactly when rows were read (now or carried)',
  );

export const JvTeamSchema = z
  .object({
    slug: teamSlug,
    teamId: z.string().min(1),
    name: z.string().min(1),
    /** MaxPreps' human-facing JV schedule page. */
    maxprepsScheduleUrl: httpUrl.nullable(),
    /** The JV team's si.com games page, when si.com has one. */
    sbliveUrl: httpUrl.nullable(),
    maxpreps: sourceState,
    sblive: sourceState,
  })
  .refine((t) => getTeamBySlug(t.slug)?.id === t.teamId, "teamId is not the registry team's")
  .refine((t) => t.maxpreps.status !== 'unavailable', 'MaxPreps is never unavailable: every school has a JV feed')
  .refine((t) => (t.sblive.status === 'unavailable') === (t.sbliveUrl === null), 'si.com is unavailable exactly when there is no JV page');

const sbliveSide = z.object({
  /** Our slug when si.com's JV team id is a registry school's JV (JV_SLUG_BY_SBLIVE_ID); never by name. */
  slug: teamSlug.nullable(),
  sbliveTeamId: z.string().regex(/^\d+$/).nullable(),
  /** si.com's display name, verbatim. */
  name: z.string().min(1),
  score: z.number().int().min(0),
  /** si.com's `isHome` for this side; null when it does not say. */
  isHome: z.boolean().nullable(),
});

export const JvSbliveRowSchema = z
  .object({
    sbliveGameId: z.string().regex(/^\d+$/),
    /** ISO with offset, as si.com published it. */
    dateIso: z.string().min(10),
    /** YYYY-MM-DD in America/Los_Angeles. */
    dateKey,
    url: httpUrl.nullable(),
    sides: z.tuple([sbliveSide, sbliveSide]),
    /** The registry teams whose JV page listed the game (sorted). */
    pages: z.array(teamSlug).min(1),
    /** Two pages listed this game with different scores: the merge never uses it. */
    copiesDisagree: z.boolean(),
  })
  .refine((r) => r.sides.some((s) => s.slug !== null), 'a si.com JV row needs a registry side')
  .refine((r) => r.sides[0].slug === null || r.sides[0].slug !== r.sides[1].slug, 'a si.com JV row cannot pit a team against itself')
  .refine(
    (r) => r.sides.every((s) => s.slug === null || (s.sbliveTeamId !== null && JV_SLUG_BY_SBLIVE_ID.get(s.sbliveTeamId) === s.slug)),
    "a side's slug must come from its si.com JV team id",
  )
  .refine((r) => r.pages.every((p, i) => i === 0 || r.pages[i - 1] < p), 'pages are sorted and unique');

export const JvGameSchema = GameSchema.refine((g) => !g.contestId.startsWith('sblive:'), 'stored JV games are MaxPreps contests')
  .refine((g) => g.home.slug !== null || g.away.slug !== null, 'a JV game needs a registry side')
  .refine((g) => g.countsFor === null && g.postseason === null, 'stored JV games are unclassified: lib/jv-standings.ts classifies them at load');

export const JvCountsSchema = z.object({
  teams: z.number().int(),
  /** Teams with at least one MaxPreps JV game in the file. */
  teamsWithGames: z.number().int(),
  games: z.number().int(),
  finals: z.number().int(),
  sbliveRows: z.number().int(),
  /** Teams where either source is carried-forward or error. */
  errors: z.number().int(),
});

const JvShape = z.object({
  season: z.string().min(1),
  /** ISO UTC, when the run started. "Today" for the merge is this stamp's Pacific date. */
  fetchedAt: z.string().min(1),
  /** The MaxPreps JV season id the games were read with. */
  sportSeasonId: z.string().min(1),
  source: z.object({ builtBy: z.string().min(1), notes: z.array(z.string()) }),
  teams: z.array(JvTeamSchema),
  games: z.array(JvGameSchema),
  sblive: z.array(JvSbliveRowSchema),
  counts: JvCountsSchema,
});

/** The file the site loads, and the one the fetch script writes. */
export const JvFileSchema = JvShape.refine(
  (f) => f.teams.length === JV_TEAM_COUNT && f.teams.every((t, i) => t.slug === TEAMS[i].slug),
  `expected one entry per registry team (${JV_TEAM_COUNT}), in registry order`,
)
  .refine((f) => new Set(f.games.map((g) => g.contestId)).size === f.games.length, 'game contest ids are not unique')
  .refine((f) => new Set(f.sblive.map((r) => r.sbliveGameId)).size === f.sblive.length, 'si.com game ids are not unique')
  .refine((f) => {
    const c = countJv(f.teams, f.games, f.sblive);
    return (Object.keys(c) as Array<keyof JvCounts>).every((k) => c[k] === f.counts[k]);
  }, 'counts do not match the rows');

export type JvSourceState = z.infer<typeof sourceState>;
export type JvTeam = z.infer<typeof JvTeamSchema>;
export type JvSbliveRow = z.infer<typeof JvSbliveRowSchema>;
export type JvCounts = z.infer<typeof JvCountsSchema>;
export type JvFile = z.infer<typeof JvFileSchema>;

/** The one place the summary numbers are computed; the schema refuses a file that disagrees. */
export function countJv(
  teams: readonly JvTeam[],
  games: ReadonlyArray<{ status: string; home: { slug: string | null }; away: { slug: string | null } }>,
  sblive: readonly unknown[],
): JvCounts {
  const withGames = new Set(games.flatMap((g) => [g.home.slug, g.away.slug]));
  const failed = (s: JvSourceState) => s.status === 'carried-forward' || s.status === 'error';
  return {
    teams: teams.length,
    teamsWithGames: teams.filter((t) => withGames.has(t.slug)).length,
    games: games.length,
    finals: games.filter((g) => g.status === 'final').length,
    sbliveRows: sblive.length,
    errors: teams.filter((t) => failed(t.maxpreps) || failed(t.sblive)).length,
  };
}

/**
 * The file's content with every `fetchedAt` and `error` dropped and keys sorted: two files with
 * the same key differ only in when they were read, so scripts/fetch-jv.ts leaves the old one in
 * place and the scheduled refresh has nothing to commit (as playerStatsContentKey does).
 */
export function jvContentKey(file: JvFile): string {
  return contentKey(file, ['fetchedAt', 'error']);
}
