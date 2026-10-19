/**
 * The RunContext implementation (SPEC §7.2): PipelineContext owns the run's three ledgers
 * (lib/pipeline/ledger.ts), the log sink and the metered transport, and answers the RunContext and
 * StepContext reads and records (lib/pipeline/contract.ts) on their behalf.
 *
 * No clock: `today` is localDateKey(fetchedAt), never Date.now().
 */

import { LEAGUES } from '@/lib/config/leagues';
import type { DroppedContest, LeagueRunState, SourceStatus } from '@/lib/model/health';
import type { LeagueId } from '@/lib/model/ids';
import type { Snapshot } from '@/lib/model/snapshot';
import { localDateKey } from '@/lib/shared/dates';

import type { RunArgs, StepContext, Transport } from './contract';
import { DroppedLedger, LeagueLedger, SourceLedger } from './ledger';
import { MeteredTransport } from './transport';

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

/** The pipeline core's RunContext and StepContext: what steps may read and record (SPEC §7.2). */
export class PipelineContext implements StepContext {
  readonly args: RunArgs;
  readonly fetchedAt: string;
  readonly today: string;
  readonly previous: Snapshot | null;
  readonly transport: Transport;
  readonly sources = new SourceLedger();
  readonly leagues = new LeagueLedger();
  readonly droppedLedger = new DroppedLedger();
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
    this.droppedLedger.add(row);
  }

  dropped(): DroppedContest[] {
    return this.droppedLedger.all();
  }

  leagueState(leagueId: LeagueId): LeagueRunState {
    return this.leagues.state(leagueId);
  }

  markStale(pick: (row: SourceStatus) => boolean, note: string, carriedFrom?: string): number {
    return this.sources.markStale(pick, note, carriedFrom);
  }

  leaguesInRun(): readonly LeagueId[] {
    return this.inRun;
  }
}


export interface CreateContextInit {
  args: RunArgs;
  /** The raw transport; it is wrapped in a MeteredTransport (request counts, `maxpreps GET` lines). */
  transport: Transport;
  previous: Snapshot | null;
  sink?: LogSink;
}

/** A PipelineContext whose transport is metered and logs through the context. */
export function createPipelineContext(init: CreateContextInit): PipelineContext {
  let ctx: PipelineContext | null = null;
  const metered = new MeteredTransport(init.transport, (line) => ctx?.log(line));
  ctx = new PipelineContext({ args: init.args, transport: metered, previous: init.previous, sink: init.sink });
  return ctx;
}
