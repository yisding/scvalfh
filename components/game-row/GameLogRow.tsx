import Link from 'next/link';

import ResultChip from '@/components/ui/ResultChip';
import { ScoreGlyph } from '@/components/ui/ScoreGlyph';
import { GameChips } from '@/components/ui/StatusLabel';
import Tag from '@/components/ui/Tag';
import { shortDate } from '@/lib/format/dates';
import { EM_DASH } from '@/lib/format/words';
import { getTeamBySlug } from '@/lib/registry/teams';
import { gameHref } from '@/lib/shared/game-id';
import { describeGame } from '@/views/shared/describe-game';

import { gameLogRowClass } from './game-log-grid';
import { GameClock, GameClockOrStatus } from './parts/GameClockOrStatus';
import type { GameViewProps } from './props';

/**
 * A dense game-log line: `Sep 24 (L) 0–7 vs Saint Francis FINAL`. ONE row for a team page's log
 * AND the /game/[id] season series ("These two this season"), so the two lists that say the same
 * thing cannot drift apart in columns, names or type size. The series renders its own `<Link>`
 * (or, for the game being viewed, an `aria-current` band) around `GameLogRowBody` with
 * `gameLogRowClass` (components/game-row/game-log-grid.ts); a team log uses `GameLogRow`, which is
 * exactly that link.
 *
 * ONE `sr-only` sentence and everything visual behind a single `aria-hidden`, exactly as
 * `GameRow`'s summary and `GameCard` already do. Leaving `ResultChip` (role="img") and
 * `StatusLabel` outside made the link's accessible name repeat itself — "…final. Loss FINAL" —
 * while the row's only date was aria-hidden and announced nowhere, so the date leads the
 * sentence here.
 *
 * Four fixed columns (date · chip · score · the rest) so the dates, chips and scores line up
 * down the log. The score column is itself a three-track grid — mine · dash · theirs — with MY
 * goals right-aligned against the dash, so a 10 and a 3 line up on their last digit and the
 * dashes stack. The opponent is never truncated: it is the thing the row exists to say.
 *
 * Where the status goes is fixed by the row's width, never by its labels. The row is its own
 * query container (rem-based, so it follows the reader's text size):
 *
 * - Under 25rem of content (every phone) the opponent ends line 1 and the status — FINAL and its
 *   tags, or the clock — is ALWAYS line 2, left-aligned under the chip across columns 2–4: 220px
 *   at 320, room for SCORE NOT REPORTED and its code (201px), which the opponent's column alone
 *   (124px at 320, 194 at 390) is not. Every phone row is 58px unless the opponent wraps.
 * - From 25rem the last column is `[1fr | 7.5rem]`, 10rem from 30rem and 14rem from 40rem (so
 *   SCORE NOT REPORTED and its code keep one line in a full-width log), the status left-aligned in
 *   its track, so FINAL starts at one x down the log. The 7.5rem step is the team page's half-width
 *   log at 1024 (about 420px of content): FINAL and a league code (94px) fit it, and a 10rem track
 *   there left the opponent 84px, so every row went to two lines where one had room.
 *
 * It used to be one wrapping flex line with the status flush right: whether the status fitted
 * beside the opponent depended on the name and the tag (SCVAL is 24px wider than NL), so at 390 it
 * jumped between the end of line 1 and the start of line 2 (rows 52, 56, 58 and 76px), and at 1280
 * FINAL started wherever the tag's width put it.
 *
 * At large text sizes (150–175%) the three fixed columns and their gaps grow with the type and
 * leave the last one too narrow for a name: at 24px on a 390px phone it was 96px, and a 6.5rem
 * minimum pushed "vs Saint Francis" out of the clipped card. So when the content box is narrower
 * than 16.75rem — the fixed tracks, their gaps and 6.5rem for the name — the opponent too drops to
 * a line of its own under the chip, across columns 2–4, and the status follows it. At 16px every
 * phone row (288px of content at 320) is wider than that. The fixed tracks are `minmax(0, …)` so
 * they give way before the row overflows.
 */

