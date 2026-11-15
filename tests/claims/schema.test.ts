/**
 * lib/claims/schema.ts (docs/DATA-SOURCES.md §4.2): a run's claims file parses and round-trips, and each refinement
 * rejects what it names: unsorted or repeated fixture ids, a (source, ref) held twice, a MaxPreps claim that is not
 * its contest or holds a field a later stage decides, an official claim with neither row nor stamp, a rule-2 fill
 * whose game is not an si.com game, and a fixture with no claims.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { claimsFileOnDisk, claimsFileText, parseClaimsText } from '../../lib/claims/file';
import { ClaimsFileSchema } from '../../lib/claims/schema';
import type { ClaimsFile } from '../../lib/claims/types';
import { snapshotOf } from '../pipeline/support/run-corpus';

let claims: ClaimsFile;
beforeAll(async () => {
  claims = (await snapshotOf({})).run.result!.claims;
});

type Disk = { fixtures: Array<{ id: string; claims: Record<string, unknown> }> } & Record<string, unknown>;
const disk = (): Disk => structuredClone(claimsFileOnDisk(claims)) as Disk;
const maxprepsOf = (d: Disk, i: number) => d.fixtures[i].claims.maxpreps as { ref: string; game: Record<string, unknown> & { provenance: Record<string, unknown> } };

function rejects(d: unknown, message: RegExp): void {
  const parsed = ClaimsFileSchema.safeParse(d);
  expect(parsed.success).toBe(false);
  expect(parsed.error?.issues.map((i) => i.message).join('\n')).toMatch(message);
}

describe('a run’s claims file', () => {
  it('parses, holds the run’s MaxPreps and editor claims, and reads back as written', () => {
    expect(ClaimsFileSchema.safeParse(claimsFileOnDisk(claims)).success).toBe(true);
    expect(claims.fixtures.filter((f) => f.claims.maxpreps).length).toBeGreaterThan(300);
    expect(claims.fixtures.some((f) => f.claims.editor)).toBe(true);
    expect(parseClaimsText(claimsFileText(claims))).toEqual(claims);
  });
});

describe('the refinements', () => {
  it('fixture ids unique and sorted', () => {
    const d = disk();
    d.fixtures.reverse();
    rejects(d, /fixture ids are not unique and sorted/);
  });

  it('each (source, ref) at most once', () => {
    const d = disk();
    d.fixtures[1].claims.maxpreps = d.fixtures[0].claims.maxpreps;
    rejects(d, /is held by/);
  });

  it('a MaxPreps claim is its contest, a GUID, and holds only what normalize writes', () => {
    let d = disk();
    maxprepsOf(d, 0).game.contestId = maxprepsOf(d, 1).ref;
    rejects(d, /is not its ref/);
    d = disk();
    maxprepsOf(d, 0).ref = 'sblive:1';
    rejects(d, /keyed by its contest GUID/);
    d = disk();
    maxprepsOf(d, 0).game.slug = '2026-09-01-a-at-b';
    rejects(d, /holds no slug/);
    d = disk();
    maxprepsOf(d, 0).game.provenance.backfill = { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'n' };
    rejects(d, /provenance.backfill is not a MaxPreps provenance key/);
    d = disk();
    maxprepsOf(d, 0).game.provenance.fetchedAt = '2020-01-01T00:00:00.000Z';
    rejects(d, /provenance.fetchedAt is not the claim's seenAt/);
    d = disk();
    maxprepsOf(d, 0).game.status = 'final';
    maxprepsOf(d, 0).game.decider = null;
    rejects(d, /decider\/status mismatch|final game with a null score/);
  });

  it('an official claim has a row or a stamp', () => {
    const d = disk();
    d.fixtures[0].claims.official = { ref: 'scval:2026-09-01:a@b' };
    rejects(d, /an official claim has a fixture or a stamp/);
  });

  it('a rule-2 fill’s game is a published game with an sblive: id', () => {
    const d = disk();
    const game = { ...maxprepsOf(d, 0).game, provenance: { ...maxprepsOf(d, 0).game.provenance, fetchedAt: claims.fetchedAt } };
    d.fixtures[0].claims.sblive = [{ ref: '1', fill: { rule: 'absent-fixture', contestId: maxprepsOf(d, 0).ref, officialFixtureId: 'x', game } }];
    rejects(d, /an absent-fixture fill's game has an sblive: id/);
  });

  it('no fixture without claims, and no key the file does not define', () => {
    let d = disk();
    d.fixtures[0].claims = {};
    rejects(d, /a fixture with no claims/);
    d = disk();
    d.extra = true;
    expect(ClaimsFileSchema.safeParse(d).success).toBe(false);
  });

  it('a file that fails is no claims at all (the run seeds them from the snapshot instead)', () => {
    expect(() => parseClaimsText('{}')).toThrow(/claims file failed validation/);
  });
});
