/**
 * vitest.config.ts's SPAWN list is complete and exact: it names every test file that runs a repo
 * script under tsx through the tests/support/cli.ts helpers (runScript, runRepoScript, runFixtureCli,
 * buildFixtureSnapshot, buildFixturePlayerStats), and nothing else. The list is kept by hand, so a
 * new spawning test would otherwise land silently in the `unit` project. tests/arch/ is left out:
 * the arch project runs on its own (tests/arch/workflows.test.ts spawns two CI scripts there).
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { expectAtLeast, importsOf, parse, sourceFiles } from '@/tests/support/source-tree';

const SPAWN_HELPERS = new Set(['runScript', 'runRepoScript', 'runFixtureCli', 'buildFixtureSnapshot', 'buildFixturePlayerStats']);

/** The string literals of the `const SPAWN = [...]` array in vitest.config.ts. */
function spawnList(): string[] {
  const sf = parse('vitest.config.ts');
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 'SPAWN' && decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
        return decl.initializer.elements.filter(ts.isStringLiteral).map((el) => el.text);
      }
    }
  }
  throw new Error('vitest.config.ts: no `const SPAWN = [...]` array');
}

/** Test files outside tests/arch that import a spawning helper from tests/support/cli.ts. */
function spawningTests(): string[] {
  return sourceFiles({ roots: ['tests'], ext: ['.test.ts'] })
    .filter((file) => !file.startsWith('tests/arch/'))
    .filter((file) =>
      importsOf(file).some(({ spec, names }) => spec === '@/tests/support/cli' && names.some((name) => SPAWN_HELPERS.has(name))),
    );
}

describe('the vitest spawn project', () => {
  it('lists exactly the test files that spawn a repo script', () => {
    const listed = spawnList();
    expectAtLeast(10, listed, 'SPAWN entries');
    expect([...listed].sort(), 'vitest.config.ts SPAWN').toEqual(spawningTests());
  });
});
