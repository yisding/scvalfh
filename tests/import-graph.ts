/**
 * The static import graph the boundary tests walk (tests/ui/client-boundary.test.ts,
 * tests/build-only-boundary.test.ts): a module's RUNTIME import specifiers, how a relative or `@/`
 * specifier resolves to a file, and the first chain from an entry module to a module a boundary bans.
 *
 * Runtime means what survives compilation: static imports and re-exports, side-effect imports, and
 * dynamic `import()` / `require()`. `import type` / `export type` and all-type specifier lists are
 * ignored, since they vanish at compile time. Each boundary decides for itself what a specifier
 * resolves to (`Target`): a file to walk into, a banned module, or something outside the walk.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Every .ts / .tsx module under `dir` (declaration files skipped). */
export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments blanked (strings kept, they hold the specifiers). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Runtime import specifiers of a module (type-only imports and re-exports skipped). */
export function runtimeImports(src: string): string[] {
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
  // Dynamic `import('…')` and `require('…')` load the module at runtime as well.
  const dyn = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.jsx'];

/** The file a resolved specifier names: the path itself, with an extension, or its index module. */
export function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const idx = path.join(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

/** The absolute path a relative or `@/` specifier names (no extension added), or null for a package. */
export function specifierBase(spec: string, fromFile: string, root: string): string | null {
  if (spec.startsWith('@/')) return path.join(root, spec.slice(2));
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  return null;
}

/** `file` relative to `root`, with forward slashes. */
export function repoPath(file: string, root: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export type Target = { kind: 'file'; file: string } | { kind: 'banned'; name: string } | { kind: 'external' };

const importsByFile = new Map<string, string[]>();

/**
 * The first chain (repo paths, entry first, the banned module's name last) from `entry` to a module
 * `classify` bans, or null when every module it reaches through runtime imports is allowed.
 */
export function bannedChain(
  entry: string,
  root: string,
  classify: (spec: string, fromFile: string) => Target,
): string[] | null {
  const seen = new Set<string>();
  const stack: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [repoPath(entry, root)] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs|jsx)$/.test(file)) continue;
    let specs = importsByFile.get(file);
    if (!specs) {
      specs = runtimeImports(readFileSync(file, 'utf8'));
      importsByFile.set(file, specs);
    }
    for (const spec of specs) {
      const target = classify(spec, file);
      if (target.kind === 'banned') return [...chain, target.name];
      if (target.kind === 'file' && !seen.has(target.file)) stack.push({ file: target.file, chain: [...chain, repoPath(target.file, root)] });
    }
  }
  return null;
}
