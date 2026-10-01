/**
 * `components/teams/team-view.ts` — the derived strings the team page's tiles read.
 *
 * Built from the committed snapshot, so these assert against real places and real ties.
 */

import { describe, expect, it } from 'vitest';

import { buildTeamPageView, placeSub } from '../../components/teams/team-view';
import { getStandings } from '../../lib/data';
import { TEAMS } from '../../lib/teams';

describe('placeSub', () => {
  it('completes the ordinal the tile already shows, rather than replacing it', () => {
    for (const team of TEAMS) {
      const view = buildTeamPageView(team.slug);
      expect(view, team.slug).toBeDefined();
      if (!view) continue;
      const sub = placeSub(view);
      // The tile's VALUE is the ordinal; the sub-line must read as the rest of that sentence and
      // must never open with the tie qualifier, which is what made it read "tied · of 8 in …".
      expect(sub, team.slug).toMatch(
        new RegExp(`^of ${view.divisionSize} in ${view.divisionLabel}( \\(tied\\))?$`),
      );
      expect(sub.startsWith('tied'), team.slug).toBe(false);
    }
  });

  it('marks exactly the teams the standings report as level on points', () => {
    const shared = new Set<string>();
    for (const division of ['de-anza', 'el-camino'] as const) {
      for (const row of getStandings(division)) {
        if (row.tiebreak.shared) shared.add(row.slug);
      }
    }
    // The snapshot has ties today; if a future snapshot has none the assertion below still holds.
    for (const team of TEAMS) {
      const view = buildTeamPageView(team.slug);
      if (!view) continue;
      expect(placeSub(view).endsWith('(tied)'), team.slug).toBe(shared.has(team.slug));
    }
  });
});
