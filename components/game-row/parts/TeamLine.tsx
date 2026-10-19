import ResultChip from '@/components/ui/ResultChip';
import { ScoreGlyph, nameClass } from '@/components/ui/ScoreGlyph';
import SideMonogram from '@/components/ui/SideMonogram';
import { recordString } from '@/lib/format/numbers';
import type { Record3 } from '@/lib/model/game';
import type { LeagueId } from '@/lib/model/ids';
import { otherLeagueSuffix } from '@/views/shared/describe-game';
import type { SideView } from '@/views/shared/game-display-client';

/**
 * One side of a game face: chip · monogram · name · score (GameRow's summary, Home's ResultRow,
 * GameCard), or the `compact` line of the JV day list (components/schedule/JvDayGames.tsx).
 */
export function TeamLine({
  side,
  showScore,
  chipSlot = true,
  monogram = true,
  record = null,
  scopeLeague,
  compact = false,
}: {
  side: SideView;
  showScore: boolean;
  /** false drops the chip column entirely (a GameCard where neither side has a chip). */
  chipSlot?: boolean;
  /**
   * false drops the mascot tile: Home's ResultRow, whose page carries every league's panel in its
   * static HTML and is held to a markup budget (SPEC §12.4).
   */
  monogram?: boolean;
  /** The side's league record to print after its name (`records`, already gated by the row). */
  record?: Record3 | null;
  scopeLeague?: LeagueId | null;
  /**
   * The JV day list's line: the short name, truncated on one line, and the score at meta size at
   * the line's end — no chip, tile, league suffix or record.
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="flex min-w-0 items-center justify-between gap-3">
        <span className={`min-w-0 truncate ${nameClass(side)}`}>{side.shortName}</span>
        {showScore ? <ScoreGlyph side={side} size="meta" className="shrink-0" /> : null}
      </span>
    );
  }
  const recordText = record ? recordString(record) : null;
  const suffix = otherLeagueSuffix(side.slug, scopeLeague);
  return (
    // One 24px line per side: chip 20 · monogram 24 · name · score, 8px apart. The status label
    // lives in the row's lead column, so nothing trails the score. The score column is sized to
    // its glyph (one digit is ~13px), not reserved for two: right-aligned, the scores still line
    // up down a list, and the name gets the slack (≈ 95px at 320, enough for "Monta Vista").
    // A name that still does not fit wraps to a second line instead of losing its end; below
    // 359px (22.4375rem, a rem gate so it follows the reader's text size) it also steps down to
    // 15px so that stays rare.
    // The name takes `nameClass`: a winner 600/ink, a loser 400/ink-2, and a LEVEL side —
    // a tie and every game not yet decided — 400 in full ink, so an upcoming slate is not
    // printed in the loser's grey.
    // `.sx-teamline`, `.sx-teamname`, `.sx-teamrecord` and `.sx-teamscore` (app/globals.css,
    // "Game rows and cards") are those measurements as classes: every list page repeats this line
    // twice per game, and /schedule/<league> twice again (GameRow and GameCard).
    <span className="sx-teamline">
      {chipSlot ? <ResultChip kind={side.chip} size={20} /> : null}
      {monogram ? <SideMonogram slug={side.slug} name={side.name} size={24} /> : null}
      <span className={`sx-teamname ${nameClass(side)}`}>
        {/* The dense row renders the SHORT name (DESIGN §3.3's wireframe writes "Mitty", not
            "Archbishop Mitty High School"). `display.sentence` keeps the full name for a screen
            reader. */}
        {side.shortName}
        {/* The other side's league, on a league-scoped list only: `Saint Francis · SCVAL`. A
            counted game never has a side from another league, so this and the record below
            never stack. */}
        {suffix ? <span className="text-ink-3">{suffix}</span> : null}
        {/* The league record rides INLINE after the name, never in the score column (which
            stays empty until there is a score). 12px mono ink-3, so it reads as a footnote to
            the name: "Presentation 2-4-1", the widest pair, measures 136px of the 156px a 360px
            row leaves the name (two-digit records would add ≈ 15px and still fit).
            Below 359px it is dropped rather than allowed to wrap the name. The row's sr-only
            sentence carries it in words. */}
        {recordText ? (
          <span className="sx-num sx-teamrecord" aria-hidden="true">
            {recordText}
          </span>
        ) : null}
      </span>
      {/* The 22px glyph's 28px line box is centred in the 24px line, so two team lines are
          52px and the row keeps its 76px height. */}
      {showScore ? (
        <span className="sx-teamscore">
          <ScoreGlyph side={side} size="score" />
        </span>
      ) : null}
    </span>
  );
}

export default TeamLine;
