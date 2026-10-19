/**
 * The OG card rows (views/standings/leader-lines.ts: the root and /standings cards).  League-specific values are
 * asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through useCorpusModules
 * (tests/support/standings-view.ts), so live fetch #2 cannot break them. Every assertion message names the module
 * that produced the value, so a failure routes to its owner.
 */

import { describe, expect, it } from 'vitest';

import { m } from '@/tests/support/standings-view';

describe('OG card rows (leader-lines.ts leaderClause over standings-view.ts leaderLine: the root and /standings cards)', () => {
  const SV = 'views/standings/leader-lines.ts leaderClause';
  it('names each division leader with points, co-leaders capped at two', () => {
    const row = (id: string) => {
      const league = m.data.getLeagueSummary(id as Parameters<typeof m.data.getLeagueSummary>[0]);
      if (!league) throw new Error(`no league ${id}`);
      return m.leaderLines.leaderClause(league.divisions.map((d) => m.sd.leaderLine(d.id, d.heading)));
    };
    expect(row('scval'), `${SV}: OG SCVAL`).toBe('De Anza: Saint Francis 12 pts · El Camino: Mitty 15 pts');
    expect(row('bval'), `${SV}: OG BVAL`).toBe('Mt. Hamilton: Christopher 6 pts · Santa Teresa: Prospect & Westmont 6 pts');
    expect(row('pcal'), `${SV}: OG PCAL`).toBe('Stevenson 18 pts');
    const line = (names: string[]) => ({
      division: 'de-anza',
      heading: null,
      teams: names.map((name) => ({ name, record: '4-0-0', pts: 12 })),
      tiedAtTop: names.length > 1,
    });
    expect(m.leaderLines.leaderClause([line(['A', 'B', 'C', 'D'])]), `${SV}: OG co-leaders`).toBe('A & B +2 12 pts');
    expect(m.leaderLines.leaderClause([line(['A', 'B'])]), `${SV}: OG co-leaders`).toBe('A & B 12 pts');
    expect(m.leaderLines.leaderClause([line([])]), `${SV}: before any result`).toBe('No league results yet');
  });
});
