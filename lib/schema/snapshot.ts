/**
 * The Zod contract for data/snapshot.json (schema version 2, SPEC §4.1).
 *
 * Its job is to fail the cron rather than ship a fake scoreline (DESIGN §5.1). Game invariants:
 *   1. a final game carries two numbers
 *   2. a non-final game carries no numbers  → "a missing score is never 0-0"
 *   3. a decider exists exactly when the game is final
 *   4. shootout data exists only when decider === 'SO' (an SO decider may carry no tally: an EAL 1 v 1 win,
 *      or a San Diego Section shootout win MaxPreps records as a level score marked W and L)
 * Ids (league, division, slug) are validated strings here and checked against the config and the
 * registry in one snapshot-level `superRefine(checkAgainstConfig)` (lib/snapshot/check.ts, which
 * builds `SnapshotSchema` from `SnapshotObject`), whose every failure is a named issue with a path.
 * This module is the shapes alone: zod and the model types, no config, no registry.
 */

import { z } from 'zod';

import { OFFICIAL_SOURCE_IDS } from '@/lib/model/ids';
import { type Snapshot } from '@/lib/model/snapshot';
import { dateKey, httpUrl, slugId } from './primitives';

// ---------------------------------------------------------------- primitives

/** League, division and slug ids: validated strings; membership is checked in checkAgainstConfig. */
const id = slugId;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SBLIVE_ID_RE = /^sblive:\d+$/;
/** A MaxPreps contest GUID, or `sblive:<digits>` (owner decision D2, rule 2). */
const contestId = z
  .string()
  .refine((v) => GUID_RE.test(v) || SBLIVE_ID_RE.test(v), 'expected a contest GUID or sblive:<digits>');
const outcome = z.enum(['W', 'L', 'T']);
// SectionId (lib/model/ids.ts); the compile-time proof at the end of this file fails if the two lists drift.
const sectionId = z.enum(['ccs', 'ncs', 'ns', 'ss', 'sds']);
const officialSourceId = z.enum(OFFICIAL_SOURCE_IDS);
const sourceId = z.enum([
  'maxpreps-api',
  'maxpreps-html',
  'sblive',
  ...OFFICIAL_SOURCE_IDS,
  'ccs-pdf',
  'ccs-ical',
  'vnn-ics',
  'cifss',
  'derived',
]);
const gameStatus = z.enum(['scheduled', 'live', 'final', 'score-pending', 'postponed']);
const decider = z.enum(['REG', 'OT', '2OT', 'SO', 'FORFEIT']);
const record3 = z.object({ w: z.number().int(), l: z.number().int(), t: z.number().int() });
const dateOnly = dateKey;
const scorePair = z.object({ home: z.number().int().min(0), away: z.number().int().min(0) });

const tiebreakStage = z.enum([
  'points',
  'head-to-head',
  'division-wins',
  'h2h-goals-against',
  'h2h-goal-diff',
  'division-goals-against',
  'record-vs-higher-placed',
  'record-vs-lower-placed',
  'h2h-win-pct',
  'record-above-tie',
  'draw-number',
  'ccs-points',
  'coin-flip',
  'no-rule',
  'play-in',
]);
const playoffStatus = z.enum([
  'aq',
  'play-in',
  'at-large',
  'out',
  'no-aq-route',
  'bye',
  'tournament',
  'below-line',
  'selection',
  'no-postseason',
]);

// Every URL in the snapshot that ends up in an `href` is `httpUrl` (lib/schema/primitives.ts says
// why the scheme check sits at this chokepoint).

// ---------------------------------------------------------------- teams

export const TeamSchema = z.object({
  id: z.string().min(1),
  slug: id,
  name: z.string().min(1),
  shortName: z.string().min(1),
  abbr: z.string().min(1),
  acronym: z.string().min(1),
  mascot: z.string(),
  city: z.string(),
  aliases: z.array(z.string()),
  section: sectionId,
  league: id,
  division: id,
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
    sbliveSchoolId: z.string().optional(),
    sbliveGamesUrl: httpUrl.optional(),
    vnnSiteId: z.string().optional(),
    vnnIcsUrl: httpUrl.optional(),
  }),
});

