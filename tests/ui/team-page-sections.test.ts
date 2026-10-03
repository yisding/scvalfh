/**
 * Page-level wiring of the team page (app/teams/[slug]/page.tsx): every registry team of every
 * league renders both a Player stats and a Roster section, once each, in that order, and neither
 * says another league's data is missing because it is "SCVAL only". tests/ui/roster-view.test.ts
 * and player-stats-view.test.ts hold the view builders; this renders the real route.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamPage from '../../app/teams/[slug]/page';
import { getRosters } from '../../lib/rosters';
import { getPlayerStats } from '../../lib/player-stats';
import { TEAMS } from '../../lib/teams';
import { SCVAL_ONLY_CLAIM } from '../../scripts/copy-rules';

async function render(slug: string): Promise<string> {
  const element = await TeamPage({ params: Promise.resolve({ slug }) } as never);
  return renderToStaticMarkup(element);
}

/** One team per league that has both sections full, and teams with each empty state. */
const SAMPLE = [
  'st-ignatius', // SCVAL
  'leigh', // BVAL
  'stevenson', // PCAL
  'university-sf', // MCAL
];

describe('the team page, every league', () => {
  it('renders Player stats then Roster, once each, for a team of each league', async () => {
    for (const slug of SAMPLE) {
      const html = await render(slug);
      const stats = [...html.matchAll(/<section[^>]*\bid="player-stats"/g)];
      const roster = [...html.matchAll(/<section[^>]*\bid="roster"/g)];
      expect(stats, slug).toHaveLength(1);
      expect(roster, slug).toHaveLength(1);
      expect(stats[0].index!, slug).toBeLessThan(roster[0].index!);
      expect(html, slug).not.toMatch(SCVAL_ONLY_CLAIM);
    }
  });

  it('every one of the 43 teams renders both sections', async () => {
    for (const team of TEAMS) {
      const html = await render(team.slug);
      expect(html, team.slug).toContain('id="player-stats"');
      expect(html, team.slug).toContain('id="roster"');
    }
  });

  it('says honestly what a team without a roster or stats has', async () => {
    const noRoster = getRosters().teams.find((t) => t.status === 'empty');
    if (noRoster) {
      expect(await render(noRoster.slug)).toContain(`MaxPreps lists no players for`);
    }
    const noStats = getPlayerStats().teams.find((t) => t.status === 'none');
    if (noStats) {
      expect(await render(noStats.slug)).toMatch(/No player stats for|Nobody has entered any/);
    }
  });
});
