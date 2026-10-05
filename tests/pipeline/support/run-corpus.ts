/**
 * Runs the real pipeline in-process over a corpus with the unit tests' (no-op or stand-in) official
 * and si.com steps. A `previous` snapshot object can be handed in directly (it is not re-parsed), so a
 * test can shape exactly the previous run a guard compares against.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { PipelineResult, PipelineSteps, RunArgs, Transport } from '../../../lib/pipeline/contract';
import { loadCorpus } from '../../../lib/pipeline/corpus';
import { SILENT_SINK, type PipelineContext } from '../../../lib/pipeline/ledger';
import { createPipelineContext, parseRunArgs, runPipeline } from '../../../lib/pipeline/run';
import { FixtureTransport } from '../../../lib/pipeline/transport';
import type { Snapshot } from '../../../lib/types';
import { REPO, corpusDir, variantDir, type CorpusName } from '../../helpers';
import { NOOP_STEPS } from './noop-steps';

export interface RunCorpusOptions {
  corpus?: CorpusName;
  /** Variant names (tests/fixtures/corpus/variants/) or directories. */
  variants?: readonly string[];
  previous?: Snapshot | null;
  fetchedAt?: string;
  /** More CLI flags (`--leagues`, `--accept-regression`, `--force` …). */
  extraArgs?: readonly string[];
  steps?: PipelineSteps;
  /** Wrap the fixture transport (latency, failure injection). */
  wrap?: (t: Transport) => Transport;
}

export interface CorpusRun {
  result: PipelineResult | null;
  ctx: PipelineContext;
  args: RunArgs;
}

export async function runCorpus(opts: RunCorpusOptions = {}): Promise<CorpusRun> {
  const dir = corpusDir(opts.corpus ?? 'all-2026-10-02');
  const variants = (opts.variants ?? []).map(variantDir);
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-run-')), 'snapshot.json');
  const parsed = parseRunArgs(
    [
      '--fixtures', dir,
      ...variants.flatMap((v) => ['--variant', v]),
      '--out', out,
      '--dry-run',
      ...(opts.fetchedAt ? ['--fetched-at', opts.fetchedAt] : []),
      ...(opts.extraArgs ?? []),
    ],
    { cwd: REPO, now: '2026-10-02T15:00:00.000Z' },
  );
  const corpus = loadCorpus(dir, variants);
  const args: RunArgs = {
    ...parsed,
    fetchedAt: parsed.fetchedAt || corpus.fetchedAt,
    leagues: parsed.leagues ?? corpus.leagues,
  };
  const fixture: Transport = new FixtureTransport(corpus);
  const ctx = createPipelineContext({
    args,
    transport: opts.wrap ? opts.wrap(fixture) : fixture,
    previous: opts.previous ?? null,
    sink: SILENT_SINK,
  });
  const result = await runPipeline(ctx, opts.steps ?? NOOP_STEPS);
  return { result, ctx, args };
}

/** runCorpus that must produce a snapshot. */
export async function snapshotOf(opts: RunCorpusOptions = {}): Promise<{ snapshot: Snapshot; run: CorpusRun }> {
  const run = await runCorpus(opts);
  if (!run.result) throw new Error('the pipeline did not run (season window?)');
  return { snapshot: run.result.snapshot, run };
}

/** A temp variant whose manifest maps the given resources to HTTP statuses (or files written beside it). */
export function writeTempVariant(files: Record<string, number | { rel: string; body: string }>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-variant-'));
  const manifestFiles: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(files)) {
    if (typeof value === 'number') {
      manifestFiles[key] = value;
      continue;
    }
    const file = path.join(dir, value.rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value.body, 'utf8');
    manifestFiles[key] = value.rel;
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id: path.basename(dir), files: manifestFiles }), 'utf8');
  return dir;
}

