import Link from 'next/link';

import { gameHref } from '../../lib/game-id';

import { describeGame, type GameDisplay, type SideView } from '../ui/describe-game';

import type { GameBaseProps, GameViewOptions } from './props';
import {
  GameStatus,
  SideCrest,
  SideNotes,
  chipsSentence,
  gameMetaText,
  recordsApply,
  recordsSentence,
  wonAttr,
} from './summary';

/**
 * The ONE game row (DESIGN §33), in components/game-row/ with its pieces in summary.tsx. `GameCard`
 * and `GameLine` are aliases of it; `GameLogRow` is the team-perspective log line.
 *
 * One DOM at every width, no `<details>`, no card twin. `.sx-game` is its own query container and
 * `.sx-game-grid` inside it is the layout (app/globals.css): stacked on two lines (status on the
 * left, away over home, scores on the right, the meta on a third line when there is one) until the
 * ROW ITSELF is 40rem wide, then one line centred on the score. So it is one line in a full-width
 * or 720px column and stacked on a phone, in the rail, in a narrow main column and in a grid.
 *
 * The whole row is ONE link to the game page (`gameHref(game.contestId)`, SPEC §10.0): the away
 * name carries it and its `::after` covers the row. Its accessible name is the game's sentence
 * (`describeGame().sentence`, the game's kind and the records after it); everything drawn is
 * aria-hidden. Team names are not links inside a row. Venue, stream, tickets and the box score are
 * the game page's.
 *
 * Winner = weight: `data-won` makes the name 700 and the score 800. No W/L marks here (a
 * team-perspective row is GameLogRow). A score cell's class starts `sx-num ` and holds
 * `text-score`, and its glyph is `describeGame`'s: a real `0`, or an en dash for a score nobody
 * reported, never a coerced zero (tests/ui/rendered-never-00.test.ts reads exactly these cells).
 * A game with nothing on the scoreboard has two empty cells and `at` (or `vs`) between the names.
 *
 * A side this site follows carries `data-team-slug` on a `.sx-pinnable` span, so the pinned team's
 * NAME takes the highlighter. A side it does not follow gets a ghost monogram titled
 * NON_MEMBER_NOTE (DESIGN §8).
 *
 * SERVER-ONLY: `showRecords` reads the standings through lib/data, and summary.tsx reads lib/teams.
 */
export type GameRowProps = GameBaseProps &
  GameViewOptions & {
    /** The row's one meta item; overrides the computed one (the seed line, the round, `Non-league`). */
    meta?: React.ReactNode;
    /** false drops the meta cell. Default true. */
    showMeta?: boolean;
    /**
     * The row's element. `'li'` directly inside a `<ul className="sx-games">` (GameList does this);
     * the default `'div'` anywhere else, e.g. inside a caller's own `<li>`.
     */
    as?: 'li' | 'div';
    /** Extra attributes for the row element (GameList's `data-*` filter attributes). They win over the row's own. */
    attrs?: Readonly<Record<`data-${string}`, string | undefined>>;
  };

/** `final` (a result, reported or not), `upcoming`, or `off` (postponed, cancelled). */
function rowState(display: GameDisplay): 'final' | 'upcoming' | 'off' {
  if (display.kind === 'scheduled') return 'upcoming';
  return display.kind === 'postponed' || display.kind === 'cancelled' ? 'off' : 'final';
}

function Score({ side, which, show }: { side: SideView; which: 'away' | 'home'; show: boolean }) {
  return (
    // `className` LAST: tests/ui/rendered-never-00.test.ts finds a score cell by `class="sx-num … text-score…"><span`.
    <span data-side={which} data-won={wonAttr(side)} aria-hidden="true" className="sx-num sx-game-score text-score">
      {show ? <span>{side.glyph}</span> : null}
    </span>
  );
}

export function GameRow({
  game,
  perspective,
  showDate = false,
  showChips = true,
  scopeLeague = null,
  showRecords = false,
  seeds,
  meta,
  showMeta = true,
  as: Row = 'div',
  attrs,
  className,
}: GameRowProps) {
  const display = describeGame(game, perspective);
  const withRecords = recordsApply(game, display, showRecords);
  const state = rowState(display);
  const metaText = gameMetaText(display, showChips, seeds);
  return (
    <Row
      className={['sx-game', className].filter(Boolean).join(' ')}
      data-state={state}
      data-off={state === 'off' ? '' : undefined}
      {...attrs}
    >
      <div className="sx-game-grid">
        <GameStatus game={game} display={display} showDate={showDate} />
        <span
          className="sx-game-team sx-pinnable"
          data-side="away"
          data-team-slug={display.away.slug ?? undefined}
          data-won={wonAttr(display.away)}
        >
          <SideCrest side={display.away} />
          <Link href={gameHref(game.contestId)} prefetch={false} className="sx-game-link sx-game-name">
            <span aria-hidden="true">{display.away.shortName}</span>
            <span className="sr-only">
              {display.sentence}
              {chipsSentence(display, showChips)}
              {withRecords ? recordsSentence(display) : ''}
            </span>
          </Link>
          <SideNotes side={display.away} showRecord={withRecords} scopeLeague={scopeLeague} />
        </span>
        <Score side={display.away} which="away" show={display.showScores} />
        <span className="sx-game-sep" aria-hidden="true">
          {display.showScores ? '–' : game.site === 'neutral' ? 'vs' : 'at'}
        </span>
        <Score side={display.home} which="home" show={display.showScores} />
        <span
          className="sx-game-team sx-pinnable"
          data-side="home"
          data-team-slug={display.home.slug ?? undefined}
          data-won={wonAttr(display.home)}
          aria-hidden="true"
        >
          <SideCrest side={display.home} />
          <span className="sx-game-name">{display.home.shortName}</span>
          <SideNotes side={display.home} showRecord={withRecords} scopeLeague={scopeLeague} />
        </span>
        {showMeta ? (
          // A caller's own meta is content the sentence does not carry, so it is not hidden.
          <span className="sx-game-meta" aria-hidden={meta === undefined ? 'true' : undefined}>
            {meta ?? metaText}
          </span>
        ) : null}
      </div>
    </Row>
  );
}

export default GameRow;
