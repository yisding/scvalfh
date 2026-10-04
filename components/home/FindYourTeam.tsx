'use client';

import TeamFinder from '../search/TeamFinder';
import SectionHeader from '../ui/SectionHeader';
import type { SearchIndex } from '../../lib/search';

import { focusUnpin } from './MyTeamCard';

/**
 * The first-visit view (SPEC §10.1): shown when no league is remembered (`data-scope="none"`), and
 * never an SCVAL default. A pin-mode finder over every team (49), then the five league cards
 * (server-rendered by the page and passed in as `children`, so they stay out of the client bundle).
 * The cards run two-up from 390px; the page gives the last card of an odd count both columns
 * (`min-[390px]:col-span-2`), so five read 2 + 2 + 1 full-width, never an orphan half-card.
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
  /** The league cards (`<LeagueCard>` items). */
  children: React.ReactNode;
  className?: string;
}

export function FindYourTeam({ index, children, className }: FindYourTeamProps) {
  return (
    <section data-scope="none" aria-labelledby="find-your-team" className={className}>
      <SectionHeader id="find-your-team" kicker="Find your team" />
      <TeamFinder index={index} mode="pin" onPin={focusUnpin} />
      <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-3 p-0 min-[390px]:grid-cols-2 md:gap-4">
        {children}
      </ul>
    </section>
  );
}

export default FindYourTeam;
