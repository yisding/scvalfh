/**
 * The claims file on its own: given only a claims file, the config and the editor ledger (no previous snapshot, no
 * source read: every team feed not fetched, every other source skipped, and every request unanswered), a run
 * publishes the games of the snapshot that was written with that claims file.
 *
 * What makes it so: every MaxPreps contest is carried, folded from its stored claims (lib/claims/resolve.ts
 * resolveCarriedClaims); the official step carries each division of a league the run does not read from the
 * official claims, with the notes each stamp came with; the si.com step re-applies the stored fills; the guards keep
 * a league that is not read as the claims give it, with its si.com rule-2 games from the si.com claims, where a run
 * with a previous snapshot freezes it to that snapshot's games; the results step weighs the stored cifsshome.org and
 * box-score evidence; an editor's listing is rebuilt with the stamp of the run that built it, recorded on its
 * fixture (the run is stamped with the claims file's fetchedAt, as the run that wrote it was).
 *
 * Every field of every game is compared but two, `aliases` and `provenance.contentChangedAt`: run history, which
 * assembly derives from the previous snapshot, and a run given none has none to derive them from.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { claimsFileText, parseClaimsText } from '../../lib/claims/file';
import type { ClaimsFile } from '../../lib/claims/types';
import { FixtureMissing, type PipelineSteps, type Transport } from '../../lib/pipeline/contract';
import { SILENT_SINK } from '../../lib/pipeline/ledger';
import { createPipelineContext, parseRunArgs, runPipeline } from '../../lib/pipeline/run';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO, corpusDir } from '../helpers';
import { snapshotOf } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };

/** A game without its run history: `aliases` and `provenance.contentChangedAt`. */
function sansHistory(g: Game): Omit<Game, 'aliases'> {
  const { aliases: _aliases, ...rest } = g;
  void _aliases;
  const { contentChangedAt: _changed, ...provenance } = g.provenance;
  void _changed;
  return { ...rest, provenance };
}

/** What the next run reads back: the snapshot and the claims file as written. */
function asWritten(snapshot: Snapshot, claims: ClaimsFile): { snapshot: Snapshot; claims: ClaimsFile } {
  return { snapshot: loadSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown), claims: parseClaimsText(claimsFileText(claims)) };
}

/** A run with `claims` alone, stamped with its fetchedAt: no previous snapshot, no league read, every source off, no request answered. */
async function runWithClaimsAlone(claims: ClaimsFile): Promise<{ games: Game[]; asked: number; sourcesRead: number; feeds: string[] }> {
  let asked = 0;
  const transport: Transport = {
    mode: 'fixture',
    get: (key) => {
      asked += 1;
      return Promise.reject(new FixtureMissing(key));
    },
  };
  const flags = ['--fixtures', corpusDir('all-2026-10-02'), '--dry-run', '--fetched-at', claims.fetchedAt];
  const off = ['--no-sblive', '--no-official', '--no-ccs', '--no-vnn', '--no-cifss'];
  const args = { ...parseRunArgs([...flags, ...off], { cwd: REPO, now: claims.fetchedAt }), leagues: [] };
  const ctx = createPipelineContext({ args, transport, previous: null, sink: SILENT_SINK, claims });
  const result = await runPipeline(ctx, STEPS);
  if (!result) throw new Error('the pipeline did not run');
  return {
    games: result.snapshot.games,
    asked,
    sourcesRead: result.snapshot.sources.filter((s) => s.status === 'ok').length,
    feeds: [...new Set(result.snapshot.sources.filter((s) => s.kind === 'team-schedule').map((s) => s.status))],
  };
}

async function expectReproduced(written: { snapshot: Snapshot; claims: ClaimsFile }): Promise<void> {
  const alone = await runWithClaimsAlone(written.claims);
  expect(alone.sourcesRead, 'no source read').toBe(0);
  expect(alone.feeds.every((s) => s !== 'ok'), 'no team feed read').toBe(true);
  expect(alone.games.map((g) => g.contestId)).toEqual(written.snapshot.games.map((g) => g.contestId));
  alone.games.forEach((g, i) => expect(sansHistory(g), g.contestId).toEqual(sansHistory(written.snapshot.games[i])));
}

describe('a run given only the claims file publishes the games written with it', () => {
  let fresh: { snapshot: Snapshot; claims: ClaimsFile };
  let committed: { snapshot: Snapshot; claims: ClaimsFile };
  beforeAll(() => {
    const read = (rel: string) => readFileSync(path.join(REPO, 'data', 'field-hockey', rel), 'utf8');
    committed = { snapshot: loadSnapshot(JSON.parse(read('snapshot.json')) as unknown), claims: parseClaimsText(read('claims.json')) };
  });

  it('a run of the all corpus with no previous snapshot', async () => {
    const { snapshot, run } = await snapshotOf({ steps: STEPS });
    fresh = asWritten(snapshot, run.result!.claims);
    await expectReproduced(fresh);
  });

  it('the committed field hockey snapshot and its seeded claims file', async () => {
    await expectReproduced(committed);
  });

  it('a run from the committed snapshot that carried contests and editor listings whose feeds it did not read', async () => {
    const { snapshot, run } = await snapshotOf({
      steps: STEPS,
      variants: ['leland-feed-503'],
      previous: committed.snapshot,
      claims: committed.claims,
      extraArgs: ['--leagues', 'scval,pcal', '--accept-regression', 'scval,pcal'],
    });
    expect(snapshot.games.some((g) => g.contestId.startsWith('official:'))).toBe(true);
    await expectReproduced(asWritten(snapshot, run.result!.claims));
  });

  it('a later run that carried contests whose feeds it did not read', async () => {
    const { snapshot, run } = await snapshotOf({
      steps: STEPS,
      variants: ['leland-feed-503'],
      previous: fresh.snapshot,
      claims: fresh.claims,
      fetchedAt: '2026-10-03T15:00:00.000Z',
      extraArgs: ['--leagues', 'scval,pcal'],
    });
    expect(run.ctx.logLines.some((l) => l.startsWith('  carried forward '))).toBe(true);
    await expectReproduced(asWritten(snapshot, run.result!.claims));
  });
});
