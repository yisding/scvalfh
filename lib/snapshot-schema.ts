/**
 * The Zod contract for data/snapshot.json.
 *
 * Its job is to fail the cron rather than ship a fake scoreline (DESIGN §5.1). Invariants:
 *   1. a final game carries two numbers
 *   2. a non-final game carries no numbers  → "a missing score is never 0-0"
 *   3. a decider exists exactly when the game is final
 *   4. shootout data exists exactly when decider === 'SO' (so: never, in this league)
 *   5. exactly 15 teams (De Anza 7, El Camino 8), with unique slugs and unique abbrs
 *   6. games are deduped on contestId
 *   7. one standings row per registry team
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';
import type { Snapshot } from './types';

const division = z.enum(['de-anza', 'el-camino']);
const outcome = z.enum(['W', 'L', 'T']);
const sourceId = z.enum([
  'maxpreps-api',
  'maxpreps-html',
  'sblive',
  'scval-pdf',
  'ccs-pdf',
  'ccs-ical',
  'vnn-ics',
  'derived',
]);
const teamSlug = z.enum([
  'cupertino', 'fremont', 'homestead', 'los-altos', 'saint-francis',
  'st-ignatius', 'valley-christian',
  'los-gatos', 'lynbrook', 'mitty', 'monta-vista',
  'palo-alto', 'presentation', 'santa-clara', 'saratoga',
]);
const gameStatus = z.enum(['scheduled', 'live', 'final', 'score-pending', 'postponed']);
const decider = z.enum(['REG', 'OT', '2OT', 'SO', 'FORFEIT']);
const record3 = z.object({ w: z.number().int(), l: z.number().int(), t: z.number().int() });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * Every URL in the snapshot that ends up in an `href`.
 *
 * All of them are third-party strings — `calculatedFields.canonicalUrl`, `nfhsStreamUrl` and
 * `goFanUrl` straight out of the MaxPreps JSON, the SBLive page links, and the standings-PDF href
 * scraped out of scval.com's HTML — and React does NOT filter a URL scheme, so a `javascript:` or
 * `data:` value from upstream would be emitted verbatim into a clickable link on a prerendered page.
 * The scheme check belongs at the same chokepoint that refuses a 0-0 non-final: it is the one place
 * the whole snapshot has to pass through. `lib/normalize.ts` drops a non-conforming URL to null with
 * a warning rather than failing the whole run over one bad row.
 */
const httpUrl = z
  .string()
  .refine((v) => /^https?:\/\/\S+$/i.test(v), 'expected an http(s) URL');

export const TeamSchema = z.object({
  id: z.string().min(1),
  slug: teamSlug,
  name: z.string().min(1),
  shortName: z.string().min(1),
  abbr: z.string().min(1),
  acronym: z.string().min(1),
  mascot: z.string(),
  city: z.string(),
  aliases: z.array(z.string()),
  division,
  isScvalMember: z.literal(true),
  dataCoverage: z.enum(['full', 'partial', 'none']),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    onPrimary: z.enum(['#0e1116', '#ffffff']),
    source: z.enum(['maxpreps-standings', 'placeholder']),
  }),
  mascotUrl: httpUrl.nullable(),
  external: z.object({
    maxprepsTeamId: z.string(),
    maxprepsTeamUrl: httpUrl.nullable(),
    maxprepsScheduleUrl: httpUrl.nullable(),
    sbliveTeamId: z.string().optional(),
    sbliveGamesUrl: httpUrl.optional(),
    vnnSiteId: z.string().optional(),
    vnnIcsUrl: httpUrl.optional(),
  }),
});

const gameSide = z.object({
  teamId: z.string().nullable(),
  slug: teamSlug.nullable(),
  name: z.string().min(1),
  city: z.string().optional(),
  score: z.number().int().min(0).nullable(),
  result: outcome.nullable(),
});

