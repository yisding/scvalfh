/**
 * San Diego team pages on the socal-2026-10-06 CORPUS snapshot (fetched 2026-10-06T02:32Z, Mon Oct 5
 * Pacific): the wording the 2026-10-06 review asked for.
 *
 *  - the "Earlier:" line of a level final MaxPreps marks W and L in a section whose shootout is
 *    'unverified' (SectionConfig.shootout.inference) says the team was credited with the win on a level
 *    score, never that a shootout decided it; the EAL's 'verified' line is unchanged;
 *  - a team whose first league game is after the snapshot's Pacific day says so, instead of "MaxPreps may
 *    have results we have not picked up yet";
 *  - 'Site leaders' on a SoCal team page goes to the SoCal player boards;
 *  - the GP sentence of a 'membership' league names the full home-and-away count, not "N scheduled".
 */
import { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { SOCAL_CORPUS, stubCorpusSnapshot } from '../helpers';
import { textOf } from './html-text';

stubCorpusSnapshot(SOCAL_CORPUS);

type Data = typeof import('../../lib/data');
type View = typeof import('../../components/teams/team-view');

let data: Data;
let view: View;
let renderTeam: (slug: string) => Promise<string>;

beforeAll(async () => {
  data = await import('../../lib/data');
  view = await import('../../components/teams/team-view');
  const teamPage = await import('../../app/teams/[slug]/page');
  renderTeam = async (slug: string) => {
    const el = await teamPage.default({ params: Promise.resolve({ slug }) } as never);
    return renderToStaticMarkup(el as ReactElement);
  };
}, 600_000);

const TV = 'components/teams/team-view.ts';

describe('San Diego team pages (socal corpus)', () => {
  it('the corpus is the Oct 5 Pacific capture', () => {
    expect(data.getToday()).toBe('2026-10-05');
  });

  it('an "Earlier:" level W/L final in the San Diego Section is a credited win, never a shootout', () => {
    // Poway 0, Mt. Carmel 0, Sep 11 at Poway: MaxPreps marks Mt. Carmel W and Poway L, decider 'SO'.
    const mtCarmel = data.getTeamBySlug('mt-carmel')!;
    const poway = data.getTeamBySlug('poway')!;
    expect(view.earlierMeeting(mtCarmel, poway, '2026-09-12')?.text, `${TV} earlierMeeting`).toBe(
      'Earlier: credited with the win on a level 0–0 score away, Sep 11',
    );
    expect(view.earlierMeeting(poway, mtCarmel, '2026-09-12')?.text, `${TV} earlierMeeting`).toBe(
      'Earlier: lost on a level 0–0 score at home, Sep 11',
    );
    for (const team of data.getTeams()) {
      const card = view.buildTeamPageView(team.slug)!.nextCard;
      if (card.kind === 'game' && card.earlier) {
        expect(card.earlier.text, `${TV} ${team.slug}`).not.toMatch(/shootout|\bSO\b/);
      }
    }
  });

  it('a team with no league game yet names its first one', async () => {
    const hilltop = textOf(await renderTeam('hilltop'));
    expect(hilltop).toContain('Hilltop has not played a Metro South Bay game yet.');
    expect(hilltop).toContain('The first is Wed Oct 7 vs Southwest. Their schedule is below.');
    expect(hilltop).not.toContain('MaxPreps may have results we have not picked up yet');
    const southwest = textOf(await renderTeam('southwest'));
    expect(southwest).toContain('The first is Wed Oct 7 at Hilltop. Their schedule is below.');
  });

  it('"Site leaders" goes to the region’s own player boards', async () => {
    expect(await renderTeam('hilltop')).toContain('href="/leaders#players-socal"');
    expect(await renderTeam('poway')).not.toContain('href="/leaders#players"');
  });

  it('a membership league’s GP sentence names the full home-and-away count, not "scheduled"', async () => {
    const helix = textOf(await renderTeam('helix'));
    expect(helix).toContain('GP is counted results out of the 8 a full home-and-away schedule gives each team;');
    expect(helix).not.toContain('out of the 8 scheduled');
  });
});
