/**
 * The shadow harness (pipeline inversion §10.0): every corpus, with no previous run and with its own output as the
 * previous run (claims seeded from that snapshot, and claims read from the file the earlier run wrote), every
 * variant, the carry cases of tests/pipeline/carry.test.ts, and runs that start from the committed snapshot and claims
 * file (merged games with si.com fills, box scores, school-calendar venues and sheet scores), run with
 * SCVAL_CLAIMS_SHADOW=1. At each stage moved onto claims, what the claims publish equals what the stage's legacy rule
 * publishes over the same input (tests/claims/support/shadow.ts). Each phase adds its stages to `STAGES_MIGRATED`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { claimsFileText, parseClaimsText, readClaimsFile } from '../../lib/claims/file';
import type { ClaimsFile, Stage } from '../../lib/claims/types';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Snapshot } from '../../lib/types';
import { REPO, corpusDir, corpusSnapshotPath, type CorpusName } from '../helpers';
import { snapshotOf, writeTempVariant, type RunCorpusOptions } from '../pipeline/support/run-corpus';
import { expectShadowAgrees, shadowStage } from './support/shadow';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
const STAGES_MIGRATED: readonly Stage[] = ['maxpreps', 'vnn', 'results'];
const CORPORA: readonly CorpusName[] = ['all-2026-10-02', 'eal-2026-10-04', 'socal-2026-10-06'];
const VARIANTS = ['bval-meta-wrong-season', 'bval-revised', 'finals-regression', 'leland-feed-503', 'mcal-postseason', 'pcal-standings-empty'];

beforeAll(() => {
  vi.stubEnv('SCVAL_CLAIMS_SHADOW', '1');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/** Runs `opts` and checks every migrated stage; returns the run's snapshot and claims. */
async function shadowRun(label: string, opts: RunCorpusOptions): Promise<{ snapshot: Snapshot; claims: ClaimsFile; carried: number }> {
  const { snapshot, run } = await snapshotOf({ steps: STEPS, ...opts });
  let carried = 0;
  for (const stage of STAGES_MIGRATED) expectShadowAgrees(run.ctx, stage, label);
  carried += shadowStage(run.ctx, 'maxpreps').carried.length;
  return { snapshot, claims: run.result!.claims, carried };
}

/** The corpus's own output (the cron script's, cached) as the previous run. */
function ownOutput(corpus: CorpusName): Snapshot {
  return loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath(corpus), 'utf8')) as unknown);
}

/** What a later run reads back: the snapshot and the claims file as written. */
function asWritten(run: { snapshot: Snapshot; claims: ClaimsFile }): { previous: Snapshot; claims: ClaimsFile } {
  return {
    previous: loadSnapshot(JSON.parse(JSON.stringify(run.snapshot)) as unknown),
    claims: parseClaimsText(claimsFileText(run.claims)),
  };
}

describe.each(CORPORA)('%s', (corpus) => {
  it('with no previous run, with its own output as the previous run, and with the claims file a run wrote', async () => {
    const first = await shadowRun(`${corpus} fresh`, { corpus });
    expect(first.carried).toBe(0);
    await shadowRun(`${corpus} seeded`, { corpus, previous: ownOutput(corpus) });
    await shadowRun(`${corpus} from file`, { corpus, ...asWritten(first) });
  });
});

describe('all-2026-10-02 variants', () => {
  it.each(VARIANTS)('%s', async (variant) => {
    await shadowRun(variant, { variants: [variant] });
  });

  it('a failed feed with a previous run, its claims seeded and read from the file', async () => {
    await shadowRun('leland-feed-503 seeded', { variants: ['leland-feed-503'], previous: ownOutput('all-2026-10-02') });
    const first = await shadowRun('fresh', {});
    await shadowRun('leland-feed-503 from file', { variants: ['leland-feed-503'], ...asWritten(first) });
  });

  it('a run of one league: the other leagues’ feeds are not fetched, and their games are carried from the claims', async () => {
    const extraArgs = ['--leagues', 'scval'];
    const seeded = await shadowRun('--leagues scval seeded', { previous: ownOutput('all-2026-10-02'), extraArgs });
    expect(seeded.carried).toBeGreaterThan(0);
    const first = await shadowRun('fresh', {});
    const fromFile = await shadowRun('--leagues scval from file', { ...asWritten(first), extraArgs });
    expect(fromFile.carried).toBeGreaterThan(0);
  });
});

describe('from the committed snapshot and claims file', () => {
  const ALL_LEAGUES = 'scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents';
  const committed = () => ({
    previous: loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown),
    claims: readClaimsFile(path.join(REPO, 'data', 'claims.json')),
  });

  it.each([
    ['a failed feed', { variants: ['leland-feed-503'] }],
    ['a run of one league', { extraArgs: ['--leagues', 'mcal'] }],
    ['a run of two leagues without si.com or school calendars', { extraArgs: ['--leagues', 'pcal,bval', '--no-sblive', '--no-vnn'] }],
    ['the SoCal corpus', { corpus: 'socal-2026-10-06' as CorpusName }],
  ])('%s', async (label, opts: RunCorpusOptions) => {
    const extraArgs = [...(opts.extraArgs ?? []), '--accept-regression', ALL_LEAGUES];
    const read = committed();
    await shadowRun(`committed, ${label}`, { ...opts, extraArgs, previous: read.previous, claims: read.claims });
    await shadowRun(`committed seeded, ${label}`, { ...opts, extraArgs, previous: read.previous });
  });
});

describe('the carry cases of tests/pipeline/carry.test.ts', () => {
  const schedule = (slug: string) => readFileSync(path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'schedule', `${slug}.json`), 'utf8');

  it('MaxPreps re-keys a contest while the other team’s feed fails', async () => {
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/stevenson': {
        rel: 'stevenson.json',
        body: schedule('stevenson').split('f999e2b1-aa11-4c04-925a-da2c5bd56fff').join('22222222-3333-4444-8555-666666666666'),
      },
    });
    await shadowRun('re-key', { variants: [variant], previous: ownOutput('all-2026-10-02') });
  });

  it('MaxPreps adds the contest a si.com fill stood in for while a feed fails', async () => {
    const row = JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'pipeline', 'santa-catalina-gre-0904-row.json'), 'utf8')) as unknown;
    const cat = JSON.parse(schedule('santa-catalina')) as { data: unknown[] };
    const variant = writeTempVariant({
      'maxpreps/schedule/greenfield': 503,
      'maxpreps/schedule/santa-catalina': { rel: 'santa-catalina.json', body: JSON.stringify({ ...cat, data: [...cat.data, row] }) },
    });
    await shadowRun('fill replaced', { variants: [variant], previous: ownOutput('all-2026-10-02') });
  });
});
