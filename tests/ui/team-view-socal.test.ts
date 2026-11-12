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
type Line = typeof import('../../components/playoffs/team-postseason-line');

let data: Data;
let dataLine: Line;
let view: View;
let renderTeam: (slug: string) => Promise<string>;

beforeAll(async () => {
  data = await import('../../lib/data');
  dataLine = await import('../../components/playoffs/team-postseason-line');
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

  it('a San Diego team’s postseason card never says "Projected from the table today": the Section places teams', async () => {
    const placed = data.getStandings('palomar').find((r) => r.computed.gp > 0)!;
    const line = dataLine.getTeamPostseasonLine(placed.slug)!;
    expect(line.caveat, 'components/playoffs/team-postseason-line.ts caveat').toBeNull();
    const text = textOf(await renderTeam(placed.slug));
    expect(text, 'components/teams/TeamPlayoffLine.tsx').toContain('San Diego Section playoffs');
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('Projected from the table today');
  });

  it('a team with no league game yet: no figures, no invented record, and its first league game is in the schedule', async () => {
    // Hilltop's first Metro South Bay game is Wed Oct 7 vs Southwest (the capture is Oct 5).
    const v = view.buildTeamPageView('hilltop')!;
    const first = v.leagueLog.reduce((a, g) => (g.dateLocal < a.dateLocal ? g : a));
    expect(first.dateKey, `${TV} first league game`).toBe('2026-10-07');
    const html = await renderTeam('hilltop');
    const hilltop = textOf(html);
    const at = html.indexOf('<section id="schedule"');
    expect(html.slice(at, html.indexOf('</section>', at)), 'components/teams/TeamGameLog.tsx').toContain(
      `href="/game/${first.contestId.replace(':', '-')}"`,
    );
    expect(hilltop).toContain('vs Southwest');
    expect(hilltop).not.toContain('0-0-0');
    expect(hilltop).not.toContain('MaxPreps may have results we have not picked up yet');
    expect(textOf(await renderTeam('southwest'))).toContain('at Hilltop');
  });

  it('the Player stats link "Leaders" goes to the region’s own player boards', async () => {
    expect(await renderTeam('hilltop')).toContain('href="/leaders#players-socal"');
    expect(await renderTeam('poway')).not.toContain('href="/leaders#players"');
  });

  it('a membership league’s page explains no column: the stat tiles and their method text are gone', async () => {
    // DESIGN §33: GP, Max and their "How these numbers are counted" disclosure are not on the team page
    // (the standings row carries the figures; the method is /about's).
    const helix = textOf(await renderTeam('helix'));
    expect(helix).not.toContain('GP is counted results');
    expect(helix).not.toContain('out of the 8 scheduled');
    expect(helix).not.toContain('How these numbers are counted');
  });
});
