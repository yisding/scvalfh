/**
 * lib/stable-json.ts: the one sorted-key walk behind every committed data file (stableStringify)
 * and the fetch scripts' no-op check (contentKey).
 */

import { describe, expect, it } from 'vitest';

import { contentKey, normalizeKeys, stableStringify } from '../lib/stable-json';

describe('stable JSON', () => {
  it('contentKey sorts keys and drops ignored keys at every level, compactly', () => {
    const value = { b: { fetchedAt: 'x', z: 1, a: 2 }, fetchedAt: 'y', a: [{ error: 'e', k: 0 }] };
    expect(contentKey(value, ['fetchedAt', 'error'])).toBe('{"a":[{"k":0}],"b":{"a":2,"z":1}}');
  });

  it('walks an object referenced twice, but refuses one that contains itself', () => {
    const shared = { a: 1 };
    expect(stableStringify({ x: shared, y: [shared] })).toBe(
      '{\n  "x": {\n    "a": 1\n  },\n  "y": [\n    {\n      "a": 1\n    }\n  ]\n}\n',
    );
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    expect(() => normalizeKeys(loop)).toThrow('circular structure');
    const ring: unknown[] = [];
    ring.push(ring);
    expect(() => normalizeKeys(ring)).toThrow('circular structure');
  });
});
