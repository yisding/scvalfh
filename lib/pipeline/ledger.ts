/**
 * The run's ledgers (SPEC §7.2 RunContext, §7.5, §7.11) and the RunContext implementation:
 *
 *  - SourceLedger   every SourceStatus row, returned in the deterministic §7.11 order however the
 *                   steps interleaved their requests;
 *  - LeagueLedger   one state machine per configured league (fresh → partial → degraded | frozen,
 *                   never back) with its reason sentences;
 *  - DroppedLedger  contests removed on purpose, deduped on (contestId, reason).
 *
 * No clock: `today` is localDateKey(fetchedAt), never Date.now().
 */

import { localDateKey, shortDate, timeOfDay, toLocalTimestamp } from '../format';
import { LEAGUES, findDivision } from '../leagues';
import { CIFSS_SECTIONS } from '../sources/cifss';
import type { ScheduleRow } from '../sources/maxpreps';
import { TEAMS, getTeamBySlug } from '../teams';
import type {
  CifssCrossCheck,
  DivisionHealth,
  DivisionId,
  DroppedContest,
  Game,
  LeagueHealth,
  LeagueId,
  LeagueRunState,
  OfficialFixture,
  ReportedRecord,
  SbliveCrossCheck,
  Snapshot,
  SourceStatus,
  TeamId,
  TeamSlug,
} from '../types';
import type { OfficialStepResult, RunArgs, RunContext, SecondaryStepResult, Transport } from './contract';

// ---------------------------------------------------------------- sources

const LEAGUE_INDEX = new Map<LeagueId, number>(LEAGUES.map((l, i) => [l.id, i]));
const DIVISION_INDEX = new Map<string, number>(LEAGUES.flatMap((l) => l.divisions.map((d, i) => [d.id, i] as const)));
const TEAM_INDEX = new Map<string, number>(TEAMS.map((t, i) => [t.slug, i]));

/** The league a row is about: scope.league, else the division's league, else the team's. */
export function leagueOfRow(row: SourceStatus): LeagueId | null {
  const scope = row.scope;
  if (!scope) return null;
  if (scope.league) return scope.league;
  if (scope.division) return findDivision(scope.division)?.leagueId ?? null;
  if (scope.team) return getTeamBySlug(scope.team)?.league ?? null;
  return null;
}

/** Within a league: metas, reported tables, team schedules, then official schedule and revision checks. */
const LEAGUE_SUB: Partial<Record<NonNullable<SourceStatus['kind']>, number>> = {
  'league-meta': 0,
  'reported-standings': 1,
  'team-schedule': 2,
  'official-schedule': 3,
  'official-revision-check': 3,
  'standings-index': 3,
};

type SortKey = [number, number, number, number, string, number];

function sortKey(row: SourceStatus, seq: number): SortKey {
  const kind = row.kind;
  if (kind === 'bootstrap') return [0, 0, 0, 0, '', seq];
  if (kind !== undefined && LEAGUE_SUB[kind] !== undefined) {
    const league = leagueOfRow(row);
    const li = league !== null ? (LEAGUE_INDEX.get(league) ?? LEAGUES.length) : LEAGUES.length;
    const sub = LEAGUE_SUB[kind] as number;
    // Registry order for team rows; config division order for the others (a league-wide row last),
    // and within a division's official rows: schedule, revision check, standings index.
    const second =
      kind === 'team-schedule'
        ? (TEAM_INDEX.get(row.scope?.team ?? '') ?? TEAMS.length)
        : (DIVISION_INDEX.get(row.scope?.division ?? '') ?? 99);
    const third = kind === 'official-revision-check' ? 1 : kind === 'standings-index' ? 2 : 0;
    return [1, li, sub, second, String(third), seq];
  }
  if (kind === 'sblive-scoreboard') return [2, 0, 0, 0, row.url, seq];
  if (kind === 'sblive-team-games') return [2, 1, 0, 0, row.scope?.team ?? row.url, seq];
  if (kind === 'school-calendar') return [3, 0, TEAM_INDEX.get(row.scope?.team ?? '') ?? TEAMS.length, 0, '', seq];
  if (kind === 'cifss-scores') return [3, 1, cifssSectionIndex(row.url), 0, '', seq];
  if (kind === 'ccs-calendar') return [4, 0, 0, 0, '', seq];
  if (kind === 'ccs-bracket') return [4, 1, 0, 0, '', seq];
  return [5, 0, 0, 0, '', seq];
}

