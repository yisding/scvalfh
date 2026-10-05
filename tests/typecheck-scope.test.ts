/**
 * scripts/typecheck-scope.mjs (`pnpm typecheck:scope`): the glob syntax it filters tsc's
 * diagnostics with, and how it splits `tsc --pretty false` output into one diagnostic per error.
 */

import { describe, expect, it } from 'vitest';

import { globToRegExp, parseDiagnostics } from '../scripts/typecheck-scope.mjs';

describe('globToRegExp', () => {
  it('reads ** as any number of segments, none included', () => {
    const re = globToRegExp('lib/**/*.ts');
    expect(re.test('lib/data.ts')).toBe(true);
    expect(re.test('lib/pipeline/steps/official.ts')).toBe(true);
    expect(re.test('scripts/lib/data.ts')).toBe(false);
    expect(globToRegExp('tests/**').test('tests/ui/plural.test.ts')).toBe(true);
  });

  it('keeps * and ? inside one segment', () => {
    expect(globToRegExp('scripts/*.ts').test('scripts/cli.ts')).toBe(true);
    expect(globToRegExp('scripts/*.ts').test('scripts/lib/x.ts')).toBe(false);
    expect(globToRegExp('lib/dat?.ts').test('lib/data.ts')).toBe(true);
    expect(globToRegExp('lib/dat?.ts').test('lib/dat/.ts')).toBe(false);
  });

  it('reads {a,b} as alternation, nested included, and an unbalanced brace literally', () => {
    const re = globToRegExp('{app,components/{ui,layout}}/**/*.tsx');
    expect(re.test('app/page.tsx')).toBe(true);
    expect(re.test('components/ui/Tag.tsx')).toBe(true);
    expect(re.test('components/teams/TeamHero.tsx')).toBe(false);
    expect(globToRegExp('a{b.ts').test('a{b.ts')).toBe(true);
  });

  it('escapes regex characters and anchors the whole path', () => {
    expect(globToRegExp('lib/data.ts').test('lib/dataXts')).toBe(false);
    expect(globToRegExp('lib/data.ts').test('x/lib/data.ts')).toBe(false);
  });
});

describe('parseDiagnostics', () => {
  it('splits tsc output into diagnostics with their continuation lines, files relative to the repo', () => {
    const out = [
      "lib/data.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  The expected type comes from property 'n'.",
      "scripts/cli.ts(1,1): error TS1005: ';' expected.",
      'error TS5083: Cannot read file tsconfig.base.json.',
      '',
    ].join('\n');
    expect(parseDiagnostics(out)).toEqual([
      {
        file: 'lib/data.ts',
        lines: [
          "lib/data.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.",
          "  The expected type comes from property 'n'.",
        ],
      },
      { file: 'scripts/cli.ts', lines: ["scripts/cli.ts(1,1): error TS1005: ';' expected."] },
      { file: null, lines: ['error TS5083: Cannot read file tsconfig.base.json.'] },
    ]);
  });
});
