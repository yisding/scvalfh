/**
 * The Zod contract for data/rosters.json — every registry team's MaxPreps roster, all nine leagues and the five independents
 * (SPEC §1.1j). Slugs, team ids and divisions are checked against the 102-team registry.
 *
 * Separate from lib/rosters.ts (the read API, which imports the file) so scripts/fetch-rosters.ts
 * can validate what it is about to write without importing what it is about to overwrite — the
 * same split as lib/snapshot-schema.ts / lib/data.ts.
 *
 * Invariants:
 *   1. exactly one team per registry team (102), unique slugs, each with its registry id and division
 *   2. grade and its label are set together or null together, and agree
 *   3. position is exactly positions joined with ", " (what MaxPreps' table prints)
 *   4. height and heightInches are set together or null together
 *   5. a team's status says what its players[] are: read this run, empty upstream, carried forward
 *      from the previous file after a failure, nothing at all after a failure, or nothing yet
 *      because no run has covered the team ('pending')
 *   6. counts are recomputed from the rows, never trusted from the file
 */

import { z } from 'zod';

import { ALL_DIVISIONS } from './leagues';
import { dateKey, httpUrl, httpsUrl, slugId } from './schema-primitives';
import { contentKey } from './stable-json';
import { TEAMS, getTeamBySlug } from './teams';

/** Rosters cover every registry team, all nine leagues and the five independents: one entry per team of TEAMS. */
const ROSTER_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));
const ROSTER_DIVISIONS: ReadonlySet<string> = new Set(ALL_DIVISIONS.map((d) => d.id));
/** How many teams a rosters file holds: TEAMS.length (102). */
export const ROSTER_TEAM_COUNT = ROSTER_SLUGS.size;

const teamSlug = slugId.refine((slug) => ROSTER_SLUGS.has(slug), 'not a registry team slug');

const division = slugId.refine((d) => ROSTER_DIVISIONS.has(d), 'not a registry division');

/** A team entry must carry its own registry id and division, not another team's. */
export function agreesWithRegistry(t: { slug: string; teamId: string; division: string }): boolean {
  const team = getTeamBySlug(t.slug);
  return team !== undefined && team.id === t.teamId && team.division === t.division;
}

export const GRADE_CLASSES = ['Fr.', 'So.', 'Jr.', 'Sr.'] as const;

