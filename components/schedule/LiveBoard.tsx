import Link from 'next/link';

import { gameHref } from '../../lib/game-id';
import type { Game, RegionId } from '../../lib/types';
import { describeGame, type SideView } from '../ui/describe-game';
import TeamMonogram from '../ui/TeamMonogram';
import GhostMonogram from '../ui/GhostMonogram';
import { gameWord } from '../words/plural';

import { dayGroups } from './day-summary';

/**
 * The live board (DESIGN §33): while games are being played, they are on the navy band directly
 * under the header, at every width. One block per region (`data-region-scope`, so each region counts
 * its own); a region with no live game has no board. A game on the board is NOT in the list below
 * it: the page passes the same ids to both.
 *
 * Order is the caller's (start time); the reader's own team's game is moved first by CSS, since the
 * pin lives in the browser. The kicker names the competition in full because the board is not
 * grouped. Not filtered by the league tabs.
 */
export interface LiveBoardProps {
  region: RegionId;
  /** The region's live games, in start-time order. */
  games: readonly Game[];
  /** '' for the first region, '-socal' for the second: the heading's id is `live-heading<suffix>`. */
  idSuffix: string;
  /** `<LastUpdated variant="time" … />`. */
  stamp: React.ReactNode;
}

function Side({ side }: { side: SideView }) {
  return (
    <span className="sx-livegame-team sx-pinnable" data-team-slug={side.slug ?? undefined}>
      {side.slug ? (
        <TeamMonogram team={{ slug: side.slug, name: side.shortName }} size={32} />
      ) : (
        <GhostMonogram name={side.shortName} size={32} />
      )}
      {side.slug ? (
        <Link href={`/teams/${side.slug}`} prefetch={false} className="sx-game-name">
          {side.shortName}
        </Link>
      ) : (
        <span className="sx-game-name">{side.shortName}</span>
      )}
      {side.slug ? (
        <span className="sx-pin-note" hidden>
          Your team
        </span>
      ) : null}
    </span>
  );
}

export function LiveBoard({ region, games, idSuffix, stamp }: LiveBoardProps) {
  if (games.length === 0) return null;
  const headingId = `live-heading${idSuffix}`;
  return (
    <section className="sx-liveboard sx-print-hide" data-region-scope={region} aria-labelledby={headingId}>
      <div className="sx-liveboard-head">
        <h2 id={headingId}>
          <span className="sx-live">Live</span>
        </h2>
        <span>
          {games.length} {gameWord(games.length)}
        </span>
        {stamp}
      </div>
      <ul className="sx-livegames [&>li:has([data-pinned])]:order-first" data-many={games.length > 6 ? '' : undefined}>
        {games.map((game) => {
          const display = describeGame(game);
          const scores = display.away.hasScore && display.home.hasScore;
          return (
            <li key={game.contestId} className="sx-livegame">
              <Link href={gameHref(game.contestId)} prefetch={false} className="sx-game-link" aria-label={display.sentence} />
              {/* The competition, in the words its strip would carry in the list ("CCS Division 1", "SCVAL"). */}
              <span className="sx-livegame-kicker">{dayGroups([game])[0]?.name}</span>
              <Side side={display.away} />
              <span className="sx-num sx-livegame-score text-score">{scores ? display.away.glyph : ''}</span>
              <Side side={display.home} />
              <span className="sx-num sx-livegame-score text-score">{scores ? display.home.glyph : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default LiveBoard;
