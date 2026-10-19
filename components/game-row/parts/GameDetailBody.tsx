import type { Game } from '@/lib/model/game';
import { resultSentence } from '@/views/shared/describe-game';
import { gameExternalLinks } from '@/views/shared/game-links';

import { GameLinks } from './GameLinks';

/** GameRow's expanded panel: the recap, the venue, the venue note and the game's links. */
export function GameDetailBody({ game, showRecap }: { game: Game; showRecap: boolean }) {
  const recap = showRecap ? resultSentence(game) : null;
  return (
    // From 768px (the team page's Last card) the panel is indented to the team column — gutter +
    // the 80px lead column + its 8px gap — so it reads as belonging to the two names above it.
    // On a phone that indent cost 94px of a 358px row and stacked every pill on its own line, so
    // the panel starts at the gutter there.
    // A flex column, not `space-y-3`: v4's space-y is a zero-specificity child rule, so each
    // child's `m-0` cancelled it and the recap sat on the pill row.
    // `.sx-gamedetail` (app/globals.css) is that panel: surface-2 under a divider, 12px between
    // its lines, the md indent.
    <div className="sx-gamedetail">
      {recap ? <p className="m-0 text-ink-2">{recap}</p> : null}
      {game.venue.name ? <p className="m-0 text-ink-2">{game.venue.name}</p> : null}
      {/* `contest.location` is a NOTE field, not a venue field — live values include
          "Senior Night" and a coach's scoring note — so it is never labelled "Venue". */}
      {game.venue.text ? <p className="m-0 text-ink-3">Note: {game.venue.text}</p> : null}
      <GameLinks game={game} links={gameExternalLinks(game)} />
    </div>
  );
}

export default GameDetailBody;