// ---------------------------------------------------------------- games

const gameSide = z.object({
  teamId: z.string().nullable(),
  slug: id.nullable(),
  name: z.string().min(1),
  city: z.string().optional(),
  score: z.number().int().min(0).nullable(),
  result: outcome.nullable(),
});

export const PostseasonTagSchema = z.object({
  kind: z.enum(['scval-crossover', 'bval-play-in', 'mcal-tournament', 'league-postseason', 'section-playoffs', 'ccs', 'other']),
  leagueId: id.nullable(),
  via: z.enum(['config-pairing', 'contest-type-4', 'league-postseason-window', 'section-postseason-window', 'ccs-window']),
});

export const OfficialStampSchema = z.object({
  scheduledDate: dateOnly,
  division: id,
  source: officialSourceId,
  fixtureId: z.string().min(1),
  pass: z.enum(['same-date', 'same-date-swapped', 'rescheduled']),
});

const backfillProvenance = z.object({
  rule: z.enum(['absent-fixture', 'score-pending', 'contradictory-result', 'off-schedule-date', 'phantom-tie']),
  sbliveGameId: z.string().min(1),
  maxpreps: scorePair.nullable(),
  note: z.string().min(1),
});

export const GameSchema = z
  .object({
    contestId,
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
    leagueDivision: id.nullable(),
    contestTypes: z.object({
      home: z.number().int().nullable(),
      away: z.number().int().nullable(),
    }),
    countsFor: id.nullable(),
    postseason: PostseasonTagSchema.nullable(),
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
    official: OfficialStampSchema.optional(),
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
      backfill: backfillProvenance.optional(),
      fetchedAt: z.string(),
      maxprepsModifiedOn: z.string().optional(),
      contentChangedAt: z.string().min(20).optional(),
      leagueFlagConflict: z.string().optional(),
      hostConflict: z.string().optional(),
      resultConflict: z.string().optional(),
      classificationNote: z.string().optional(),
      dateCorrection: z
        .object({ maxprepsDateLocal: z.string().min(10), maxprepsTimeTba: z.boolean(), source: z.string().min(1) })
        .optional(),
      overtimeNote: z.string().min(1).optional(),
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
  // 4. Shootout data only with decider === 'SO' (an EAL 1 v 1 win is 'SO' with no stored tally).
  .refine((g) => g.shootout === null || g.decider === 'SO', 'shootout data without decider SO')
  .refine((g) => g.isOt === g.otPeriods > 0, 'isOt/otPeriods mismatch')
  .refine((g) => g.dateKey === g.dateLocal.slice(0, 10), 'dateKey does not match dateLocal');

// ---------------------------------------------------------------- standings

const computedRecord = z
  .object({
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
  .refine((r) => r.gd === r.gf - r.ga, 'gd is not gf - ga');
// The points column (w·win + t·tie + l·loss under the team's league) is checked at snapshot level.

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
  slug: id,
  division: id,
  computed: computedRecord,
  overall: computedRecord,
  reported: reportedRecord.nullable(),
  mismatch: z.boolean(),
  mismatchDetail: z.string().optional(),
  tiebreak: z.object({
    resolvedBy: tiebreakStage,
    note: z.string().min(1),
    tiedWith: z.array(z.string()),
    shared: z.boolean(),
  }),
  playoffStatus,
  hasReportedResults: z.boolean(),
});

// ---------------------------------------------------------------- season

const seasonWindow = z.object({
  firstGame: z.string().nullable(),
  lastLeagueGame: z.string().nullable(),
  lastGame: z.string().nullable(),
});

export const SeasonSchema = z.object({
  year: z.string(),
  label: z.string(),
  sportSeasonId: z.string(),
  allSeasonId: z.string(),
  genderSport: z.literal('girls,fieldhockey'),
  teamLevel: z.enum(['Varsity', 'JV']),
  sections: z.array(
    z.object({
      id: sectionId,
      name: z.string().min(1),
      maxprepsSectionId: z.string().min(1),
      holdsFieldHockeyChampionship: z.boolean(),
    }),
  ),
  leagues: z.array(
    z.object({
      id,
      sectionId,
      name: z.string().min(1),
      shortName: z.string().min(1),
      divisions: z.array(
        // null where MaxPreps has no table for the division (the San Diego Section's Valley); checked against config (#6).
        z.object({ id, label: z.string().min(1), maxprepsLeagueId: z.string().min(1).nullable() }),
      ),
      postseasonKind: z.enum(['ccs-ladder', 'league-tournament', 'unbracketed-tournament', 'no-postseason', 'section-playoffs']),
      window: seasonWindow,
    }),
  ),
  window: seasonWindow,
});

// ---------------------------------------------------------------- CCS playoffs

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
    endOfLeagueSeason: dateOnly,
  }),
  ccsCalendar: z.array(CcsCalendarEventSchema).optional(),
  keyDatesConfirmed: z.boolean().optional(),
  format: z.object({
    elimination: z.literal('single'),
    ccsDivisions: z.array(
      z.object({
        name: z.enum(['Division 1', 'Division 2']),
        seeds: z.tuple([z.number(), z.number()]),
      }),
    ),
    // Numbers only: one key per CCS-ladder league, plus atLarge and total (checked against config).
    autoQualifiers: z
      .object({ atLarge: z.number().int().min(0), total: z.number().int().min(0) })
      .catchall(z.number().int().min(0)),
    highSeedHostsThrough: z.literal('semifinals'),
  }),
  bracketPublished: z.boolean(),
  bracketUrl: httpUrl,
  games: z.array(GameSchema),
});

