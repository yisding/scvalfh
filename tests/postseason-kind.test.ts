/** lib/postseason/postseason-kind.ts — one /playoffs href and one citation per postseason kind. */

import { describe, expect, it } from 'vitest';

import { LEAGUES } from '../lib/leagues';
import { pairingsHref, postseasonCitation, postseasonHref } from '../lib/postseason/postseason-kind';

describe('postseasonHref', () => {
  it('gives a league tournament its own page and every other kind an anchor on /playoffs', () => {
    expect(LEAGUES.length).toBeGreaterThan(0);
    for (const league of LEAGUES) {
      const want = league.postseason.kind === 'league-tournament' ? `/playoffs/${league.id}` : `/playoffs#${league.id}`;
      expect(postseasonHref(league), league.id).toBe(want);
    }
  });
});

describe('postseasonCitation', () => {
  it('cites a non-empty rule for every league', () => {
    for (const league of LEAGUES) expect(postseasonCitation(league), league.id).toMatch(/\S/);
  });
});

describe('pairingsHref', () => {
  it('anchors the league pairing cards on /playoffs', () => {
    expect(pairingsHref('scval')).toBe('/playoffs#scval-pairings');
  });
});
