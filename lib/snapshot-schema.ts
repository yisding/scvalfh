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
 * registry in one snapshot-level `superRefine(checkAgainstConfig)`, whose every failure is a named
 * issue with a path.
 *
 * `loadSnapshot` is the one entry point for reading a file from disk: a v1 file (no
 * `schemaVersion`) is upgraded in memory by lib/snapshot-migrate.ts first, and so is a v2 file
 * written before a configured league existed (the "league added" upgrade).
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { classifyGame } from './classify';
import {
  CCS,
  CCS_LEAGUE_IDS,
  LEAGUES,
  SECTIONS,
  findDivision,
  findLeague,
  getSection,
  statusesOf,
} from './leagues';
import { dateKey, formatIssues, httpUrl, slugId } from './schema-primitives';
import {
  addConfiguredLeagues,
  isSnapshotV1,
  lacksConfiguredLeagues,
  migrateV1ToV2,
  needsReclassification,
  reclassify,
} from './snapshot-migrate';
import { stableStringify } from './stable-json';
import { TEAMS, getTeamBySlug } from './teams';
import { OFFICIAL_SOURCE_IDS, type DivisionId, type Snapshot, type TiebreakStage } from './types';

// ---------------------------------------------------------------- primitives

/** League, division and slug ids: validated strings; membership is checked in checkAgainstConfig. */
const id = slugId;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SBLIVE_ID_RE = /^sblive:\d+$/;
/** A MaxPreps contest GUID, or `sblive:<digits>` (owner decision D2, rule 2). */
const contestId = z
  .string()
  .refine((v) => GUID_RE.test(v) || SBLIVE_ID_RE.test(v), 'expected a contest GUID or sblive:<digits>');
const outcome = z.enum(['W', 'L', 'T']);
// SectionId (lib/types.ts); the compile-time proof at the end of this file fails if the two lists drift.
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

// Every URL in the snapshot that ends up in an `href` is `httpUrl` (lib/schema-primitives.ts says
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
      backfill: backfillProvenance.optional(),
      fetchedAt: z.string(),
      maxprepsModifiedOn: z.string().optional(),
      leagueFlagConflict: z.string().optional(),
      hostConflict: z.string().optional(),
      resultConflict: z.string().optional(),
      classificationNote: z.string().optional(),
      dateCorrection: z
        .object({ maxprepsDateLocal: z.string().min(10), maxprepsTimeTba: z.boolean(), source: z.string().min(1) })
        .optional(),
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