/** A cifsshome.org row's Section in CIFSS_SECTIONS order, read from its listing URL's section_id. */
function cifssSectionIndex(url: string): number {
  const id = /[?&]section_id=(\d+)/.exec(url)?.[1];
  const i = CIFSS_SECTIONS.findIndex((s) => String(s.sectionId) === id);
  return i === -1 ? CIFSS_SECTIONS.length : i;
}

function compareKeys(a: SortKey, b: SortKey): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'string') return x < (y as string) ? -1 : 1;
    return (x as number) - (y as number);
  }
  return 0;
}

export class SourceLedger {
  private readonly rows: Array<{ row: SourceStatus; seq: number }> = [];

  add(row: SourceStatus): void {
    this.rows.push({ row, seq: this.rows.length });
  }

  /** Relabel this run's rows matching `pick` that did not succeed (status 'stale', note appended). */
  markStale(pick: (row: SourceStatus) => boolean, note: string, carriedFrom?: string): number {
    let n = 0;
    for (const slot of this.rows) {
      const { row } = slot;
      if (!pick(row) || row.status === 'ok') continue;
      slot.row = {
        ...row,
        status: 'stale',
        error: row.error ? `${row.error}; ${note}` : note,
        ...(carriedFrom && !row.carriedFrom ? { carriedFrom } : {}),
      };
      n += 1;
    }
    return n;
  }

  /** Rows in insertion order. */
  all(): SourceStatus[] {
    return this.rows.map((r) => r.row);
  }

  /** SPEC §7.11 order: bootstrap; per league in config order its metas, reported tables, team schedules (registry order), official rows; si.com scoreboards by date, si.com team pages by slug; VNN; cifsshome.org by Section; CCS. */
  ordered(): SourceStatus[] {
    return this.rows
      .map((r) => ({ r, k: sortKey(r.row, r.seq) }))
      .sort((a, b) => compareKeys(a.k, b.k))
      .map(({ r }) => r.row);
  }
}

// ---------------------------------------------------------------- leagues

const STATE_RANK: Record<LeagueRunState, number> = { fresh: 0, partial: 1, degraded: 2, frozen: 3 };

export interface LeagueEntry {
  state: LeagueRunState;
  reasons: string[];
  /** Short causes for the commit summary ("meta season mismatch"), in order. */
  causes: string[];
  /** The cause given with the degrade that last raised `state`: what the commit summary prints. */
  stateCause?: string;
}

export class LeagueLedger {
  private readonly leagues = new Map<LeagueId, LeagueEntry>();

  constructor(ids: readonly LeagueId[] = LEAGUES.map((l) => l.id)) {
    for (const id of ids) this.leagues.set(id, { state: 'fresh', reasons: [], causes: [] });
  }

  private entry(id: LeagueId): LeagueEntry {
    const e = this.leagues.get(id);
    if (!e) throw new Error(`lib/pipeline/ledger.ts: unknown league ${id}`);
    return e;
  }

  /**
   * Only ever towards worse; the reason and cause are recorded whatever the state does (deduped), and
   * a cause that comes with a strictly worse state becomes the state's own cause.
   */
  degrade(id: LeagueId, state: Exclude<LeagueRunState, 'fresh'>, reason: string, cause?: string): void {
    const e = this.entry(id);
    if (STATE_RANK[state] > STATE_RANK[e.state]) {
      e.state = state;
      if (cause) e.stateCause = cause;
    }
    if (reason && !e.reasons.includes(reason)) e.reasons.push(reason);
    if (cause && !e.causes.includes(cause)) e.causes.push(cause);
  }

  state(id: LeagueId): LeagueRunState {
    return this.entry(id).state;
  }

  reasons(id: LeagueId): readonly string[] {
    return this.entry(id).reasons;
  }

  causes(id: LeagueId): readonly string[] {
    return this.entry(id).causes;
  }

  /** The cause that set the league's current state, else its first recorded cause. */
  stateCause(id: LeagueId): string | undefined {
    const e = this.entry(id);
    return e.stateCause ?? e.causes[0];
  }

