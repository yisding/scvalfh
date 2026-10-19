/**
 * lib/queries/provenance.ts: the snapshot's identity and freshness, and the secondary-source read API (dropped rows,
 * superseded games, official fixtures, sources and the MaxPreps cross-check), against the committed v1 golden
 * snapshot migrated to v2 (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { goldenQueries } from '@/tests/support/golden-queries';

describe('lib/queries/provenance: identity and freshness', () => {
  it('loads the snapshot once and exposes it', () => {
    expect(goldenQueries.data.getSnapshot().schemaVersion).toBe(2);
    expect(goldenQueries.data.getSnapshot().teams.length).toBe(102);
    expect(goldenQueries.data.getFetchedAt()).toBe('2026-10-02T10:48:51.206Z');
    expect(goldenQueries.data.getCounts().teams).toBe(102);
  });

  it('derives today from the snapshot stamp in America/Los_Angeles', () => {
    // 2026-10-02T10:48Z is 3:48 AM PDT on the 2nd.
    expect(goldenQueries.data.getToday()).toBe('2026-10-02');
  });
});

describe('lib/queries/provenance: the secondary-source read API', () => {
  it('returns what the snapshot carries, and is safe to call when it carries nothing', () => {
    expect(goldenQueries.data.getDropped()).toEqual([]);
    expect(goldenQueries.data.getSupersededGames()).toEqual({});
    expect(goldenQueries.data.getOfficialFixtures()).toHaveLength(2);
    expect(goldenQueries.data.getOfficialFixtures({ league: 'scval' })).toHaveLength(2);
    expect(goldenQueries.data.getOfficialFixtures({ league: 'bval' })).toEqual([]);
    expect(goldenQueries.data.getOfficialFixtures({ division: 'de-anza', slug: 'cupertino' })).toHaveLength(2);
    expect(goldenQueries.data.getOfficialFixtures({ slug: 'wilcox' })).toEqual([]);
    expect(goldenQueries.data.getSources().length).toBeGreaterThan(20);
    expect(goldenQueries.data.getSources({ league: 'mcal' })).toEqual([]);
  });

  it('keeps the MaxPreps standings cross-check separate from the si.com score one', () => {
    for (const row of goldenQueries.data.getCrossCheck()) {
      expect(row).toHaveProperty('field');
      expect(row).toHaveProperty('ours');
      expect(row).toHaveProperty('theirs');
    }
    expect(goldenQueries.data.getCrossCheck({ league: 'scval' })).toEqual(goldenQueries.data.getCrossCheck());
    expect(goldenQueries.data.getCrossCheck({ league: 'bval' })).toEqual([]);
  });
});
