/**
 * The run-level facts resolve reads (lib/claims/types.ts RunFacts): which feeds and sources this run read. Each
 * source not yet resolved from claims reports itself as not read, so a stage that has not moved to claims cannot
 * read a fact it does not have yet.
 */

import type { RunFacts, SourceReads } from '../claims/types';
import type { PipelineContext, RunState } from './ledger';

export function runFactsOf(ctx: PipelineContext, state: RunState, reads: Partial<SourceReads> = {}): RunFacts {
  return {
    fetchedAt: ctx.fetchedAt,
    today: ctx.today,
    leaguesInRun: ctx.leaguesInRun(),
    reads: {
      maxprepsFeeds: new Map([...state.feeds].map(([slug, f]) => [slug, f.status])),
      officialDivisions: new Map(),
      sblive: { read: false, consulted: () => false },
      vnnSites: new Map(),
      sdsTabs: new Map(),
      cifss: 'none',
      box: false,
      ...reads,
    },
    degradedDivisions: new Set(),
  };
}
