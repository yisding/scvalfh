/**
 * The shadow harness (pipeline inversion §10.0): every corpus, with no previous run and with its own output as the
 * previous run (claims seeded from that snapshot, and claims read from the file the earlier run wrote), every
 * variant, the carry cases of tests/pipeline/carry.test.ts, and runs that start from the committed snapshot and claims
 * file (merged games with si.com fills, box scores, school-calendar venues and sheet scores), run with
 * SCVAL_CLAIMS_SHADOW=1. At each stage moved onto claims, what the claims publish equals what the stage's legacy rule
 * publishes over the same input (tests/claims/support/shadow.ts). Each phase adds its stages to `STAGES_MIGRATED`.
 * No corpus reads the San Diego bracket sheet, so the SoCal corpus is also run on a playoff day with the sheet's tabs
 * of 2026-11-06 (tests/fixtures/sds/sheet-2026/), whole, failed and partly unreadable.
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
const STAGES_MIGRATED: readonly Stage[] = ['maxpreps', 'official', 'vnn', 'sdsSheet', 'results'];
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

  it('without the official schedules: the live divisions are carried from the official claims', async () => {
    const extraArgs = ['--no-official'];
    await shadowRun('--no-official seeded', { previous: ownOutput('all-2026-10-02'), extraArgs });
    const first = await shadowRun('fresh', {});
    const fromFile = await snapshotOf({ steps: STEPS, ...asWritten(first), extraArgs });
    expectShadowAgrees(fromFile.run.ctx, 'official', '--no-official from file');
    expect(fromFile.run.ctx.shadow?.filter((r) => r.stage === 'official' && r.kind === 'carry')).toHaveLength(2);
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
    ['a run without the official schedules', { extraArgs: ['--leagues', 'scval,bval', '--no-official'] }],
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

describe('the San Diego bracket sheet, read on a playoff day', () => {
  const PLAYOFF_DAY = '2026-11-07T15:00:00.000Z';
  const tab = (division: string, edit: (csv: string) => string = (csv) => csv) => ({
    rel: `${division}.csv`,
    body: edit(readFileSync(path.join(REPO, 'tests', 'fixtures', 'sds', 'sheet-2026', `${division}.csv`), 'utf8')),
  });
  const read = () => writeTempVariant({
    'sds/bracket-sheet/open': tab('open'),
    'sds/bracket-sheet/division-1': tab('division-1'),
    'sds/bracket-sheet/division-2': tab('division-2'),
  });
  // Division I fails; Division II's Mission Bay score cannot be read (a warning), so that pair keeps the previous result.
  const partly = () => writeTempVariant({
    'sds/bracket-sheet/open': tab('open'),
    'sds/bracket-sheet/division-1': 503,
    'sds/bracket-sheet/division-2': tab('division-2', (csv) => csv.replace(/\b(\d)-(\d)\b/, '$1-x')),
  });
  const socal = { corpus: 'socal-2026-10-06' as CorpusName, fetchedAt: PLAYOFF_DAY };
  const sheetOf = (run: { run: { ctx: Parameters<typeof shadowStage>[0] } }) => shadowStage(run.run.ctx, 'sdsSheet');

  it('every tab read: the sheet’s games are created on fixtures of their own, and a later run carries them from the claims', async () => {
    const first = await snapshotOf({ steps: STEPS, ...socal, variants: [read()] });
    for (const stage of STAGES_MIGRATED) expectShadowAgrees(first.run.ctx, stage, 'sheet read');
    const sheet = first.snapshot.games.filter((g) => g.contestId.startsWith('cifsds:'));
    expect(sheet.length).toBeGreaterThan(0);
    const claims = first.run.result!.claims;
    for (const g of sheet) {
      const held = claims.fixtures.find((f) => f.claims.sdsSheet?.published.contestId === g.contestId);
      expect(held?.claims.maxpreps, g.contestId).toBeUndefined();
      expect(held?.claims.sdsSheet?.host, g.contestId).toBe(g.home.slug);
    }

    await shadowRun('sheet partly read, from file', { ...socal, variants: [partly()], ...asWritten({ snapshot: first.snapshot, claims }) });
    await shadowRun('sheet partly read, seeded', { ...socal, variants: [partly()], previous: asWritten({ snapshot: first.snapshot, claims }).previous });
    const nothing = writeTempVariant({ 'sds/bracket-sheet/open': 503, 'sds/bracket-sheet/division-1': 503, 'sds/bracket-sheet/division-2': 503 });
    const carried = await snapshotOf({ steps: STEPS, ...socal, variants: [nothing], ...asWritten({ snapshot: first.snapshot, claims }) });
    for (const stage of STAGES_MIGRATED) expectShadowAgrees(carried.run.ctx, stage, 'sheet carried');
    expect(sheetOf(carried).input.tabs.map((t) => t.read)).toEqual(['carried', 'carried', 'carried']);
    // Every sheet game comes back, each on its fixture and with the host the first run published.
    const ids = (snap: Snapshot) => snap.games.filter((g) => g.contestId.startsWith('cifsds:')).map((g) => `${g.contestId} ${g.home.slug}`);
    expect(ids(carried.snapshot)).toEqual(ids(first.snapshot));
    const fixtureIds = (c: ClaimsFile) => c.fixtures.filter((f) => f.claims.sdsSheet?.published.contestId.startsWith('cifsds:')).map((f) => f.id);
    expect(fixtureIds(carried.run.result!.claims)).toEqual(fixtureIds(claims));
  });

  it('from the committed snapshot and claims file', async () => {
    const extraArgs = ['--accept-regression', 'scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents'];
    const previous = loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'snapshot.json'), 'utf8')) as unknown);
    const claims = readClaimsFile(path.join(REPO, 'data', 'claims.json'));
    await shadowRun('committed, sheet partly read', { ...socal, variants: [partly()], extraArgs, previous, claims });
    await shadowRun('committed seeded, sheet partly read', { ...socal, variants: [partly()], extraArgs, previous });
  });
});
