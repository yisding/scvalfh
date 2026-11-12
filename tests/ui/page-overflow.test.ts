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

  it('keeps a stretched team link inside its own table row', () => {
    // `.sx-rowlink::after` is `position: absolute; inset: 0`: it covers the nearest positioned box. A
    // table whose rows did not say `relative` (the MCAL seeds on /playoffs, the JV tables) left that
    // box to the page, so one team's link lay over the whole first screen and took every tap
    // (found in the integration sweep, 2026-11-12). The row is positioned by the shared rule.
    expect(CSS).toContain('.sx-rowlink::after { content: ""; position: absolute; inset: 0; }');
    expect(CSS).toContain('.sx-table tbody tr { position: relative; }');
  });

  it('has no old card left to wrap inside, and still wraps a link set in a paragraph', () => {
    // The pages dropped `.sx-card` (integration pass, 2026-11-12), so the flattened card and the two
    // rules that let text wrap inside it are gone together. A sentence-long `.sx-action` set in a
    // paragraph still wraps: /playoffs' NFHS link is wider than a 320px phone.
    expect(CSS).not.toMatch(/\.sx-card\b/);
    expect(CSS).toContain('p > .sx-action { white-space: normal; }');
  });
});