const SnapshotObject = z.object({
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
  officialFixtures: z.array(OfficialFixtureSchema).optional(),
  supersededGames: z.record(z.string(), z.string()),
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

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Every chain stage a league may print as `resolvedBy`, plus 'points' (and 'play-in' for a tournament league). */
function allowedStages(leagueId: string): ReadonlySet<TiebreakStage> {
  const league = findLeague(leagueId);
  const out = new Set<TiebreakStage>(['points']);
  if (!league) return out;
  for (const s of league.rules.tiebreaks.default) out.add(s);
  for (const chain of Object.values(league.rules.tiebreaks.byBucketStart ?? {})) {
    for (const s of chain ?? []) out.add(s);
  }
  if (league.postseason.kind === 'league-tournament') out.add('play-in');
  return out;
}

/** SPEC §4.1 checkAgainstConfig, items 1-10. */
function checkAgainstConfig(s: z.infer<typeof SnapshotObject>, ctx: Ctx): void {
  // 1. teams = the registry, as sets AND in order; slug and abbr unique.
  const ids = s.teams.map((t) => t.id);
  const registry = TEAMS.map((t) => t.id);
  const missing = registry.filter((x) => !ids.includes(x));
  const extra = ids.filter((x) => !registry.includes(x));
  if (missing.length || extra.length || ids.join('|') !== registry.join('|')) {
    const slugOf = (x: string) => TEAMS.find((t) => t.id === x)?.slug ?? x;
    issue(
      ctx,
      ['teams'],
      `teams do not equal the registry (missing: ${missing.map(slugOf).join(', ') || 'none'}, extra: ${extra.join(', ') || 'none'}${missing.length || extra.length ? '' : '; order differs'})`,
    );
  }
  if (new Set(s.teams.map((t) => t.slug)).size !== s.teams.length) issue(ctx, ['teams'], 'duplicate team slug');
  if (new Set(s.teams.map((t) => t.abbr)).size !== s.teams.length) issue(ctx, ['teams'], 'duplicate team abbr');

  // 2. leagues, divisions, sections, per-division counts.
  const perDivision = new Map<string, number>();
  s.teams.forEach((t, i) => {
    const league = findLeague(t.league);
    if (!league) {
      issue(ctx, ['teams', i, 'league'], `unknown league ${t.league}`);
      return;
    }
    if (!league.divisions.some((d) => d.id === t.division)) {
      issue(ctx, ['teams', i, 'division'], `division ${t.division} is not in ${t.league}`);
    }
    if (t.section !== league.sectionId) issue(ctx, ['teams', i, 'section'], `section ${t.section} is not ${league.sectionId}`);
    perDivision.set(t.division, (perDivision.get(t.division) ?? 0) + 1);
  });
  for (const league of LEAGUES) {
    for (const d of league.divisions) {
      const n = perDivision.get(d.id) ?? 0;
      if (n !== d.expectedTeams) issue(ctx, ['teams'], `${d.id} has ${n} teams, expected ${d.expectedTeams}`);
    }
  }

  // 3. standings: one per team, division, points under the team's league, resolvedBy, status.
  const teamById = new Map(s.teams.map((t) => [t.id, t]));
  if (s.standings.length !== s.teams.length) issue(ctx, ['standings'], 'standings row count != team count');
  const seenStanding = new Set<string>();
  s.standings.forEach((r, i) => {
    if (seenStanding.has(r.teamId)) issue(ctx, ['standings', i], `duplicate standings row for ${r.slug}`);
    seenStanding.add(r.teamId);
    const team = teamById.get(r.teamId);
    if (!team) {
      issue(ctx, ['standings', i], `standings rows do not match the team registry (${r.slug})`);
      return;
    }
    if (r.division !== team.division) issue(ctx, ['standings', i, 'division'], `${r.slug}: division ${r.division} != ${team.division}`);
    const league = findLeague(team.league);
    if (!league) return;
    const p = league.rules.points;
    for (const key of ['computed', 'overall'] as const) {
      const c = r[key];
      if (c.pts !== p.win * c.w + p.tie * c.t + p.loss * c.l) {
        issue(ctx, ['standings', i, key, 'pts'], `pts is not ${p.win}w + ${p.tie}t under ${league.id}`);
      }
    }
    if (!allowedStages(team.league).has(r.tiebreak.resolvedBy)) {
      issue(ctx, ['standings', i, 'tiebreak', 'resolvedBy'], `${r.slug}: ${r.tiebreak.resolvedBy} is not a ${league.id} stage`);
    }
    if (r.hasReportedResults && !statusesOf(league.id).includes(r.playoffStatus)) {
      issue(ctx, ['standings', i, 'playoffStatus'], `${r.slug}: ${r.playoffStatus} is not a ${league.id} status`);
    }
  });
  for (const t of s.teams) {
    if (!seenStanding.has(t.id)) issue(ctx, ['standings'], `standings rows do not match the team registry (missing ${t.slug})`);
  }

  // 4. games.
  const degraded = new Set<DivisionId>();
  for (const h of s.leagueHealth) {
    for (const d of h.divisions) if (d.classification === 'fallback-contest-type') degraded.add(d.divisionId);
  }
  const contestIds = new Set<string>();
  const countedFixtures = new Map<string, string>();
  s.games.forEach((g, i) => {
    if (contestIds.has(g.contestId)) issue(ctx, ['games', i, 'contestId'], `duplicate contestId in games (${g.contestId})`);
    contestIds.add(g.contestId);
    for (const side of ['home', 'away'] as const) {
      const slug = g[side].slug;
      if (slug !== null && !getTeamBySlug(slug)) issue(ctx, ['games', i, side, 'slug'], `game side references an unknown slug (${slug})`);
    }
    if (g.leagueDivision !== null) {
      const ok = [g.home, g.away].every((side) => {
        const t = side.slug ? getTeamBySlug(side.slug) : undefined;
        return t?.division === g.leagueDivision;
      });
      if (!ok) issue(ctx, ['games', i, 'leagueDivision'], `leagueDivision ${g.leagueDivision} but a side is not a member`);
    }
    const expected = classifyGame(g, { degradedDivisions: degraded });
    if (g.countsFor !== expected) {
      issue(ctx, ['games', i, 'countsFor'], `countsFor ${g.countsFor} != classifyGame ${expected} (${g.contestId})`);
    }
    if (g.countsFor !== null && g.countsFor !== g.leagueDivision) {
      issue(ctx, ['games', i, 'countsFor'], 'countsFor differs from leagueDivision');
    }
    if (g.official) {
      const d = findDivision(g.official.division);
      if (!d) issue(ctx, ['games', i, 'official', 'division'], `unknown division ${g.official.division}`);
      else if (d.official.mode === 'none') {
        issue(ctx, ['games', i, 'official', 'division'], `${d.id} publishes no official schedule; a game cannot carry an official stamp for it`);
      } else if (g.official.source !== d.official.source) {
        issue(ctx, ['games', i, 'official', 'source'], `official source ${g.official.source} is not ${d.official.source}`);
      }
    }
    // 'SO' only between two teams of a section that decides a level varsity game by shootout (SectionConfig.
    // shootout: the Northern Section's 1 v 1s, the San Diego Section's shootout, which covers games between its
    // conferences too); without a tally, a level score flagged W/L. Keyed on the section, as lib/normalize.ts is.
    if (g.decider === 'SO') {
      const home = g.home.slug ? getTeamBySlug(g.home.slug) : undefined;
      const away = g.away.slug ? getTeamBySlug(g.away.slug) : undefined;
      const section = home && away && home.section === away.section ? getSection(home.section) : undefined;
      if (!section?.shootout) {
        issue(ctx, ['games', i, 'decider'], `decider SO but the sides are not two teams of a section that decides level games by shootout (${g.contestId})`);
      } else if (!section.shootout.coversTournaments && (g.contestTypes?.home === 2 || g.contestTypes?.away === 2)) {
        // The San Diego procedures do not cover invitational tournaments; lib/normalize.ts reads no 'SO' there.
        issue(ctx, ['games', i, 'decider'], `decider SO on a tournament row, which the ${section.name}'s shootout rule does not cover (${g.contestId})`);
      }
      if (g.shootout === null) {
        const flags = [g.home.result, g.away.result].sort().join('');
        if (g.home.score !== g.away.score || flags !== 'LW') {
          issue(ctx, ['games', i, 'decider'], `decider SO without a tally needs a level score flagged W/L (${g.contestId})`);
        }
      }
    }
    if (SBLIVE_ID_RE.test(g.contestId)) {
      if (g.provenance.scores !== 'sblive') issue(ctx, ['games', i, 'provenance', 'scores'], 'a sblive: game must carry sblive scores');
      if (g.urls.maxpreps !== null) issue(ctx, ['games', i, 'urls', 'maxpreps'], 'a sblive: game has no MaxPreps URL');
      if (!g.urls.sblive) issue(ctx, ['games', i, 'urls', 'sblive'], 'a sblive: game needs its si.com URL');
      if (g.provenance.backfill?.rule !== 'absent-fixture') {
        issue(ctx, ['games', i, 'provenance', 'backfill'], "a sblive: game needs backfill rule 'absent-fixture'");
      }
    }
    if (g.provenance.backfill && g.provenance.scores !== 'sblive') {
      issue(ctx, ['games', i, 'provenance', 'scores'], 'a backfilled game must carry sblive scores');
    }
    // One official fixture is one game: where the official schedule decides what counts, two counted
    // games stamped with the same fixture would count it twice.
    if (g.countsFor !== null && g.official) {
      const d = findDivision(g.countsFor);
      const league = d ? findLeague(d.leagueId) : undefined;
      if (league?.rules.classification === 'official-fixtures') {
        const prior = countedFixtures.get(g.official.fixtureId);
        if (prior !== undefined) {
          issue(
            ctx,
            ['games', i, 'official', 'fixtureId'],
            `official fixture ${g.official.fixtureId} is counted twice (${prior} and ${g.contestId})`,
          );
        } else countedFixtures.set(g.official.fixtureId, g.contestId);
      }
    }
  });

  // 5. official fixtures.
  (s.officialFixtures ?? []).forEach((f, i) => {
    const d = findDivision(f.division);
    if (!d) {
      issue(ctx, ['officialFixtures', i, 'division'], `unknown division ${f.division}`);
      return;
    }
    if (f.league !== d.leagueId) issue(ctx, ['officialFixtures', i, 'league'], `${f.league} is not the league of ${f.division}`);
    for (const key of ['awaySlug', 'homeSlug'] as const) {
      const slug = f[key];
      if (slug !== null && getTeamBySlug(slug)?.division !== f.division) {
        issue(ctx, ['officialFixtures', i, key], `${slug} is not a member of ${f.division}`);
      }
    }
    if (d.official.mode === 'none') {
      issue(ctx, ['officialFixtures', i, 'division'], `${d.id} publishes no official schedule; there is no official fixture for it`);
    } else if (f.source !== d.official.source) {
      issue(ctx, ['officialFixtures', i, 'source'], `source ${f.source} is not ${d.official.source}`);
    }
  });

  // 6. season = config (order included).
  const sectionIds = s.season.sections.map((x) => x.id).join('|');
  if (sectionIds !== SECTIONS.map((x) => x.id).join('|')) issue(ctx, ['season', 'sections'], 'season sections differ from config');
  if (s.season.leagues.map((l) => l.id).join('|') !== LEAGUES.map((l) => l.id).join('|')) {
    issue(ctx, ['season', 'leagues'], 'season leagues differ from config');
  }
  s.season.leagues.forEach((l, i) => {
    const league = findLeague(l.id);
    if (!league) return;
    if (l.divisions.map((d) => d.id).join('|') !== league.divisions.map((d) => d.id).join('|')) {
      issue(ctx, ['season', 'leagues', i, 'divisions'], `${l.id} divisions differ from config`);
    }
    l.divisions.forEach((d, j) => {
      const cfg = league.divisions.find((x) => x.id === d.id);
      if (cfg && cfg.maxprepsLeagueId !== d.maxprepsLeagueId) {
        issue(ctx, ['season', 'leagues', i, 'divisions', j, 'maxprepsLeagueId'], `${d.id} maxprepsLeagueId differs from config`);
      }
    });
    if (l.postseasonKind !== league.postseason.kind) {
      issue(ctx, ['season', 'leagues', i, 'postseasonKind'], `${l.id} postseasonKind differs from config`);
    }
  });

  // 7. the CCS field.
  const aq = s.playoffs.format.autoQualifiers;
  const keys = Object.keys(aq).sort().join('|');
  const expectedKeys = [...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort().join('|');
  if (keys !== expectedKeys) issue(ctx, ['playoffs', 'format', 'autoQualifiers'], `autoQualifiers keys ${keys} != ${expectedKeys}`);
  let sum = aq.atLarge ?? 0;
  for (const leagueId of CCS_LEAGUE_IDS) {
    if (aq[leagueId] !== CCS.autoQualifiers[leagueId]) {
      issue(ctx, ['playoffs', 'format', 'autoQualifiers', leagueId], `${leagueId} has ${aq[leagueId]} berths, config ${CCS.autoQualifiers[leagueId]}`);
    }
    sum += aq[leagueId] ?? 0;
  }
  if (sum !== aq.total) issue(ctx, ['playoffs', 'format', 'autoQualifiers'], `autoQualifiers sum ${sum} != total ${aq.total}`);

  // 8. one leagueHealth row per league, config order, with that league's divisions.
  if (s.leagueHealth.map((h) => h.leagueId).join('|') !== LEAGUES.map((l) => l.id).join('|')) {
    issue(ctx, ['leagueHealth'], 'leagueHealth rows must be one per configured league, config order');
  }
  s.leagueHealth.forEach((h, i) => {
    const league = findLeague(h.leagueId);
    if (!league) return;
    if (h.divisions.map((d) => d.divisionId).join('|') !== league.divisions.map((d) => d.id).join('|')) {
      issue(ctx, ['leagueHealth', i, 'divisions'], `${h.leagueId} health rows differ from its divisions`);
    }
  });

  // 9. cross-check slugs.
  s.crossCheck.forEach((r, i) => {
    if (!getTeamBySlug(r.slug)) issue(ctx, ['crossCheck', i, 'slug'], `unknown slug ${r.slug}`);
  });

  // 10. superseded si.com games.
  for (const [from, to] of Object.entries(s.supersededGames)) {
    if (!SBLIVE_ID_RE.test(from)) issue(ctx, ['supersededGames', from], 'a superseded key must be sblive:<digits>');
    if (contestIds.has(from)) issue(ctx, ['supersededGames', from], 'a superseded game is still in games');
    if (!contestIds.has(to)) issue(ctx, ['supersededGames', from], `superseding contest ${to} is not in games`);
  }

  // counts in step with the arrays.
  if (s.counts.teams !== s.teams.length) issue(ctx, ['counts', 'teams'], 'counts.teams is stale');
  if (s.counts.games !== s.games.length) issue(ctx, ['counts', 'games'], 'counts.games is stale');
}

export const SnapshotSchema: z.ZodType<Snapshot> = SnapshotObject.superRefine(checkAgainstConfig);

export type SnapshotOutput = z.infer<typeof SnapshotObject>;

// Compile-time proof that the schema and the hand-written types agree, in both directions.
const _schemaMatchesType = (s: SnapshotOutput): Snapshot => s;
const _typeMatchesSchema = (s: Snapshot): SnapshotOutput => s;
void _schemaMatchesType;
void _typeMatchesSchema;

/** Parse-or-throw (v2 only), with a readable message naming the first few failures. */
export function parseSnapshot(raw: unknown): Snapshot {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    const n = parsed.error.issues.length;
    throw new Error(
      `snapshot failed validation (${n} ${n === 1 ? 'issue' : 'issues'}):\n${formatIssues(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/**
 * v1 (no schemaVersion) → migrateV1ToV2; a v2 written before a configured league existed →
 * addConfiguredLeagues; a v2 whose games no longer classify under the current rules or registry →
 * reclassify; then parseSnapshot. Used by lib/data.ts and the pipeline's readPrevious.
 */
export function loadSnapshot(raw: unknown): Snapshot {
  const v2 = isSnapshotV1(raw) ? migrateV1ToV2(raw) : raw;
  const complete = lacksConfiguredLeagues(v2) ? addConfiguredLeagues(v2) : v2;
  return parseSnapshot(needsReclassification(complete) ? reclassify(complete) : complete);
}

// ---------------------------------------------------------------- canonical form

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
