/**
 * scripts/copy-rules.ts: the rules scripts/assert-copy.ts holds every built page to — nothing
 * claims rosters or player stats are SCVAL-only now that they cover all four leagues, and no page
 * shows what data/clubs.json keeps but never renders (an affiliation's basis, a source's quote).
 */

import { describe, expect, it } from 'vitest';

import { LEAK_MIN_FRAGMENT, SCVAL_ONLY_CLAIM, affiliationLeaks } from '../scripts/copy-rules';

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
