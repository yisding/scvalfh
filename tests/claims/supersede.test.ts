/**
 * A fixture keeps its id when a MaxPreps contest takes over the game another source published
 * (lib/claims/supersede.ts): the contest's claim joins the fixture si.com's rule 2 created, the fixture records both
 * contest ids it was published under, and `supersededGames`, read off that history, is what the previous snapshot's
 * games give (lib/pipeline/steps/assemble.ts supersededGamesOf).
 *
 * The scenario: a run of the all corpus publishes the Greenfield at Santa Catalina game of 9/4 as si.com's
 * `sblive:6541425`; the next run reads Santa Catalina's feed with that game's contest added.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { claimsFileText, parseClaimsText } from '../../lib/claims/file';
import type { ClaimsFile, Fixture } from '../../lib/claims/types';
import type { PipelineSteps } from '../../lib/pipeline/contract';
import { supersededGamesOf } from '../../lib/pipeline/steps/assemble';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { stepSblive } from '../../lib/pipeline/steps/sblive';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Snapshot } from '../../lib/types';
import { REPO, corpusDir } from '../helpers';
import { snapshotOf, writeTempVariant } from '../pipeline/support/run-corpus';

const STEPS: PipelineSteps = { official: stepOfficial, sblive: stepSblive };
const FILL = 'sblive:6541425';
/** The contest the added feed row gives the game (tests/fixtures/pipeline/santa-catalina-gre-0904-row.json). */
const CONTEST = '11111111-2222-4333-8444-555555555555';

const holding = (claims: ClaimsFile, contestId: string): Fixture | undefined =>
  claims.fixtures.find((f) => (f.published ?? []).some((p) => p.contestId === contestId));

let first: { snapshot: Snapshot; claims: ClaimsFile };
let next: { snapshot: Snapshot; claims: ClaimsFile };
beforeAll(async () => {
  const schedule = readFileSync(path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'schedule', 'santa-catalina.json'), 'utf8');
  const row = JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'pipeline', 'santa-catalina-gre-0904-row.json'), 'utf8')) as unknown;
  const cat = JSON.parse(schedule) as { data: unknown[] };
  const variant = writeTempVariant({
    'maxpreps/schedule/santa-catalina': { rel: 'santa-catalina.json', body: JSON.stringify({ ...cat, data: [...cat.data, row] }) },
  });
  const a = await snapshotOf({ steps: STEPS });
  first = { snapshot: loadSnapshot(JSON.parse(JSON.stringify(a.snapshot)) as unknown), claims: parseClaimsText(claimsFileText(a.run.result!.claims)) };
  const b = await snapshotOf({ steps: STEPS, variants: [variant], previous: first.snapshot, claims: first.claims });
  next = { snapshot: b.snapshot, claims: parseClaimsText(claimsFileText(b.run.result!.claims)) };
});

describe('a MaxPreps contest that takes over an si.com rule-2 game', () => {
  it('joins the fixture the rule-2 game was published on, which keeps its id', () => {
    const before = holding(first.claims, FILL);
    expect(before?.claims.maxpreps).toBeUndefined();
    const after = holding(next.claims, CONTEST);
    expect(after?.id).toBe(before?.id);
    expect(after?.claims.maxpreps?.ref).toBe(CONTEST);
    expect(next.claims.fixtures.filter((f) => f.claims.maxpreps?.ref === CONTEST)).toHaveLength(1);
  });

  it('records every contest id the game was published under, in order', () => {
    expect(holding(next.claims, CONTEST)?.published?.map((p) => p.contestId)).toEqual([FILL, CONTEST]);
  });

  it('publishes supersededGames from the fixture’s history as the previous snapshot’s games give it', () => {
    expect(next.snapshot.supersededGames).toEqual({ [FILL]: CONTEST });
    expect(next.snapshot.supersededGames).toEqual(supersededGamesOf(next.snapshot.games, first.snapshot));
  });
});
