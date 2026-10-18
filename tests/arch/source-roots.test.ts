/**
 * The source roots are complete: every top-level directory that holds a .ts/.tsx/.mjs file is either
 * scanned by the architecture rules (SOURCE_ROOTS) or deliberately ignored (IGNORED_TOP_LEVEL), both in
 * tests/support/source-tree.ts. A new top-level directory (views/, packages/, …) therefore cannot
 * slip past the deleted-names, page-code, client-boundary and layer rules unnoticed.
 */
import { describe, expect, it } from 'vitest';

import { IGNORED_TOP_LEVEL, SOURCE_ROOTS, expectAtLeast, topLevelSourceDirs } from '@/tests/support/source-tree';

describe('source roots', () => {
  it('every top-level directory with source is in SOURCE_ROOTS or IGNORED_TOP_LEVEL', () => {
    const found = topLevelSourceDirs();
    expectAtLeast(SOURCE_ROOTS.length, found, 'top-level source directories');
    const unclassified = found.filter((dir) => !SOURCE_ROOTS.includes(dir));
    expect(
      unclassified,
      'add the directory to SOURCE_ROOTS (its code is ours) or to IGNORED_TOP_LEVEL (it is not) in tests/support/source-tree.ts',
    ).toEqual([]);
  });

  it('a directory is never both scanned and ignored', () => {
    expect(SOURCE_ROOTS.filter((dir) => IGNORED_TOP_LEVEL.includes(dir))).toEqual([]);
  });

  it('every SOURCE_ROOTS entry exists', () => {
    expectAtLeast(SOURCE_ROOTS.length, topLevelSourceDirs().filter((dir) => SOURCE_ROOTS.includes(dir)), 'scanned roots that hold source');
  });
});
