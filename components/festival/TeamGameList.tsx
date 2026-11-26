import Link from 'next/link';

import ResultChip from '../ui/ResultChip';
import type { SideModel, TeamGameModel } from './festival-model';

/**
 * One team's games, read from its side (DESIGN §35 §6), on the site's log-row grid (`.sx-logrow`): the venue's
 * weekday, the W/L/T chip, the score (own goals first) or the start time ET, the opponent, and the field. A
 * placement game is named as one ("Placement B3", with a link to its place in the bracket); one level at the
 * end says "Tied — shoot-out" (regs D.4: the feed has no shoot-out result, so neither side is called the
 * winner).
 *
 * `showTeam` (a club's merged schedule): the club's own team leads the opponent cell, with its division. Those rows
 * sit under day and slot headings that already say when (`slotted`), so they drop the weekday and the start time
 * and give the width to the two team names (`.sx-logrow[data-slotted]`): at 390px the repeated "Thu 10:00 AM"
 * left the names a 180px column, three or four lines a row. A slot with no result yet has no chip or score column
 * either (`data-slotted="plain"`); one result in the slot keeps both on every row, so its names stay aligned.
 */
export function TeamGameList({
  games,
  showTeam = false,
  slotted = false,
}: {
  games: readonly TeamGameModel[];
  showTeam?: boolean;
  slotted?: boolean;
}) {
  const plain = slotted && games.every((g) => g.score === null && !g.chip);
  return (
    <ul className="m-0 list-none p-0">
      {games.map((g) => (
        <li key={g.key} className="sx-logrow" data-slotted={plain ? 'plain' : slotted ? '' : undefined}>
          {slotted ? null : <span>{g.day}</span>}
          {plain ? null : <span>{g.chip ? <ResultChip kind={g.chip} size={20} /> : null}</span>}
          {plain ? null : g.score !== null ? (
            <span className="sx-num">{g.score}</span>
          ) : slotted ? (
            <span />
          ) : (
            <span className="sx-num" data-time="">
              {g.time}
            </span>
          )}
          <span className="sx-teamcell">
            <span>
              {showTeam ? (
                <>
                  <span data-fest-team={g.team.slug}>
                    <Link href={g.team.href} prefetch={false} className="sx-link">
                      {g.team.name}
                    </Link>
                    <span className="sx-pin-note" hidden>
                      Following
                    </span>
                  </span>
                  <span className="text-ink-2"> ({g.team.divisionShort})</span>{' '}
                </>
              ) : null}
              <span className="text-ink-2">v </span>
              <Opponent side={g.opponent} />
              {g.note ? (
                <span className="block text-cell text-ink-2">
                  {g.note}
                  {g.bracketHref ? (
                    <>
                      {' '}
                      <Link href={g.bracketHref} prefetch={false} className="sx-link">
                        Bracket
                      </Link>
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
          </span>
          <span className="sx-logrow-note">{g.field}</span>
        </li>
      ))}
    </ul>
  );
}

function Opponent({ side }: { side: SideModel }) {
  if (side.state === 'team' || side.state === 'pool-complete') {
    return (
      <span data-fest-team={side.team!.slug}>
        <Link href={side.team!.href} prefetch={false} className="sx-link">
          {side.team!.name}
        </Link>
        <span className="sx-pin-note" hidden>
          Following
        </span>
      </span>
    );
  }
  return (
    <span className="text-ink-2">
      {side.slot}
      {side.state === 'provisional' ? ` (now ${side.team!.name})` : null}
    </span>
  );
}

export default TeamGameList;
