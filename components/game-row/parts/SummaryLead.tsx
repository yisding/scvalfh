import StatusLabel, { GameChips } from '@/components/ui/StatusLabel';
import { monthDay } from '@/lib/format/dates';
import type { Game } from '@/lib/model/game';
import type { GameDisplay } from '@/views/shared/game-display-client';

import { GameClock, GameClockOrStatus } from './GameClockOrStatus';

/**
 * The lead column of a game summary row — GameRow's `<summary>` and Home's ResultRow
 * (components/home/LatestScores.tsx), which renders this same component so the two faces of one
 * game cannot drift apart. Three FIXED slots, top to bottom:
 *
 *   clock   16px  `4:00 PM`, mono 13px; struck through for a postponed game.
 *   status  16px  the status word and its decider tag (`FINAL`, `FINAL 2 OT`, `POSTPONED`), and
 *                 the † of a si.com score. Empty for a scheduled game: its status IS the clock.
 *   chips   20px  the league / NL code (`SCVAL`, `NL`), or the postseason chip. Reserved when the
 *                 game has none, so a row with chips and a row without are one height.
 *
 * 52px in all — the two 24px team lines and their 4px gap — so the row is its 76px
 * `min-h-gamerow` whatever its labels say, and the team block never re-centres. Before, the
 * status word and the chips shared one wrapping line: FINAL + NL (64px) fitted the 80px column
 * but FINAL + SCVAL (90px) did not, so the code dropped to a third line and one /schedule list
 * mixed 76, 86, 92 and 100px rows, its names shifting a few px each time.
 *
 * Widths at 12px: FINAL is 34.5px at normal tracking and a decider tag, 4px later and with the
 * lead's 4px tag padding, at most 39.7px (`2 OT`), so `FINAL 2 OT` is 78px of the 80; the decider
 * tag is 16px tall here so it fits the 16px slot. The widest league code, SUNSET, is 55.5px. What
 * cannot fit one 80px line wraps INSIDE its slot and that row grows: SCORE NOT REPORTED (135px;
 * two 12px caps lines, an 84px row), a shootout tally, a `2 OT` tag with the † beside it, and a
 * postseason phrase, which grows into one taller capsule (GameChips).
 */
export function SummaryLead({
  game,
  display,
  showDate = false,
  showTime = true,
  showChips = true,
}: {
  game: Game;
  display: GameDisplay;
  /** No caller passes it today: it adds a fourth slot above the clock, and the row grows. */
  showDate?: boolean;
  /** false drops the clock slot (the team page's expanded Last row, under its own date header). */
  showTime?: boolean;
  showChips?: boolean;
}) {
  return (
    // `[&_.rounded-tag]:px-1`: every tag in the lead (decider, codes, postseason capsule) takes
    // 4px of padding instead of 6, the 4px that lets `FINAL 2 OT` keep one line. A descendant
    // rule, so it outranks Tag's own `px-1.5` without depending on stylesheet order.
    <span className="flex min-w-0 flex-col [&_.rounded-tag]:px-1" aria-hidden="true">
      {showDate ? (
        <span className="sx-num text-cell leading-4 text-ink-2">{monthDay(game.dateLocal)}</span>
      ) : null}
      {showTime ? (
        // ONE clock line in ONE face for every state, as GameCard prints it ("4:00 PM", mono): a
        // final and the upcoming game under it no longer switch faces. "12:00 PM" is 62px.
        // `display.sentence` carries PT.
        <GameClock
          game={game}
          tba="TBA"
          className={[
            // `.sx-lead-clock` (app/globals.css): the 16px nowrap line of 13px mono ink-2.
            'sx-num sx-lead-clock',
            display.strikeTime ? 'line-through' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
      {/* StatusLabel's own gap (6px), tracking (0.04em) and line (16px) are tightened from here,
          by child rules that outrank its classes: 4px, normal tracking, 12px lines (all caps, so
          two lines of SCORE NOT REPORTED are 24px), and a 16px decider tag. Those rules are
          `.sx-lead-status` (app/globals.css): (0,1,1) and (0,2,0) against `.sx-status` and
          `.sx-tag`, which are (0,1,0) in the same layer, so they still win. */}
      <span className="sx-lead-status">
        {/* A scheduled game's status label IS its time ("4:00 PM", "TIME TBA"), so under the
            clock line it would only repeat it: the status slot stays empty (GameCard does the
            same). Without the clock slot the label is the only time the row prints. */}
        {showTime ? (
          <GameClockOrStatus game={game} display={display} showChips={false} clock={null} />
        ) : (
          <StatusLabel display={display} showChips={false} />
        )}
      </span>
      <span className="sx-lead-chips">
        {showChips ? <GameChips display={display} /> : null}
      </span>
    </span>
  );
}

export default SummaryLead;
