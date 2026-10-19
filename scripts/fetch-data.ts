#!/usr/bin/env tsx
/**
 * The cron entry point (SPEC §7.12): a thin CLI over lib/pipeline/ — parse args → RunContext →
 * runPipeline → write outputs. A run abort (RunAbort) exits 1 and writes nothing, so the previous
 * snapshot stays.
 *
 *   pnpm fetch-data                          live: the 131-request MaxPreps sweep (1 bootstrap + 14 league
 *                                            metas + 14 standings + 102 schedules, ≤3 concurrent, ≥500 ms
 *                                            apart; the San Diego Valley division and the Southern Section
 *                                            independents have no MaxPreps table and are not requested) plus the official, si.com, VNN and
 *                                            CCS sources
 *   pnpm fetch-data --fixtures <dir>         offline: a manifest-driven corpus (lib/pipeline/corpus.ts)
 *   pnpm fetch-data --variant <dir>          … with a variant overlay (repeatable)
 *   pnpm fetch-data --capture <dir>          live, recording every response into a new corpus
 *   pnpm fetch-data --leagues scval,bval     fetch only these; the others are carried forward, frozen
 *   pnpm fetch-data --accept-regression bval skip the finals-regression guard for BVAL this run
 *   pnpm fetch-data --out <path> · --dry-run · --fetched-at <iso> · --force
 *   pnpm fetch-data --no-sblive · --sblive-full · --no-official (alias --no-scval) · --no-ccs · --no-vnn
 *
 * Modules load inside main() so that a config or registry invariant failing at import
 * (assertLeagues / assertRegistry, §7.5 run-abort trigger 2) is reported as an abort, not a crash:
 * lib/pipeline/run-failure.ts classifies the throw (a RunAbort or a ConfigInvariantError, lib/config/invariant.ts).
 */

import { runCli } from './lib/cli';

/**
 * How a throw is reported (runCli's onError), once main() has loaded it: until then a throw is the
 * plain `FAILED: <message>` line.
 */
let describeRunFailure: ((err: unknown) => { line: string }) | null = null;

async function main(argv: readonly string[]): Promise<number> {
  ({ describeRunFailure } = await import('@/lib/pipeline/run-failure'));
  const cli = await import('@/lib/pipeline/cli');
  const run = await import('@/lib/pipeline/run');
  const args = cli.parseRunArgs(argv, { cwd: process.cwd(), now: new Date().toISOString() });
  if (args.help) {
    console.log(cli.USAGE);
    return 0;
  }
  const { stepOfficial } = await import('@/lib/pipeline/steps/official');
  const { stepSblive } = await import('@/lib/pipeline/steps/sblive');
  const { args: resolved, ctx } = cli.prepareRun(args);
  const result = await run.runPipeline(ctx, { official: stepOfficial, sblive: stepSblive });
  if (result === null) return 0; // out of season: nothing fetched, nothing written
  if (resolved.dryRun) {
    ctx.log('dry run: nothing written');
    return 0;
  }
  const metaPath = cli.writeOutputs(resolved.out, result);
  const rel = (p: string) => p.replace(`${process.cwd()}/`, '');
  ctx.log(`wrote ${rel(resolved.out)} and ${rel(metaPath)}`);
  return 0;
}

runCli(main, { onError: (err) => describeRunFailure?.(err).line ?? null });
