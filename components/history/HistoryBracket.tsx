import Link from 'next/link';

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
 * across from sm), never a sideways-scrolling tree. From md (lg for four or five rounds, COLUMNS
 * below) the rounds are columns of a grid, cards
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
  const lineClass = 'flex items-center gap-2 py-1 pr-3 pl-2';
  const style = won ? { boxShadow: 'inset 2px 0 0 var(--sx-text)' } : undefined;
  const body = (
    <>
      <span className="sx-num w-5 shrink-0 text-right text-meta text-ink-3">{side.seed}</span>
      {team ? <TeamMonogram team={team} size={20} /> : <span className="inline-block w-5 shrink-0" />}
      {/* The registry's short name, as the live bracket draws it ("RBV", "San Dieguito"): five round
          columns leave a line little room. The screen-reader sentence keeps the full name. */}
      <span className={`min-w-0 flex-1 truncate text-meta ${weight}`}>{team?.shortName ?? sideName(side)}</span>
      <span className={`sx-num shrink-0 text-meta ${weight}`}>
        {goals === null ? <MissingValue words="score not posted" /> : goals}
      </span>
    </>
  );
  // The archive has no game pages, so a registry side's line is a tap target to its team page, as
  // the same school's row is in the standings table and awards on this page. The card's lines are
  // aria-hidden (its sr-only sentence speaks for it), so the link is a pointer-only duplicate kept
  // out of the tab order; the keyboard route is the standings table's rows.
  return team ? (
    <Link
      href={`/teams/${team.slug}`}
      prefetch={false}
      tabIndex={-1}
      className={`${lineClass} sx-tap no-underline`}
      style={style}
    >
      {body}
    </Link>
  ) : (
    <span className={lineClass} style={style}>
      {body}
    </span>
  );
}

/**
 * `noted`: some game of this bracket has a note, so every card keeps a one-line note row, empty or
 * not. A card was 64px with no note, 86 with one and 102 when it wrapped to two lines, and in a
 * column spread with `justify-around` uneven cards put each pair's midpoint off the card it feeds
 * by up to 11px. The row is cut to one line with an ellipsis; the whole note is in the sentence
 * above it (gameSentence says how the game was decided and that no score was posted,
 * gameSentenceTail a moved date and the site), and in the `title` for a pointer.
 */
function Card({ game, round, noted }: { game: HistoryBracketGame; round: HistoryBracketRound; noted: boolean }) {
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
        {noted ? (
          <span className="block h-[1.375rem] truncate px-2 pt-0.5 text-micro text-ink-3" title={note ?? undefined}>
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The round-columns layout, from md, or from lg for a bracket of four or five rounds: at 768px
 * five columns left a card 111px and a name 19px ("B…"), four left names 55px. Below that the
 * rounds stack, as on a phone. Each class is spelled out for Tailwind's scanner.
 *
 * The bracket is a grid of three rows, headings, games and byes, and each round a subgrid of them
 * (`grid-rows-subgrid row-span-3`): a round heading that wraps ("Quarterfinals · Nov 8" at 768px)
 * or a Byes line under one column takes the same height in every column, where before it lowered
 * or shortened only its own, so card tops differed 5–35px between rounds and the stubs missed the
 * midpoints between the two games feeding each card.
 */
const COLUMNS = {
  md: {
    list: 'md:gap-0 md:[grid-template-columns:var(--sx-rounds)] md:grid-rows-[auto_1fr_auto]',
    round: 'md:row-span-3 md:grid md:grid-cols-[minmax(0,1fr)] md:grid-rows-subgrid',
    heading: 'md:pl-4',
    games: 'md:flex md:flex-col md:justify-around md:gap-4',
    rail: 'md:border-l md:border-divider',
    stub: 'md:block',
    byes: 'md:pr-4 md:pl-1',
  },
  lg: {
    list: 'lg:gap-0 lg:[grid-template-columns:var(--sx-rounds)] lg:grid-rows-[auto_1fr_auto]',
    round: 'lg:row-span-3 lg:grid lg:grid-cols-[minmax(0,1fr)] lg:grid-rows-subgrid',
    heading: 'lg:pl-4',
    games: 'lg:flex lg:flex-col lg:justify-around lg:gap-4',
    rail: 'lg:border-l lg:border-divider',
    stub: 'lg:block',
    byes: 'lg:pr-4 lg:pl-1',
  },
} as const;

const cx = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' ');

export function HistoryBracket({ division, label }: HistoryBracketProps) {
  const { rounds } = division;
  const at = COLUMNS[rounds.length >= 4 ? 'lg' : 'md'];
  const noted = rounds.some((round) => round.games.some((game) => gameNote(game, round) !== null));
  return (
    <ol
      aria-label={label}
      className={cx('m-0 grid list-none gap-6 p-0', at.list)}
      style={{ '--sx-rounds': `repeat(${rounds.length}, minmax(0, 1fr))` } as React.CSSProperties}
    >
      {rounds.map((round, roundIndex) => {
        const byes = roundByes(division, roundIndex);
        return (
          <li key={round.name} className={cx('flex min-w-0 flex-col', at.round)}>
            <h4 className={cx('m-0 mb-3 text-meta font-semibold text-ink', roundIndex > 0 && at.heading)}>
              {round.name} <span className="font-normal text-ink-2">&middot; {roundDate(round)}</span>
            </h4>
            <ol
              className={cx(
                'm-0 grid flex-1 list-none gap-3 p-0 sm:grid-cols-2',
                at.games,
                roundIndex > 0 && at.rail,
              )}
            >
              {round.games.map((game) => (
                <li key={`${game.top.slug}-${game.bottom.slug}`} className="flex min-w-0 items-center">
                  {roundIndex > 0 ? (
                    <span className={cx('hidden w-4 shrink-0 border-t border-divider', at.stub)} aria-hidden="true" />
                  ) : null}
                  <Card game={game} round={round} noted={noted} />
                  {roundIndex < rounds.length - 1 ? (
                    <span className={cx('hidden w-4 shrink-0 border-t border-divider', at.stub)} aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
            {byes.length > 0 ? (
              <p className={cx('m-0 mt-2 text-micro text-ink-3', at.byes)}>
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
