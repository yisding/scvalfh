/**
 * sx-bleed: nothing cancels the phone bleed.
 *
 * `.sx-bleed` pulls a card out to the screen edges with `margin-inline: -16px`; an `m-0` in the
 * utilities layer wins over it, and the card floats inside the gutters with no side edges. A
 * bleeding list zeroes only its block margins (`my-0`, as components/playoffs/KeyDates.tsx does).
 */
import { describe, expect, it } from 'vitest';

import { PAGE_CODE_ROOTS, readSource, sourceFiles } from '@/tests/support/source-tree';

describe('sx-bleed: nothing cancels the phone bleed', () => {
  it('no className pairs sx-bleed with m-0', () => {
    const offenders = sourceFiles({ roots: PAGE_CODE_ROOTS, ext: ['.tsx'] }).flatMap((file) =>
      [...readSource(file).matchAll(/className=\{?(["'`])([^"'`]*)/g)]
        .map((m) => m[2].split(/\s+/))
        .filter((classes) => classes.includes('sx-bleed') && classes.includes('m-0'))
        .map(() => file),
    );
    expect(offenders).toEqual([]);
  });
});
