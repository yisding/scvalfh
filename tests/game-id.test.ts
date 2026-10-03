import { describe, expect, it } from 'vitest';

import { gameHref, gameIdToParam, paramToGameId } from '../lib/game-id';

const GUID = '30e15701-fddc-4695-9f1c-148e19f58ca5';

describe('game ids in URLs', () => {
  it('leaves a MaxPreps GUID unchanged', () => {
    expect(gameIdToParam(GUID)).toBe(GUID);
    expect(paramToGameId(GUID)).toBe(GUID);
  });

  it("maps a si.com-only id's ':' to '-' and back", () => {
    expect(gameIdToParam('sblive:123')).toBe('sblive-123');
    expect(paramToGameId('sblive-123')).toBe('sblive:123');
  });

  it('round-trips both kinds', () => {
    for (const id of [GUID, 'sblive:6541425', 'sblive:0']) {
      expect(paramToGameId(gameIdToParam(id))).toBe(id);
    }
  });

  it('builds the game href', () => {
    expect(gameHref(GUID)).toBe(`/game/${GUID}`);
    expect(gameHref('sblive:6541425')).toBe('/game/sblive-6541425');
  });

  it('leaves anything else alone', () => {
    expect(gameIdToParam('sblive:abc')).toBe('sblive:abc');
    expect(paramToGameId('sblive-abc')).toBe('sblive-abc');
  });
});
