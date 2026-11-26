import Link from 'next/link';

import type { BracketColumnModel, PlacementGameModel, SideModel } from './festival-model';

/**
 * A division's Saturday placement games (DESIGN §35 §6), in TourneyMachine's own layout: one column per group of
 * crossovers ("Pool R and S crossovers"), its games top to bottom. Every game is sourced from pool places, none
 * from another game, so there are no connectors and no rounds: components/playoffs/Bracket.tsx (a tree with
 * round tabs) does not fit, and its cell face (`.sx-tie`) is reused instead. Columns sit side by side from
 * 1024px and stack on a phone.
 *
 * A box: the game number, the time ET and the field over two lines. Each line is the slot ("Pool R 1st") over
 * who fills it: the team TourneyMachine named; else, when the source pool is complete and one team is alone at
 * that place, that team "from the final pool table"; else, while the pool is under way or the place is tied (a full
 * tie is listed alphabetically: DESIGN §35.5), "Now: <team>" in the secondary grey; else the slot alone. A final's winner is bold; a level final reads "Tied — shoot-out" and names no winner.
 */
export function PlacementBracket({ columns, label }: { columns: readonly BracketColumnModel[]; label: string }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2" role="group" aria-label={label}>
      {columns.map((column) => (
        <section key={column.key} className="min-w-0">
          <h3 className="m-0 mb-2 text-lead text-ink">{column.title}</h3>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {column.games.map((game) => (
              <li key={game.key}>
                <PlacementBox game={game} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function PlacementBox({ game }: { game: PlacementGameModel }) {
  return (
    <div id={game.anchor} className="sx-tie sx-target" data-state={game.status === 'scheduled' ? undefined : game.status}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 px-2 text-cell text-ink-2">
        <span className="font-semibold text-ink">{game.number}</span>
        <span>{game.when}</span>
        <span>{game.field}</span>
      </div>
      <Line side={game.sides[0]} />
      <Line side={game.sides[1]} />
      {game.note ? <div className="sx-tie-note font-semibold text-ink">{game.note}</div> : null}
    </div>
  );
}

function Line({ side }: { side: SideModel }) {
  const plays = side.state === 'team' || side.state === 'pool-complete';
  return (
    <div
      className="sx-tie-line border-t border-hairline"
      data-won={side.result === 'won' ? '' : undefined}
      data-lost={side.result === 'lost' ? '' : undefined}
    >
      <span className="flex min-w-0 flex-col py-1 leading-5">
        <span className="text-cell font-normal text-ink-2">{side.slot}</span>
        {plays ? (
          <span data-fest-team={side.team!.slug} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <Link href={side.team!.href} prefetch={false} className="sx-link">
              {side.team!.name}
            </Link>
            <span className="sx-pin-note" hidden>
              Following
            </span>
          </span>
        ) : side.state === 'provisional' ? (
          <span className="text-cell font-normal text-ink-2">Now: {side.team!.name}</span>
        ) : (
          <span className="text-cell font-normal text-ink-3">To be decided</span>
        )}
        {side.state === 'pool-complete' ? (
          <span className="text-micro font-normal text-ink-2">From the final pool table</span>
        ) : null}
      </span>
      {side.score !== undefined ? <span className="sx-num sx-tie-score">{side.score}</span> : null}
    </div>
  );
}

export default PlacementBracket;
