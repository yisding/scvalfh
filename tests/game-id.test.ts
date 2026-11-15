import { describe, expect, it } from 'vitest';

import { gameHref, gameIdToParam, paramToGameId } from '../lib/game-id';

const GUID = '30e15701-fddc-4695-9f1c-148e19f58ca5';

describe('game ids and their legacy URL params', () => {
  it('leaves a MaxPreps GUID unchanged', () => {
    expect(gameIdToParam(GUID)).toBe(GUID);
    expect(paramToGameId(GUID)).toBe(GUID);
  });

  it("maps a si.com-only id's ':' to '-' and back", () => {
    expect(gameIdToParam('sblive:123')).toBe('sblive-123');
    expect(paramToGameId('sblive-123')).toBe('sblive:123');
  });

  it("maps a San Diego bracket sheet id's ':' to '-' and back", () => {
    expect(gameIdToParam('cifsds:la-jolla-country-day-at-mission-bay')).toBe('cifsds-la-jolla-country-day-at-mission-bay');
    expect(paramToGameId('cifsds-la-jolla-country-day-at-mission-bay')).toBe('cifsds:la-jolla-country-day-at-mission-bay');
  });

  it('round-trips every kind', () => {
    for (const id of [GUID, 'sblive:6541425', 'sblive:0', 'cifsds:del-norte-at-torrey-pines']) {
      expect(paramToGameId(gameIdToParam(id))).toBe(id);
    }
  });

  it('builds the game href from the slug, never from the id (tests/game-urls.test.ts has the slug rules)', () => {
    const side = (slug: string) => ({ slug, name: slug });
    const game = { contestId: GUID, dateKey: '2026-10-06', site: 'home' as const, away: side('santa-catalina'), home: side('greenfield') };
    expect(gameHref(game)).toBe('/game/2026-10-06-santa-catalina-at-greenfield');
    expect(gameHref({ ...game, slug: '2026-10-06-santa-catalina-at-greenfield-2' })).toBe(
      '/game/2026-10-06-santa-catalina-at-greenfield-2',
    );
  });

  it('leaves anything else alone', () => {
    expect(gameIdToParam('sblive:abc')).toBe('sblive:abc');
    expect(paramToGameId('sblive-abc')).toBe('sblive-abc');
    expect(gameIdToParam('cifsds:no-pair')).toBe('cifsds:no-pair');
    expect(paramToGameId('cifsds-no-pair')).toBe('cifsds-no-pair');
  });
});
