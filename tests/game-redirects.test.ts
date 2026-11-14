/**
 * lib/game-redirects.ts — the redirects next.config.ts returns for retired game pages (SPEC §8.1): one 308 per
 * `supersededGames` key and its OG image, and nothing that could shadow a MaxPreps game's page. The corpus copy in
 * tests/ui/game-view.test.ts checks the file read and next.config.ts itself.
 */

import { describe, expect, it } from 'vitest';

import { supersededGameRedirects } from '../lib/game-redirects';

const GUID = 'b8ac93c0-885d-4998-bda4-aabc8b083a85';

describe('supersededGameRedirects', () => {
  it('a page and its OG image per key, in key order, at the URL params (gameIdToParam)', () => {
    expect(
      supersededGameRedirects({
        'sblive:6543072': GUID,
        'cifsds:del-norte-at-torrey-pines': GUID,
        'official:2026-11-24-greenfield-at-santa-catalina': 'sblive:7000001',
      }),
    ).toEqual([
      { source: '/game/cifsds-del-norte-at-torrey-pines', destination: `/game/${GUID}`, permanent: true },
      { source: '/game/cifsds-del-norte-at-torrey-pines/opengraph-image', destination: `/game/${GUID}/opengraph-image`, permanent: true },
      { source: '/game/official-2026-11-24-greenfield-at-santa-catalina', destination: '/game/sblive-7000001', permanent: true },
      {
        source: '/game/official-2026-11-24-greenfield-at-santa-catalina/opengraph-image',
        destination: '/game/sblive-7000001/opengraph-image',
        permanent: true,
      },
      { source: '/game/sblive-6543072', destination: `/game/${GUID}`, permanent: true },
      { source: '/game/sblive-6543072/opengraph-image', destination: `/game/${GUID}/opengraph-image`, permanent: true },
    ]);
    expect(supersededGameRedirects({})).toEqual([]);
    // A MaxPreps GUID in upper case (GUID_RE allows it) is kept as spelled.
    expect(supersededGameRedirects({ 'sblive:1': GUID.toUpperCase() })[0]).toEqual({
      source: '/game/sblive-1',
      destination: `/game/${GUID.toUpperCase()}`,
      permanent: true,
    });
  });

  it('refuses a key that is a MaxPreps id (its redirect would hide a live page) or a target with route syntax', () => {
    expect(() => supersededGameRedirects({ [GUID]: GUID.replace('b', 'c') })).toThrow(/not an sblive:, cifsds: or official: id/);
    expect(() => supersededGameRedirects({ 'sblive:1': '/elsewhere' })).toThrow(/is not a game id/);
    expect(() => supersededGameRedirects({ 'sblive:1': 'abc:(.*)' })).toThrow(/is not a game id/);
    expect(() => supersededGameRedirects({ 'sblive:1': 'sblive:1' })).toThrow(/is not a game id/);
  });
});
