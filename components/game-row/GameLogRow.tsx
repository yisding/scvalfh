import Link from 'next/link';

import { EM_DASH, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Game } from '../../lib/types';

import { getTeamBySlug } from '../../lib/teams';
import GhostMonogram from '../ui/GhostMonogram';
import ResultChip from '../ui/ResultChip';
import { SourceMark, postseasonChipText, statusCase } from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { WIDE_SCORES } from '../words/score-words';
import { clockText, describeGame, gameKind, perspectiveIsHome } from '../ui/describe-game';

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
 * A team-perspective log line (DESIGN §33): `Nov 7 [W] 2-0 vs Gilroy`, and a note only when there
 * is something to add. ONE row for a team page's schedule AND the /game/[id] season series, so the
 * two lists cannot drift apart. The series renders its own `<Link>` (or, for the game being
 * viewed, an `aria-current` band) around `GameLogRowBody` with `gameLogRowClass`; a team log uses
 * `GameLogRow`, which is exactly that link.
 *
 * `.sx-logrow` (app/globals.css) is the grid, with FIXED columns so the result column is one
 * vertical line down the schedule: the date, the W/L/T chip (an empty cell for a game still to
 * play), the score (mine first) or the start time (`data-time`), the opponent with its logo
 * (`vs` / `at`), and a note. Below 1024 the note drops under the opponent.
 *
 * ONE `sr-only` sentence, led by the date, inside the date cell (the cells are counted by the
 * stylesheet, so there is no extra first child), and everything visual behind `aria-hidden`: the
 * link's accessible name is the sentence.
 *
 * The note says only what the row has not said: `Postponed`, `Score not reported`, the decider
 * (`OT`), the †, `Non-league` or the postseason round, `this game`, a caller's extra tag.
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
  const upcoming = display.kind === 'scheduled';
  const team = opponent.slug ? getTeamBySlug(opponent.slug) : undefined;
  // The kind, only when it is not a league game: `Non-league`, or the postseason round.
  const kind = showChips ? (display.postseasonTag ?? (display.isNonLeague ? 'Non-league' : null)) : null;
  const notes = [
    isThisGame ? 'this game' : null,
    final || upcoming ? null : statusCase(display.statusLabel),
    display.deciderTag,
    kind ? (kind === display.postseasonTag ? postseasonChipText(kind) : kind) : null,
    extraTag?.text ?? null,
  ].filter(Boolean);
  return (
    <>
      <span className="sx-num">
        <span className="sr-only">
          {isThisGame ? 'This game. ' : ''}
          {day}: {display.sentence}
          {extraTag ? ` ${extraTag.label}` : ''}
        </span>
        <span aria-hidden="true">{day}</span>
      </span>
      {/* The chip column is always there, so the scores line up; a game still to play leaves it empty. */}
      <span aria-hidden="true">
        {display.perspectiveOutcome || display.kind === 'unreported' ? (
          <ResultChip kind={display.perspectiveOutcome ?? 'pending'} size={20} />
        ) : null}
      </span>
      {/* Mine first. A start time takes the same column; a score nobody reported is a dash, never 0-0. */}
      {final ? (
        <span className="sx-num" aria-hidden="true">
          {mine.glyph}-{opponent.glyph}
        </span>
      ) : upcoming ? (
        <span className="sx-num" data-time="" aria-hidden="true">
          {clockText(game, 'TBA')}
        </span>
      ) : (
        <span className="sx-num text-ink-3" aria-hidden="true">
          {display.kind === 'unreported' ? EM_DASH : ''}
        </span>
      )}
      {/* The short name, as every game row prints it; the sr-only sentence keeps the full name. */}
      <span className="sx-teamcell" aria-hidden="true">
        {team ? <TeamMonogram team={team} size={24} /> : <GhostMonogram name={opponent.name} size={24} />}
        <span>
          {display.versus ?? 'vs'} {opponent.shortName}
        </span>
      </span>
      <span className="sx-logrow-note" aria-hidden="true">
        {notes.join(', ')}
        <SourceMark display={display} />
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
