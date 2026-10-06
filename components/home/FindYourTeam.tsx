'use client';

import TeamFinder from '../search/TeamFinder';
import SectionHeader from '../ui/SectionHeader';
import type { SearchIndex } from '../../lib/search';

import { focusUnpin } from './MyTeamCard';

/**
 * The first-visit view (SPEC §10.1): shown when no league is remembered (`data-scope="none"`), and
 * never an SCVAL default. A pin-mode finder over every team (102, both regions: DESIGN-socal §2.4 keeps
 * ONE finder outside the region blocks, so a family finds its school whichever region is shown), then
 * the league cards (server-rendered by the page and passed in as `children`, so they stay out of the
 * client bundle): one `<h3>` and one `<ul data-region-scope>` grid per region, which the scope
 * stylesheet shows for the reader's region. The cards run two-up from 390px; the page gives the last
 * card of a region's odd count both columns (`min-[390px]:col-span-2`), so NorCal's five read 2 + 2 + 1
 * full-width, never an orphan half-card, and SoCal's four read 2 + 2.
 *
 * Pinning a team from here also remembers its league (`usePinnedTeam().pin`), so this whole block
 * hides and the My-team slot appears; focus moves to the pinned card's Unpin button
 * (`#my-team-unpin`) one frame later, once the card has rendered, so the keyboard is never dropped
 * on `<body>`.
 *
 * Without JavaScript the finder is hidden (`sx-js-only` inside TeamFinder) and the cards' plain
 * standings links are the page.
 */
export interface FindYourTeamProps {
  index: SearchIndex;
  /** Each region's heading and its grid of league cards (`<LeagueCard>` items), from the page. */
  children: React.ReactNode;
  className?: string;
}

export function FindYourTeam({ index, children, className }: FindYourTeamProps) {
  return (
    <section data-scope="none" aria-labelledby="find-your-team" className={className}>
      <SectionHeader id="find-your-team" kicker="Find your team" />
      <TeamFinder index={index} mode="pin" onPin={focusUnpin} />
      {children}
    </section>
  );
}

export default FindYourTeam;
