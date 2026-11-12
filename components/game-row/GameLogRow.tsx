import Link from 'next/link';

import { EM_DASH, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Game } from '../../lib/types';

import ResultChip from '../ui/ResultChip';
import { ScoreGlyph } from '../ui/ScoreGlyph';
import { SourceMark, postseasonChipText, statusCase } from '../ui/StatusLabel';
import Tag from '../ui/Tag';
import { WIDE_SCORES } from '../words/score-words';
import { clockText, describeGame, gameKind, perspectiveIsHome, statusLabelIsTime } from '../ui/describe-game';

import type { GameBaseProps } from './props';

/** `GameLogRowBody` only: the row IS the page being viewed (the season series on /game/[id]). */
export type GameLogRowProps = GameBaseProps & {
  isThisGame?: boolean;
  /**
   * One more tag after the status and its chips, with its sentence for a screen reader: a JV row listed from
   * the league's own schedule carries `SCHED` (components/jv/TeamJvGames.tsx).
   */
  extraTag?: { text: string; label: string };
};

/**
 * A team-perspective log line (DESIGN §33): `Sep 24 [L] 0–7 vs Saint Francis`, and a note only
 * when there is something to add. ONE row for a team page's log AND the /game/[id] season series
 * ("These two this season"), so the two lists cannot drift apart. The series renders its own
 * `<Link>` (or, for the game being viewed, an `aria-current` band) around `GameLogRowBody` with
 * `gameLogRowClass`; a team log uses `GameLogRow`, which is exactly that link.
 *
 * ONE `sr-only` sentence, led by the date, and everything visual behind `aria-hidden`: the link's
 * accessible name is the sentence, never "…final. Loss FINAL".
 *
 * `.sx-logrow` (app/globals.css) is the grid: date, result mark, score, opponent, note, on one
 * 44px line with a hairline below. This is the one place a W/L/T mark appears (hueless: solid,
 * hollow, grey). The score is mine, a dash, theirs, with MY score right-aligned against the dash so
 * the dashes stack down the log. The opponent is the short name and never gives way to the note:
 * when the row is narrow (a phone, or large text) the note drops to a second line under it.
 *
 * The note says only what the row has not said: the clock of a game still to play, `Postponed`,
 * `Score not reported`, the decider (`OT`), the †, `Non-league` or the postseason round, `this
 * game`, a caller's extra tag. A final league game has none: "FINAL SCVAL" on every line was noise.
 */
/** The log row's class, shared with the team page's JV list (components/jv/TeamJvGames.tsx). The name is historical. */
export const GAME_LOG_ROW_GRID = WIDE_SCORES ? 'sx-logrow sx-logrow-wide' : 'sx-logrow';

export function gameLogRowClass(game: Game, className?: string): string {
  // The non-league rule is `display.isNonLeague` (SPEC §10.4): neither counted for a league table
  // nor postseason. A postseason game is neither league nor NL, so it takes no rule.
  const nonLeague = gameKind(game) === 'non-league';
  return [
    GAME_LOG_ROW_GRID,
    nonLeague ? 'sx-nonleague' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The row's contents, for a host that supplies its own wrapper. `isThisGame` (the season series,
 * on the game's own page) adds a "this game" tag and leads the sentence with "This game."; the
 * host then renders a non-link `aria-current="page"` band instead of a link to itself.
 */
export function GameLogRowBody({
  game,
  perspective,
  showChips = true,
  isThisGame = false,
  extraTag,
}: GameLogRowProps) {
  const display = describeGame(game, perspective);
  const mineIsHome = perspectiveIsHome(game, perspective) ?? true;
  const opponent = mineIsHome ? display.away : display.home;
  const mine = mineIsHome ? display.home : display.away;
  const day = shortDate(game.dateLocal).slice(4);
  const final = display.kind === 'final';
  // The kind, only when it is not a league game: `Non-league`, or the postseason round.
  const kind = showChips ? (display.postseasonTag ?? (display.isNonLeague ? 'Non-league' : null)) : null;
  return (
    <>
      <span className="sr-only">
        {isThisGame ? 'This game. ' : ''}
        {day}: {display.sentence}
        {extraTag ? ` ${extraTag.label}` : ''}
      </span>
      <span className="sx-num text-cell text-ink-2" aria-hidden="true">
        {day}
      </span>
      <span className="inline-flex" aria-hidden="true">
        <ResultChip
          kind={display.perspectiveOutcome ?? (display.showScores ? 'pending' : 'none')}
          size={20}
        />
      </span>
      {/* mine · dash · theirs. Mine takes the slack and sits right against the dash. An unreported
          game keeps ScoreGlyph's two muted en dashes (never 0–0); a game with no score yet is one
          em dash in the middle. */}
      <span className="sx-num grid grid-cols-[minmax(0,1fr)_auto_minmax(1.4em,auto)] whitespace-nowrap" aria-hidden="true">
        {display.showScores ? (
          <>
            <ScoreGlyph side={mine} size="meta" className="justify-self-end" />
            <span className="px-0.5 text-center text-ink-3">{'–'}</span>
            <ScoreGlyph side={opponent} size="meta" className="justify-self-start" />
          </>
        ) : (
          <span className="col-start-2 text-center text-ink-3">{EM_DASH}</span>
        )}
      </span>
      {/* The short name, as every game row prints it; the sr-only sentence keeps the full name. */}
      <span className="min-w-0 break-words text-ink" aria-hidden="true">
        {display.versus ?? 'vs'} {opponent.shortName}
      </span>
      <span className="sx-logrow-note" aria-hidden="true">
        {isThisGame ? <Tag>this game</Tag> : null}
        {final ? null : (
          <span className={display.strikeTime ? 'line-through' : undefined}>
            {statusLabelIsTime(game, display.statusLabel) ? clockText(game, 'TBA') : statusCase(display.statusLabel)}
          </span>
        )}
        {display.deciderTag ? <Tag>{display.deciderTag}</Tag> : null}
        <SourceMark display={display} />
        {kind ? <span>{kind === display.postseasonTag ? postseasonChipText(kind) : kind}</span> : null}
        {extraTag ? <Tag>{extraTag.text}</Tag> : null}
      </span>
    </>
  );
}

/** A team page's game-log row: the whole row is one link to the game page. */
export function GameLogRow({ game, className, ...rest }: GameBaseProps) {
  return (
    <Link
      href={gameHref(game.contestId)}
      prefetch={false}
      className={`sx-tap no-underline ${gameLogRowClass(game, className)}`}
    >
      <GameLogRowBody game={game} {...rest} />
    </Link>
  );
}
