/**
 * Every data/ JSON file the code imports has a `<name>.d.json.ts` sidecar beside it (README,
 * "Typecheck memory").
 *
 * With `allowArbitraryExtensions` on, tsc resolves `import x from '…/snapshot.json'` to
 * `snapshot.d.json.ts` and never reads the JSON, so the import is typed `unknown` (the loaders
 * validate it with zod anyway). Without a sidecar, tsc infers a literal type from the whole
 * file. With 26 MB of imported data that roughly doubled the typecheck's heap (2.1 GB vs 1.1 GB),
 * past Node's default ~2 GB heap. Nothing else would catch a missing sidecar: the
 * typecheck still passes, only more slowly. Bundlers ignore the sidecars and import the real JSON.
 *
 * Imports are read with ts.preProcessFile, so an import path written in a comment doesn't count.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { REPO } from './helpers';

const ROOTS = ['app', 'components', 'lib', 'scripts'];
const DATA = path.join(REPO, 'data') + path.sep;
const SIDECAR = 'declare const data: unknown;\nexport default data;\n';

function* sourceFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(p);
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !e.name.endsWith('.d.json.ts')) yield p;
  }
}

/** Absolute path of every data/**.json imported from ROOTS → the first file that imports it. */
function importedDataJson(): Map<string, string> {
  const out = new Map<string, string>();
  for (const root of ROOTS) {
    for (const file of sourceFiles(path.join(REPO, root))) {
      const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
      for (const { fileName } of importedFiles) {
        if (!fileName.startsWith('.') || !fileName.endsWith('.json')) continue;
        const target = path.resolve(path.dirname(file), fileName);
        if (target.startsWith(DATA) && !out.has(target)) out.set(target, path.relative(REPO, file));
      }
    }
  }
  return out;
}

describe('data/ JSON imports have .d.json.ts sidecars', () => {
  const imported = importedDataJson();

  it('finds the data imports (the scan is not vacuous)', () => {
    expect(imported.size).toBeGreaterThan(50);
  });

  it('every imported data JSON has a sidecar typing it `unknown`', () => {
    const problems: string[] = [];
    for (const [json, importer] of imported) {
      const sidecar = json.replace(/\.json$/, '.d.json.ts');
      const rel = path.relative(REPO, sidecar);
      if (!existsSync(sidecar)) {
        problems.push(`${rel} is missing (${path.relative(REPO, json)} is imported by ${importer})`);
      } else if (!readFileSync(sidecar, 'utf8').endsWith(SIDECAR)) {
        problems.push(`${rel} must end with:\n${SIDECAR}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
