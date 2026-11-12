import Link from 'next/link';

import { gameHref } from '../../lib/game-id';

import { describeGame, type SideView } from '../ui/describe-game';

import type { GameBaseProps, GameViewOptions } from './props';
import {
  GameStatus,
  SideCrest,
  chipsSentence,
  gameMetaText,
  lostAttr,
  rowState,
  shootoutNote,
  venueWords,
  wonAttr,
} from './summary';

/**
 * The ONE game row (DESIGN §33), in components/game-row/ with its pieces in summary.tsx.
 * `GameLogRow` is the team-perspective log line.
 *
 * One DOM, one shape, one size, in every list and every state. Three columns (`.sx-game-grid`,
 * app/globals.css):
 *
 *   status slot | away logo, name, seed, star | away score
 *               | home logo, name, seed, star | home score
 *               | note (a shootout, the competition, the venue, one link)
 *
 * - The STATUS SLOT is always rendered and always first: a start time, `Live`, `Final`,
 *   `Postponed` (summary.tsx `GameStatus`). "Final" is printed on every final.
 * - Away first, home second, always.
 * - Nothing but a score is ever in the score column, so the scores are one vertical line down a
 *   list whatever mix of states it holds. A game with no score (upcoming, postponed, cancelled,
 *   unreported) renders NO score cells: never a dash, never a coerced zero. A real 0-0 final
 *   renders two zeros (tests/ui/rendered-never-00.test.ts reads exactly these cells: the class
 *   starts `sx-num ` and holds `text-score`).
 * - Result = weight: the winner's name and score carry `data-won` (700), the loser's `data-lost`
 *   (grey). A tie, a live game and a game still to play carry neither. No W/L marks here.
 * - The NOTE is one line under the names: how a shootout was decided (`data-decider`), the
 *   competition when the list is not grouped by competition (`showChips`), where a game still to
 *   play is (`at Los Altos`), and one optional link (`noteLink`).
 *
 * Links: `.sx-game-link` is an empty link covering the row, named by the game's sentence
 * (`describeGame().sentence`). With a mouse the team names are links to the teams too, above it;
 * on touch the CSS turns them off, so the row is ONE target.
 *
 * A side this site follows carries `data-team-slug` on a `.sx-pinnable` span and a hidden
 * `.sx-pin-note`, so the reader's team gets the star. A side it does not follow gets a ghost
 * monogram titled NON_MEMBER_NOTE (DESIGN §8) and a name that is not a link.
 *
 * SERVER-ONLY: summary.tsx reads lib/teams and lib/data.
 */
export type GameRowProps = GameBaseProps &
  GameViewOptions & {
    /** The note's text; overrides the computed one (shootout, competition, venue). */
    meta?: React.ReactNode;
    /** false drops the note line. Default true. */
    showMeta?: boolean;
    /** One link at the end of the note ("Bracket"): a team page's next game. */
    noteLink?: { href: string; label: string };
    /**
     * The row's element. `'li'` directly inside a `<ul className="sx-games">` (GameList does this);
     * the default `'div'` anywhere else, e.g. inside a caller's own `<li>`.
     */
    as?: 'li' | 'div';
    /** Extra attributes for the row element (GameList's `data-*` filter attributes). They win over the row's own. */
    attrs?: Readonly<Record<`data-${string}`, string | undefined>>;
  };

function Team({
  side,
  which,
  seed,
  decided,
}: {
  side: SideView;
  which: 'away' | 'home';
  seed: number | null | undefined;
  decided: boolean;
}) {
  return (
    <span
      className="sx-game-team sx-pinnable"
      data-side={which}
      data-team-slug={side.slug ?? undefined}
      data-won={decided ? wonAttr(side) : undefined}
      data-lost={decided ? lostAttr(side) : undefined}
    >
      <SideCrest side={side} />
      {side.slug ? (
        <Link href={`/teams/${side.slug}`} prefetch={false} className="sx-game-name">
          {side.shortName}
        </Link>
      ) : (
        <span className="sx-game-name">{side.shortName}</span>
      )}
      {seed !== null && seed !== undefined ? <span className="sx-seed sx-num">#{seed}</span> : null}
      {side.slug ? (
        <span className="sx-pin-note" hidden>
          Your team
        </span>
      ) : null}
    </span>
  );
}

function Score({ side, which, decided }: { side: SideView; which: 'away' | 'home'; decided: boolean }) {
  return (
    // `className` LAST: tests/ui/rendered-never-00.test.ts finds a score cell by `class="sx-num … text-score…"><span`.
    <span
      data-side={which}
      data-won={decided ? wonAttr(side) : undefined}
      data-lost={decided ? lostAttr(side) : undefined}
      aria-hidden="true"
      className="sx-num sx-game-score text-score"
    >
      <span>{side.glyph}</span>
    </span>
  );
}

export function GameRow({
  game,
  perspective,
  showDate = false,
  showChips = true,
  seeds,
  meta,
  showMeta = true,
  noteLink,
  as: Row = 'div',
  attrs,
  className,
}: GameRowProps) {
  const display = describeGame(game, perspective);
  const state = rowState(game, display);
  // A score cell only for a score that exists: a final, or a live game with both numbers in.
  const scores = display.showScores && display.away.hasScore && display.home.hasScore;
  // Winner and loser are marked on a final only: a live lead is not a result.
  const decided = state === 'final';
  const decider = showMeta && meta === undefined && decided ? shootoutNote(game, display) : null;
  const noteParts =
    meta === undefined
      ? [decider, gameMetaText(display, showChips), venueWords(game, display)].filter(Boolean)
      : [];
  const hasNote = showMeta && (meta !== undefined || noteParts.length > 0 || noteLink !== undefined);
  return (
    <Row
      className={['sx-game', className].filter(Boolean).join(' ')}
      data-state={state}
      data-off={state === 'off' && display.kind !== 'unreported' ? '' : undefined}
      {...attrs}
    >
      <div className="sx-game-grid">
        <Link
          href={gameHref(game.contestId)}
          prefetch={false}
          className="sx-game-link"
          aria-label={`${display.sentence}${chipsSentence(display, showChips)}`}
        />
        <GameStatus game={game} display={display} showDate={showDate} />
        <Team side={display.away} which="away" seed={seeds?.away} decided={decided} />
        {scores ? <Score side={display.away} which="away" decided={decided} /> : null}
        <Team side={display.home} which="home" seed={seeds?.home} decided={decided} />
        {scores ? <Score side={display.home} which="home" decided={decided} /> : null}
        {hasNote ? (
          <span className="sx-game-note" data-decider={decider ? '' : undefined}>
            {meta ?? noteParts.join(', ')}
            {noteLink ? (
              <Link href={noteLink.href} prefetch={false} className="sx-link">
                {noteLink.label}
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </Row>
  );
}

export default GameRow;
