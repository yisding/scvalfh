/**
 * A carried contest from its stored claims (lib/claims/resolve.ts resolveCarriedClaims): every MaxPreps game a run
 * publishes is its fixture's claims folded, the MaxPreps claim on the editor's day and host with what each other
 * source's claim says the last publication showed, classification cleared. So a contest the previous publication
 * lacks, and every contest of a run that has only the claims file, carries as the previous run published it.
 *
 * Checked over the committed snapshot and claims file of each sport, and over a run of the all corpus as written.
 * The fields left out are run history, which assembly gives every game from the previous snapshot: the slug, the
 * aliases and `provenance.contentChangedAt`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ledgerEditor } from '../../lib/claims/editor';
import { claimsFileText, parseClaimsText } from '../../lib/claims/file';
import { resolveCarriedClaims, withoutClassification } from '../../lib/claims/resolve';
import { ClaimStore } from '../../lib/claims/store';
import type { ClaimsFile } from '../../lib/claims/types';
import { GUID_RE } from '../../lib/game-id';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO } from '../helpers';
import { snapshotOf } from '../pipeline/support/run-corpus';

/** A game without its run history. */
function sansHistory(g: Game): Game {
  const { slug: _slug, aliases: _aliases, ...rest } = g;
  void [_slug, _aliases];
  const { contentChangedAt: _changed, ...provenance } = g.provenance;
  void _changed;
  return { ...rest, provenance };
}

/** Each MaxPreps game of `snapshot` against its claims folded; returns how many were compared. */
function expectEveryContestFolds(snapshot: Snapshot, claims: ClaimsFile): number {
  const store = ClaimStore.fromFile(claims);
  const { view } = ledgerEditor(claims.fetchedAt);
  let compared = 0;
  for (const g of snapshot.games.filter((x) => GUID_RE.test(x.contestId))) {
    const id = store.fixtureOf('maxpreps', g.contestId);
    expect(id, g.contestId).toBeDefined();
    const folded = resolveCarriedClaims(store.get(id as string)!, view);
    expect(folded && sansHistory(folded), g.contestId).toEqual(sansHistory(withoutClassification(g)));
    compared += 1;
  }
  return compared;
}

describe('a MaxPreps game is its claims folded', () => {
  it('in a run of the all corpus, as written', async () => {
    const { snapshot, run } = await snapshotOf({ steps: { official: stepOfficial, sblive: stepSblive } satisfies PipelineSteps });
    const written = loadSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown);
    expect(expectEveryContestFolds(written, parseClaimsText(claimsFileText(run.result!.claims)))).toBeGreaterThan(100);
  });

  it('in the committed field hockey snapshot and its claims file', () => {
    const read = (rel: string) => readFileSync(path.join(REPO, 'data', rel), 'utf8');
    const snapshot = loadSnapshot(JSON.parse(read('snapshot.json')) as unknown);
    expect(expectEveryContestFolds(snapshot, parseClaimsText(read('claims.json')))).toBeGreaterThan(100);
  });
});
