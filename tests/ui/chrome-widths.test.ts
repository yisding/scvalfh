/**
 * The chrome keeps its widths: what a page shows must not move because of WHICH page it is, which
 * item is current, or whether the web fonts have arrived yet ("layout is different because of
 * different text widths"). Source pins for the fixes measured in Chromium on 2026-10-18; the
 * measurements themselves are in the comments of the files named.
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

  it('Geist keeps next/font’s adjusted fallback: no `fallback` list (Turbopack lets one replace it)', () => {
    const sans = call('Geist');
    expect(sans).not.toMatch(/\bfallback\s*:/);
    expect(sans).not.toMatch(/adjustFontFallback/);
  });

  it('Geist Mono falls back to a metric-matched monospace, never to a blown-up Arial', () => {
    const mono = call('Geist_Mono');
    expect(mono).toMatch(/adjustFontFallback: false/);
    expect(mono).toMatch(/fallback: \[\s*'Geist Mono Fallback',\s*'Geist Mono Fallback Narrow',[\s\S]*'monospace',\s*\]/);
    expect(css).toMatch(/@font-face \{\s*font-family: "Geist Mono Fallback";/);
    expect(css).toMatch(/@font-face \{\s*font-family: "Geist Mono Fallback Narrow";\s*src: local\("Consolas"\);/);
  });

  it('"Geist Fallback" has a bold face, so semibold text is not set in Arial Regular before Geist loads', () => {
    expect(css).toMatch(/font-family: "Geist Fallback";\s*src: local\("Arial Bold"\), local\("Arial-BoldMT"\);[\s\S]*?font-weight: 600 900;/);
  });

  it('the theme font stacks end in a generic family', () => {
    expect(css).toContain('--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;');
    expect(css).toContain('--font-mono: var(--font-geist-mono), ui-monospace, monospace;');
  });
});

describe('weight without width', () => {
  it('the top-bar label and the filter pills hold their semibold width', () => {
    expect(read('app/globals.css')).toMatch(/\.sx-weight-hold::after \{\s*content: attr\(data-label\);[\s\S]*?font-weight: 600;/);
    expect(read('components/layout/NavLink.tsx')).toContain('<span className="sx-weight-hold" data-label={label}>');
    expect(read('components/schedule/ScheduleFilters.tsx')).toContain('<span className="sx-weight-hold" data-label={option.label}>');
  });
});

describe('PageHeader (components/layout/PageHeader.tsx)', () => {
  it('sets the aside beside the title only from lg, so a header has one shape on every league page', () => {
    const src = read('components/layout/PageHeader.tsx');
    expect(src).toContain("'pt-6 md:pt-10 lg:flex lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-8 lg:gap-y-4'");
    expect(src).not.toMatch(/\bmd:flex\b/);
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