export const GameSchema = z
  .object({
    contestId: z.string().min(1),
    dateLocal: z.string().min(10),
    dateUtc: z.string().min(10),
    dateKey: dateOnly,
    isDateTba: z.boolean(),
    isTimeTba: z.boolean(),
    home: gameSide,
    away: gameSide,
    site: z.enum(['home', 'away', 'neutral']),
    status: gameStatus,
    isLeague: z.boolean(),
    leagueDivision: division.nullable(),
    otPeriods: z.number().int().min(0),
    isOt: z.boolean(),
    isForfeit: z.boolean(),
    forfeitBy: z.enum(['home', 'away']).nullable(),
    decider: decider.nullable(),
    shootout: z.object({ home: z.number().int(), away: z.number().int() }).nullable(),
    venue: z.object({
      text: z.string().nullable(),
      name: z.string().optional(),
      address: z
        .object({
          street: z.string(),
          city: z.string(),
          region: z.string(),
          postalCode: z.string(),
        })
        .optional(),
    }),
    timeConfirmed: z.boolean().optional(),
    official: z
      .object({ scheduledDate: dateOnly, source: z.literal('scval-pdf') })
      .optional(),
    recap: z.string().nullable(),
    urls: z.object({
      maxpreps: httpUrl.nullable(),
      sblive: httpUrl.optional(),
      nfhsStream: httpUrl.nullable(),
      goFan: httpUrl.nullable(),
    }),
    provenance: z.object({
      scores: sourceId,
      schedule: sourceId,
      scoreConflict: z
        .object({
          sblive: z.object({ home: z.number(), away: z.number() }),
          note: z.string(),
        })
        .optional(),
      fetchedAt: z.string(),
      maxprepsModifiedOn: z.string().optional(),
      leagueFlagConflict: z.string().optional(),
      hostConflict: z.string().optional(),
    }),
  })
  // 1. A final game must have two numbers.
  .refine(
    (g) => g.status !== 'final' || (g.home.score !== null && g.away.score !== null),
    'final game with a null score',
  )
  // 2. A non-final game must have no numbers — this is the never-0-0 rule, enforced.
  .refine(
    (g) => g.status === 'final' || (g.home.score === null && g.away.score === null),
    'non-final game carrying a score',
  )
  // 3. A decider exists only on a final.
  .refine((g) => (g.decider !== null) === (g.status === 'final'), 'decider/status mismatch')
  // 4. Shootout data only with decider === 'SO'.
  .refine((g) => (g.shootout !== null) === (g.decider === 'SO'), 'shootout/decider mismatch')
  .refine((g) => g.isOt === g.otPeriods > 0, 'isOt/otPeriods mismatch')
  .refine((g) => g.dateKey === g.dateLocal.slice(0, 10), 'dateKey does not match dateLocal');

const computedRecord = z.object({
  gp: z.number().int().min(0),
  w: z.number().int().min(0),
  l: z.number().int().min(0),
  t: z.number().int().min(0),
  winPct: z.number().min(0).max(1),
  pts: z.number().int().min(0),
  gf: z.number().int().min(0),
  ga: z.number().int().min(0),
  gd: z.number().int(),
  streak: z.object({ count: z.number().int().min(1), result: outcome }).nullable(),
  last5: z.array(outcome).max(5),
  homeRecord: record3,
  awayRecord: record3,
  neutralRecord: record3,
  place: z.number().int().min(1),
})
  .refine((r) => r.gp === r.w + r.l + r.t, 'gp does not equal w + l + t')
  // Article VI §2 — the points column is derived, never stored loose.
  .refine((r) => r.pts === 3 * r.w + r.t, 'pts is not 3w + t')
  .refine((r) => r.gd === r.gf - r.ga, 'gd is not gf - ga');

const reportedRecord = z.object({
  conferenceWins: z.number(),
  conferenceLosses: z.number(),
  conferenceTies: z.number(),
  overallWins: z.number(),
  overallLosses: z.number(),
  overallTies: z.number(),
  conferencePoints: z.number(),
  conferencePointsAgainst: z.number(),
  points: z.number(),
  pointsAgainst: z.number(),
  conferenceContestsPlayed: z.number(),
  overallContestsPlayed: z.number(),
  conferenceStandingPlacement: z.number().nullable(),
  conferenceWinningPercentage: z.number(),
  winningPercentage: z.number(),
  streak: z.number(),
  streakResult: outcome.nullable(),
  homeWins: z.number(), homeLosses: z.number(), homeTies: z.number(),
  awayWins: z.number(), awayLosses: z.number(), awayTies: z.number(),
  neutralWins: z.number(), neutralLosses: z.number(), neutralTies: z.number(),
  modifiedOn: z.string(),
});

export const StandingSchema = z.object({
  teamId: z.string().min(1),
  slug: teamSlug,
  division,
  computed: computedRecord,
  overall: computedRecord,
  reported: reportedRecord.nullable(),
  mismatch: z.boolean(),
  mismatchDetail: z.string().optional(),
  tiebreak: z.object({
    resolvedBy: z.enum([
      'points',
      'head-to-head',
      'division-wins',
      'h2h-goals-against',
      'h2h-goal-diff',
      'coin-flip',
    ]),
    note: z.string().min(1),
    tiedWith: z.array(z.string()),
    shared: z.boolean(),
  }),
  playoffStatus: z.enum(['aq', 'play-in', 'at-large', 'out']),
  hasReportedResults: z.boolean(),
});

