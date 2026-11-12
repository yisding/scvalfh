'use client';

import TeamFinder from '../search/TeamFinder';
import type { SearchIndex } from '../../lib/search';

/**
 * The first-visit block on `/` (DESIGN §33, "Home is Scores"): ONE finder over every team, both
 * regions, on one 44px line (its heading is for screen readers; the field's prompt says the same).
 * The page hands it to the score day view, which prints it at the top of the main column, under the
 * date bar. Phones and tablets only: from 1024 the header carries a team search field on the same
 * screen, and two search fields 200px apart read as one control stated twice.
 *
 * `data-scope="none"`: the scope stylesheet shows it only while no league is remembered. Picking a
 * team here pins it, and pinning remembers the team's league, so the block hides the moment it has
 * done its job. Focus then goes to that league's tab in the league row (now the selected one), or to
 * the page's main landmark when the tab is not on screen; never to `<body>` (WCAG 2.4.3).
 *
 * Without JavaScript the finder is hidden (`sx-js-only`, inside TeamFinder); the header's team search
 * and the Teams link are the way in.
 */
export interface FindYourTeamProps {
  /** The search index over every team, built by the page on the server. */
  index: SearchIndex;
}

/** Where focus lands once a team is pinned from this block: its league's tab, else `#main`. */
export function afterPinTarget(leagueId: string): HTMLElement | null {
  if (/^[a-z0-9-]+$/.test(leagueId)) {
    const tab = [...document.querySelectorAll<HTMLElement>(`button[data-league-option="${leagueId}"]`)].find(
      (el) => el.getClientRects().length > 0,
    );
    if (tab) return tab;
  }
  const main = document.getElementById('main');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  return main;
}

function focusAfterPin(_slug: string, leagueId: string): void {
  // One frame later: the scope stylesheet has hidden this block and shown the league's games by then.
  const run = () => afterPinTarget(leagueId)?.focus();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

export function FindYourTeam({ index }: FindYourTeamProps) {
  return (
    <section data-scope="none" aria-labelledby="find-your-team" className="sx-section sx-js-only lg:hidden" data-first="">
      <h2 id="find-your-team" className="sr-only">
        Find your team
      </h2>
      <TeamFinder index={index} mode="pin" compact placeholder="Find your team" onPin={focusAfterPin} />
    </section>
  );
}

export default FindYourTeam;
