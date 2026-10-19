/**
 * The /game/[id] route params (SPEC §10.6; views/game/game-route.ts: app/game/[id]/page.tsx and opengraph-image.tsx
 * share gameStaticParams and gameParam).
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6; the fixture is
 * tests/support/game-view.ts). Every assertion message names the module that produced the value.
 */

import { describe, expect, it } from 'vitest';

import { L } from '@/tests/support/game-view';

describe('params (app/game/[id]/page.tsx and opengraph-image.tsx via game-route.ts gameStaticParams)', () => {
  it('page params === OG params, one per game, gameIdToParam round trip, no ":"', () => {
    const page = L.pageParams();
    const og = L.ogParams();
    expect(og, 'app/game/[id]/opengraph-image.tsx: OG params === page params').toEqual(page);
    const games = L.d.getGames();
    const superseded = Object.keys(L.d.getSupersededGames());
    expect(page.length, 'views/game/game-route.ts gameStaticParams count').toBe(games.length + superseded.length);
    for (const { id } of page) {
      expect(id, 'views/game/game-view.ts param').not.toContain(':');
      const contestId = L.ids.paramToGameId(id);
      expect(L.ids.gameIdToParam(contestId), `lib/shared/game-id.ts round trip ${id}`).toBe(id);
      expect(
        !!L.d.getGameById(contestId) || superseded.includes(contestId),
        `views/game/game-view.ts ${id} resolves`,
      ).toBe(true);
    }
    const sblive = games.filter((g) => g.contestId.startsWith('sblive:'));
    expect(sblive.length, 'lib/queries/games.ts: the corpus has si.com-only games').toBeGreaterThan(0);
    for (const g of sblive) {
      expect(page.map((p) => p.id), `views/game/game-view.ts ${g.contestId}`).toContain(g.contestId.replace(':', '-'));
    }
  });

  it('buildGameView takes the URL param and returns null for an unknown id', () => {
    const g = L.d.getGames().find((x) => x.contestId.startsWith('sblive:'))!;
    const model = L.m.buildGameView(L.ids.gameIdToParam(g.contestId));
    expect(model?.game.contestId, 'views/game/game-view.ts sblive param').toBe(g.contestId);
    expect(model?.canonical, 'views/game/game-view.ts canonical').toBe(L.ids.gameHref(g.contestId));
    expect(L.m.buildGameView('nope'), 'views/game/game-view.ts unknown').toBeNull();
    expect(L.m.buildGameView('sblive-1'), 'views/game/game-view.ts unknown sblive').toBeNull();
    expect(L.m.buildSupersededStub('sblive-1'), 'views/game/game-view.ts unknown stub').toBeNull();
    // The superseded map is a plain JSON object: no prototype member is ever a "target".
    for (const param of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(L.m.buildSupersededStub(param), `views/game/game-view.ts stub for "${param}"`).toBeNull();
    }
  });
});
