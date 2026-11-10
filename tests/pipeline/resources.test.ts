/** lib/pipeline/resources.ts — the one table of per-kind resource facts LiveTransport reads. */

import { describe, expect, it } from 'vitest';

import { RESOURCES } from '../../lib/pipeline/resources';

describe('RESOURCES', () => {
  const entries = Object.entries(RESOURCES);

  it('gives every resource kind a host, an extension, a URL builder and a live fetch', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [kind, spec] of entries) {
      expect(['maxpreps', 'sblive', 'official', 'other'], kind).toContain(spec.host);
      expect(['.json', '.html', '.ics', '.txt', '.csv'], kind).toContain(spec.ext);
      expect(typeof spec.url, kind).toBe('function');
      expect(typeof spec.fetch, kind).toBe('function');
    }
  });

  it('marks only the two hash-by-contract kinds as hash bodies', () => {
    expect(entries.filter(([, spec]) => spec.hashBody).map(([kind]) => kind).sort()).toEqual(['official-changes', 'official-revision']);
  });
});
