import { getStandingFor } from '../../lib/data';
import { monthDay, recordString, recordWords } from '../../lib/format';
import { TEAMS, getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, Record3 } from '../../lib/types';

import GhostMonogram from '../ui/GhostMonogram';
import ResultChip from '../ui/ResultChip';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import StatusLabel, { GameChips } from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { clockText, otherLeagueSuffix, statusLabelIsTime, type GameDisplay, type SideView } from '../ui/describe-game';

/*
 * The pieces a game summary is built from: the lead column, the two team lines, and the sr-only
 * sentences for the chips and the records. GameRow and GameCard (and Home's ResultRow) render them.
 *
 * SERVER-ONLY: `showRecords` reads the standings through lib/data, which does an fs read at module
 * scope, and NON_MEMBER_NOTE counts the registry through lib/teams. Every consumer is a server
 * component; nothing on the client imports this module.
 */

/** The ghost monogram's words (a tooltip; the monogram itself is decorative). */
export const NON_MEMBER_NOTE = `Not one of the ${TEAMS.length} teams this site follows`;

/**
 * A side's current league record ("1-4-0") for `showRecords`, or null when it should not print:
 * a side outside the registry has no record on this site (DESIGN §8), and a team with no reported
 * result would read 0-0-0, which the never-0-0 posture forbids for a record as much as for a
 * score.
 */
function leagueStanding(side: SideView): Record3 | null {
  if (!side.slug) return null;
  const standing = getStandingFor(side.slug);
  return standing && standing.hasReportedResults ? standing.computed : null;
}

function leagueRecord(side: SideView): string | null {
  const computed = leagueStanding(side);
  return computed ? recordString(computed) : null;
}

/**
 * Whether a game shows records at all: a league game (one that counts for a league table,
 * SPEC §10.4 — never MaxPreps' own league flag) with nothing on the scoreboard yet. Both sides of
 * a counted game are in that league, so neither record is a cross-league one.
 */
export function recordsApply(game: Game, display: GameDisplay, showRecords: boolean): boolean {
  return showRecords && game.countsFor !== null && !display.showScores;
}

/**
 * The game's chips in words, for a row whose visible chips sit in an aria-hidden column: " SCVAL
 * league game." / " Non-league." / " SCVAL crossover." The same gate as the chips themselves, so
 * a bracket (showChips false) does not repeat them per row.
 */
export function chipsSentence(display: GameDisplay, showChips: boolean): string {
  if (!showChips) return '';
  const kind = display.isNonLeague
    ? ' Non-league.'
    : display.leagueTag
      ? ` ${display.leagueTag} league game.`
      : '';
  return `${kind}${display.postseasonTag ? ` ${display.postseasonTag}.` : ''}`;
}

/**
 * The sr-only tail for the records, appended to the row's own sentence (describeGame's sentence
 * is shared with the game page and the OG card, so it is not changed): " Homestead 1 win,
 * 4 losses, 0 ties in league, Los Altos 3 wins, 1 loss, 0 ties in league." In words, as the
 * standings row labels are: the visible team rows are aria-hidden, so this is the only record a
 * screen reader gets, and "1-4-0" is read as a subtraction or a date. A side with no record is
 * left out rather than read as zero.
 */
export function recordsSentence(display: GameDisplay): string {
  const parts = [display.away, display.home].flatMap((side) => {
    const computed = leagueStanding(side);
    return computed ? [`${side.name} ${recordWords(computed)} in league`] : [];
  });
  return parts.length ? ` ${parts.join(', ')}.` : '';
}

export function TeamLine({
  side,
  showScore,
  chipSlot = true,
  monogram = true,
  showRecord = false,
  scopeLeague,
  seed = null,
}: {
  side: SideView;
  /** The side's bracket seed (`GameViewOptions.seeds`), or null. */
  seed?: number | null;
  showScore: boolean;
  /** false drops the chip column entirely (a GameCard where neither side has a chip). */
  chipSlot?: boolean;
  /**
   * false drops the mascot tile: Home's ResultRow, whose page carries every league's panel in its
   * static HTML and is held to a markup budget (SPEC §12.4).
   */
  monogram?: boolean;
  /** Print the side's league record after its name (`showRecords`, already gated by the row). */
  showRecord?: boolean;
  scopeLeague?: LeagueId | null;
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const record = showRecord ? leagueRecord(side) : null;
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
      {!monogram ? null : team ? (
        <TeamMonogram team={team} size={24} />
      ) : (
        <GhostMonogram name={side.name} size={24} title={NON_MEMBER_NOTE} />
      )}
      {seed !== null ? <span className="sx-num w-4 shrink-0 text-meta text-ink-3">{seed}</span> : null}
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
        {record ? (
          <span className="sx-num sx-teamrecord" aria-hidden="true">
            {record}
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
  // A scheduled game's status label IS its time ("4:00 PM", "TIME TBA"), so under the clock line
  // it would only repeat it: the status slot stays empty (GameCard does the same).
  const statusIsTime = statusLabelIsTime(game, display.statusLabel);
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
        <span
          className={[
            // `.sx-lead-clock` (app/globals.css): the 16px nowrap line of 13px mono ink-2.
            'sx-num sx-lead-clock',
            display.strikeTime ? 'line-through' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {clockText(game, 'TBA')}
        </span>
      ) : null}
      {/* StatusLabel's own gap (6px), tracking (0.04em) and line (16px) are tightened from here,
          by child rules that outrank its classes: 4px, normal tracking, 12px lines (all caps, so
          two lines of SCORE NOT REPORTED are 24px), and a 16px decider tag. Those rules are
          `.sx-lead-status` (app/globals.css): (0,1,1) and (0,2,0) against `.sx-status` and
          `.sx-tag`, which are (0,1,0) in the same layer, so they still win. */}
      <span className="sx-lead-status">
        {statusIsTime && showTime ? null : <StatusLabel display={display} showChips={false} />}
      </span>
      <span className="sx-lead-chips">
        {showChips ? <GameChips display={display} /> : null}
      </span>
    </span>
  );
}

/**
 * The two team lines of a summary row, away over home (GameRow, Home's ResultRow). 24px each,
 * 4px apart: the 52px block SummaryLead's slots are measured against.
 */
export function SummaryTeams({
  display,
  showRecords = false,
  scopeLeague = null,
  monogram = true,
  seeds,
}: {
  display: GameDisplay;
  showRecords?: boolean;
  scopeLeague?: LeagueId | null;
  monogram?: boolean;
  seeds?: { away: number | null; home: number | null };
}) {
  return (
    <span className="min-w-0 space-y-1" aria-hidden="true">
      <TeamLine
        side={display.away}
        showScore={display.showScores}
        monogram={monogram}
        showRecord={showRecords}
        scopeLeague={scopeLeague}
        seed={seeds?.away ?? null}
      />
      <TeamLine
        side={display.home}
        showScore={display.showScores}
        monogram={monogram}
        showRecord={showRecords}
        scopeLeague={scopeLeague}
        seed={seeds?.home ?? null}
      />
    </span>
  );
}
