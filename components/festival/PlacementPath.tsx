import Link from 'next/link';

import type { PlacementPathModel, SideModel } from './festival-model';

/**
 * Where a team's final pool place sends it on Saturday (DESIGN §35 §6): "If 2nd in Pool K: plays Pool L 2nd ·
 * Sat 9:00 AM ET · Field 3", one line per place of its pool that feeds a placement game. The team's place now is
 * marked in words ("Now 2nd") and weight, never by colour alone. Once the pool is complete with the team alone at
 * its place, or TourneyMachine names the team in a game, that game is the one it plays ("Plays …") and the other
 * places drop away. A team level with a neighbour on every figure the feed carries is "tied for 1st" and every
 * place of the tie stays open: TourneyMachine lists such teams alphabetically, and the head-to-head result or
 * shoot-out that breaks the tie (regs D.2) is not in the feed (DESIGN §35.5).
 */
export function PlacementPath({ path, teamName }: { path: PlacementPathModel; teamName: string }) {
  if (path.entries.length === 0) {
    return <p className="sx-empty">TourneyMachine lists no placement game for {path.poolName}: its pool games are the whole schedule.</p>;
  }
  const settled = path.entries.flatMap((e) => e.games.filter((g) => g.settled).map((g) => ({ entry: e, game: g })));
  if (settled.length > 0) {
    return (
      <ul className="m-0 list-none p-0">
        {settled.map(({ entry, game }) => (
          <li key={game.number} className="border-t border-hairline py-2 first:border-t-0">
            <p className="m-0 text-body text-ink">
              <span className="font-semibold">
                {path.poolComplete ? `Finished ${entry.placeWord} in ${path.poolName}` : `${entry.placeWord} in ${path.poolName}`}:
              </span>{' '}
              plays <Opponent side={game.opponent} />
            </p>
            <p className="m-0 text-cell text-ink-2">
              {game.when} · {game.field} ·{' '}
              <Link href={game.href} prefetch={false} className="sx-link">
                {game.number} in the bracket
              </Link>
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <p className="sx-note">
        {path.place && path.poolComplete && path.place.tied
          ? `${teamName} finished ${path.place.words} in ${path.poolName}; the head-to-head result or a shoot-out decides which of these it plays.`
          : path.place
            ? `${teamName} is ${path.place.words} in ${path.poolName} now; the pool’s final order decides which of these it plays.`
            : `${path.poolName}’s final order decides which of these ${teamName} plays.`}
      </p>
      <ul className="mt-2 mb-0 list-none p-0">
        {path.entries.map((entry) => (
          <li key={entry.place} className="border-t border-hairline py-2 first:border-t-0" data-current={entry.current ? '' : undefined}>
            {entry.games.map((game) => (
              <div key={game.number}>
                <p className={['m-0 text-body text-ink', entry.current ? 'font-semibold' : null].filter(Boolean).join(' ')}>
                  {entry.nowWords ? <span className="text-accent-ink">{entry.nowWords} </span> : null}
                  If {entry.placeWord} in {path.poolName}: plays <Opponent side={game.opponent} />
                </p>
                <p className="m-0 text-cell text-ink-2">
                  {game.when} · {game.field} ·{' '}
                  <Link href={game.href} prefetch={false} className="sx-link">
                    {game.number} in the bracket
                  </Link>
                </p>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

function Opponent({ side }: { side: SideModel }) {
  if (side.state === 'team') return <>{side.team!.name}</>;
  if (side.state === 'pool-complete') return <>{`${side.slot} (${side.team!.name})`}</>;
  if (side.state === 'provisional') return <>{`${side.slot} (now ${side.team!.name})`}</>;
  return <>{side.slot}</>;
}

export default PlacementPath;
