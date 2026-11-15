/**
 * A frozen league keeps its MaxPreps claims (lib/claims/sources/maxpreps.ts keepFrozenClaims): the league publishes
 * its previous snapshot's games, so the claims file the run writes holds the MaxPreps claim of every contest it
 * publishes under a MaxPreps id, even where MaxPreps re-keyed or deleted the contest this run, and no claim of a
 * contest this run's feeds listed and the frozen league does not publish.
 *
 * The scenario is the finals-regression variant (BVAL frozen, its feeds read) with one BVAL game of the previous
 * snapshot under another contest id, as when MaxPreps re-keys a contest between two runs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { claimsFileText, parseClaimsText } from '../../lib/claims/file';
import type { ClaimsFile } from '../../lib/claims/types';
import { GUID_RE } from '../../lib/game-id';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Snapshot } from '../../lib/types';
import { variantDir } from '../helpers';
import { snapshotOf } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
/** The Leigh at Gilroy game of 9/17, a BVAL league final in the previous snapshot and in the corpus's feeds. */
const LISTED = 'd5522657-4790-463d-9466-a50bfe4470f0';
/** The id the previous snapshot publishes that game under: MaxPreps has re-keyed it since. */
const REKEYED = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const maxprepsRefs = (claims: ClaimsFile) => new Set(claims.fixtures.flatMap((f) => (f.claims.maxpreps ? [f.claims.maxpreps.ref] : [])));
const publishedGuids = (snapshot: Snapshot) => new Set(snapshot.games.filter((g) => GUID_RE.test(g.contestId)).map((g) => g.contestId));

function previousWithRekeyedGame(): Snapshot {
  const raw = JSON.parse(readFileSync(path.join(variantDir('finals-regression'), 'previous-snapshot.json'), 'utf8')) as Snapshot;
  const games = raw.games.map((g) => (g.contestId === LISTED ? { ...g, contestId: REKEYED } : g));
  expect(games.some((g) => g.contestId === REKEYED)).toBe(true);
  return loadSnapshot({ ...raw, games } as unknown);
}

describe('a frozen league whose feeds were read keeps the claims of the games it publishes', () => {
  let snapshot: Snapshot;
  let claims: ClaimsFile;
  let previous: Snapshot;
  beforeAll(async () => {
    previous = previousWithRekeyedGame();
    const run = await snapshotOf({ steps: STEPS, variants: ['finals-regression'], previous });
    expect(run.run.ctx.leagues.state('bval')).toBe('frozen');
    snapshot = run.snapshot;
    claims = parseClaimsText(claimsFileText(run.run.result!.claims));
  });

  it('publishes the previous game under the id MaxPreps no longer lists, with its MaxPreps claim', () => {
    expect(publishedGuids(snapshot).has(REKEYED)).toBe(true);
    expect(publishedGuids(snapshot).has(LISTED)).toBe(false);
    expect(maxprepsRefs(claims).has(REKEYED)).toBe(true);
  });

  it('holds a MaxPreps claim for every contest it publishes under a MaxPreps id, and none for a contest it does not publish', () => {
    expect([...publishedGuids(snapshot)].filter((id) => !maxprepsRefs(claims).has(id))).toEqual([]);
    expect(maxprepsRefs(claims).has(LISTED)).toBe(false);
  });

  it('keeps the claim the run read for a frozen contest, not this run’s row', () => {
    const fromFile = (ref: string) => claims.fixtures.find((f) => f.claims.maxpreps?.ref === ref)?.claims.maxpreps;
    for (const g of snapshot.games.filter((x) => x.countsFor === 'santa-teresa' || x.countsFor === 'mt-hamilton')) {
      const claim = fromFile(g.contestId);
      expect(claim?.seenAt, g.contestId).toBe(previous.fetchedAt);
    }
  });
});
