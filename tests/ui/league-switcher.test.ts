/**
 * `components/layout/LeagueSwitcher.tsx`: the hairline between two sections' chip lists.
 *
 * With five leagues, `All` plus the five chips no longer fit one row at 320-360px (DESIGN §22.3), so
 * the Northern Section's list wraps alone onto a second row. A hairline drawn as its own flex item
 * in the outer row was left behind at the end of row 1. It is now the following list's own
 * `::before`, so it travels with that list: these tests pin that it is never a sibling of the lists.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LeagueSwitcher, { RegionSwitcher, type LeagueChip } from '../../components/layout/LeagueSwitcher';

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

  it('draws each section divider on the list it introduces, never as a separate flex item', () => {
    const uls = lists(html);
    expect(uls.map((u) => /aria-label="([^"]+)"/.exec(u)?.[1]), 'components/layout/LeagueSwitcher.tsx').toEqual([
      'Central Coast Section',
      'North Coast Section',
      'Northern Section',
    ]);
    expect(uls[0], 'the first section has no divider').not.toContain('before:bg-hairline');
    for (const ul of uls.slice(1)) expect(ul, 'a later section leads with its divider').toContain('before:bg-hairline');
    // No stray element between two lists that a wrap could strand at the end of a line.
    expect(html, 'components/layout/LeagueSwitcher.tsx').not.toMatch(/<\/ul><(?!ul\b)[^>]*>(?:<\/[^>]+>)?<ul\b/);
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

  it('draws the divider from the index within the region: CCS and SS open their regions bare', () => {
    expect(uls.map((u) => u.includes('before:bg-hairline'))).toEqual([false, true, true, false, true]);
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
    expect(uls[0]).not.toContain('before:bg-hairline');
    expect(uls[1]).toContain('before:bg-hairline');
    for (const ul of uls) expect(ul).toContain('data-region-scope="socal"');
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
    expect(lists(html)[0]).not.toContain('before:bg-hairline');
    expect(html).toContain('href="/schedule/city"');
    expect(html).toContain('aria-current="page"');
  });
});

describe('RegionSwitcher', () => {
  const html = renderToStaticMarkup(createElement(RegionSwitcher, {}));

  it('is a labelled group of two pressed-state buttons, NorCal then SoCal', () => {
    expect(html).toMatch(/^<div role="group" aria-label="Region"/);
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => /data-region-option="([^"]+)"/.exec(b)?.[1])).toEqual(['norcal', 'socal']);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      // Server render: not pressed and disabled until hydrated; the stylesheet draws the selection.
      expect(b).toContain('aria-pressed="false"');
      expect(b).toContain('disabled=""');
      expect(b).toContain('min-h-11');
      expect(b).toContain('min-w-11');
    }
    expect(html).toContain('>NorCal</button>');
    expect(html).toContain('>SoCal</button>');
  });

  it('is JS-only, has a polite live region, and a hairline only when separated', () => {
    expect(html).toContain('sx-js-only');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toContain('after:bg-hairline');
    expect(renderToStaticMarkup(createElement(RegionSwitcher, { separated: true }))).toContain('after:bg-hairline');
    expect(renderToStaticMarkup(createElement(RegionSwitcher, { label: 'Show region' }))).toContain(
      'aria-label="Show region"',
    );
  });

  it('carries no region scope of its own: it shows in both views', () => {
    expect(html).not.toContain('data-region-scope');
  });
});
