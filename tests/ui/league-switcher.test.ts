/**
 * `components/prefs/LeagueSwitcher.tsx`: the league row and the region control (DESIGN §33).
 *
 * The league row is a row of words on a hairline, one list per section. Nothing is drawn between
 * sections any more: the hairline that used to introduce a later section's list (and, before that,
 * a separate flex item that a wrap stranded at the end of a line) is gone, and these tests pin that
 * no element and no pseudo-element class can come back between two lists. The lists themselves are
 * `display: contents`, so the row wraps tab by tab like text.
 *
 * The region is the one control drawn as a switch (`.sx-seg` of two `.sx-opt` buttons); in the
 * footer and the More sheet it is ONE text button that names the action. The theme is one text
 * button too.
 */

import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { LeagueChip } from '../../components/layout/league-chips';
import LeagueSwitcher, { RegionSwitcher } from '../../components/prefs/LeagueSwitcher';
import ThemeToggle from '../../components/prefs/ThemeToggle';

const GLOBALS = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

const CHIPS: LeagueChip[] = [
  { id: 'scval', shortName: 'SCVAL', sectionShort: 'CCS', region: 'norcal' },
  { id: 'bval', shortName: 'BVAL', sectionShort: 'CCS', region: 'norcal' },
  { id: 'pcal', shortName: 'PCAL', sectionShort: 'CCS', region: 'norcal' },
  { id: 'mcal', shortName: 'MCAL', sectionShort: 'NCS', region: 'norcal' },
  { id: 'eal', shortName: 'EAL', sectionShort: 'NS', region: 'norcal' },
];
/** The SoCal leagues (DESIGN-socal §2.1.5): the Southern Section's Sunset, the San Diego Section's three. */
const SOCAL_CHIPS: LeagueChip[] = [
  { id: 'sunset', shortName: 'Sunset', sectionShort: 'SS', region: 'socal' },
  { id: 'city', shortName: 'City', sectionShort: 'SDS', region: 'socal' },
  { id: 'north-county', shortName: 'North County', sectionShort: 'SDS', region: 'socal' },
  { id: 'metro', shortName: 'Metro', sectionShort: 'SDS', region: 'socal' },
];
const ALL_CHIPS = [...CHIPS, ...SOCAL_CHIPS];
const HREFS = Object.fromEntries([['all', '/schedule'], ...CHIPS.map((c) => [c.id, `/schedule/${c.id}`])]);
/** /playoffs' shape: fragment chips, with a route chip for a league that has its own page. */
const ANCHOR_HREFS = Object.fromEntries(CHIPS.map((c) => [c.id, c.id === 'eal' ? '/playoffs/eal' : `#${c.id}`]));
const ALL_ANCHOR_HREFS = Object.fromEntries(ALL_CHIPS.map((c) => [c.id, `#${c.id}`]));
const SOCAL_HREFS = Object.fromEntries([['all', '/schedule'], ...SOCAL_CHIPS.map((c) => [c.id, `/schedule/${c.id}`])]);

/** Each section list's opening tag, in order. */
function lists(html: string): string[] {
  return [...html.matchAll(/<ul\b[^>]*>/g)].map((m) => m[0]);
}

describe.each([
  ['link', () => createElement(LeagueSwitcher, { mode: 'link', includeAll: true, label: 'Leagues', leagues: CHIPS, hrefs: HREFS, current: 'eal' })],
  ['scope', () => createElement(LeagueSwitcher, { mode: 'scope', includeAll: true, label: 'Your league', leagues: CHIPS })],
  ['anchor', () => createElement(LeagueSwitcher, { mode: 'anchor', label: 'Leagues', leagues: CHIPS, hrefs: ANCHOR_HREFS })],
] as const)('%s mode', (_mode, element) => {
  const html = renderToStaticMarkup(element());

  it('draws nothing between sections: bare lists, and no separate flex item a wrap could strand', () => {
    const uls = lists(html);
    expect(uls.map((u) => /aria-label="([^"]+)"/.exec(u)?.[1]), 'components/prefs/LeagueSwitcher.tsx').toEqual([
      'Central Coast Section',
      'North Coast Section',
      'Northern Section',
    ]);
    // A list is its label (and, in scope and anchor mode, its region) and nothing else: no class,
    // so no `before:` / `after:` divider and no layout of its own.
    for (const ul of uls) {
      expect(ul, 'a section list carries no class').toMatch(/^<ul aria-label="[^"]+"(?: data-region-scope="(?:norcal|socal)")?>$/);
    }
    expect(html).not.toMatch(/(before|after):/);
    // No stray element between two lists that a wrap could strand at the end of a line.
    expect(html, 'components/prefs/LeagueSwitcher.tsx').not.toMatch(/<\/ul><(?!ul\b)[^>]*>(?:<\/[^>]+>)?<ul\b/);
    expect(html).not.toContain('w-px shrink-0 self-center bg-hairline');
  });
});

/**
 * Both regions (DESIGN-socal §2.4; design-review UI §3): each section list carries its region as
 * `data-region-scope` in scope and anchor mode, the hairline is drawn from the list's index WITHIN
 * its region (the first SoCal list has none, since NorCal's lists are hidden in the SoCal view), and
 * there is no wrapper element around a region (it would make the region one flex item).
 */
