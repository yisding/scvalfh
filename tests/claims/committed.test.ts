/**
 * The committed claims files: beside each sport's committed snapshot sits the claims file a run writes, or
 * scripts/claims-seed.ts seeded from it. Each one parses (lib/claims/schema.ts), is written as the pipeline writes
 * it, and is for its sport.
 *
 * Two properties are NOT asserted, because the data crons may legitimately break them: the file's size (the pipeline
 * warns past CLAIMS_WARN_BYTES, and that warning is the signal), and that its `fetchedAt` is the snapshot's (the
 * pipeline ignores a mismatched file and seeds from the snapshot, lib/pipeline/run.ts `previousClaims`; a data cron
 * commit landing on main before a branch merges, or a workflow revert, makes one). When the stamps DO match the file
 * is the one the pipeline wrote for that snapshot, and then every MaxPreps game of the snapshot has a claim. A frozen
 * league's games are the previous snapshot's and its claims the ones the run started with (keepFrozenClaims), so the
 * check is that each game HAS a claim, not that the two agree.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimsFileText, claimsPathOf, parseClaimsText } from '../../lib/claims/file';
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
  });

  it('is for this sport; when stamped with the snapshot’s fetchedAt, every MaxPreps game of the snapshot has a claim', () => {
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8')) as { fetchedAt: string; games: Array<{ contestId: string }> };
    const claims = parseClaimsText(readFileSync(claimsFile, 'utf8'));
    expect(claims.sport).toBe(sport);
    // A different stamp is a file the pipeline would ignore and seed past: nothing more to say about it.
    if (claims.fetchedAt !== snapshot.fetchedAt) return;
    const held = new Set(claims.fixtures.flatMap((f) => (f.claims.maxpreps ? [f.claims.maxpreps.ref] : [])));
    const published = snapshot.games.map((g) => g.contestId).filter((id) => GUID_RE.test(id));
    const missing = published.filter((id) => !held.has(id));
    expect(missing).toEqual([]);
    expect(published.length === 0 || held.size > 0).toBe(true);
  });
});
