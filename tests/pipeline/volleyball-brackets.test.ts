/**
 * Step 09's published brackets (lib/pipeline/steps/secondary.ts stepBrackets) on the volleyball corpus
 * (tests/fixtures/corpus/volleyball-2026-11-14): the CCS divisions from the tournament page the bracket poll reads,
 * the CIF State divisions our teams play in from the pages their games name, and the previous snapshot's copy of
 * any bracket a run could not read. A volleyball build (CCS.ccsDivisions is empty), so this file sets the switch
 * before importing anything that reads it.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Snapshot } from '../../lib/types';

const CORPUS = 'volleyball-2026-11-14' as const;
const CIF_DIVISION_II = 'maxpreps/tournament/03154bfd-27dc-46b2-ae38-ebc9c4311de6';
const names = (s: Snapshot) => (s.playoffs.brackets ?? []).map((b) => `${b.event} ${b.name} ${b.matchups.length}`);
const ALL = [
  'ccs Open Division 7', 'ccs Division 1 15', 'ccs Division 2 15', 'ccs Division 3 15', 'ccs Division 4 15', 'ccs Division 5 15',
  'cif Division I 31', 'cif Division II 31', 'cif Division III 31',
];

let support: typeof import('./support/run-corpus');
let schema: typeof import('../../lib/snapshot/snapshot-schema');
let first: Snapshot;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'volleyball');
  vi.resetModules();
  support = await import('./support/run-corpus');
  schema = await import('../../lib/snapshot/snapshot-schema');
  first = (await support.snapshotOf({ corpus: CORPUS })).snapshot;
}, 120_000);

describe('the published brackets', () => {
  it('reads every CCS division and the CIF State divisions our teams play in, and the snapshot validates', () => {
    expect(names(first)).toEqual(ALL);
    expect(schema.PlayoffsSchema.safeParse(first.playoffs).success).toBe(true);
    expect(first.sources.filter((s) => s.kind === 'tournament-bracket').map((s) => [s.label, s.status, s.rowCount])).toEqual([
      ['cif bracket Division I', 'ok', 31], ['cif bracket Division II', 'ok', 31], ['cif bracket Division III', 'ok', 31],
    ]);
  });

  it('keeps the previous copy of a CIF division whose page fails, and says so', async () => {
    const previous = structuredClone(first);
    const marked = previous.playoffs.brackets?.find((b) => b.event === 'cif' && b.name === 'Division II');
    if (!marked) throw new Error('the first run read CIF Division II');
    marked.tournament = 'carried';
    const variant = support.writeTempVariant({ [CIF_DIVISION_II]: 503 });
    const { snapshot, run } = await support.snapshotOf({ corpus: CORPUS, variants: [variant], previous });
    expect(names(snapshot)).toEqual(ALL);
    expect(snapshot.playoffs.brackets?.filter((b) => b.tournament === 'carried').map((b) => b.name)).toEqual(['Division II']);
    expect(snapshot.sources.find((s) => s.label === 'cif bracket Division II')?.status).toBe('error');
    expect(run.result?.logLines).toContain('  brackets carried from the previous snapshot: CIF Division II');
  }, 120_000);

  it('keeps every CCS division when the tournament page is not the bracket page', async () => {
    const variant = support.writeTempVariant({ 'ccs/bracket': { rel: 'ccs/bracket.html', body: `<html>${'Access denied. '.repeat(200)}</html>` } });
    const { snapshot } = await support.snapshotOf({ corpus: CORPUS, variants: [variant], previous: first });
    expect(names(snapshot)).toEqual(ALL);
    expect(snapshot.sources.find((s) => s.label === 'ccs bracket')?.status).toBe('error');
  }, 120_000);

  it('keeps everything on a run that does not poll the CCS, and has none to keep on a first such run', async () => {
    const kept = await support.snapshotOf({ corpus: CORPUS, previous: first, extraArgs: ['--no-ccs'] });
    expect(names(kept.snapshot)).toEqual(ALL);
    const none = await support.snapshotOf({ corpus: CORPUS, extraArgs: ['--no-ccs'] });
    expect(none.snapshot.playoffs.brackets).toBeUndefined();
  }, 120_000);
});
