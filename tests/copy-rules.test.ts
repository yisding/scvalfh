/**
 * scripts/copy-rules.ts: the rule scripts/assert-copy.ts holds every built page to, that nothing
 * claims rosters or player stats are SCVAL-only now that they cover all four leagues; and how it
 * cuts the history page into one section per league.
 */

import { describe, expect, it } from 'vitest';

import { SCVAL_ONLY_CLAIM, sectionById } from '../scripts/copy-rules';

describe('SCVAL_ONLY_CLAIM', () => {
  it.each([
    'Rosters are SCVAL-only.',
    'Player stats: SCVAL only for now.',
    'SCVAL only has rosters at the moment',
    'Only SCVAL teams have rosters.',
    'Only the SCVAL has player stats',
    'Rosters (SCVAL)',
    'player stats (SCVAL teams)',
    'Rosters for SCVAL teams only',
    '<p>Player stats are only for SCVAL.</p>',
    'SCVAL-only: rosters and the like',
  ])('flags %j', (text) => {
    expect(text).toMatch(SCVAL_ONLY_CLAIM);
  });

  it.each([
    'Rosters and player stats for all four leagues.',
    'The 2025-26 history is SCVAL only.',
    '<p>SCVAL only</p><p>Rosters for every team</p>',
    'Rosters from MaxPreps. SCVAL standings come from the official PDFs.',
    'Player stats: not every coach enters them.',
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(SCVAL_ONLY_CLAIM);
  });

  it('does not pair a subject and a claim more than 120 characters apart', () => {
    const far = `Rosters ${'x'.repeat(130)} SCVAL-only`;
    expect(far).not.toMatch(SCVAL_ONLY_CLAIM);
  });
});

describe('sectionById: one league\'s section of the history page', () => {
  type Attrs = (id: string) => string;
  const idFirst: Attrs = (id) => `id="${id}" aria-label="${id}" class="min-w-0"`;
  const idLast: Attrs = (id) => `class="min-w-0 lg:grid" aria-label="${id}" id="${id}"`;
  /** A league section holding its division sections, as app/history/2025-26 renders it. */
  const league = (id: string, attrs: Attrs, divisionAttrs: Attrs, divisions: string[], tail: string) =>
    `<section ${attrs(id)}><h2>${id}</h2>` +
    divisions.map((d) => `<section ${divisionAttrs(d)}><p>${d}</p></section>`).join('') +
    `${tail}</section>`;

  it('finds the id anywhere in the start tag, and takes the nested division sections with it', () => {
    for (const [attrs, divisionAttrs] of [[idFirst, idLast], [idLast, idFirst], [idFirst, idFirst], [idLast, idLast]]) {
      const html =
        '<main>' +
        league('scval', attrs, divisionAttrs, ['de-anza', 'el-camino'], '') +
        league('bval', attrs, divisionAttrs, ['mt-hamilton', 'santa-teresa'], '<p>BVAL tail</p>') +
        league('pcal', attrs, divisionAttrs, [], '<p>Unavailable</p>') +
        '</main>';
      const bval = sectionById(html, 'bval');
      expect(bval).toBe(league('bval', attrs, divisionAttrs, ['mt-hamilton', 'santa-teresa'], '<p>BVAL tail</p>'));
      // A division is a section of its own too; the last league runs to its own close.
      expect(sectionById(html, 'mt-hamilton')).toBe(`<section ${divisionAttrs('mt-hamilton')}><p>mt-hamilton</p></section>`);
      expect(sectionById(html, 'pcal')).toBe(league('pcal', attrs, divisionAttrs, [], '<p>Unavailable</p>'));
    }
  });

  it('matches the id attribute exactly, not a data- attribute, a longer id or another element', () => {
    const html =
      '<div id="bval"></div><section data-id="bval"><p>a</p></section><section id="bval-old"><p>b</p></section>' +
      '<section class="x" id="bval"><p>c</p></section>';
    expect(sectionById(html, 'bval')).toBe('<section class="x" id="bval"><p>c</p></section>');
    expect(sectionById(html, 'mcal')).toBe('');
  });

  it('runs to the end of the markup when the section is never closed', () => {
    expect(sectionById('<p>x</p><section id="a"><section id="b"></section><p>y</p>', 'a')).toBe(
      '<section id="a"><section id="b"></section><p>y</p>',
    );
  });
});
