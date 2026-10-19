/**
 * The run's three ledgers (SPEC §7.2 RunContext, §7.5, §7.11):
 *
 *  - SourceLedger   every SourceStatus row, returned in the deterministic §7.11 order however the
 *                   steps interleaved their requests;
 *  - LeagueLedger   one state machine per configured league (fresh → partial → degraded | frozen,
 *                   never back) with its reason sentences;
 *  - DroppedLedger  contests removed on purpose, deduped on (contestId, reason).
 *
 * PipelineContext (lib/pipeline/context.ts) holds one of each; the previous run's reads are in
 * lib/pipeline/previous.ts and the run's working state in lib/pipeline/state.ts.
 */

import { LEAGUES, findDivision } from '@/lib/config/leagues';
import type { DroppedContest, LeagueRunState, SourceStatus } from '@/lib/model/health';
import type { LeagueId } from '@/lib/model/ids';
import { TEAMS, getTeamBySlug } from '@/lib/registry/teams';
import { cifssSectionIndexOfUrl } from '@/lib/sources/cifss';

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
  if (kind === 'cifss-scores') return [3, 1, cifssSectionIndexOfUrl(row.url), 0, '', seq];
  if (kind === 'ccs-calendar') return [4, 0, 0, 0, '', seq];
  if (kind === 'ccs-bracket') return [4, 1, 0, 0, '', seq];
  return [5, 0, 0, 0, '', seq];
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