export const SeasonSchema = z.object({
  year: z.string(),
  label: z.string(),
  sportSeasonId: z.string(),
  allSeasonId: z.string(),
  genderSport: z.literal('girls,fieldhockey'),
  teamLevel: z.enum(['Varsity', 'JV']),
  sectionId: z.string(),
  sectionName: z.string(),
  leagues: z.object({
    'de-anza': z.object({ leagueId: z.string(), name: z.string() }),
    'el-camino': z.object({ leagueId: z.string(), name: z.string() }),
  }),
  window: z.object({
    firstGame: z.string().nullable(),
    lastLeagueGame: z.string().nullable(),
    lastGame: z.string().nullable(),
  }),
});

const ccsEventKind = z.enum([
  'entries-due',
  'quarterfinals',
  'semifinals',
  'finals',
  'evaluation',
  'other',
]);

export const CcsCalendarEventSchema = z.object({
  date: dateOnly,
  summary: z.string().min(1),
  kind: ccsEventKind,
  uid: z.string().nullable(),
  detail: z.string().nullable(),
});

export const PlayoffsSchema = z.object({
  keyDates: z.object({
    entriesDue: z.string(),
    seedingMeeting: z.string(),
    quarterfinals: dateOnly,
    semifinals: dateOnly,
    finals: dateOnly,
    evaluationMeeting: z.string(),
    crossover: dateOnly,
  }),
  ccsCalendar: z.array(CcsCalendarEventSchema).optional(),
  keyDatesConfirmed: z.boolean().optional(),
  format: z.object({
    elimination: z.literal('single'),
    divisions: z.array(
      z.object({
        name: z.enum(['Division 1', 'Division 2']),
        seeds: z.tuple([z.number(), z.number()]),
      }),
    ),
    autoQualifiers: z.object({
      scval: z.literal(7),
      bval: z.literal(4),
      pcal: z.string(),
      atLarge: z.number(),
      total: z.literal(16),
    }),
    highSeedHostsThrough: z.literal('semifinals'),
  }),
  bracketPublished: z.boolean(),
  bracketUrl: httpUrl,
  games: z.array(GameSchema),
});

export const SourceStatusSchema = z.object({
  id: sourceId,
  label: z.string(),
  url: httpUrl,
  status: z.enum(['ok', 'stale', 'error', 'skipped']),
  httpStatus: z.number().optional(),
  fetchedAt: z.string(),
  upstreamModifiedOn: z.string().optional(),
  error: z.string().optional(),
  rowCount: z.number().optional(),
});

export const OfficialFixtureSchema = z.object({
  division,
  dateKey: dateOnly,
  awayName: z.string().min(1),
  homeName: z.string().min(1),
  awaySlug: teamSlug.nullable(),
  homeSlug: teamSlug.nullable(),
  source: z.literal('scval-pdf'),
});

const scorePair = z.object({ home: z.number().int().min(0), away: z.number().int().min(0) });

export const SbliveCrossCheckSchema = z.object({
  sbliveFetchedAt: z.string(),
  compared: z.number().int().min(0),
  agreements: z.number().int().min(0),
  conflicts: z.array(
    z.object({
      contestId: z.string().min(1),
      dateKey: dateOnly,
      label: z.string().min(1),
      maxpreps: scorePair,
      sblive: scorePair,
      aligned: z.boolean(),
      maxprepsUrl: httpUrl.nullable(),
      sbliveUrl: httpUrl.nullable(),
      note: z.string().min(1),
    }),
  ),
  sbliveOnlyScored: z.array(
    z.object({
      contestId: z.string().min(1),
      dateKey: dateOnly,
      label: z.string().min(1),
      sblive: scorePair,
      aligned: z.boolean(),
      sbliveUrl: httpUrl.nullable(),
      maxprepsUrl: httpUrl.nullable(),
      status: gameStatus,
      note: z.string().min(1),
    }),
  ),
});