describe.each([
  ['scope', () => createElement(LeagueSwitcher, { mode: 'scope', includeAll: true, label: 'Your league', leagues: ALL_CHIPS })],
  ['anchor', () => createElement(LeagueSwitcher, { mode: 'anchor', label: 'Leagues', leagues: ALL_CHIPS, hrefs: ALL_ANCHOR_HREFS })],
] as const)('%s mode, both regions', (_mode, element) => {
  const html = renderToStaticMarkup(element());
  const uls = lists(html);

  it('lists the five sections in config order, each with its region', () => {
    expect(uls.map((u) => /aria-label="([^"]+)"/.exec(u)?.[1])).toEqual([
      'Central Coast Section',
      'North Coast Section',
      'Northern Section',
      'Southern Section',
      'San Diego Section',
    ]);
    expect(uls.map((u) => /data-region-scope="([^"]+)"/.exec(u)?.[1])).toEqual([
      'norcal',
      'norcal',
      'norcal',
      'socal',
      'socal',
    ]);
  });

  it('draws no divider in either region: every list is bare, so hiding a region leaves no orphan', () => {
    for (const ul of uls) expect(ul).toMatch(/^<ul aria-label="[^"]+" data-region-scope="(?:norcal|socal)">$/);
    expect(html).not.toMatch(/hairline|(before|after):/);
  });

  it('has no wrapper element around a region and no stray element between lists', () => {
    expect(html).not.toMatch(/<(?!ul\b)[a-z]+\b[^>]*data-region-scope=/);
    expect(html).not.toMatch(/<\/ul><(?!ul\b)[^>]*>(?:<\/[^>]+>)?<ul\b/);
  });
});

describe('a SoCal fixture alone', () => {
  it('scope mode: lists [SS, SDS], the SS list without a divider, data-region-scope on each ul', () => {
    const html = renderToStaticMarkup(
      createElement(LeagueSwitcher, { mode: 'scope', includeAll: true, label: 'Your league', leagues: SOCAL_CHIPS }),
    );
    const uls = lists(html);
    expect(uls.map((u) => /aria-label="([^"]+)"/.exec(u)?.[1])).toEqual(['Southern Section', 'San Diego Section']);
    for (const ul of uls) expect(ul).toMatch(/^<ul aria-label="[^"]+" data-region-scope="socal">$/);
    expect(html).toContain('data-league-option="north-county"');
  });

  it('link mode (a per-league page, handed its own region): no scope attribute, so it shows in either view', () => {
    const html = renderToStaticMarkup(
      createElement(LeagueSwitcher, {
        mode: 'link',
        includeAll: true,
        label: 'Leagues',
        leagues: SOCAL_CHIPS,
        hrefs: SOCAL_HREFS,
        current: 'city',
      }),
    );
    expect(html).not.toContain('data-region-scope');
    for (const ul of lists(html)) expect(ul).toMatch(/^<ul aria-label="[^"]+">$/);
    expect(html).toContain('href="/schedule/city"');
    expect(html).toContain('aria-current="page"');
  });
});

describe('the row lays out as text (app/globals.css)', () => {
  it('section lists are `display: contents`, inside a ScopeBar and alone', () => {
    expect(GLOBALS).toContain('.sx-scope ul, .sx-opts ul { display: contents; }');
    expect(GLOBALS).toContain('.sx-chips ul { display: contents; }');
  });

  it('a league tab is a 44px target that never wraps inside itself', () => {
    const m = /\.sx-tab, \.sx-league-chip, \.sx-opt \{([^}]*)\}/.exec(GLOBALS);
    expect(m, 'globals.css: the tab face').not.toBeNull();
    expect(m![1]).toMatch(/min-height:\s*2\.75rem/);
    expect(m![1]).toMatch(/white-space:\s*nowrap/);
  });
});