export const RosterPlayerSchema = z
  .object({
    /** MaxPreps per-season athlete GUID: a returning player gets a new one each year. */
    athleteId: z.string().min(1).nullable(),
    /** MaxPreps per-season roster-membership GUID. */
    rosterId: z.string().min(1).nullable(),
    /** MaxPreps' stable person id, the same across seasons. */
    careerProfileId: z.string().min(1).nullable(),
    /** The `?careerid=` short key in the career URL: the public identifier in links. */
    careerId: z.string().min(1).nullable(),
    firstName: z.string().min(1).nullable(),
    lastName: z.string().min(1).nullable(),
    /** As the table prints it. Never empty. */
    fullName: z.string().min(1),
    /** A string on purpose: "00" and "21/88" occur. null when blank. */
    jersey: z.string().min(1).nullable(),
    /** 9–12, or null when the coach left it blank. */
    grade: z.number().int().min(9).max(12).nullable(),
    /** "Sr." / "Jr." / "So." / "Fr.", or null: always in step with `grade`. */
    gradeClass: z.enum(GRADE_CLASSES).nullable(),
    /** position1..3 in order, blanks dropped (F / M / D / G observed). */
    positions: z.array(z.string().min(1)),
    /** `positions` joined with ", ": exactly the table's Position cell; null when blank. */
    position: z.string().min(1).nullable(),
    /** `5'7"`, as MaxPreps prints it; null when heightFeet is blank. */
    height: z.string().regex(/^\d'\d{1,2}"$/, 'expected feet\'inches"').nullable(),
    /** Total inches, or null. */
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

export const TeamRosterStatus = z.enum(['ok', 'empty', 'carried-forward', 'error', 'pending']);

export const TeamRosterSchema = z
  .object({
    slug: teamSlug,
    /** The registry id (lib/teams.ts) — the join key to the snapshot. */
    teamId: z.string().min(1),
    /** The GUID the page itself reports; null when the page was not read. */
    maxprepsTeamId: z.string().min(1).nullable(),
    name: z.string().min(1),
    division,
    rosterUrl: httpUrl.nullable(),
    /**
     * ok              rows were read from the page this run
     * empty           the page was read and MaxPreps publishes no athletes
     * carried-forward this run failed for this team; players[] are the previous file's rows
     * error           this run failed and there was nothing to carry forward
     * pending         no run has covered this team yet (a league left out of a `--leagues` run, or
     *                 a team added to the registry since the file was built): nothing was
     *                 fetched, so nothing is claimed — not even "MaxPreps has no players"
     */
    status: TeamRosterStatus,
    /** MaxPreps' own count (excludes soft-deleted rows); null when no page was ever read. */
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
  .refine((t) => t.status !== 'pending' || t.players.length === 0, 'status pending cannot have players')
  .refine(
    (t) => t.status !== 'pending' || (t.fetchedAt === null && t.maxprepsTeamId === null),
    'status pending means nothing was read: no fetchedAt, no page id',
  )
  .refine(agreesWithRegistry, 'teamId or division is not the registry team\'s')
  .refine(
    (t) => (t.status === 'carried-forward' || t.status === 'error') === (t.error !== null),
    'error is set exactly when the fetch failed',
  )
  .refine(
    (t) => (t.status === 'ok' || t.status === 'empty' || t.status === 'carried-forward') === (t.athleteCount !== null),
    'athleteCount is set exactly when a page was read (this run, or the one a carried-forward team keeps)',
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

const RostersShape = z.object({
  season: z.string().min(1),
  /** ISO UTC, when the run started. */
  fetchedAt: z.string().min(1),
  source: z.object({
    id: z.literal('maxpreps-html'),
    builtBy: z.string().min(1),
    notes: z.array(z.string()),
  }),
  teams: z.array(TeamRosterSchema),
  counts: RosterCountsSchema,
});

/**
 * Any rosters file whose teams are valid, unique and correctly counted — possibly not every
 * registry team. This is how scripts/fetch-rosters.ts reads the PREVIOUS file: one written before
 * the other leagues were added (15 SCVAL teams), or before a team joined the registry, still
 * supplies the rows a failed team carries forward. The file the site loads is RostersSchema.
 */
export const RostersPartialSchema = RostersShape
  .refine((r) => new Set(r.teams.map((t) => t.slug)).size === r.teams.length, 'team slugs are not unique')
  .refine((r) => {
    const c = countRosters(r.teams);
    return (Object.keys(c) as Array<keyof typeof c>).every((k) => c[k] === r.counts[k]);
  }, 'counts do not match the rows');

/** The file the site loads: exactly one entry per registry team. */
export const RostersSchema = RostersPartialSchema.refine(
  (r) => r.teams.length === ROSTER_TEAM_COUNT,
  `expected one entry per registry team (${ROSTER_TEAM_COUNT})`,
);

export type RosterPlayer = z.infer<typeof RosterPlayerSchema>;
export type TeamRoster = z.infer<typeof TeamRosterSchema>;
export type RosterCounts = z.infer<typeof RosterCountsSchema>;
export type Rosters = z.infer<typeof RostersSchema>;

// ---------------------------------------------------------------- the enrichment overlay

/**
 * data/rosters-enrichment.json — what OTHER public sources add to the MaxPreps rosters, joined on
 * team slug + MaxPreps athleteId (SPEC §1.1j).
 *
 * It is an overlay, never a replacement. The three rules, enforced by lib/rosters.ts at load time:
 *   1. a value is filled only where MaxPreps has null for that field
 *   2. where a source disagrees with MaxPreps, MaxPreps stays and the disagreement is recorded
 *   3. every filled value names its source URL, its kind and a confidence
 * It also carries links to players' own recruiting profiles (PlayerProfileSchema below), which
 * fill no field: they sit beside the row, and a class year they state must agree with its grade.
 */

export const ENRICHMENT_KINDS = [
  /** an official school athletics site (roster page or player profile) */
  'school-site',
  /** an official school roster PDF */
  'school-pdf',
  /** a school newspaper or similar public article */
  'news',
  /** MaxPreps' own JV roster page for the same career id */
  'maxpreps-jv',
  /** a dated class year on a MaxPreps career page plus the years elapsed */
  'maxpreps-career',
  /** a MaxPreps team home page (coach names) */
  'maxpreps-team',
] as const;
const enrichmentKind = z.enum(ENRICHMENT_KINDS);

/**
 * high   an official 2026-27 school roster, or MaxPreps' own data for the same career
 * medium a school-site profile field that is not season-dated, a school-paper statement, or a
 *        derived grade
 * low    a profile field not tied to the season at all
 */
const confidence = z.enum(['high', 'medium', 'low']);

const sourced = {
  kind: enrichmentKind,
  source: httpUrl,
  confidence,
  note: z.string().min(1).nullable(),
};

export const EnrichedGradeSchema = z.object({
  value: z.number().int().min(9).max(12),
  /** true when computed from a class year on another season, not read for this one. */
  derived: z.boolean(),
  ...sourced,
});

export const EnrichedPositionsSchema = z.object({
  value: z.array(z.string().min(1)).min(1),
  ...sourced,
});

export const EnrichedJerseySchema = z.object({
  value: z.string().min(1),
  ...sourced,
});

export const EnrichedHeightSchema = z
  .object({
    value: z.string().regex(/^\d'\d{1,2}"$/, 'expected feet\'inches"'),
    inches: z.number().int().min(1),
    ...sourced,
  })
  .refine((h) => {
    const m = /^(\d)'(\d{1,2})"$/.exec(h.value);
    return !!m && Number(m[1]) * 12 + Number(m[2]) === h.inches;
  }, 'inches must agree with value');

/**
 * A player's own recruiting page: a profile the athlete (or their family) published for college
 * coaches — NCSA, SportsRecruits, FieldLevel, Hudl, Captain U, or a personal recruiting site.
 * Social media, news stories and team rosters are not profiles.
 *
 * Linked only when the page (or, for NCSA, whose pages are behind a bot wall, the search result
 * for it) names this player, field hockey and this school. A stated graduation year must agree
 * with the grade the roster shows: lib/rosters.ts checks that at load time.
 */
export const PROFILE_PLATFORMS = [
  'ncsa',
  'sportsrecruits',
  'fieldlevel',
  'hudl',
  'captainu',
  /** a site built for this one athlete, on any host */
  'personal',
] as const;
export type ProfilePlatform = (typeof PROFILE_PLATFORMS)[number];

/** Where each platform's profiles live; a URL on any other host is refused. */
export const PROFILE_HOSTS: Record<Exclude<ProfilePlatform, 'personal'>, string> = {
  ncsa: 'ncsasports.org',
  sportsrecruits: 'sportsrecruits.com',
  fieldlevel: 'fieldlevel.com',
  hudl: 'hudl.com',
  captainu: 'captainu.com',
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const PlayerProfileSchema = z
  .object({
    platform: z.enum(PROFILE_PLATFORMS),
    url: httpsUrl,
    /** The graduation year the profile states, when it states one. */
    classOf: z.number().int().min(2020).max(2040).nullable(),
    note: z.string().min(1).nullable(),
  })
  .refine((p) => {
    const host = hostOf(p.url);
    if (host === null) return false;
    if (p.platform === 'personal') return true;
    const want = PROFILE_HOSTS[p.platform];
    return host === want || host.endsWith(`.${want}`);
  }, 'url is not a valid URL on the platform it names');

/** A source that disagrees with MaxPreps. `kept` is what the merged roster shows. */
export const RosterConflictSchema = z.object({
  field: z.enum(['jersey', 'grade', 'position', 'height']),
  kept: z.string().min(1).nullable(),
  other: z.string().min(1),
  kind: enrichmentKind,
  source: httpUrl,
  note: z.string().min(1).nullable(),
});

export const EnrichedPlayerSchema = z
  .object({
    /** The MaxPreps per-season id: the join key. */
    athleteId: z.string().min(1),
    /** As MaxPreps spells it (for reading the file; the join is on athleteId). */
    fullName: z.string().min(1),
    /** As the source spells it, when that differs (e.g. "Gabriella" for "Gigi"). */
    sourceName: z.string().min(1).nullable(),
    /** Only where a school source says which squad a row belongs to (Los Gatos). */
    level: z.enum(['varsity', 'jv']).nullable(),
    levelSource: httpUrl.nullable(),
    grade: EnrichedGradeSchema.nullable(),
    positions: EnrichedPositionsSchema.nullable(),
    jersey: EnrichedJerseySchema.nullable(),
    height: EnrichedHeightSchema.nullable(),
    conflicts: z.array(RosterConflictSchema),
    /** The player's own recruiting pages, at most one per platform. */
    profiles: z.array(PlayerProfileSchema),
    note: z.string().min(1).nullable(),
  })
  .refine(
    (p) =>
      p.sourceName !== null || p.level !== null || p.grade !== null || p.positions !== null ||
      p.jersey !== null || p.height !== null || p.conflicts.length > 0 || p.profiles.length > 0,
    'an enrichment record must add something',
  )
  .refine((p) => (p.level === null) === (p.levelSource === null), 'level and levelSource go together')
  .refine(
    (p) => new Set(p.profiles.map((x) => x.platform)).size === p.profiles.length,
    'one profile per platform',
  );

export const RosterCoachSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).nullable(),
  source: httpUrl,
});

export const EnrichmentSourceSchema = z.object({
  kind: enrichmentKind,
  url: httpUrl,
  title: z.string().min(1),
  capturedAt: dateKey,
  confidence,
});

export const EnrichedTeamSchema = z
  .object({
    slug: teamSlug,
    sources: z.array(EnrichmentSourceSchema),
    players: z.array(EnrichedPlayerSchema),
    coaches: z.array(RosterCoachSchema),
    notes: z.array(z.string().min(1)),
  })
  .refine(
    (t) => new Set(t.players.map((p) => p.athleteId)).size === t.players.length,
    'athleteIds are not unique within the team',
  );

export const RosterEnrichmentSchema = z
  .object({
    season: z.string().min(1),
    capturedAt: dateKey,
    builtBy: z.string().min(1),
    notes: z.array(z.string().min(1)),
    /** One entry per registry team; a team nothing has been added for has empty lists. */
    teams: z.array(EnrichedTeamSchema).length(ROSTER_TEAM_COUNT),
  })
  .refine((e) => new Set(e.teams.map((t) => t.slug)).size === ROSTER_TEAM_COUNT, 'team slugs are not unique')
  .refine((e) => {
    const urls = e.teams.flatMap((t) => t.players.flatMap((p) => p.profiles.map((x) => x.url)));
    return new Set(urls).size === urls.length;
  }, 'a profile URL is linked to more than one player');

export type EnrichedGrade = z.infer<typeof EnrichedGradeSchema>;
export type EnrichedPositions = z.infer<typeof EnrichedPositionsSchema>;
export type EnrichedJersey = z.infer<typeof EnrichedJerseySchema>;
export type EnrichedHeight = z.infer<typeof EnrichedHeightSchema>;
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export type RosterConflict = z.infer<typeof RosterConflictSchema>;
export type EnrichedPlayer = z.infer<typeof EnrichedPlayerSchema>;
export type RosterCoach = z.infer<typeof RosterCoachSchema>;
export type EnrichmentSource = z.infer<typeof EnrichmentSourceSchema>;
export type EnrichedTeam = z.infer<typeof EnrichedTeamSchema>;
export type RosterEnrichment = z.infer<typeof RosterEnrichmentSchema>;

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

/**
 * The file's content with every `fetchedAt` and `error` dropped and keys sorted. Two files with the
 * same key differ only in when they were read and in a failure's message text, so
 * scripts/fetch-rosters.ts leaves the old one in place and a run that found nothing new commits
 * nothing — the same guard as playerStatsContentKey. A team's `status` stays in the key.
 */
export function rostersContentKey(file: Rosters): string {
  return contentKey(file, ['fetchedAt', 'error']);
}
