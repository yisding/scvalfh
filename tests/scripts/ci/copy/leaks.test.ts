/**
 * scripts/ci/copy/copy-rules.ts: no page shows what data/clubs.json or data/commits.json keeps but never renders (a
 * record's basis, a source's quote).
 */

import { describe, expect, it } from 'vitest';

import {
  LEAK_MIN_FRAGMENT, LEAK_MIN_PRIVATE, affiliationLeaks, commitmentLeaks, restates,
} from '@/scripts/ci/copy/copy-rules';

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

  it('finds an excerpt of a quote as well as the whole of it', () => {
    // 45 letters and digits from inside the quote's first segment, neither end of it.
    expect(affiliationLeaks('<p>Example’s teammates &amp; coach O’Neill: U19 Hawks Blue, Class</p>', file)).toEqual([
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
  });

  it('excuses a quote that only restates an official line the page prints, and nothing more', () => {
    const line = {
      player: 'Pat Example',
      terms: ['Freshman of the Year', 'Saint Ignatius Prep', 'St. Ignatius', 'Midfield', '9'],
    };
    const restating = {
      affiliations: [
        {
          ...file.affiliations[0],
          basis: 'Researchers matched the club blog to the roster.',
          sources: [{ url: 'https://example.com/blog', quote: 'Freshman of the Year - Pat Example, Saint Ignatius Prep' }],
        },
      ],
    };
    // The archive prints the award line from the league's own document, the school first.
    const page = '<dl><dt>Freshman of the Year</dt><dd>Pat Example<span>Saint Ignatius Prep</span></dd></dl>';
    expect(affiliationLeaks(page, restating)).toEqual([
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/blog',
    ]);
    expect(affiliationLeaks(page, restating, { restatedLines: [line] })).toEqual([]);
    // Anything the line does not say keeps the quote a leak: a club, a coach, a teammate.
    expect(restates('freshmanoftheyearpatexamplestignatius', [line])).toBe(true);
    expect(restates('stignatiusmidfield9patexample', [line])).toBe(true);
    expect(restates('freshmanoftheyearpatexamplestignatiussfhawksu19', [line])).toBe(false);
    // The player must be the line's: another player's name with the same title and school is not.
    expect(restates('freshmanoftheyearjosamplestignatius', [line])).toBe(false);
    expect(restates('freshmanoftheyearstignatius', [line])).toBe(false);
    // A basis is never excused.
    expect(
      affiliationLeaks(`${page}<p>Researchers matched the club blog to the roster.</p>`, restating, { restatedLines: [line] }),
    ).toEqual(['st-ignatius / Pat Example (sf-hawks): its basis']);
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

  it('finds an excerpt from the middle of a quote, and lets one under the floor pass', () => {
    // 45 letters and digits from inside the quote's first segment, neither end of it.
    const excerpt = 'teammate Jo Sample, coached by O’Neill: Example College';
    expect(commitmentLeaks(`<p>${excerpt}</p>`, file)).toEqual([
      'st-ignatius / Pat Example (example-college): the quote from https://example.com/commits-2027',
    ]);
    // 39: one short of LEAK_MIN_FRAGMENT, wherever it starts.
    const short = 'eammate Jo Sample, coached by O’Neill: Example Co';
    expect(short.replace(/[^a-z0-9]/gi, '').length).toBe(LEAK_MIN_FRAGMENT - 1);
    expect(commitmentLeaks(`<p>${short}</p>`, file)).toEqual([]);
    // The run must be one run: two halves with other text between them do not add up.
    expect(commitmentLeaks('<p>teammate Jo Sample, coached</p><p>by somebody else: Example College</p>', file)).toEqual([]);
  });

  it('does not count public names towards an excerpt, but counts what only the source says', () => {
    const quoted = (quote: string) => ({
      commitments: [{ ...file.commitments[0], sources: [{ url: 'https://example.com/list', quote }] }],
    });
    const publicTerms = ['Example Preparatory High School', 'San Example Hawks'];
    const list = quoted('Example Preparatory High School | San Example Hawks | coached by Jo Sample since 2019');
    // The school and its club side by side, as a page prints them: 44 letters, every one public.
    const page = '<p>Example Preparatory High School · San Example Hawks</p>';
    expect(commitmentLeaks(page, list)).toHaveLength(1);
    expect(commitmentLeaks(page, list, { publicTerms })).toEqual([]);
    // The part only the list says (a coach's name) makes the same excerpt a leak.
    const coached = '<p>San Example Hawks coached by Jo Sample since 2019</p>';
    expect(commitmentLeaks(coached, list, { publicTerms })).toHaveLength(1);
    // A run whose private part is one short of LEAK_MIN_PRIVATE is not one.
    const private19 = 'abcdefghijklmnopqrs';
    expect(private19.length).toBe(LEAK_MIN_PRIVATE - 1);
    const near = quoted(`Example Preparatory High School ${private19} San Example Hawks`);
    expect(commitmentLeaks(`<p>Example Preparatory High School ${private19}</p>`, near, { publicTerms })).toEqual([]);
    // A whole fragment always counts, public or not.
    const whole = quoted('Example Preparatory High School | San Example Hawks');
    expect(commitmentLeaks(page, whole, { publicTerms })).toHaveLength(1);
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