export const SnapshotSchema = z
  .object({
    fetchedAt: z.string().min(20),
    season: SeasonSchema,
    teams: z.array(TeamSchema),
    games: z.array(GameSchema),
    standings: z.array(StandingSchema),
    playoffs: PlayoffsSchema,
    sources: z.array(SourceStatusSchema),
    crossCheck: z.array(
      z.object({
        slug: teamSlug,
        field: z.string(),
        ours: z.string(),
        theirs: z.string(),
        url: httpUrl,
      }),
    ),
    sbliveCrossCheck: SbliveCrossCheckSchema.optional(),
    officialFixtures: z.array(OfficialFixtureSchema).optional(),
    officialStandingsPdfUrl: httpUrl.nullable().optional(),
    counts: z.object({
      teams: z.number().int(),
      games: z.number().int(),
      finals: z.number().int(),
      pending: z.number().int(),
      leagueGames: z.number().int(),
      mismatches: z.number().int(),
    }),
  })
  // 5. Exactly 15 teams, slugs and abbrs unique (DESIGN §12.1, §12.9).
  .refine((s) => s.teams.length === 15, 'expected exactly 15 teams')
  .refine(
    (s) => new Set(s.teams.map((t) => t.slug)).size === s.teams.length,
    'duplicate team slug',
  )
  .refine(
    (s) => new Set(s.teams.map((t) => t.abbr)).size === s.teams.length,
    'duplicate team abbr',
  )
  .refine(
    (s) => s.teams.filter((t) => t.division === 'de-anza').length === 7,
    'De Anza must have 7 teams',
  )
  .refine(
    (s) => s.teams.filter((t) => t.division === 'el-camino').length === 8,
    'El Camino must have 8 teams',
  )
  // 6. Games deduped on contestId.
  .refine(
    (s) => new Set(s.games.map((g) => g.contestId)).size === s.games.length,
    'duplicate contestId in games',
  )
  // 7. One standings row per team.
  .refine((s) => s.standings.length === s.teams.length, 'standings row count != team count')
  .refine(
    (s) =>
      new Set(s.standings.map((r) => r.teamId)).size === s.standings.length &&
      s.standings.every((r) => s.teams.some((t) => t.id === r.teamId)),
    'standings rows do not match the team registry',
  )
  // Every game side that names a slug must name a registry slug.
  .refine(
    (s) =>
      s.games.every((g) =>
        [g.home, g.away].every(
          (side) => side.slug === null || s.teams.some((t) => t.slug === side.slug),
        ),
      ),
    'game side references an unknown slug',
  )
  .refine((s) => s.counts.teams === s.teams.length, 'counts.teams is stale')
  .refine((s) => s.counts.games === s.games.length, 'counts.games is stale');

export type SnapshotInput = z.input<typeof SnapshotSchema>;
export type SnapshotOutput = z.infer<typeof SnapshotSchema>;

// Compile-time proof that the schema and the hand-written types agree, in both directions.
const _schemaMatchesType = (s: SnapshotOutput): Snapshot => s;
const _typeMatchesSchema = (s: Snapshot): SnapshotOutput => s;
void _schemaMatchesType;
void _typeMatchesSchema;

/** Parse-or-throw, with a readable message naming the first few failures. */
export function parseSnapshot(raw: unknown): Snapshot {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(
      `snapshot failed validation (${parsed.error.issues.length} issue(s)):\n${lines.join('\n')}`,
    );
  }
  return parsed.data;
}

export function safeParseSnapshot(raw: unknown) {
  return SnapshotSchema.safeParse(raw);
}

// ---------------------------------------------------------------- canonical form

/** Keys sorted at every level so a git diff shows only what really changed. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      if (seen.has(node as object)) throw new Error('circular structure in snapshot');
      seen.add(node as object);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

/**
 * Any key that holds a run's wall-clock stamp rather than a fact about the season.
 *
 * Matched by SHAPE, not by an enumerated list, because an enumerated list is exactly how the hole
 * reopened once: the guard tested `key === 'fetchedAt'` while `sbliveCrossCheck.sbliveFetchedAt`
 * carried the same instant under a different name, so every live in-season run moved the hash and
 * the cron's "commit only if the content changed" guard never fired — a ~370-line timestamp-only
 * commit and a hosting rebuild, twice a day, for no change at all.
 */
const STAMP_KEY_RE = /fetchedat$/i;

/**
 * A SHA-256 over the snapshot with every wall-clock stamp removed.
 *
 * The snapshot stamps the run's clock in ~160 places — the top level, every game's `provenance`,
 * every `SourceStatus` row and the SBLive cross-check report — so two runs over IDENTICAL upstream
 * data never produce identical bytes. The cron's "commit the snapshot if it changed" guard
 * therefore has to compare content, not bytes; this hash is what it compares, and it is published
 * in snapshot.meta.json so the comparison needs nothing but the previous commit's meta file.
 */
export function snapshotContentHash(snapshot: Snapshot): string {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (STAMP_KEY_RE.test(key)) continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return createHash('sha256').update(stableStringify(strip(snapshot))).digest('hex');
}
