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

import LeagueSwitcher, { type LeagueChip } from '../../components/layout/LeagueSwitcher';

const CHIPS: LeagueChip[] = [
  { id: 'scval', shortName: 'SCVAL', sectionShort: 'CCS' },
  { id: 'bval', shortName: 'BVAL', sectionShort: 'CCS' },
  { id: 'pcal', shortName: 'PCAL', sectionShort: 'CCS' },
  { id: 'mcal', shortName: 'MCAL', sectionShort: 'NCS' },
  { id: 'eal', shortName: 'EAL', sectionShort: 'NS' },
];
const HREFS = Object.fromEntries([['all', '/schedule'], ...CHIPS.map((c) => [c.id, `/schedule/${c.id}`])]);

/** Each section list's opening tag, in order. */
function lists(html: string): string[] {
  return [...html.matchAll(/<ul\b[^>]*>/g)].map((m) => m[0]);
}

describe.each([
  ['link', () => createElement(LeagueSwitcher, { mode: 'link', includeAll: true, label: 'Leagues', leagues: CHIPS, hrefs: HREFS, current: 'eal' })],
  ['scope', () => createElement(LeagueSwitcher, { mode: 'scope', includeAll: true, label: 'Your league', leagues: CHIPS })],
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
