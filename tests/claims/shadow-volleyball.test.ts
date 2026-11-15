/**
 * The per-stage trace check (tests/claims/shadow.test.ts) on the volleyball corpus, in a volleyball build: the sport
 * switch is read at import (lib/sports/current.ts), so this file sets it before importing anything that reads it.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Snapshot } from '../../lib/types';

const CORPUS = 'volleyball-2026-11-14' as const;

let support: typeof import('../pipeline/support/run-corpus');
let shadow: typeof import('./support/shadow');
let previous: Snapshot;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'volleyball');
  vi.stubEnv('SCVAL_STAGE_TRACE', '1');
  vi.resetModules();
  support = await import('../pipeline/support/run-corpus');
  shadow = await import('./support/shadow');
  const { corpusSnapshotPath } = await import('../helpers');
  const { loadSnapshot } = await import('../../lib/snapshot/snapshot-load');
  previous = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath(CORPUS), 'utf8')) as unknown);
}, 120_000);
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('volleyball-2026-11-14', () => {
  it('with no previous run and with its own output as the previous run', async () => {
    const { stepOfficial } = await import('../../lib/pipeline/steps/official');
    const { stepSblive } = await import('../../lib/pipeline/steps/sblive');
    const steps = { official: stepOfficial, sblive: stepSblive };
    const fresh = await support.snapshotOf({ corpus: CORPUS, steps });
    expect(fresh.run.result?.claims.sport).toBe('volleyball');
    for (const stage of ['maxpreps', 'official', 'sblive', 'sdsSheet'] as const) shadow.expectTraceAgrees(fresh.run.ctx, stage, 'volleyball fresh');
    const seeded = await support.snapshotOf({ corpus: CORPUS, steps, previous });
    for (const stage of ['maxpreps', 'official', 'sblive', 'sdsSheet'] as const) shadow.expectTraceAgrees(seeded.run.ctx, stage, 'volleyball seeded');
  });
});
