/**
 * No sideways page scroll (app/globals.css, components/layout/SiteHeader.tsx).
 *
 * Chrome on Android showed a scrollbar and a few pixels of sideways scroll on every page: with
 * Android's text scaling the top bar's row could not shrink, and a visually hidden span in it sat
 * past the right edge. The row is fixed at the source; this suite pins the page-level guard and
 * the two details the fix depends on, so neither is "simplified" away:
 *
 * - `overflow-x: clip` on html and body, never `hidden`: `hidden` on <body> makes it a scroll
 *   container, and every `position: sticky` on the site would stick to <body> and stop sticking.
 * - The header stamp may shrink (`min-w-0 truncate`) and is `relative`, the containing block of
 *   its `sr-only` span: an absolutely positioned box is not clipped by an ancestor that is not its
 *   containing block, so without it the span alone widened the page.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from '../helpers';

const CSS = readFileSync(path.join(REPO, 'app', 'globals.css'), 'utf8');
const HEADER = readFileSync(path.join(REPO, 'components', 'layout', 'SiteHeader.tsx'), 'utf8');

describe('no sideways page scroll', () => {
  it('clips html and body horizontally, and never hides them', () => {
    expect(CSS).toMatch(/\bhtml, body \{ overflow-x: clip; \}/);
    expect(CSS, 'overflow hidden on html/body breaks position: sticky').not.toMatch(
      /(^|[\s,}])(html|body)\s*(,\s*(html|body)\s*)?\{[^}]*overflow(-x)?:\s*hidden/m,
    );
  });

  it('lets the header stamp give way, and contains its hidden label', () => {
    const stamp = HEADER.match(/<LastUpdated[\s\S]*?className="([^"]+)"/);
    expect(stamp, 'components/layout/SiteHeader.tsx: the stamp').not.toBeNull();
    const classes = stamp![1].split(/\s+/);
    for (const c of ['relative', 'min-w-0', 'truncate']) expect(classes).toContain(c);
    // The cluster holding the stamp must be allowed to shrink too.
    expect(HEADER).toContain('<span className="ml-auto flex min-w-0 items-center gap-2">');
  });
});