describe('RegionSwitcher', () => {
  const html = renderToStaticMarkup(createElement(RegionSwitcher, {}));

  it('is a labelled group of two pressed-state buttons, NorCal then SoCal', () => {
    expect(html).toMatch(/^<div role="group" aria-label="Region" class="sx-js-only sx-seg">/);
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => /data-region-option="([^"]+)"/.exec(b)?.[1])).toEqual(['norcal', 'socal']);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      // Server render: not pressed and disabled until hydrated; the stylesheet draws the selection.
      expect(b).toContain('aria-pressed="false"');
      expect(b).toContain('disabled=""');
      expect(b).toContain('class="sx-opt"');
    }
    // The buttons are DIRECT children of the switch (the scope stylesheet's `.sx-seg>` rules).
    expect(html).toMatch(/class="sx-js-only sx-seg"><button\b[^>]*>NorCal<\/button><button\b[^>]*>SoCal<\/button>/);
  });

  it('is a 44px target on touch: a 32px segment whose hit area reaches 6px above and below', () => {
    expect(GLOBALS).toMatch(/\.sx-seg > \.sx-opt \{ position: relative;[^}]*min-height: 2rem;/);
    expect(GLOBALS).toContain(
      '@media (pointer: coarse) { .sx-seg > .sx-opt::before { content: ""; position: absolute; inset: -6px 0; } }',
    );
  });

  it('is JS-only, has a polite live region, and draws no hairline of its own', () => {
    expect(html).toContain('sx-js-only');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toMatch(/hairline|(before|after):/);
    // `separated` is accepted and draws nothing.
    expect(renderToStaticMarkup(createElement(RegionSwitcher, { separated: true }))).toBe(html);
    expect(renderToStaticMarkup(createElement(RegionSwitcher, { label: 'Show region' }))).toContain(
      'aria-label="Show region"',
    );
  });

  it('carries no region scope of its own: it shows in both views', () => {
    expect(html).not.toContain('data-region-scope');
  });

  it('the text face is ONE button that names the action, and no group', () => {
    const text = renderToStaticMarkup(createElement(RegionSwitcher, { face: 'text', className: 'sx-textbtn' }));
    const buttons = [...text.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(1);
    expect(text.match(/data-region-option=/g)).toHaveLength(1);
    expect(text).not.toContain('role="group"');
    expect(text).not.toContain('aria-pressed');
    expect(text).not.toContain('sx-seg');
    expect(text).not.toContain('sx-opt');
    // Its option is the OTHER region (the default view is NorCal), and the words say so.
    expect(buttons[0]).toContain('data-region-option="socal"');
    expect(buttons[0]).toContain('class="sx-js-only sx-textbtn"');
    expect(text).toContain('>Switch to SoCal</button>');
    // The announcement is a sibling, never part of the button's name.
    expect(text).toMatch(/<\/button><span role="status" aria-live="polite" class="sr-only"><\/span>$/);
  });
});

describe('ThemeToggle', () => {
  it.each(['text', 'row'] as const)('is ONE text button that names the action (face: %s)', (face) => {
    const html = renderToStaticMarkup(createElement(ThemeToggle, { face }));
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html.match(/data-theme-toggle/g)).toHaveLength(1);
    expect(html).toMatch(/^<button type="button" data-theme-toggle=""/);
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('role="radio');
    expect(html).not.toContain('sx-seg');
    // The server (and a light device) offers the other theme by name.
    expect(html).toContain('>Dark mode</button>');
    expect(html).toContain('sx-js-only');
    expect(html.includes('sx-textbtn')).toBe(face === 'text');
  });
});

/**
 * One tab width on every page. A tab's selected state is bold, and its label is set twice
 * (`.sx-weight-hold`: the visible word plus a hidden zero-height bold copy), so a per-league page's
 * row is the same row whichever league is current. The check spans that used to mark the current
 * chip are gone: selection is weight plus a bar, never a glyph.
 */
describe('the league tab', () => {
  const chipsOf = (html: string) =>
    [...html.matchAll(/<(a|button)\b[^>]*class="(sx-league-chip[^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({
      className: m[2],
      body: m[3],
    }));
  const link = (current?: string) =>
    renderToStaticMarkup(
      createElement(LeagueSwitcher, { mode: 'link', includeAll: true, label: 'Leagues', leagues: CHIPS, hrefs: HREFS, current }),
    );
  const scope = () =>
    renderToStaticMarkup(createElement(LeagueSwitcher, { mode: 'scope', includeAll: true, label: 'Your league', leagues: CHIPS }));
  const anchor = () =>
    renderToStaticMarkup(createElement(LeagueSwitcher, { mode: 'anchor', label: 'Leagues', leagues: CHIPS, hrefs: ANCHOR_HREFS }));

  it.each(['scval', 'eal', undefined])('link mode: every tab is the width-held label alone (current: %s)', (current) => {
    const html = link(current);
    const chips = chipsOf(html);
    expect(chips).toHaveLength(CHIPS.length + 1);
    for (const chip of chips) {
      expect(chip.body, 'components/prefs/LeagueSwitcher.tsx').toMatch(
        /^<span class="sx-weight-hold" data-label="([^"]+)">\1<\/span>$/,
      );
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('every mode: the class is exactly `sx-league-chip`, never the page-tab face', () => {
    const all = [...chipsOf(scope()), ...chipsOf(anchor()), ...chipsOf(link('bval'))];
    expect(all).toHaveLength(CHIPS.length + 1 + CHIPS.length + CHIPS.length + 1);
    for (const chip of all) {
      expect(chip.className).toBe('sx-league-chip');
      expect(chip.className).not.toContain('sx-tab');
      expect(chip.body).toMatch(/^<span class="sx-weight-hold" data-label="([^"]+)">\1<\/span>$/);
    }
  });

  it('no mode and no region control renders a check span', () => {
    for (const html of [link('bval'), scope(), anchor(), renderToStaticMarkup(createElement(RegionSwitcher, {}))]) {
      expect(html).not.toContain('sx-chip-check');
      expect(html).not.toContain('sx-check');
    }
  });

  it('never types the glyph', () => {
    for (const html of [link('bval'), scope(), renderToStaticMarkup(createElement(RegionSwitcher, {}))]) {
      expect(html).not.toContain('✓');
    }
  });
});
