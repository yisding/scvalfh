import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import { GameChips } from '@/components/ui/StatusLabel';
import { matchupJoiner } from '@/lib/format/score';
import { gameHref } from '@/lib/shared/game-id';
import { describeGame, resultSentence } from '@/views/shared/describe-game';
import { maxPrepsLabel } from '@/views/shared/words/maxpreps-label';

import { GameClock, GameClockOrStatus } from './parts/GameClockOrStatus';
import { chipsSentence, printedRecords, recordsSentence } from './parts/sentence-tails';
import { TeamLine } from './parts/TeamLine';
import type { GameViewProps } from './props';

/**
 * The ≥768px card in an auto-fill grid (home, /schedule, /scores/[date]), and the team page's
 * Last card from 768px. Recap and venue are always visible and there is nothing to expand. The
 * date is not printed: every host names the day in its own heading. The whole card is one
 * stretched "Game page" link; the box-score (and, with `showStream`, stream) link sits above the
 * stretch so it stays its own target.
 */
export function GameCard({
  game,
  perspective,
  showRecap = true,
  showChips = true,
  scopeLeague = null,
  records = null,
  showStream = false,
  linkStyle = 'text',
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  const shown = printedRecords(game, display, records);
  const pills = linkStyle === 'pills';
  // The links' names end in the matchup, so a links list (VoiceOver rotor, NVDA Insert+F7)
  // reads "Game page: Carmel at Fremont" rather than nine identical "Game page"s. Full names, as
  // the card's sr-only sentence speaks them: this tail is sr-only, so it need not match the
  // printed short name, and an abbreviated one was read out as letters. The visible "Game page" /
  // "Box score" still starts the name, so label-in-name holds.
  const matchup = `${display.away.name} ${matchupJoiner(game)} ${display.home.name}`;
  // An upcoming card has no chip on either side; an invisible 28px slot there pushed both team
  // lines right of the time above them. Rows keep the slot (cross-row alignment), cards drop it.
  const chipSlot = display.away.chip !== 'none' || display.home.chip !== 'none';
  const sentenceId = `game-card-${game.contestId}`;
  const recap = showRecap ? resultSentence(game) : null;
  return (
    <div
      // The stretched "Game page" link covers the card, so its focus ring is drawn on the card:
      // a keyboard user sees the same target a pointer gets. Inset, because a /schedule date
      // group is `content-visibility: auto` (paint containment) and clips anything outside it.
      // `.sx-gamecard` (app/globals.css) carries the column, the padding and that ring.
      className={['sx-card sx-lift sx-gamecard', className].filter(Boolean).join(' ')}
    >
      <span id={sentenceId} className="sr-only">
        {display.sentence}
        {chipsSentence(display, showChips)}
        {shown ? recordsSentence(display, shown) : ''}
      </span>
      <div className="flex items-center justify-between gap-2" aria-hidden="true">
        <GameClock
          game={game}
          tba="Time TBA"
          className={['sx-num text-cell text-ink-2', display.strikeTime ? 'line-through' : null]
            .filter(Boolean)
            .join(' ')}
        />
        {/* A scheduled game's status label is this same time; repeating it on the right read
            "3:30 PM … 3:30 PM". Only the chips are left to say there. */}
        <GameClockOrStatus
          game={game}
          display={display}
          showChips={showChips}
          className="justify-end"
          clock={showChips ? <GameChips display={display} className="justify-end" /> : null}
        />
      </div>
      <div className="space-y-2" aria-hidden="true">
        <TeamLine
          side={display.away}
          showScore={display.showScores}
          chipSlot={chipSlot}
          record={shown?.away ?? null}
          scopeLeague={scopeLeague}
        />
        <TeamLine
          side={display.home}
          showScore={display.showScores}
          chipSlot={chipSlot}
          record={shown?.home ?? null}
          scopeLeague={scopeLeague}
        />
      </div>
      {recap ? (
        // Not clamped: in a 17rem card the result sentence needs 3–4 lines, and a two-line clamp
        // cut every one mid-name ("…against Palo Alt…"). The grid row is `items-stretch`, so the
        // cards in a row still share one height.
        <p className="m-0 text-meta text-ink-2">{recap}</p>
      ) : null}
      {display.note ? <p className="m-0 text-meta text-ink-3">{display.note}</p> : null}
      <div
        className={pills ? 'mt-auto flex flex-wrap gap-2 pt-1' : 'sx-gamecard-links'}
      >
        <Link
          href={gameHref(game.contestId)}
          prefetch={false}
          data-stretched=""
          aria-describedby={sentenceId}
          // `.sx-stretch` (app/globals.css): the ::after that covers the card, and no ring of its
          // own (the card draws it).
          className={[
            pills
              ? 'sx-pill sx-pill-accent min-h-11'
              : 'sx-action font-medium text-accent no-underline hover:underline',
            'sx-stretch',
          ].join(' ')}
        >
          {pills ? 'Full game page' : 'Game page'}
          <span className="sr-only">: {matchup}</span>
        </Link>
        {/* The same face as its neighbour: sentence case, 500 weight, underline on hover only.
            The matchup goes inside the children so ExternalLink's "(opens in a new tab)" stays
            last in the name. */}
        {game.urls.maxpreps ? (
          <ExternalLink
            href={game.urls.maxpreps}
            className={pills ? 'sx-pill relative z-10 min-h-11' : textLinkClass}
          >
            {pills ? maxPrepsLabel(game.status) : 'Box score'}
            <span className="sr-only">: {matchup}</span>
          </ExternalLink>
        ) : null}
        {showStream && game.urls.nfhsStream ? (
          <ExternalLink
            href={game.urls.nfhsStream}
            className={pills ? 'sx-pill relative z-10 min-h-11' : textLinkClass}
          >
            NFHS stream<span className="sr-only">: {matchup}</span>
          </ExternalLink>
        ) : null}
      </div>
    </div>
  );
}

/**
 * GameCard's compact Box score / NFHS stream text links, above the stretched link
 * (`.sx-gamecard-extlink`: relative, z-10, a 4px gap, weight 500). ExternalLink already adds
 * `hover:underline`.
 */
const textLinkClass = 'sx-action sx-gamecard-extlink no-underline';

export default GameCard;
