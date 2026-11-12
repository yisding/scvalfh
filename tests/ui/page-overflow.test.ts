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
 * - The header holds the wordmark, the nav and the team search and nothing else (DESIGN §33). The
 *   freshness stamp was cut off in it at 1280, so it left the header for good: nothing in the row
 *   may truncate, and no stamp, external link, theme control or region control may come back.
 * - The stamp now sits beside the content (the league row's util part). Its rule never wraps and
 *   has no clipping property at all, so "Updated 3:42 PM" cannot be cut again.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO } from '../helpers';

const CSS = readFileSync(path.join(REPO, 'app', 'globals.css'), 'utf8');
const HEADER = readFileSync(path.join(REPO, 'components', 'layout', 'SiteHeader.tsx'), 'utf8');
const SCOPE_BAR = readFileSync(path.join(REPO, 'components', 'prefs', 'ScopeBar.tsx'), 'utf8');

describe('no sideways page scroll', () => {
  it('clips html and body horizontally, and never hides them', () => {
    expect(CSS).toMatch(/\bhtml, body \{ overflow-x: clip; \}/);
    expect(CSS, 'overflow hidden on html/body breaks position: sticky').not.toMatch(
      /(^|[\s,}])(html|body)\s*(,\s*(html|body)\s*)?\{[^}]*overflow(-x)?:\s*hidden/m,
    );
  });

  it('keeps the header to the wordmark, the nav and the search: nothing in it can be cut', () => {
    const element = HEADER.match(/<header\b[\s\S]*?<\/header>/);
    expect(element, 'components/layout/SiteHeader.tsx: the <header> element').not.toBeNull();
    const header = element![0];
    for (const banned of ['LastUpdated', 'truncate', 'ExternalLink', 'ThemeToggle', 'RegionSwitcher']) {
      expect(header, `the header must not contain ${banned}`).not.toContain(banned);
    }
    expect(header).toMatch(/<TopNav className="sx-mast-nav"/);
    // Exactly three children in the row: wordmark, nav, search.
    expect(header.match(/className="sx-wordmark"/g)).toHaveLength(1);
    expect(header.match(/className="sx-mast-end"/g)).toHaveLength(1);
  });

  it('draws the stamp beside the content, in a rule that can never cut it', () => {
    // ScopeBar renders its `stamp` prop inside the util part.
    expect(SCOPE_BAR).toMatch(/<span className="sx-scope-util">[\s\S]*?\{stamp\}[\s\S]*?<\/span>/);
    const rules = [...CSS.matchAll(/^\s*\.sx-stamp\s*\{([^}]*)\}/gm)];
    expect(rules, 'globals.css: exactly one base .sx-stamp rule').toHaveLength(1);
    const body = rules[0][1];
    expect(body).toMatch(/white-space:\s*nowrap/);
    for (const banned of ['overflow', 'text-overflow', 'max-width']) {
      expect(body, `.sx-stamp must not set ${banned}`).not.toContain(banned);
    }
    // No other rule may clip a stamp either.
    for (const m of CSS.matchAll(/([^{}]*\.sx-stamp[^{}]*)\{([^}]*)\}/g)) {
      expect(m[2], `${m[1].trim()}`).not.toMatch(/text-overflow|overflow\s*:|max-width/);
    }
  });

  it('lets text inside an old card wrap for as long as the old card exists', () => {
    // The new `.sx-table` cells and `.sx-action` never wrap. On a page that has not been rebuilt
    // (measured at 390px, 2026-11-12) that set /about's cross-check tables 618 to 1080px wide, which
    // widened the whole page on a phone, and cut /playoffs' sentence-long links at the right edge.
    // While the flattened `.sx-card` is defined, both wrap inside it; the rules go when it goes.
    if (!/^\s*\.sx-card \{/m.test(CSS)) return;
    expect(CSS).toContain('.sx-card .sx-table:not(.sx-tablewrap > .sx-table) :is(td, tbody th) { white-space: normal; }');
    expect(CSS).toContain('.sx-card .sx-action, p > .sx-action { white-space: normal; }');
  });
});
