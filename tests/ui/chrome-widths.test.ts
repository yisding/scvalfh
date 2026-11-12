/**
 * The chrome keeps its widths: what a page shows must not move because of WHICH page it is, which
 * item is current, or whether the web fonts have arrived yet ("layout is different because of
 * different text widths"). Source pins for the fixes measured in Chromium on 2026-10-18, re-pinned
 * for the two faces of the 2026-11-12 refresh (DESIGN §33: Public Sans for text, Barlow Semi
 * Condensed for figures and titles); the measurements themselves are in the comments of the files named.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { pinSelfCss } from '../../components/teams/TeamIdentity';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

describe('fonts (app/layout.tsx, app/globals.css)', () => {
  const layout = read('app/layout.tsx');
  const css = read('app/globals.css');
  const call = (name: string) => {
    const m = new RegExp(`= ${name}\\(\\{([\\s\\S]*?)\\}\\);`).exec(layout);
    expect(m, `app/layout.tsx: ${name}({ … })`).not.toBeNull();
    return m![1];
  };

  it('Public Sans keeps next/font’s adjusted fallback: no `fallback` list (Turbopack lets one replace it)', () => {
    const sans = call('Public_Sans');
    expect(sans).toMatch(/variable: '--font-public-sans'/);
    expect(sans).toMatch(/subsets: \['latin'\]/);
    expect(sans).toMatch(/display: 'swap'/);
    // The variable face: no weight list, so every weight from 100 to 900 is one file.
    expect(sans).not.toMatch(/\bweight\s*:/);
    expect(sans).not.toMatch(/\bfallback\s*:/);
    expect(sans).not.toMatch(/adjustFontFallback/);
  });

  it('Barlow Semi Condensed is the figure and title face: three weights, `--font-num`, the same fallback rule', () => {
    const num = call('Barlow_Semi_Condensed');
    expect(num).toMatch(/weight: \['500', '600', '700'\]/);
    expect(num).toMatch(/variable: '--font-num'/);
    expect(num).toMatch(/subsets: \['latin'\]/);
    expect(num).toMatch(/display: 'swap'/);
    expect(num).not.toMatch(/\bfallback\s*:/);
    expect(num).not.toMatch(/adjustFontFallback/);
    // Both are on <html>, and Geist is gone.
    expect(layout).not.toMatch(/\bGeist/);
    expect(layout).toMatch(/import \{ Barlow_Semi_Condensed, Public_Sans \} from 'next\/font\/google';/);
  });

  it('the options are inline literals: vinext only self-hosts a call whose object is all literals', () => {
    for (const name of ['Public_Sans', 'Barlow_Semi_Condensed']) {
      const body = call(name);
      expect(body, name).not.toMatch(/\.\.\./);
      for (const line of body.split('\n').map((l) => l.trim()).filter(Boolean)) {
        expect(line, `${name}: ${line}`).toMatch(/^[a-zA-Z]+: ('[^']*'|\[('[^']*'(, )?)+\]|true|false),$/);
      }
    }
  });

  it('each fallback face has ONE bold twin (600–700), so bold text is not set in Arial Regular before the font loads', () => {
    expect(css).toMatch(/font-family: "Public Sans Fallback";\s*src: local\("Arial Bold"\), local\("Arial-BoldMT"\);[\s\S]*?font-weight: 600 700;/);
    expect(css).toMatch(/font-family: "Barlow Semi Condensed Fallback";\s*src: local\("Arial Bold"\), local\("Arial-BoldMT"\);[\s\S]*?font-weight: 600 700;/);
    const faces = [...css.matchAll(/@font-face \{\s*font-family: "([^"]+)";/g)].map((m) => m[1]);
    expect(faces).toEqual(['Public Sans Fallback', 'Barlow Semi Condensed Fallback']);
    // Each twin is metric-adjusted, never a blown-up Arial.
    for (const m of css.matchAll(/@font-face \{([^}]*)\}/g)) {
      for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
        expect(m[1], d).toMatch(new RegExp(`${d}: [\\d.]+%;`));
      }
    }
    expect(css).not.toMatch(/Geist/);
  });

  it('the theme font stacks are exact, and the text stack ends in a generic family', () => {
    expect(css).toContain('--font-sans: var(--font-public-sans), ui-sans-serif, system-ui, sans-serif;');
    // Figures fall back to the text face (and through it to the generic tail), never to a monospace.
    expect(css).toContain('--font-mono: var(--font-num), var(--font-sans);');
    expect(css).not.toMatch(/ui-monospace|monospace;/);
  });

  it('titles are set in the figure face by ONE base rule', () => {
    expect(css).toContain('h1, h2, .sx-title { font-family: var(--font-num), var(--font-sans), sans-serif;');
    expect(css.match(/^\s*h1, h2, \.sx-title \{/gm)).toHaveLength(1);
  });
});

describe('weight without width', () => {
  it('the top-bar label, the league tabs and the filter pills hold their bold width', () => {
    expect(read('app/globals.css')).toMatch(/\.sx-weight-hold::after \{\s*content: attr\(data-label\);[^}]*?font-weight: 700;/);
    // The reserved weight is the selected weight: the site's heaviest is 700.
    expect(read('app/globals.css')).toMatch(/\.sx-navtop\[aria-current\], \.sx-navtop:has\(\[data-pending\]\) \{ font-weight: 700;/);
    const nav = read('components/layout/NavLink.tsx');
    expect(nav).toContain('data-label={label}');
    expect(nav).toMatch(/className=\{`sx-indicator sx-weight-hold /);
    expect(read('components/prefs/LeagueSwitcher.tsx')).toContain('<span className="sx-weight-hold" data-label={text}>');
    expect(read('components/schedule/ScheduleFilters.tsx')).toContain('<span className="sx-weight-hold" data-label={option.label}>');
  });
});

describe('PageHeader (components/layout/PageHeader.tsx)', () => {
  const src = read('components/layout/PageHeader.tsx');
  const css = read('app/globals.css');

  it('has one class string and one shape: a grid from globals.css, no breakpoint utilities of its own', () => {
    expect(src).toContain("<header className={['sx-pagehead', lead ? 'sx-teamhead' : null, className].filter(Boolean).join(' ')}>");
    expect(src).toContain('<h1 className="m-0 text-h1 text-ink">');
    expect(src).not.toMatch(/\b(sm|md|lg|xl):/);
    expect(css).toMatch(/\.sx-pagehead \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  });

  it('sets the end slot beside the title only from 768, on every page alike', () => {
    // Below 768 the title spans the row; from 768 it shares row 1 with the end slot, when there is one.
    expect(css).toContain('.sx-pagehead > h1 { grid-column: 1 / -1; margin: 0; }');
    expect(css).toContain('.sx-pagehead:has(> .sx-pagehead-end) > h1 { grid-column: 1; }');
    const at = css.indexOf('.sx-pagehead:has(> .sx-pagehead-end) > h1 { grid-column: 1; }');
    const media = css.lastIndexOf('@media', at);
    expect(css.slice(media, media + 40)).toContain('@media (min-width: 48rem)');
  });

  it('a score page’s header is the hidden h1 alone', () => {
    expect(src).toMatch(/if \(titleHidden\) \{\s*return \(\s*<>\s*<h1 className="sr-only">/);
  });
});

describe('the pinned team’s own hero (components/teams/TeamIdentity.tsx pinSelfCss)', () => {
  it('switches the "replaces your pinned team" note off for its own slug only', () => {
    expect(pinSelfCss('cupertino')).toBe('html[data-pin="cupertino"] [data-team-slug="cupertino"]{--sx-pin-other:none}');
    expect(pinSelfCss('saint-francis')).toContain('[data-team-slug="saint-francis"]');
  });

  it('refuses anything that is not a slug, so nothing can break out of the selector or the <style>', () => {
    for (const bad of ['', 'A', 'a"]', 'a</style>', 'a b', 'x{}']) expect(pinSelfCss(bad), JSON.stringify(bad)).toBeNull();
  });

  it('globals.css reads the property on the pre-hydration reveal', () => {
    expect(read('app/globals.css')).toContain('.sx-pin-other[data-pending] { display: var(--sx-pin-other, inline) !important; }');
  });
});
