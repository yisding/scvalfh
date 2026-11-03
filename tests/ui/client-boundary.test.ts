/**
 * The client boundary (SPEC §0.4, §10.2): no `'use client'` module may reach, through its static
 * imports, a server-only module — the snapshot, the registry, the league config, the engines, the
 * pipeline, zod or any Node built-in. Those would ship the whole data layer (and every league's
 * config) to every phone, or fail outright in the browser.
 *
 * One `it` per module whose first statement is `'use client'`, named by its path, so a filter like
 * `-t 'components/(layout|search)/'` runs one owner's modules. Each walks the static import graph
 * (tests/import-graph.ts: relative and `@/` specifiers, static and dynamic `import()` / `require()`;
 * `import type` / `export type` and all-type specifier lists are ignored, since they vanish at compile
 * time) and fails with the chain that reached a banned module. Anything under data/ is banned outright.
 *
 * Client-safe: lib/types (types), lib/season (a constants leaf), lib/format, lib/game-id,
 * lib/search, lib/schools/mascots (the mascot tile sizes, a constants leaf); every other lib/ module
 * is banned (CLIENT_SAFE_LIB below).
 */
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from '../helpers';
import {
  bannedChain,
  repoPath,
  resolveFile,
  runtimeImports,
  sourceFiles,
  specifierBase,
  stripComments,
  type Target,
} from '../import-graph';

/**
 * The only lib/ modules (repo-relative, no extension) a client module may reach. Everything else
 * under lib/ — the snapshot, the registry, the league config, the engines, the pipeline, the
 * scrapers — is banned. An allowlist, so a module added or moved under lib/ is server-only until
 * someone decides otherwise here.
 */
const CLIENT_SAFE_LIB = new Set([
  'lib/types',
  'lib/season',
  'lib/format',
  'lib/game-id',
  'lib/search',
  'lib/schools/mascots',
]);
const NODE_BUILTINS = new Set(builtinModules);

function isUseClient(src: string): boolean {
  return /^\s*['"]use client['"]/.test(stripComments(src));
}

function resolve(spec: string, fromFile: string): Target {
  if (spec === 'zod' || spec.startsWith('zod/')) return { kind: 'banned', name: spec };
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec.split('/')[0])) return { kind: 'banned', name: spec };
  const base = specifierBase(spec, fromFile, ROOT);
  if (base === null) return { kind: 'external' };
  const relPath = repoPath(base, ROOT);
  // Anything under data/ (the snapshot, the official fixtures, the history) is server-only.
  if (relPath === 'data' || relPath.startsWith('data/')) return { kind: 'banned', name: relPath };
  const rel = relPath.replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
  if (rel.startsWith('lib/') && !CLIENT_SAFE_LIB.has(rel)) return { kind: 'banned', name: rel };
  const file = resolveFile(base);
  return file ? { kind: 'file', file } : { kind: 'external' };
}

const CLIENT_MODULES = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))]
  .filter((f) => isUseClient(readFileSync(f, 'utf8')))
  .sort();

describe('client boundary: no "use client" module reaches a server-only module', () => {
  it('finds the client modules', () => {
    expect(CLIENT_MODULES.length).toBeGreaterThan(5);
  });

  it('the import scanner skips type-only imports and keeps runtime ones', () => {
    expect(
      runtimeImports(
        [
          "import type { A } from '../../lib/data';",
          "import { type B, type C } from '../../lib/teams';",
          "export type { D } from '../../lib/leagues';",
          "import { x, type Y } from './keep';",
          "import './side-effect';",
          "export { z } from '@/lib/format';",
        ].join('\n'),
      ),
    ).toEqual(['./keep', './side-effect', '@/lib/format']);
  });

  it('the import scanner collects dynamic import() and require() specifiers', () => {
    expect(
      runtimeImports(
        [
          "const g = await import('../lib/data');",
          "const h = import ( \"@/lib/teams\" );",
          "const j = require('./legacy');",
        ].join('\n'),
      ),
    ).toEqual(['../lib/data', '@/lib/teams', './legacy']);
  });

  it('a specifier that resolves under data/ is banned (the snapshot never ships to the client)', () => {
    const from = path.join(ROOT, 'components', 'home', 'Leak.tsx');
    expect(resolve('../../data/snapshot.json', from)).toEqual({ kind: 'banned', name: 'data/snapshot.json' });
    expect(resolve('@/data/snapshot.json', from)).toEqual({ kind: 'banned', name: 'data/snapshot.json' });
    expect(resolve('../../lib/data', from)).toEqual({ kind: 'banned', name: 'lib/data' });
  });

  for (const file of CLIENT_MODULES) {
    it(repoPath(file, ROOT), () => {
      const chain = bannedChain(file, ROOT, resolve);
      expect(chain, chain ? `client boundary crossed: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});
