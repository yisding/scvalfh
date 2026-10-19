import { describeGame } from '@/views/shared/describe-game';

import { GameDetailBody } from './parts/GameDetailBody';
import { chipsSentence, printedRecords, recordsSentence } from './parts/sentence-tails';
import { SummaryLead } from './parts/SummaryLead';
import { SummaryTeams } from './parts/SummaryTeams';
import type { GameViewProps } from './props';

/**
 * GameRow / GameCard / GameLine / GameLogRow (DESIGN §7.4, modernization brief §4.15): the
 * game-row family, one face per file in components/game-row/ (props.ts holds their props), with
 * the pieces two faces share in parts/.
 *
 * A row is a three-column grid: a lead column (clock · the written status label · the chips, in
 * three fixed slots: SummaryLead), the two team lines — AWAY on top, HOME below, each `[chip]
 * [monogram] [name] [score]` — and a chevron.
 * The score column is mono/tabular so scores align down a list, and the winner's number is 600
 * weight in `--sx-text` against the loser's 400 in `--sx-text-2` (the fourth redundant channel,
 * R-19). Exactly two ScoreGlyphs per row, away then home.
 *
 * The row is a `<details>` / `<summary>` pair, so EXPAND WORKS WITH ZERO JAVASCRIPT. Venue,
 * stream, tickets, the box score and the /game/[id] link live in the panel, which is why 174
 * venue addresses never enter the initial payload of a list page.
 *
 * An opponent that is not one of the registry's teams gets a ghost monogram (GhostMonogram: two
 * mixed-case letters on the inset surface, no school colour), titled NON_MEMBER_NOTE, and no link
 * (DESIGN §8): components/ui/SideMonogram.tsx.
 *
 * Every game link is `gameHref(game.contestId)` (SPEC §10.0): a si.com-only game's id is
 * `sblive:<n>`, which the route spells `sblive-<n>`.
 *
 * SERVER-ONLY: the faces resolve registry teams through lib/registry/teams (SideMonogram's tile,
 * GameLine's and the log row's short names), and NON_MEMBER_NOTE counts the registry. Every
 * consumer is a server component; nothing on the client imports these modules. The league records
 * a slate prints arrive as props (`records`, resolved by views/shared/game-records.ts), so no
 * game-row module reads lib/queries.
 */
export function GameRow({
  game,
  perspective,
  showDate = false,
  showTime = true,
  showRecap = true,
  showChips = true,
  scopeLeague = null,
  records = null,
  defaultExpanded = false,
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  const shown = printedRecords(game, display, records);
  return (
    <details
      open={defaultExpanded || undefined}
      className={[
        display.isNonLeague ? 'sx-nonleague' : null,
        'bg-surface',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Three columns — lead (clock · status · chips, SummaryLead), the two team lines, the
          chevron — so the status word never pushes a team line onto a third row. The lead column
          is 80px at every phone width and its three slots are fixed, so the row is 76px whatever
          its labels say. At 320 a 70px column broke a label into three lines and grew the row to
          90px; the 10px comes back from the score column, which is sized to its glyph. */}
      {/* The ring is inset: the row is an edge-to-edge band, and an outset ring would be clipped
          by the screen edge (or by a /schedule date group's paint containment). */}
      {/* `.sx-gamerow` (app/globals.css) is the grid, the 76px floor, the padding, the inset ring
          and the hidden marker: one class instead of twelve utilities on every row. */}
      <summary className="sx-tap sx-gamerow">
        {/* The chips are aria-hidden in the lead column, so the sentence says them in words — the
            same gate as the chips, so a bracket (showChips false) does not repeat them. */}
        <span className="sr-only">
          {display.sentence}
          {chipsSentence(display, showChips)}
          {shown ? recordsSentence(display, shown) : ''}
        </span>
        {/* The lead is 52px and centred on the 52px team block (the grid's `items-center`); a
            name that genuinely wraps grows the block, and the lead stays centred on it. */}
        <SummaryLead
          game={game}
          display={display}
          showDate={showDate}
          showTime={showTime}
          showChips={showChips}
        />
        <SummaryTeams display={display} records={shown} scopeLeague={scopeLeague} />
        <svg
          className="sx-chevron text-ink-3"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>
      <GameDetailBody game={game} showRecap={showRecap} />
    </details>
  );
}

export default GameRow;
