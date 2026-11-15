/**
 * The committed claims files (pipeline inversion P1): beside each sport's committed snapshot sits the claims file a
 * run writes, or scripts/claims-seed.ts seeded from it. Each one parses (lib/claims/schema.ts), is stamped with its
 * snapshot's fetchedAt and sport, so the next scheduled run reads it rather than seeding again, and gives every
 * MaxPreps game of the snapshot a claim. A frozen league's games are the previous run's while the claims are this
 * run's reads (risk R13), so the check is that each game HAS a claim, not that the two agree.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLAIMS_WARN_BYTES, claimsFileText, claimsPathOf, parseClaimsText } from '../../lib/claims/file';
import { GUID_RE } from '../../lib/game-id';
import type { SportId } from '../../lib/sports/current';
import { REPO } from '../helpers';

const DIRS: ReadonlyArray<[SportId, string]> = [
  ['field-hockey', 'data'],
  ['soccer', 'data/soccer'],
  ['basketball', 'data/basketball'],
  ['volleyball', 'data/volleyball'],
];

describe.each(DIRS)('%s: %s/claims.json', (sport, dir) => {
  const snapshotFile = path.join(REPO, dir, 'snapshot.json');
  const claimsFile = claimsPathOf(snapshotFile);

  it('sits beside the snapshot, parses, and is written as the pipeline writes it', () => {
    expect(path.relative(REPO, claimsFile)).toBe(`${dir}/claims.json`);
    const text = readFileSync(claimsFile, 'utf8');
    const claims = parseClaimsText(text);
    expect(claimsFileText(claims)).toBe(text);
    expect(Buffer.byteLength(text)).toBeLessThan(CLAIMS_WARN_BYTES);
  });

  it('is stamped with the snapshot’s fetchedAt and sport, and every MaxPreps game of the snapshot has a claim', () => {
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8')) as { fetchedAt: string; games: Array<{ contestId: string }> };
    const claims = parseClaimsText(readFileSync(claimsFile, 'utf8'));
    expect(claims.fetchedAt).toBe(snapshot.fetchedAt);
    expect(claims.sport).toBe(sport);
    const held = new Set(claims.fixtures.flatMap((f) => (f.claims.maxpreps ? [f.claims.maxpreps.ref] : [])));
    const missing = snapshot.games.map((g) => g.contestId).filter((id) => GUID_RE.test(id) && !held.has(id));
    expect(missing).toEqual([]);
  });
});
