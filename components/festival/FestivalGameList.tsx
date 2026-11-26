import Link from 'next/link';

import type { GameRowModel, SideModel } from './festival-model';

/**
 * Games under a time slot's heading (DESIGN §35 §6), on the site's game-row grid (`.sx-games`, `.sx-game-grid`;
 * one column on a phone, columns of 21rem from 44rem): the field and the state ("Final", "Live") in the status
 * slot (the slot heading carries the time), the two sides in the feed's order with their scores, the winner bold
 * and the loser grey, and a note line: division, pool or "Placement", game number, and "Tied — shoot-out" for a
 * level placement game, which names no winner.
 *
 * A side of a placement game still open prints its slot ("Pool R 1st") in the secondary grey, with the team that
 * holds that place now ("Now: …") when its pool is under way; once the pool is complete, the team itself.
 *
 * Each row carries its teams' slugs (`data-fest-game`) for the schedule's "Only my teams" filter. Team names link
 * to the team pages; there is no game page, so the row itself is not a link.
 */
export function FestivalGameList({ games, id }: { games: readonly GameRowModel[]; id?: string }) {
  return (
    <div className="sx-gamelist" id={id}>
      <ul className="sx-games">
        {games.map((g) => (
          <li key={g.key} className="sx-game" data-fest-game={g.teamSlugs.join(' ')}>
            <div className="sx-game-grid">
              <div className="sx-game-status">
                <span>{g.field}</span>
                {g.statusWords ? <small>{g.statusWords}</small> : null}
              </div>
              <Side side={g.sides[0]} at="away" />
              <Side side={g.sides[1]} at="home" />
              <div className="sx-game-note">
                {g.note}
                {g.bracketHref ? (
                  <Link href={g.bracketHref} prefetch={false} className="sx-link">
                    Bracket
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Side({ side, at }: { side: SideModel; at: 'away' | 'home' }) {
  const won = side.result === 'won' ? '' : undefined;
  const lost = side.result === 'lost' ? '' : undefined;
  const plays = side.state === 'team' || side.state === 'pool-complete';
  return (
    <>
      <div
        className="sx-game-team"
        data-side={at}
        data-won={won}
        data-lost={lost}
        data-undecided={plays ? undefined : ''}
        data-fest-team={plays ? side.team!.slug : undefined}
      >
        {plays ? (
          <>
            <Link href={side.team!.href} prefetch={false} className="sx-game-name">
              {side.team!.name}
            </Link>
            <span className="sx-pin-note" hidden>
              Following
            </span>
          </>
        ) : (
          <span className="sx-game-name">
            {side.slot}
            {side.state === 'provisional' ? <span className="text-ink-3"> · Now: {side.team!.name}</span> : null}
          </span>
        )}
      </div>
      {side.score !== undefined ? (
        <span className="sx-num sx-game-score" data-side={at} data-won={won} data-lost={lost}>
          {side.score}
        </span>
      ) : null}
    </>
  );
}

export default FestivalGameList;