// ---------------------------------------------------------------- sources, health, dropped

export const SourceStatusSchema = z.object({
  id: sourceId,
  kind: z
    .enum([
      'bootstrap',
      'league-meta',
      'reported-standings',
      'team-schedule',
      'official-schedule',
      'official-revision-check',
      'standings-index',
      'sblive-scoreboard',
      'sblive-team-games',
      'ccs-calendar',
      'ccs-bracket',
      'school-calendar',
      'cifss-scores',
    ])
    .optional(),
  scope: z
    .object({
      section: sectionId.optional(),
      league: id.optional(),
      division: id.optional(),
      team: id.optional(),
    })
    .optional(),
  label: z.string(),
  url: httpUrl,
  status: z.enum(['ok', 'stale', 'error', 'skipped']),
  httpStatus: z.number().optional(),
  fetchedAt: z.string(),
  carriedFrom: z.string().optional(),
  upstreamModifiedOn: z.string().optional(),
  error: z.string().optional(),
  rowCount: z.number().optional(),
});

const divisionHealth = z.object({
  divisionId: id,
  meta: z.enum(['ok', 'error', 'mismatch', 'skipped']),
  reportedTable: z.enum(['ok', 'carried', 'missing', 'skipped']),
  reportedRows: z.number().int().min(0).nullable(),
  classification: z.enum(['contest-type', 'official-fixtures', 'membership', 'fallback-contest-type']),
  official: z
    .object({
      source: officialSourceId,
      total: z.number().int().min(0),
      matched: z.number().int().min(0),
      missingPast: z.number().int().min(0),
      carried: z.boolean(),
      revisedUpstream: z.boolean(),
    })
    .nullable(),
  countedFinals: z.number().int().min(0),
  previousCountedFinals: z.number().int().min(0).nullable(),
  backfilled: z.number().int().min(0),
  missingLeaguePast: z.number().int().min(0).optional(),
});

