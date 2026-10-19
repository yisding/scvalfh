/**
 * scripts/ci/copy/copy-rules.ts: the history page holds what the data says it holds (historyPageProblems), and a
 * league's section of it is cut out by id (sectionById).
 */

import { describe, expect, it } from 'vitest';

import { getHistoryLeagues } from '@/lib/datasets/history';
import { historyPageProblems, sectionById } from '@/scripts/ci/copy/copy-rules';

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

describe('historyPageProblems: the history page holds what the history data says', () => {
  const leagues = getHistoryLeagues();
  /** React's escaping of text: `&` and `'`. */
  const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
  /** The page's <main>, as app/history/2025-26 renders it, with one league's section edited. */
  const page = (edit: { id: string; omit?: boolean; dropDivision?: boolean; tail?: string } | null = null) =>
    '<main>' +
    leagues
      .filter(({ id }) => !(edit?.id === id && edit.omit))
      .map(({ id, entry }) => {
        const body =
          entry.status === 'available'
            ? entry.divisions
                .filter((_, i) => !(edit?.id === id && edit.dropDivision && i === 0))
                .map(
                  (d) =>
                    `<section class="min-w-0" id="${d.division}"><table>` +
                    d.standings.varsity.map((r) => `<tr><td>${escaped(r.name)}</td><td>${r.leagueRecord}</td></tr>`).join('') +
                    '</table></section>',
                )
                .join('')
            : `<div><h3>Unavailable</h3><p>${escaped(entry.reason)}</p></div>`;
        return `<section id="${id}" aria-label="${id}"><h2>${id}</h2>${body}${edit?.id === id ? (edit.tail ?? '') : ''}</section>`;
      })
      .join('') +
    '</main>';
  const available = leagues.find((l) => l.entry.status === 'available');
  const unavailable = leagues.find((l) => l.entry.status === 'unavailable');

  it('finds nothing on a complete page', () => {
    expect(historyPageProblems(page(), leagues)).toEqual([]);
  });

  it('names a league whose section is gone', () => {
    expect(historyPageProblems(page({ id: 'pcal', omit: true }), leagues)).toEqual(['no <section id="pcal">']);
  });

  it('names the division anchor an available league lost', () => {
    if (available?.entry.status !== 'available') throw new Error('no available league in the history data');
    const { id, entry } = available;
    const problems = historyPageProblems(page({ id, dropDivision: true }), leagues);
    expect(problems).toContain(`${id}: no id="${entry.divisions[0].division}" division anchor`);
  });

  it('reports an unavailable league that shows a table or an award', () => {
    if (!unavailable) throw new Error('no unavailable league in the history data');
    const { id } = unavailable;
    expect(historyPageProblems(page({ id, tail: '<table><tr><td>1-0</td></tr></table>' }), leagues)).toEqual([
      `${id}: an unavailable league shows a table`,
    ]);
    const award = historyPageProblems(page({ id, tail: '<p>League champion: Example</p>' }), leagues);
    expect(award).toHaveLength(1);
    expect(award[0]).toMatch(new RegExp(`^${id}: an unavailable league shows a result or award — “…`));
  });

  it('reads the reason as React escapes it, decoding each entity once', () => {
    if (unavailable?.entry.status !== 'unavailable') throw new Error('no unavailable league in the history data');
    const { id } = unavailable;
    const reason = `The league's "standings" page & its <archive> are gone, so nothing official was read.`;
    const one = [{ id, entry: { ...unavailable.entry, reason } }];
    const section = (text: string) => `<main><section id="${id}"><div><h3>Unavailable</h3><p>${text}</p></div></section></main>`;
    // React escapes `& < > " '` in text.
    const react = reason
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
    expect(historyPageProblems(section(react), one)).toEqual([]);
    // An escaped `&#x27;` is the text `&#x27;`, never an apostrophe.
    expect(historyPageProblems(section(react.replace('&#x27;', '&amp;#x27;')), one)).toEqual([
      `${id}: the reason is not on the page`,
    ]);
  });
});