  ids(): LeagueId[] {
    return [...this.leagues.keys()];
  }
}

// ---------------------------------------------------------------- dropped

export class DroppedLedger {
  private readonly rows: DroppedContest[] = [];
  private readonly seen = new Set<string>();

  add(row: DroppedContest): void {
    const key = `${row.contestId}|${row.reason}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.rows.push(row);
  }

  /** Sorted by dateKey (nulls last), then contestId: stable across runs whatever the feed order. */
  all(): DroppedContest[] {
    return [...this.rows].sort((a, b) => {
      const da = a.dateKey ?? '9999-99-99';
      const db = b.dateKey ?? '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
      if (a.contestId !== b.contestId) return a.contestId < b.contestId ? -1 : 1;
      return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
    });
  }
}

// ---------------------------------------------------------------- the run context

export interface LogSink {
  log(line: string): void;
  warn(line: string): void;
}

/** console.log / console.warn. */
export const CONSOLE_SINK: LogSink = {
  log: (line) => console.log(line),
  warn: (line) => console.warn(line),
};

export const SILENT_SINK: LogSink = { log: () => {}, warn: () => {} };

export interface RunContextInit {
  args: RunArgs;
  transport: Transport;
  previous: Snapshot | null;
  sink?: LogSink;
}

/** The pipeline core's RunContext: what steps may read and record (SPEC §7.2). */
export class PipelineContext implements RunContext {
  readonly args: RunArgs;
  readonly fetchedAt: string;
  readonly today: string;
  readonly previous: Snapshot | null;
  readonly transport: Transport;
  readonly sources = new SourceLedger();
  readonly leagues = new LeagueLedger();
  readonly dropped = new DroppedLedger();
  readonly logLines: string[] = [];
  private readonly sink: LogSink;
  private readonly inRun: readonly LeagueId[];

  constructor(init: RunContextInit) {
    this.args = init.args;
    this.fetchedAt = init.args.fetchedAt;
    this.today = localDateKey(init.args.fetchedAt);
    this.previous = init.previous;
    this.transport = init.transport;
    this.sink = init.sink ?? CONSOLE_SINK;
    const wanted = init.args.leagues;
    // Config order, whatever order the flag listed them in.
    this.inRun = LEAGUES.map((l) => l.id).filter((id) => wanted === null || wanted.includes(id));
  }

  log(line: string): void {
    this.logLines.push(line);
    this.sink.log(line);
  }

  warn(line: string, scope?: SourceStatus['scope']): void {
    const where = scope ? ` [${[scope.league, scope.division, scope.team].filter(Boolean).join('/')}]` : '';
    const text = `WARN ${line}${where}`;
    this.logLines.push(text);
    this.sink.warn(text);
  }

  source(row: SourceStatus): void {
    this.sources.add(row);
  }

  degrade(leagueId: LeagueId, state: Exclude<LeagueRunState, 'fresh'>, reason: string, cause?: string): void {
    this.leagues.degrade(leagueId, state, reason, cause);
  }

  drop(row: DroppedContest): void {
    this.dropped.add(row);
  }

  leaguesInRun(): readonly LeagueId[] {
    return this.inRun;
  }
}

// ---------------------------------------------------------------- the previous run

/** 'Tue Sep 29, 7:02 AM' (Pacific) for an ISO UTC stamp — the "shown as of" stamp in reasons. */
export function asOfStamp(iso: string): string {
  const local = toLocalTimestamp(iso);
  return `${shortDate(local)}, ${timeOfDay(local)}`;
}

/** 'Tue Sep 29' (Pacific) for an ISO UTC stamp. */
export function asOfDay(iso: string): string {
  return shortDate(toLocalTimestamp(iso));
}

export function previousLeagueHealth(previous: Snapshot | null, leagueId: LeagueId): LeagueHealth | null {
  return previous?.leagueHealth.find((h) => h.leagueId === leagueId) ?? null;
}

export function previousDivisionHealth(previous: Snapshot | null, division: DivisionId): DivisionHealth | null {
  for (const h of previous?.leagueHealth ?? []) {
    const d = h.divisions.find((x) => x.divisionId === division);
    if (d) return d;
  }
  return null;
}

/**
 * The previous snapshot holds this league's data: it has a health row whose `lastFreshAt` is set
 * (the league was fresh or partial in some earlier run, and a frozen run carries those rows). A
 * v1-migrated snapshot's BVAL/PCAL/MCAL rows (lastFreshAt null), and the EAL row a pre-EAL v2 file
 * gains on load (lib/snapshot-migrate.ts addConfiguredLeagues, lastFreshAt null), hold nothing to carry.
 */
export function hasPreviousData(previous: Snapshot | null, leagueId: LeagueId): boolean {
  return previousLeagueHealth(previous, leagueId)?.lastFreshAt != null;
}

/**
 * The "shown as of" stamp of a league's previous data (asOfStamp of its lastFreshAt), or null when the
 * previous snapshot holds nothing to carry for it (hasPreviousData).
 */
export function lastFreshStamp(previous: Snapshot | null, leagueId: LeagueId): string | null {
  const lastFresh = previousLeagueHealth(previous, leagueId)?.lastFreshAt ?? null;
  return lastFresh === null ? null : asOfStamp(lastFresh);
}

/** When a carried source's data was last fresh: the previous row's own stamp, else the previous run's. */
export function carriedFromOf(previous: Snapshot | null, pick: (row: SourceStatus) => boolean): string | undefined {
  if (!previous) return undefined;
  const prev = previous.sources.find(pick);
  if (prev?.status === 'ok') return prev.fetchedAt;
  if (prev?.carriedFrom) return prev.carriedFrom;
  return previous.fetchedAt;
}

// ---------------------------------------------------------------- the run's working state

export interface DivisionRunInfo {
  meta: DivisionHealth['meta'];
  reportedTable: DivisionHealth['reportedTable'];
  reportedRows: number | null;
}

export interface TeamFeedInfo {
  slug: TeamSlug;
  teamId: TeamId;
  league: LeagueId;
  /** 'skipped' = not in the corpus / no data source; 'not-fetched' = its league is not in this run. */
  status: 'ok' | 'failed' | 'skipped' | 'not-fetched';
  /** Its games were carried from the previous snapshot. */
  carried: boolean;
}

/**
 * What the built-in steps (lib/pipeline/steps/*) share through run.ts. The injectable official and
 * si.com steps (PipelineSteps) never see it: they get only RunContext and their step input.
 */
export interface RunState {
  divisions: Map<DivisionId, DivisionRunInfo>;
  /** MaxPreps' reported rows, keyed on schoolId (cross-check only). */
  reported: Map<TeamId, ReportedRecord>;
  feeds: Map<TeamSlug, TeamFeedInfo>;
  /** Raw schedule rows of the feeds read this run, TBA rows split off, registry order. */
  rows: ScheduleRow[];
  /** One per TBA row split off a feed. */
  tbaDropped: DroppedContest[];
  games: Game[];
  unmatched: OfficialFixture[];
  /** The official step's flags and sets; its games and fixtures moved into `games` / `unmatched`. */
  official: Omit<OfficialStepResult, 'games' | 'unmatched'>;
  sbliveCrossCheck: SbliveCrossCheck | undefined;
  /** Step 11b's cifsshome.org report (undefined: none this run and none to carry). */
  cifssCrossCheck: CifssCrossCheck | undefined;
  /** The secondary step's CCS state; its games moved into `games`. */
  secondary: Omit<SecondaryStepResult, 'games'>;
  /** Leagues whose intra-league games and fixtures were substituted from the previous snapshot. */
  frozenFromPrevious: Set<LeagueId>;
  /** DivisionHealth.classification per division (a frozen league's is copied from the previous health). */
  classification: Map<DivisionId, DivisionHealth['classification']>;
}

export function emptyRunState(): RunState {
  return {
    divisions: new Map(),
    reported: new Map(),
    feeds: new Map(),
    rows: [],
    tbaDropped: [],
    games: [],
    unmatched: [],
    official: {
      degradedDivisions: new Set(),
      revisedUpstream: new Set(),
      carriedDivisions: new Set(),
    },
    sbliveCrossCheck: undefined,
    cifssCrossCheck: undefined,
    secondary: { bracketPublished: false },
    frozenFromPrevious: new Set(),
    classification: new Map(),
  };
}
