import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import type { Game } from '@/lib/model/game';
import { gameHref } from '@/lib/shared/game-id';
import type { ExternalGameLink } from '@/views/shared/game-links';

/**
 * The pills in an expanded panel: real links only, never a dead affordance. `links` is the game's
 * off-site list (views/shared/game-links.ts `gameExternalLinks`), after the way on to the game page.
 */
export function GameLinks({ game, links }: { game: Game; links: readonly ExternalGameLink[] }) {
  return (
    <p className="m-0 flex flex-wrap gap-2">
      {/* The way on to the whole contest comes first, as the one accent pill. */}
      <Link
        href={gameHref(game.contestId)}
        prefetch={false}
        className="sx-pill sx-pill-accent min-h-11"
      >
        Full game page
      </Link>
      {/* The open panel is surface-2, the pill's own fill, so these pills take the card
          surface instead or they would read as bare text links. A press steps them to surface-3,
          the same as a hover, so a tap on a phone (no hover) still answers. */}
      {links.map((l) => (
        <ExternalLink
          key={l.href}
          href={l.href}
          className="sx-pill sx-pill-card"
        >
          {l.label}
        </ExternalLink>
      ))}
    </p>
  );
}

export default GameLinks;