export const LeagueHealthSchema = z.object({
  leagueId: id,
  state: z.enum(['fresh', 'partial', 'frozen', 'degraded']),
  lastFreshAt: z.string().nullable(),
  reasons: z.array(z.string().min(1)),
  divisions: z.array(divisionHealth),
  teamFeeds: z.object({
    total: z.number().int().min(0),
    ok: z.number().int().min(0),
    carried: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
});

export const DroppedContestSchema = z.object({
  contestId: z.string().min(1),
  reason: z.enum(['ghost-team', 'excluded-by-config', 'tba-opponent', 'phantom-duplicate']),
  note: z.string().min(1),
  dateKey: dateOnly.nullable(),
  teams: z.array(z.string()),
});

export const OfficialFixtureSchema = z.object({
  id: z.string().min(1),
  league: id,
  division: id,
  dateKey: dateOnly,
  time: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM').nullable(),
  awayName: z.string().min(1),
  homeName: z.string().min(1),
  awaySlug: id.nullable(),
  homeSlug: id.nullable(),
  source: officialSourceId,
});

// ---------------------------------------------------------------- cross-checks

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
  backfilled: z.array(
    z.object({
      contestId,
      dateKey: dateOnly,
      label: z.string().min(1),
      rule: backfillProvenance.shape.rule,
      sblive: scorePair,
      maxpreps: scorePair.nullable(),
      sbliveUrl: httpUrl,
      maxprepsUrl: httpUrl.nullable(),
      note: z.string().min(1),
    }),
  ),
});

const cifssOnlyRow = z.object({
  contestId: z.string().min(1),
  dateKey: dateOnly,
  label: z.string().min(1),
  cifss: scorePair,
  pairKey: z.string().min(1),
  cifssDateKey: dateOnly,
  maxprepsUrl: httpUrl.nullable(),
  cifssUrl: httpUrl,
  note: z.string().min(1),
});

export const CifssCrossCheckSchema = z.object({
  cifssFetchedAt: z.string(),
  compared: z.number().int().min(0),
  agreements: z.number().int().min(0),
  conflicts: z.array(
    z.object({
      contestId,
      dateKey: dateOnly,
      label: z.string().min(1),
      maxpreps: scorePair,
      cifss: scorePair,
      cifssDateKey: dateOnly,
      maxprepsUrl: httpUrl.nullable(),
      cifssUrl: httpUrl,
      note: z.string().min(1),
    }),
  ),
  cifssOnlyScored: z.array(cifssOnlyRow),
  notOnMaxPreps: z.array(cifssOnlyRow),
});

const crossCheckRow = z.object({
  slug: id,
  field: z.string(),
  ours: z.string(),
  theirs: z.string(),
  url: httpUrl,
  knownCause: z.string().optional(),
});

// ---------------------------------------------------------------- snapshot

const countsRow = z.object({
  teams: z.number().int().min(0),
  games: z.number().int().min(0),
  finals: z.number().int().min(0),
  leagueGames: z.number().int().min(0),
  backfilled: z.number().int().min(0),
});

export const SnapshotObject = z.object({
  schemaVersion: z.literal(2),
  fetchedAt: z.string().min(20),
  season: SeasonSchema,
  teams: z.array(TeamSchema),
  games: z.array(GameSchema),
  standings: z.array(StandingSchema),
  playoffs: PlayoffsSchema,
  sources: z.array(SourceStatusSchema),
  leagueHealth: z.array(LeagueHealthSchema),
  dropped: z.array(DroppedContestSchema),
  crossCheck: z.array(crossCheckRow),
  sbliveCrossCheck: SbliveCrossCheckSchema.optional(),
  cifssCrossCheck: CifssCrossCheckSchema.optional(),
  officialFixtures: z.array(OfficialFixtureSchema).optional(),
  supersededGames: z.record(z.string(), z.string()),
  contentRemovals: z
    .array(
      z.object({
        contestId: z.string().min(1),
        dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slugs: z.array(z.string().min(1)),
        removedAt: z.string().min(20),
      }),
    )
    .optional(),
  officialStandingsPdfUrl: httpUrl.nullable().optional(),
  counts: z.object({
    teams: z.number().int(),
    games: z.number().int(),
    finals: z.number().int(),
    pending: z.number().int(),
    leagueGames: z.number().int(),
    mismatches: z.number().int(),
    byLeague: z.record(z.string(), countsRow),
  }),
});

export type SnapshotOutput = z.infer<typeof SnapshotObject>;

// Compile-time proof that the schema and the hand-written types agree, in both directions.
const _schemaMatchesType = (s: SnapshotOutput): Snapshot => s;
const _typeMatchesSchema = (s: Snapshot): SnapshotOutput => s;
void _schemaMatchesType;
void _typeMatchesSchema;
