/**
 * scripts/copy-rules.ts: the rules scripts/assert-copy.ts holds every built page to — nothing
 * claims rosters or player stats are SCVAL-only now that they cover all four leagues, and no page
 * shows what data/clubs.json or data/commits.json keeps but never renders (a record's basis, a
 * source's quote);
 * and how it cuts the history page into one section per league.
 */

import { describe, expect, it } from 'vitest';

import { LEAK_MIN_FRAGMENT, SCVAL_ONLY_CLAIM, affiliationLeaks, commitmentLeaks, sectionById } from '../scripts/copy-rules';

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

describe('affiliationLeaks (data/clubs.json: quotes and bases are kept, never rendered)', () => {
  const file = {
    affiliations: [
      {
        teamSlug: 'st-ignatius',
        fullName: 'Pat Example',
        club: 'sf-hawks',
        basis: 'Club roster lists her under Class of 2027; the director confirmed it by email.',
        sources: [
          {
            url: 'https://example.com/roster',
            quote: 'Pat Example’s teammates & coach O’Neill: U19 Hawks Blue, Class of 2027 … short bit',
          },
        ],
      },
    ],
  };

  it('finds a basis, whatever the spacing and punctuation', () => {
    const page = '<p>Club roster lists her under\nClass of 2027 - the director confirmed it by email</p>';
    expect(affiliationLeaks(page, file)).toEqual(['st-ignatius / Pat Example (sf-hawks): its basis']);
  });

  it('finds a quote fragment hidden behind entities, JSON escapes and line breaks', () => {
    const html = '<span>Pat Example&#x27;s teammates &amp; coach\nO&rsquo;Neill:</span> U19 Hawks Blue, Class of 2027';
    expect(affiliationLeaks(html, file)).toEqual([
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
    const rsc = 'Pat Example\\u0027s teammates \\u0026 coach O\\u2019Neill: U19 Hawks Blue, Class of 2027';
    expect(affiliationLeaks(rsc, file)).toHaveLength(1);
  });

  it('excuses a quote only from a document the page prints itself, and never a basis', () => {
    const page =
      '<p>Pat Example’s teammates &amp; coach O’Neill: U19 Hawks Blue, Class of 2027</p>' +
      '<p>Club roster lists her under Class of 2027; the director confirmed it by email.</p>';
    // /history/2025-26 prints the SCVAL all-league PDF some quotes copy a line of: not a leak there.
    expect(affiliationLeaks(page, file, { printsItself: new Set(['https://example.com/roster']) })).toEqual([
      'st-ignatius / Pat Example (sf-hawks): its basis',
    ]);
    // Any other document excuses nothing.
    expect(affiliationLeaks(page, file, { printsItself: new Set(['https://example.com/elsewhere']) })).toEqual([
      'st-ignatius / Pat Example (sf-hawks): its basis',
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
  });

  it('ignores a fragment shorter than the floor, and a page that shows neither', () => {
    expect('short bit'.replace(/[^a-z0-9]/gi, '').length).toBeLessThan(LEAK_MIN_FRAGMENT);
    expect(affiliationLeaks('<p>… short bit …</p>', file)).toEqual([]);
    expect(affiliationLeaks('<p>Pat Example · U19 Hawks Blue · Current, as of Jul 8, 2026</p>', file)).toEqual([]);
  });
});

describe('commitmentLeaks (data/commits.json: the same rule as the clubs file)', () => {
  const file = {
    commitments: [
      {
        teamSlug: 'st-ignatius',
        fullName: 'Pat Example',
        college: 'example-college',
        basis: 'Her own profile says committed; a teammate’s post names the coach who recruited her.',
        sources: [
          {
            url: 'https://example.com/commits-2027',
            quote: 'Pat Example and teammate Jo Sample, coached by O’Neill: Example College, Class of 2027 … short bit',
          },
        ],
      },
    ],
  };

  it('finds a basis, and a quote fragment hidden behind entities and JSON escapes', () => {
    const page = '<p>Her own profile says committed - a teammate&#x27;s post names the coach who recruited her</p>';
    expect(commitmentLeaks(page, file)).toEqual(['st-ignatius / Pat Example (example-college): its basis']);
    const rsc = 'Pat Example and teammate Jo Sample, coached by O\\u2019Neill: Example College, Class of 2027';
    expect(commitmentLeaks(rsc, file)).toEqual([
      'st-ignatius / Pat Example (example-college): the quote from https://example.com/commits-2027',
    ]);
  });

  it('excuses a quote only from a document the page prints itself, never a basis', () => {
    const page =
      '<p>Pat Example and teammate Jo Sample, coached by O’Neill: Example College, Class of 2027</p>' +
      '<p>Her own profile says committed; a teammate’s post names the coach who recruited her.</p>';
    expect(commitmentLeaks(page, file, { printsItself: new Set(['https://example.com/commits-2027']) })).toEqual([
      'st-ignatius / Pat Example (example-college): its basis',
    ]);
    expect(commitmentLeaks(page, file)).toHaveLength(2);
  });

  it('ignores what the page is meant to show, and a fragment under the floor', () => {
    expect(commitmentLeaks('<p>Pat Example · Example · NCAA Division I · Committed, as of Jun 2026</p>', file)).toEqual([]);
    expect(commitmentLeaks('<p>… short bit …</p>', file)).toEqual([]);
  });

  it('leaves the clubs rule exactly as it was', () => {
    const asClubs = { affiliations: file.commitments.map((c) => ({ ...c, club: c.college })) };
    const page = '<p>Her own profile says committed; a teammate’s post names the coach who recruited her.</p>';
    expect(affiliationLeaks(page, asClubs)).toEqual(commitmentLeaks(page, file));
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
