/**
 * The lib/data boundary: lib/data.ts is the site's one read of the snapshot singleton, and a lib/ domain
 * module should take the games, standings or pairings it works on as parameters rather than importing that
 * singleton, so it stays testable on any input and keeps lib/data out of its import graph. Seven domain
 * modules import it today; the list below is frozen at those seven. A module may leave it (shrink the
 * list), never join it.
 *
 * Runtime imports only (a type-only import of lib/data vanishes at compile time), read with the same
 * parser the other boundary tests use (tests/import-graph.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from './helpers';
import { repoPath, resolveFile, runtimeImports, sourceFiles, specifierBase } from './import-graph';

const DATA = path.join(ROOT, 'lib', 'data.ts');

/** The lib/ modules (besides lib/data.ts itself) that import the lib/data singleton at runtime today. */
const ALLOWED = [
  'lib/jv/jv.ts',
  'lib/players/player-stats.ts',
  'lib/postseason/postseason-round-label.ts',
  'lib/postseason/sds-bracket.ts',
  'lib/ratings/adjusted-scoring.ts',
  'lib/ratings/ratings.ts',
  'lib/schools/venue.ts',
];

function importsData(file: string): boolean {
  return runtimeImports(readFileSync(file, 'utf8')).some((spec) => {
    const base = specifierBase(spec, file, ROOT);
    return base !== null && resolveFile(base) === DATA;
  });
}

describe('lib/data boundary: no new lib/ module imports the lib/data singleton', () => {
  const libModules = sourceFiles(path.join(ROOT, 'lib')).filter((f) => f !== DATA);

  it('finds the lib/ modules', () => {
    expect(libModules.length).toBeGreaterThan(50);
  });

  it('a relative or @/ specifier for lib/data resolves to lib/data.ts', () => {
    expect(resolveFile(specifierBase('../data', path.join(ROOT, 'lib', 'jv', 'jv.ts'), ROOT)!)).toBe(DATA);
    expect(resolveFile(specifierBase('@/lib/data', path.join(ROOT, 'lib', 'jv', 'jv.ts'), ROOT)!)).toBe(DATA);
  });

  it('the lib/ modules that import lib/data are exactly the frozen list', () => {
    const importers = libModules.filter(importsData).map((f) => repoPath(f, ROOT)).sort();
    expect(
      importers,
      'a lib/ domain module must take games/pairings as parameters instead of importing the lib/data singleton; shrink this list, never grow it',
    ).toEqual(ALLOWED);
  });
});
