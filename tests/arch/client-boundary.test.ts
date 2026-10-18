/**
 * The client boundary (SPEC §0.4, §10.2): no `'use client'` module may reach, through its runtime
 * imports, a server-only module — the snapshot, the registry, the league config, the engines, the
 * pipeline, zod or any Node built-in. Those would ship the whole data layer (and every league's
 * config) to every phone, or fail outright in the browser.
 *
 * allowlist: a move that changes a client-safe module's path must update CLIENT_SAFE. The boundary
 * is the list of what MAY be reached, not of what may not, so a new server module is banned the day
 * it exists and a moved client-safe module fails here until its entry follows it.
 *
 * One `it` per module whose directive prologue holds `'use client'`, named by its path, so a filter
 * like `-t 'components/(layout|search)/'` runs one owner's modules. Each walks the runtime import
 * graph (tests/support/source-tree.ts importsOf: `@/` and relative specifiers, static and dynamic
 * `import()` / `require()`; `import type` / `export type` and all-type specifier lists are ignored,
 * since they vanish at compile time) through components/ and app/ and fails with the chain that
 * reached a banned module. Anything else a client module reaches must be in CLIENT_SAFE, whose
 * files are walked too (what a client-safe module imports must be client-safe as well). Anything
 * under data/, zod and the Node built-ins are banned outright.
 */
import { builtinModules } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  PAGE_CODE_ROOTS,
  expectAtLeast,
  importsOf,
  isUseClient,
  moduleFile,
  parse,
  parseText,
  resolveModule,
  sourceFiles,
} from '@/tests/support/source-tree';

/**
 * Repo-relative module paths (no extension, no trailing /index) a client module may import from
 * outside components/ and app/. An entry ending in '/' is a prefix: it admits everything under it.
 */
const CLIENT_SAFE: readonly string[] = ['lib/model/', 'lib/shared/', 'lib/format/', 'lib/config/season', 'lib/config/mascots'];

const NODE_BUILTINS = new Set(builtinModules);

const isClientSafe = (mod: string): boolean =>
  CLIENT_SAFE.some((entry) => (entry.endsWith('/') ? mod.startsWith(entry) : mod === entry));

const inPageCode = (mod: string): boolean => PAGE_CODE_ROOTS.some((root) => mod.startsWith(`${root}/`));

type Target = { kind: 'file'; file: string } | { kind: 'banned'; name: string } | { kind: 'external' };

/** Where a specifier leads: a file to walk, a banned module, or a package that is fine. */
function classify(spec: string, fromFile: string): Target {
  if (spec === 'zod' || spec.startsWith('zod/')) return { kind: 'banned', name: spec };
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec.split('/')[0])) return { kind: 'banned', name: spec };
  const mod = resolveModule(fromFile, spec);
  if (mod === null) return { kind: 'external' };
  // Anything under data/ (the snapshot, the official fixtures, the history) is server-only.
  if (mod === 'data' || mod.startsWith('data/')) return { kind: 'banned', name: mod };
  if (!inPageCode(mod) && !isClientSafe(mod)) return { kind: 'banned', name: mod };
  const file = moduleFile(mod);
  return file ? { kind: 'file', file } : { kind: 'external' };
}

/** The first chain from `entry` to a banned module, or null. */
function bannedChain(entry: string): string[] | null {
  const seen = new Set<string>();
  const stack: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [entry] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs|jsx)$/.test(file)) continue;
    for (const { spec } of importsOf(file, { runtimeOnly: true })) {
      const target = classify(spec, file);
      if (target.kind === 'banned') return [...chain, target.name];
      if (target.kind === 'file' && !seen.has(target.file)) stack.push({ file: target.file, chain: [...chain, target.file] });
    }
  }
  return null;
}

/** A client file that does not exist, to resolve probe specifiers from. */
const PROBE = ['components', 'home', 'Probe.tsx'].join('/');

const CLIENT_MODULES = sourceFiles({ roots: PAGE_CODE_ROOTS, ext: ['.ts', '.tsx'] }).filter((f) => isUseClient(parse(f)));

describe('client boundary: no "use client" module reaches a server-only module', () => {
  it('finds the client modules', () => {
    expectAtLeast(16, CLIENT_MODULES, 'use-client modules');
  });

  it('the import scanner skips type-only imports and keeps runtime ones', () => {
    const specs = (text: string) => importsOf(parseText(PROBE, text), { runtimeOnly: true }).map((r) => r.spec);
    expect(
      specs(
        [
          "import type { A } from '../../lib/data';",
          "import { type B, type C } from '../../lib/teams';",
          "export type { D } from '../../lib/config/leagues';",
          "import { x, type Y } from './keep';",
          "import './side-effect';",
          "export { z } from '@/lib/format/words';",
          "import W, { type V } from './default-rides-along';",
          "type T = import('../../lib/data').Snapshot;",
        ].join('\n'),
      ),
    ).toEqual(['./keep', './side-effect', '@/lib/format/words', './default-rides-along']);
  });

  it('the import scanner collects dynamic import() and require() specifiers', () => {
    const text = [
      "const g = await import('../lib/data');",
      'const h = import ( "@/lib/teams" );',
      "const j = require('./legacy');",
    ].join('\n');
    expect(importsOf(parseText(PROBE, text), { runtimeOnly: true }).map((r) => r.spec)).toEqual([
      '../lib/data',
      '@/lib/teams',
      './legacy',
    ]);
  });

  it('a specifier that resolves under data/ is banned (the snapshot never ships to the client)', () => {
    const from = PROBE;
    expect(classify('../../data/snapshot.json', from)).toEqual({ kind: 'banned', name: 'data/snapshot.json' });
    expect(classify('@/data/snapshot.json', from)).toEqual({ kind: 'banned', name: 'data/snapshot.json' });
    expect(classify('../../lib/data', from).kind).toBe('banned');
  });

  it('only CLIENT_SAFE modules are reachable from outside components/ and app/ (allowlist)', () => {
    const from = PROBE;
    // A module nobody listed is banned, wherever it lives: this is what makes the list an allowlist.
    // (lib/format.ts, beside the client-safe lib/format/ directory, serves only the metadata image routes.)
    for (const spec of ['@/lib/config/leagues/labels', '@/lib/config/leagues', '@/lib/format', '@/lib/brand-new-module', '@/scripts/cli']) {
      expect(classify(spec, from), spec).toEqual({ kind: 'banned', name: spec.slice(2) });
    }
    // A listed one passes (and is walked), a trailing /index is the same module, and the client's own tree is free.
    expect(classify('@/lib/format/words', from).kind).toBe('file');
    expect(classify('@/lib/format/words/index', from).kind).toBe('file');
    expect(classify('@/components/ui/local-store', from).kind).toBe('file');
    expect(classify('react', from)).toEqual({ kind: 'external' });
    // zod and the Node built-ins stay banned.
    expect(classify('zod', from)).toEqual({ kind: 'banned', name: 'zod' });
    expect(classify('node:fs', from)).toEqual({ kind: 'banned', name: 'node:fs' });
    expect(classify('path', from)).toEqual({ kind: 'banned', name: 'path' });
  });

  for (const file of CLIENT_MODULES) {
    it(file, () => {
      const chain = bannedChain(file);
      expect(chain, chain ? `client boundary crossed: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});
