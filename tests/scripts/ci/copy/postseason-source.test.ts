/**
 * views/shared/postseason-source.ts, held to the words the pages print (scripts/ci/copy/copy-rules.ts's postseason
 * source rule).
 */

import { describe, expect, it } from 'vitest';

import { postseasonSourceLink } from '@/views/shared/postseason-source';

describe('postseasonSourceLink (views/shared/postseason-source.ts): the source link’s words', () => {
  it('keeps the EAL’s link text byte-identical', () => {
    expect(postseasonSourceLink('eal')?.text).toBe('Northern Section Field Hockey Guidelines (PDF)');
  });

  it('names the SoCal documents as /playoffs and /about print them: the config’s sourceLabel, with no format', () => {
    // Whether to add the document's format ("(PDF)", "(Google Doc)") is an open owner decision
    // (views/shared/postseason-source.ts); until it is made, the words are the pages' words.
    for (const id of ['sunset', 'independents']) expect(postseasonSourceLink(id)?.text, id).toBe('CIF-SS Blue Book 2026-27');
    for (const id of ['city', 'north-county', 'metro']) {
      expect(postseasonSourceLink(id)?.text, id).toBe('CIF-SDS Green Book 2026-27, Bylaw 2000.1');
    }
  });

  it('never names a "Field Hockey Guidelines" the SoCal sections do not publish', () => {
    for (const id of ['sunset', 'independents', 'city', 'north-county', 'metro']) {
      expect(postseasonSourceLink(id)?.text, id).not.toMatch(/Field Hockey Guidelines/);
      expect(postseasonSourceLink(id)?.href, id).toMatch(/^https:\/\//);
    }
  });

  it('is null for the leagues whose pages word their own links', () => {
    for (const id of ['scval', 'bval', 'pcal', 'mcal']) expect(postseasonSourceLink(id), id).toBeNull();
  });
});
