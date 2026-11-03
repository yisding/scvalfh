/**
 * The build-only boundary: no module of the rendered site (app/, components/) reaches, through its
 * runtime imports, the code that only the data cron runs — the scrapers and parsers (lib/sources/),
 * the pipeline (lib/pipeline/), the official-schedule tooling (lib/official/) and the si.com and
 * cifsshome.org cross-checks and backfill (lib/crosscheck/). The site renders the
 * committed data files; it never fetches, parses or assembles them, so a page that loads a scraper
 * only means a build that bundles, and type-checks, code the site never calls.
 *
 * A type-only import of those modules is fine (it vanishes at compile time). The one named exception
 * is lib/crosscheck/cifss-notes.ts (SITE_SAFE below), an import-free leaf: /about prints the
 * cifsshome.org notes from it, never from the comparison itself. The usual way back
 * across is one value a site module needs from a scraper module (a URL root, a date helper, a note);
 * the fix is to give that value a leaf home (lib/season.ts, lib/format.ts, a small module beside its
 * writer), not to allow the edge here. No edge is allowed today.
 *
 * One `it` per module under app/ and components/, named by its path, as tests/ui/client-boundary.test.ts
 * does, walking the same import graph (tests/import-graph.ts); a failure prints the chain.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from './helpers';
import { bannedChain, repoPath, resolveFile, sourceFiles, specifierBase, type Target } from './import-graph';

/** The build-only folders under lib/ (repo-relative, trailing slash). */
const BUILD_ONLY = ['lib/sources/', 'lib/pipeline/', 'lib/official/', 'lib/crosscheck/'];
/** Leaf modules inside a build-only folder that the site may load (repo-relative, no extension). */
const SITE_SAFE = new Set(['lib/crosscheck/cifss-notes']);

function resolve(spec: string, fromFile: string): Target {
  const base = specifierBase(spec, fromFile, ROOT);
  if (base === null) return { kind: 'external' };
  const rel = repoPath(base, ROOT).replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
  if (BUILD_ONLY.some((dir) => rel.startsWith(dir)) && !SITE_SAFE.has(rel)) return { kind: 'banned', name: rel };
  const file = resolveFile(base);
  return file ? { kind: 'file', file } : { kind: 'external' };
}

const SITE_MODULES = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))].sort();

describe('build-only boundary: no app/ or components/ module reaches lib/sources, lib/pipeline, lib/official or lib/crosscheck', () => {
  it('finds the site modules', () => {
    expect(SITE_MODULES.length).toBeGreaterThan(50);
  });

  it('a specifier under a build-only folder is banned, relative or @/; the rest of lib/ is walked', () => {
    const from = path.join(ROOT, 'components', 'about', 'Leak.tsx');
    expect(resolve('../../lib/sources/sblive', from)).toEqual({ kind: 'banned', name: 'lib/sources/sblive' });
    expect(resolve('@/lib/pipeline/run', from)).toEqual({ kind: 'banned', name: 'lib/pipeline/run' });
    expect(resolve('../../lib/official/schema.ts', from)).toEqual({ kind: 'banned', name: 'lib/official/schema' });
    expect(resolve('../../lib/crosscheck/backfill', from)).toEqual({ kind: 'banned', name: 'lib/crosscheck/backfill' });
    expect(resolve('../../lib/crosscheck/cifss-notes', from)).toEqual({
      kind: 'file',
      file: path.join(ROOT, 'lib', 'crosscheck', 'cifss-notes.ts'),
    });
    expect(resolve('react', from)).toEqual({ kind: 'external' });
  });

  it('the walk follows lib/ modules into a scraper (the comparison behind /about’s notes does reach one)', () => {
    const chain = bannedChain(path.join(ROOT, 'lib', 'crosscheck', 'cifss-crosscheck.ts'), ROOT, resolve);
    expect(chain?.[0]).toBe('lib/crosscheck/cifss-crosscheck.ts');
    expect(chain?.at(-1)).toMatch(/^lib\/(sources|crosscheck)\//);
  });

  for (const file of SITE_MODULES) {
    it(repoPath(file, ROOT), () => {
      const chain = bannedChain(file, ROOT, resolve);
      expect(chain, chain ? `build-only code reached: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});
