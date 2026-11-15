/**
 * The claims boundary (pipeline inversion §10.9): the claims are the pipeline's own working state, written beside
 * the snapshot, and the site never reads them. No module of the rendered site (app/, components/, lib/data.ts) nor
 * the snapshot loader (lib/snapshot/snapshot-load.ts, snapshot-migrate.ts) reaches lib/claims/ through its runtime
 * imports, no site module names the claims file, and lib/claims/ never loads the site's data loader.
 *
 * Walks the same import graph as tests/build-only-boundary.test.ts (tests/import-graph.ts); a failure prints the
 * chain. A type-only import vanishes at compile time and is allowed.
 *
 * And the ledger boundary (§3, §10 P8): the pipeline is to read the fixture ledger only as the editor's claims
 * (lib/claims/editor.ts), never LEDGER_VIEW, EXCLUSIONS or LEDGER themselves. The pipeline-side modules that still
 * import one of them are a frozen list, in tests/data-boundary.test.ts's style: a module may leave it (shrink the
 * list), never join it. All but lib/claims/editor.ts keep the import as a default parameter for their other callers.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from '../helpers';
import { bannedChain, repoPath, resolveFile, runtimeImports, sourceFiles, specifierBase, stripComments, type Target } from '../import-graph';

/** A specifier that lands in lib/claims/ is banned; the rest of the repo is walked. */
function toClaims(spec: string, fromFile: string): Target {
  const base = specifierBase(spec, fromFile, ROOT);
  if (base === null) return { kind: 'external' };
  const rel = repoPath(base, ROOT).replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
  if (rel.startsWith('lib/claims/')) return { kind: 'banned', name: rel };
  const file = resolveFile(base);
  return file ? { kind: 'file', file } : { kind: 'external' };
}

/** A specifier that lands on lib/data.ts is banned; nothing outside lib/claims/ is walked. */
function toSiteData(spec: string, fromFile: string): Target {
  const base = specifierBase(spec, fromFile, ROOT);
  if (base === null) return { kind: 'external' };
  const rel = repoPath(base, ROOT).replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
  if (rel === 'lib/data') return { kind: 'banned', name: rel };
  const file = resolveFile(base);
  return file && repoPath(file, ROOT).startsWith('lib/claims/') ? { kind: 'file', file } : { kind: 'external' };
}

const SITE_MODULES = [
  ...sourceFiles(path.join(ROOT, 'app')),
  ...sourceFiles(path.join(ROOT, 'components')),
  path.join(ROOT, 'lib', 'data.ts'),
].sort();
const LOADER_MODULES = ['lib/snapshot/snapshot-load.ts', 'lib/snapshot/snapshot-migrate.ts'].map((f) => path.join(ROOT, f));
const CLAIMS_MODULES = sourceFiles(path.join(ROOT, 'lib', 'claims')).sort();

describe('the site and the snapshot loader never reach lib/claims/', () => {
  it('finds the modules', () => {
    expect(SITE_MODULES.length).toBeGreaterThan(50);
    expect(CLAIMS_MODULES.map((f) => repoPath(f, ROOT))).toContain('lib/claims/store.ts');
  });

  it('a specifier into lib/claims/ is banned, relative or @/', () => {
    const from = path.join(ROOT, 'components', 'about', 'Leak.tsx');
    expect(toClaims('../../lib/claims/store', from)).toEqual({ kind: 'banned', name: 'lib/claims/store' });
    expect(toClaims('@/lib/claims/types', from)).toEqual({ kind: 'banned', name: 'lib/claims/types' });
    expect(toClaims('react', from)).toEqual({ kind: 'external' });
  });

  it('the walk follows lib/ modules into lib/claims/ (the pipeline does reach it)', () => {
    const chain = bannedChain(path.join(ROOT, 'lib', 'pipeline', 'run.ts'), ROOT, toClaims);
    expect(chain?.[0]).toBe('lib/pipeline/run.ts');
    expect(chain?.at(-1)).toMatch(/^lib\/claims\//);
  });

  for (const file of [...SITE_MODULES, ...LOADER_MODULES]) {
    it(repoPath(file, ROOT), () => {
      const chain = bannedChain(file, ROOT, toClaims);
      expect(chain, chain ? `lib/claims reached: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});

describe('no site module names the claims file', () => {
  // A path built for readFileSync is invisible to the import graph; the file's name is not.
  for (const file of SITE_MODULES) {
    it(repoPath(file, ROOT), () => {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('claims.json')).toBe(false);
    });
  }
});

describe('lib/claims/ never loads lib/data.ts', () => {
  for (const file of CLAIMS_MODULES) {
    it(repoPath(file, ROOT), () => {
      const chain = bannedChain(file, ROOT, toSiteData);
      expect(chain, chain ? `lib/data reached: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});

/** The pipeline-side folders: what the cron runs to build the snapshot. */
const PIPELINE_DIRS = ['lib/pipeline', 'lib/claims', 'lib/crosscheck', 'lib/official', 'lib/results', 'lib/postseason', 'lib/sources'];
/**
 * The modules among them that import LEDGER_VIEW, EXCLUSIONS or LEDGER at runtime. lib/claims/editor.ts reads the
 * ledger for the run; every other one imports LEDGER_VIEW only as a default parameter, which the pipeline never
 * leaves to its default (it passes the editor's slices; tests/claims/empty-editor.test.ts checks a run with an empty
 * ledger shows none of the ledger's facts), and which the loader, the site, the JV script and the tests rely on.
 */
const LEDGER_READERS = [
  'lib/claims/editor.ts',
  'lib/crosscheck/backfill.ts',
  'lib/pipeline/normalize.ts',
  'lib/results/fixture-games.ts',
  'lib/results/host-correction.ts',
  'lib/results/result.ts',
];
const LEDGER_FILE = path.join(ROOT, 'lib', 'fixtures', 'ledger.ts');

/** Whether `file` imports one of the ledger's values from lib/fixtures/ledger.ts (not a type, not a helper). */
function readsLedger(file: string): boolean {
  const src = readFileSync(file, 'utf8');
  const importsLedger = runtimeImports(src).some((spec) => {
    const base = specifierBase(spec, file, ROOT);
    return base !== null && resolveFile(base) === LEDGER_FILE;
  });
  if (!importsLedger) return false;
  const clauses = [...stripComments(src).matchAll(/import\s+\{([^}]*)\}\s*from\s*['"][^'"]*fixtures\/ledger['"]/g)].map((m) => m[1]);
  return clauses.some((c) => c.split(',').map((n) => n.trim()).some((n) => ['LEDGER_VIEW', 'EXCLUSIONS', 'LEDGER'].includes(n)));
}

describe('the ledger boundary: no new pipeline module reads LEDGER_VIEW, EXCLUSIONS or LEDGER', () => {
  it('the modules that read them are exactly the frozen list', () => {
    const readers = PIPELINE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .filter(readsLedger)
      .map((f) => repoPath(f, ROOT))
      .sort();
    expect(readers).toEqual(LEDGER_READERS);
  });
});
