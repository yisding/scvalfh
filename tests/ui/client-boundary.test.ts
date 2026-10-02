/**
 * The client boundary (SPEC §0.4, §10.2): no `'use client'` module may reach, through its static
 * imports, a server-only module — the snapshot, the registry, the league config, the engines, the
 * pipeline, zod or any Node built-in. Those would ship the whole data layer (and every league's
 * config) to every phone, or fail outright in the browser.
 *
 * One `it` per module whose first statement is `'use client'`, named by its path, so a filter like
 * `-t 'components/(layout|search)/'` runs one owner's modules. Each walks the static import graph
 * (relative and `@/` specifiers, static and dynamic `import()` / `require()`; `import type` /
 * `export type` and all-type specifier lists are ignored, since they vanish at compile time) and
 * fails with the chain that reached a banned module. Anything under data/ is banned outright.
 *
 * Client-safe: lib/types (types), lib/season (a constants leaf), lib/format, lib/game-id,
 * lib/search, lib/pin-label.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Repo-relative module paths (no extension) that a client module must never reach. */
const BANNED_LIB: RegExp[] = [
  /^lib\/data$/,
  /^lib\/teams$/,
  /^lib\/leagues$/,
  /^lib\/registry\//,
  /^lib\/standings$/,
  /^lib\/classify$/,
  /^lib\/snapshot-[^/]+$/,
  /^lib\/postseason$/,
  /^lib\/season-build$/,
  /^lib\/normalize$/,
  /^lib\/pipeline\//,
  /^lib\/official\//,
  /^lib\/backfill$/,
  /^lib\/crosscheck$/,
  /^lib\/sources\//,
];
const NODE_BUILTINS = new Set(builtinModules);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments blanked (strings kept, they hold the specifiers). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

function isUseClient(src: string): boolean {
  return /^\s*['"]use client['"]/.test(stripComments(src));
}

/** Runtime import specifiers of a module (type-only imports and re-exports skipped). */
function runtimeImports(src: string): string[] {
  const code = stripComments(src);
  const specs: string[] = [];
  const re = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m[5]) {
      specs.push(m[5]); // side-effect import
      continue;
    }
    if (m[2]) continue; // import type / export type
    const clause = m[3].trim();
    const braces = /^\{([\s\S]*)\}$/.exec(clause);
    if (braces) {
      const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => n.startsWith('type '))) continue;
    }
    specs.push(m[4]);
  }
  // Dynamic `import('…')` and `require('…')` pull the module into the client bundle as well.
  const dyn = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.jsx'];

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const idx = path.join(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

type Target = { kind: 'file'; file: string } | { kind: 'banned'; name: string } | { kind: 'external' };

function resolve(spec: string, fromFile: string): Target {
  if (spec === 'zod' || spec.startsWith('zod/')) return { kind: 'banned', name: spec };
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec.split('/')[0])) return { kind: 'banned', name: spec };
  let base: string | null = null;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  if (base === null) return { kind: 'external' };
  const relPath = path.relative(ROOT, base).split(path.sep).join('/');
  // Anything under data/ (the snapshot, the official fixtures, the history) is server-only.
  if (relPath === 'data' || relPath.startsWith('data/')) return { kind: 'banned', name: relPath };
  const rel = relPath.replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
  if (BANNED_LIB.some((re) => re.test(rel))) return { kind: 'banned', name: rel };
  const file = resolveFile(base);
  return file ? { kind: 'file', file } : { kind: 'external' };
}

/** The first chain from `entry` to a banned module, or null. */
function bannedChain(entry: string): string[] | null {
  const seen = new Set<string>();
  const stack: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [rel(entry)] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs|jsx)$/.test(file)) continue;
    for (const spec of runtimeImports(readFileSync(file, 'utf8'))) {
      const target = resolve(spec, file);
      if (target.kind === 'banned') return [...chain, target.name];
      if (target.kind === 'file' && !seen.has(target.file)) stack.push({ file: target.file, chain: [...chain, rel(target.file)] });
    }
  }
  return null;
}

function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

const CLIENT_MODULES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]
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
    it(rel(file), () => {
      const chain = bannedChain(file);
      expect(chain, chain ? `client boundary crossed: ${chain.join(' → ')}` : '').toBeNull();
    });
  }
});
