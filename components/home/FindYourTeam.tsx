'use client';

import TeamFinder from '../search/TeamFinder';
import SectionHeader from '../ui/SectionHeader';
import type { SearchIndex } from '../../lib/search';

/**
 * The first-visit view (SPEC §10.1): shown when no league is remembered (`data-scope="none"`), and
 * never an SCVAL default. A pin-mode finder over all 43 teams, then the four league cards
 * (server-rendered by the page and passed in as `children`, so they stay out of the client bundle).
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

export const UNPIN_ID = 'my-team-unpin';

/** Focus the pinned card's Unpin button once it has rendered. */
export function focusUnpin(): void {
  const run = () => document.getElementById(UNPIN_ID)?.focus();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

export function FindYourTeam({ index, children, className }: FindYourTeamProps) {
  return (
    <section data-scope="none" aria-labelledby="find-your-team" className={className}>
      <SectionHeader id="find-your-team" kicker="Find your team" />
      <TeamFinder index={index} mode="pin" label="School, city or mascot" onPin={focusUnpin} />
      <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-3 p-0 min-[390px]:grid-cols-2 md:gap-4">
        {children}
      </ul>
    </section>
  );
}

export default FindYourTeam;
