import { getTeamBySlug } from '../../lib/data';
import type {
  HistoryBracketDivision,
  HistoryBracketGame,
  HistoryBracketRound,
  HistoryBracketSide,
} from '../../lib/history';
import MissingValue from '../ui/MissingValue';
import TeamMonogram from '../ui/TeamMonogram';

import { gameNote, gameSentence, gameSentenceTail, roundByes, roundDate, sideName } from './bracket-view';

/**
 * One division of a 2025 section bracket on /history/2025-26 (DESIGN §3.9), drawn the way the live
 * bracket is (components/playoffs/PlayoffBracket.tsx, DESIGN §3.8) but from the archive file, which
 * has no game pages to link: every game is final and none of them is in the snapshot.
 *
 * One markup for both breakpoints. Below md the rounds stack, each a heading over its cards (two
 * across from sm), never a sideways-scrolling tree. From md the rounds are columns of a grid, cards
 * spread with `justify-around` so each pair points at the game it feeds, with the same 1px rail and
 * stubs as the live bracket. The winner's line is 600 weight with a 2px ink rule on its left, never
 * colour alone. Each card is one sentence for a screen reader ("Los Gatos beat Saint Francis 3-0.");
 * the two drawn lines are hidden from it.
 */
export interface HistoryBracketProps {
  division: HistoryBracketDivision;
  /** Names the list for a screen reader: "CCS Division 1 bracket, 2025". */
  label: string;
}

function Line({ side, goals, won }: { side: HistoryBracketSide; goals: number | null; won: boolean }) {
  const team = getTeamBySlug(side.slug);
  const weight = won ? 'font-semibold text-ink' : 'font-normal text-ink-2';
  return (
    <span
      className="flex items-center gap-2 py-1 pr-3 pl-2"
      style={won ? { boxShadow: 'inset 2px 0 0 var(--sx-text)' } : undefined}
    >
      <span className="sx-num w-5 shrink-0 text-right text-meta text-ink-3">{side.seed}</span>
      {team ? <TeamMonogram team={team} size={20} /> : <span className="inline-block w-5 shrink-0" />}
      {/* The registry's short name, as the live bracket draws it ("RBV", "San Dieguito"): five round
          columns leave a line little room. The screen-reader sentence keeps the full name. */}
      <span className={`min-w-0 flex-1 truncate text-meta ${weight}`}>{team?.shortName ?? sideName(side)}</span>
      <span className={`sx-num shrink-0 text-meta ${weight}`}>
        {goals === null ? <MissingValue words="score not posted" /> : goals}
      </span>
    </span>
  );
}

function Card({ game, round }: { game: HistoryBracketGame; round: HistoryBracketRound }) {
  const note = gameNote(game, round);
  return (
    <div className="sx-card min-w-0 flex-1 py-1">
      <p className="sr-only">
        {gameSentence(game)}
        {gameSentenceTail(game, round)}
      </p>
      <div aria-hidden="true">
        <Line side={game.top} goals={game.score?.[0] ?? null} won={game.winner === 'top'} />
        <Line side={game.bottom} goals={game.score?.[1] ?? null} won={game.winner === 'bottom'} />
        {note ? <span className="block px-2 pt-0.5 pb-1 text-micro text-ink-3">{note}</span> : null}
      </div>
    </div>
  );
}

export function HistoryBracket({ division, label }: HistoryBracketProps) {
  const { rounds } = division;
  return (
    <ol
      aria-label={label}
      className="m-0 grid list-none gap-6 p-0 md:gap-0 md:[grid-template-columns:var(--sx-rounds)]"
      style={{ '--sx-rounds': `repeat(${rounds.length}, minmax(0, 1fr))` } as React.CSSProperties}
    >
      {rounds.map((round, roundIndex) => {
        const byes = roundByes(division, roundIndex);
        return (
          <li key={round.name} className="flex min-w-0 flex-col">
            <h4 className="m-0 mb-3 text-meta font-semibold text-ink md:pl-4">
              {round.name} <span className="font-normal text-ink-2">&middot; {roundDate(round)}</span>
            </h4>
            <ol
              className={[
                'm-0 grid flex-1 list-none gap-3 p-0 sm:grid-cols-2 md:flex md:flex-col md:justify-around md:gap-4',
                roundIndex > 0 ? 'md:border-l md:border-divider' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {round.games.map((game) => (
                <li key={`${game.top.slug}-${game.bottom.slug}`} className="flex min-w-0 items-center">
                  {roundIndex > 0 ? (
                    <span className="hidden w-4 shrink-0 border-t border-divider md:block" aria-hidden="true" />
                  ) : null}
                  <Card game={game} round={round} />
                  {roundIndex < rounds.length - 1 ? (
                    <span className="hidden w-4 shrink-0 border-t border-divider md:block" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
            {byes.length > 0 ? (
              <p className="m-0 mt-2 text-micro text-ink-3 md:pr-4 md:pl-1">
                Byes: {byes.map((s) => `${sideName(s)} (${s.seed})`).join(', ')}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default HistoryBracket;
