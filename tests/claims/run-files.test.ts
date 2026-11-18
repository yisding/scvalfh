/**
 * The claims file at the run's edges (docs/DATA-SOURCES.md §4.2): `writeOutputs` writes it beside the snapshot and
 * its meta file; `prepareRun` reads it only when it was written with the previous snapshot (same fetchedAt and
 * sport), seeds the claims from the snapshot otherwise, starts empty with no previous snapshot whatever file lies
 * beside --out, and never lets a corpus's previous snapshot meet a claims file left by an earlier run.
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimsFileText, claimsPathOf, parseClaimsText } from '../../lib/claims/file';
import type { ClaimsFile } from '../../lib/claims/types';
import { loadCorpus } from '../../lib/pipeline/corpus';
import { SILENT_SINK } from '../../lib/pipeline/ledger';
import { parseRunArgs, prepareRun, runPipeline, writeOutputs } from '../../lib/pipeline/run';
import { REPO, corpusDir, variantDir } from '../helpers';
import { NOOP_STEPS } from '../pipeline/support/noop-steps';

const opts = { cwd: REPO, now: '2026-10-02T15:00:00.000Z' };
const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-claims-')), 'snapshot.json');
const MARK = 'zz-marker';

/** A claims file whose first MaxPreps fixture is renamed MARK, so a test can tell it was read rather than seeded. */
function marked(claims: ClaimsFile, fetchedAt = claims.fetchedAt): string {
  const first = claims.fixtures.find((f) => f.claims.maxpreps);
  const fixtures = claims.fixtures.map((f) => (f === first ? { ...f, id: MARK } : f)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return claimsFileText({ ...claims, fetchedAt, fixtures });
}

/** A first run over the corpus written to `out`: snapshot, meta and claims. */
async function firstRun(out: string): Promise<ClaimsFile> {
  const prepared = prepareRun(parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--out', out], opts), SILENT_SINK);
  const result = await runPipeline(prepared.ctx, NOOP_STEPS);
  if (!result) throw new Error('no result');
  writeOutputs(out, result);
  return result.claims;
}

describe('claimsPathOf', () => {
  it('is claims.json beside a snapshot.json, else <out>.claims.json', () => {
    expect(claimsPathOf('/x/data/field-hockey/snapshot.json')).toBe('/x/data/field-hockey/claims.json');
    expect(claimsPathOf('/x/data/soccer/snapshot.json')).toBe('/x/data/soccer/claims.json');
    expect(claimsPathOf('/tmp/x.json')).toBe('/tmp/x.claims.json');
  });
});

describe('writeOutputs and prepareRun', () => {
  it('writes the claims file after the snapshot and meta, stamped with the run, as stable JSON', async () => {
    const out = tmpOut();
    const claims = await firstRun(out);
    const text = readFileSync(claimsPathOf(out), 'utf8');
    expect(text).toBe(claimsFileText(claims));
    const snapshot = JSON.parse(readFileSync(out, 'utf8')) as { fetchedAt: string };
    expect(parseClaimsText(text).fetchedAt).toBe(snapshot.fetchedAt);
  });

  it('reads the claims file written with the previous snapshot, and seeds from the snapshot when the stamps differ', async () => {
    const out = tmpOut();
    const claims = await firstRun(out);
    writeFileSync(claimsPathOf(out), marked(claims));
    const args = parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--out', out], opts);
    expect(prepareRun(args, SILENT_SINK).ctx.claims.get(MARK)).toBeDefined();
    writeFileSync(claimsPathOf(out), marked(claims, '2026-10-01T15:00:00.000Z'));
    const seeded = prepareRun(args, SILENT_SINK).ctx.claims;
    expect(seeded.get(MARK)).toBeUndefined();
    expect(seeded.ids().length).toBeGreaterThan(300);
    writeFileSync(claimsPathOf(out), '{ not json');
    expect(prepareRun(args, SILENT_SINK).ctx.claims.ids().length).toBe(seeded.ids().length);
  });

  it('with no previous snapshot the store is empty, whatever claims file lies beside --out', async () => {
    const claims = await firstRun(tmpOut());
    const out = tmpOut();
    writeFileSync(claimsPathOf(out), marked(claims));
    const prepared = prepareRun(parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--out', out], opts), SILENT_SINK);
    expect(prepared.ctx.previous).toBeNull();
    expect(prepared.ctx.claims.ids()).toEqual([]);
  });

  it('a corpus’s previous snapshot copied to --out takes away the claims file an earlier run left there', async () => {
    const out = tmpOut();
    const claims = await firstRun(out);
    // The finals-regression variant ships a previous snapshot with no claims file.
    const prev = JSON.parse(readFileSync(path.join(variantDir('finals-regression'), 'previous-snapshot.json'), 'utf8')) as { fetchedAt: string };
    writeFileSync(claimsPathOf(out), marked(claims, prev.fetchedAt));
    const args = parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--variant', variantDir('finals-regression'), '--out', out], opts);
    const prepared = prepareRun(args, SILENT_SINK);
    expect(existsSync(claimsPathOf(out))).toBe(false);
    expect(prepared.ctx.claims.get(MARK)).toBeUndefined();
    expect(prepared.ctx.claims.ids().length).toBeGreaterThan(0);
  });

  it('a corpus’s previousClaims is copied beside --out with its previous snapshot, and read', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-variant-'));
    const firstOut = tmpOut();
    const claims = await firstRun(firstOut);
    copyFileSync(firstOut, path.join(dir, 'previous.json'));
    writeFileSync(path.join(dir, 'previous.claims.json'), marked(claims));
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id: 'with-claims', previous: 'previous.json', previousClaims: 'previous.claims.json' }));
    expect(loadCorpus(corpusDir('all-2026-10-02'), [dir]).previousClaims).toBe(path.join(dir, 'previous.claims.json'));
    const out = tmpOut();
    const prepared = prepareRun(parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--variant', dir, '--out', out], opts), SILENT_SINK);
    expect(readFileSync(claimsPathOf(out), 'utf8')).toBe(marked(claims));
    expect(prepared.ctx.claims.get(MARK)).toBeDefined();
    // A dry run reads it in place and writes nothing.
    const dryOut = tmpOut();
    const dry = prepareRun(parseRunArgs(['--fixtures', corpusDir('all-2026-10-02'), '--variant', dir, '--out', dryOut, '--dry-run'], opts), SILENT_SINK);
    expect(dry.ctx.claims.get(MARK)).toBeDefined();
    expect(existsSync(claimsPathOf(dryOut))).toBe(false);
  });

  it('a variant’s own previous snapshot does not inherit the corpus’s claims file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-variant-'));
    writeFileSync(path.join(dir, 'prev.json'), '{}');
    writeFileSync(path.join(dir, 'prev.claims.json'), '{}');
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ previous: 'prev.json', previousClaims: 'prev.claims.json' }));
    const other = mkdtempSync(path.join(tmpdir(), 'scvalfh-variant-'));
    writeFileSync(path.join(other, 'prev.json'), '{}');
    writeFileSync(path.join(other, 'manifest.json'), JSON.stringify({ previous: 'prev.json' }));
    expect(loadCorpus(corpusDir('all-2026-10-02'), [dir, other]).previousClaims).toBeNull();
    const orphan = mkdtempSync(path.join(tmpdir(), 'scvalfh-variant-'));
    writeFileSync(path.join(orphan, 'manifest.json'), JSON.stringify({ previousClaims: 'missing.json' }));
    expect(() => loadCorpus(corpusDir('all-2026-10-02'), [orphan])).toThrow(/names no previous snapshot|not found/);
  });
});