/** `GameLogRowBody` only: the row IS the page being viewed (the season series on /game/[id]). */
export interface GameLogRowProps extends GameViewProps {
  isThisGame?: boolean;
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
}: GameLogRowProps) {
  const display = describeGame(game, perspective);
  const mineIsHome = perspective ? game.home.slug === perspective : true;
  const opponent = mineIsHome ? display.away : display.home;
  const mine = mineIsHome ? display.home : display.away;
  const opponentTeam = opponent.slug ? getTeamBySlug(opponent.slug) : undefined;
  const day = shortDate(game.dateLocal).slice(4);
  return (
    <>
      <span className="sr-only">
        {isThisGame ? 'This game. ' : ''}
        {day}: {display.sentence}
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
      {/* mine · dash · theirs. `1ch` holds the en dash and `2ch` the widest score, so mine takes
          the slack and sits right against the dash. An unreported game keeps ScoreGlyph's two
          muted en dashes (never 0–0); a game with no score yet is one em dash in the middle. */}
      <span
        className="sx-num grid grid-cols-[minmax(0,1fr)_1ch_2ch] whitespace-nowrap"
        aria-hidden="true"
      >
        {display.showScores ? (
          <>
            <ScoreGlyph side={mine} size="meta" className="justify-self-end" />
            <span className="text-center text-ink-3">{'–'}</span>
            <ScoreGlyph side={opponent} size="meta" className="justify-self-start" />
          </>
        ) : (
          <span className="col-start-2 text-center text-ink-3">{EM_DASH}</span>
        )}
      </span>
      {/* From 25rem: a nested `[1fr | status track]` grid in the fourth column. Below it the
          wrapper is `display: contents`, so the opponent and status are the ROW's grid items:
          the opponent takes the fourth column of line 1 and the status a line 2 of its own
          across columns 2–4. The children repeat `aria-hidden` rather than lean on a
          `contents` box to pass it down. */}
      <span
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-3 @max-[25rem]:contents @min-[30rem]:grid-cols-[minmax(0,1fr)_10rem] @min-[40rem]:grid-cols-[minmax(0,1fr)_14rem]"
        aria-hidden="true"
      >
        {/* `break-words` breaks a long single word inside the column. Reflowed under the chip
            (large text), it may take three lines: "vs University Prep Academy" needs them. */}
        <span
          className="line-clamp-2 min-w-0 break-words text-ink @max-[16.75rem]:col-span-3 @max-[16.75rem]:col-start-2 @max-[16.75rem]:mt-1 @max-[16.75rem]:line-clamp-3"
          aria-hidden="true"
        >
          {/* The short name, as every game row prints it: a long full name ("Convent of the
              Sacred Heart") was clamped mid-name in a 320px log. The sr-only sentence keeps the
              full name. */}
          {display.versus ?? 'vs'} {opponentTeam ? opponentTeam.shortName : opponent.name}
        </span>
        {/* Left-aligned, so FINAL starts at one x down the log; the tags never wrap inside
            themselves (Tag), and what is wider than its space (a `this game` tag beside FINAL
            and its code, a postseason chip, and in the 7.5rem track SCORE NOT REPORTED or
            FINAL 2 OT with a code) wraps there, growing that row alone. */}
        <span
          className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 @max-[25rem]:col-span-3 @max-[25rem]:col-start-2 @max-[25rem]:mt-0.5"
          aria-hidden="true"
        >
          {isThisGame ? <Tag label="the game on this page">this game</Tag> : null}
          <GameClockOrStatus
            game={game}
            display={display}
            showChips={showChips}
            className="max-w-full"
            clock={
              // An upcoming game's status IS its time: printed as the clock it is — mono 13px
              // ink-2, the face of every other clock on the site — not as a sans-caps status word.
              <>
                <GameClock game={game} tba="TBA" className="sx-num text-cell text-ink-2" />
                {showChips ? <GameChips display={display} /> : null}
              </>
            }
          />
        </span>
      </span>
    </>
  );
}

/** A team page's game-log row: the whole row is one link to the game page. */
export function GameLogRow({ game, className, ...rest }: GameViewProps) {
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

export default GameLogRow;
