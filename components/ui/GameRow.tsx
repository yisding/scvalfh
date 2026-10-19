import Link from 'next/link';

import { monthDay, shortDate, timeOfDay } from '@/lib/format/dates';
import { recordString, recordWords } from '@/lib/format/numbers';
import { matchupJoiner } from '@/lib/format/score';
import { EM_DASH } from '@/lib/format/words';
import type { Game, Record3 } from '@/lib/model/game';
import type { LeagueId, TeamSlug } from '@/lib/model/ids';
import { getStandingFor } from '@/lib/queries/standings';
import { TEAMS, getTeamBySlug } from '@/lib/registry/teams';
import { gameHref } from '@/lib/shared/game-id';

import ExternalLink from './ExternalLink';
import GhostMonogram from './GhostMonogram';
import { maxPrepsLabel } from './maxpreps-label';
import ResultChip from './ResultChip';
import { ScoreGlyph, nameClass } from './ScoreGlyph';
import StatusLabel, { GameChips } from './StatusLabel';
import Tag from './Tag';
import TeamMonogram from './TeamMonogram';
import {
  describeGame,
  gameKind,
  otherLeagueSuffix,
  resultSentence,
  statusLabelIsTime,
  type GameDisplay,
  type SideView,
} from './describe-game';

/**
 * GameRow / GameCard / GameLine / GameLogRow (DESIGN §7.4, modernization brief §4.15).
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
 * (DESIGN §8).
 *
 * Every game link is `gameHref(game.contestId)` (SPEC §10.0): a si.com-only game's id is
 * `sblive:<n>`, which the route spells `sblive-<n>`.
 *
 * SERVER-ONLY: `showRecords` reads the standings through lib/queries/standings.ts, whose snapshot read (lib/datasets/snapshot.ts) is an fs read at module
 * scope, and NON_MEMBER_NOTE counts the registry through lib/registry/teams. Every consumer is a server
 * component; nothing on the client imports this module.
 */
export interface GameViewProps {
  game: Game;
  /** Orients "vs / at" and the W/L/T from this team's side. */
  perspective?: TeamSlug | null;
  showDate?: boolean;
  showTime?: boolean;
  /** Default true on /schedule and /; false in dense tables. */
  showRecap?: boolean;
  /**
   * The game's chips (league / NL, postseason), passed through to `StatusLabel`. It gates the
   * whole chip group, not only NL — but never the †, which travels with the score. Set it false
   * in a context that prints them elsewhere, or where every game is the same kind and marking
   * each one is noise — a CCS bracket (DESIGN §5.4).
   */
  showChips?: boolean;
  /**
   * A league-scoped list (`/schedule/<league>`): a side from ANOTHER league carries its league's
   * short name after its name (`Saint Francis · SCVAL`), so a cross-league game reads right in
   * both leagues' lists.
   */
  scopeLeague?: LeagueId | null;
  /**
   * GameRow / GameCard only: print each registry side's current league record beside its name on
   * a league game (one that counts for a league table, `countsFor`) that has no score yet
   * ("Homestead 1-4-0"). GameList passes it on /schedule/<league> and /scores/[date] only — a
   * list with no perspective, where a reader is sizing up a game before kickoff. Never on a team
   * page (the record is that page's headline) or in a bracket.
   */
  showRecords?: boolean;
  /**
   * GameCard only: add an "NFHS stream" link beside Box score when the game has one. Only the
   * team page's Last card passes it: from 768px it replaces the phone's expanded row, whose
   * panel offers the stream, and a replay is what a parent wants from a game just played.
   */
  showStream?: boolean;
  /**
   * GameCard only: `'pills'` prints its links as the team page's Next card does — the accent
   * "Full game page" pill (still the stretched link) and 44px "MaxPreps box score" / "NFHS stream"
   * pills — so the Last and Next cards side by side word and size the same actions alike. Only that
   * Last card passes it; every other card keeps the compact `'text'` links.
   */
  linkStyle?: 'text' | 'pills';
  defaultExpanded?: boolean;
  className?: string;
}

/** `GameLogRowBody` only: the row IS the page being viewed (the season series on /game/[id]). */
export interface GameLogRowProps extends GameViewProps {
  isThisGame?: boolean;
}

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
function recordsApply(game: Game, display: GameDisplay, showRecords: boolean): boolean {
  return showRecords && game.countsFor !== null && !display.showScores;
}

/**
 * The game's chips in words, for a row whose visible chips sit in an aria-hidden column: " SCVAL
 * league game." / " Non-league." / " SCVAL crossover." The same gate as the chips themselves, so
 * a bracket (showChips false) does not repeat them per row.
 */
function chipsSentence(display: GameDisplay, showChips: boolean): string {
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
function recordsSentence(display: GameDisplay): string {
  const parts = [display.away, display.home].flatMap((side) => {
    const computed = leagueStanding(side);
    return computed ? [`${side.name} ${recordWords(computed)} in league`] : [];
  });
  return parts.length ? ` ${parts.join(', ')}.` : '';
}

function TeamLine({
  side,
  showScore,
  chipSlot = true,
  monogram = true,
  showRecord = false,
  scopeLeague,
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
          {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
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
}: {
  display: GameDisplay;
  showRecords?: boolean;
  scopeLeague?: LeagueId | null;
  monogram?: boolean;
}) {
  return (
    <span className="min-w-0 space-y-1" aria-hidden="true">
      <TeamLine
        side={display.away}
        showScore={display.showScores}
        monogram={monogram}
        showRecord={showRecords}
        scopeLeague={scopeLeague}
      />
      <TeamLine
        side={display.home}
        showScore={display.showScores}
        monogram={monogram}
        showRecord={showRecords}
        scopeLeague={scopeLeague}
      />
    </span>
  );
}

/** The pills in an expanded panel: real links only, never a dead affordance. */
function GameLinks({ game }: { game: Game }) {
  const address = game.venue.address;
  const directions = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`
    : null;
  const links: Array<{ href: string; label: string }> = [];
  if (directions) links.push({ href: directions, label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: maxPrepsLabel(game.status) });
  return (
    <p className="m-0 flex flex-wrap gap-2">
      {/* The way on to the whole contest comes first, as the one accent pill. */}
      <Link
        href={gameHref(game.contestId)}
        prefetch={false}
        className="sx-pill sx-pill-accent min-h-11"
      >
        Full game page
      </Link>
      {/* The open panel is surface-2, the pill's own fill, so these pills take the card
          surface instead or they would read as bare text links. A press steps them to surface-3,
          the same as a hover, so a tap on a phone (no hover) still answers. */}
      {links.map((l) => (
        <ExternalLink
          key={l.href}
          href={l.href}
          className="sx-pill sx-pill-card"
        >
          {l.label}
        </ExternalLink>
      ))}
    </p>
  );
}

function GameDetailBody({ game, showRecap }: { game: Game; showRecap: boolean }) {
  const recap = showRecap ? resultSentence(game) : null;
  return (
    // From 768px (the team page's Last card) the panel is indented to the team column — gutter +
    // the 80px lead column + its 8px gap — so it reads as belonging to the two names above it.
    // On a phone that indent cost 94px of a 358px row and stacked every pill on its own line, so
    // the panel starts at the gutter there.
    // A flex column, not `space-y-3`: v4's space-y is a zero-specificity child rule, so each
    // child's `m-0` cancelled it and the recap sat on the pill row.
    // `.sx-gamedetail` (app/globals.css) is that panel: surface-2 under a divider, 12px between
    // its lines, the md indent.
    <div className="sx-gamedetail">
      {recap ? <p className="m-0 text-ink-2">{recap}</p> : null}
      {game.venue.name ? <p className="m-0 text-ink-2">{game.venue.name}</p> : null}
      {/* `contest.location` is a NOTE field, not a venue field — live values include
          "Senior Night" and a coach's scoring note — so it is never labelled "Venue". */}
      {game.venue.text ? <p className="m-0 text-ink-3">Note: {game.venue.text}</p> : null}
      <GameLinks game={game} />
    </div>
  );
}

export function GameRow({
  game,
  perspective,
  showDate = false,
  showTime = true,
  showRecap = true,
  showChips = true,
  scopeLeague = null,
  showRecords = false,
  defaultExpanded = false,
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  const withRecords = recordsApply(game, display, showRecords);
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
          {withRecords ? recordsSentence(display) : ''}
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
        <SummaryTeams display={display} showRecords={withRecords} scopeLeague={scopeLeague} />
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
  showRecords = false,
  showStream = false,
  linkStyle = 'text',
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  const withRecords = recordsApply(game, display, showRecords);
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
        {withRecords ? recordsSentence(display) : ''}
      </span>
      <div className="flex items-center justify-between gap-2" aria-hidden="true">
        <span
          className={['sx-num text-cell text-ink-2', display.strikeTime ? 'line-through' : null]
            .filter(Boolean)
            .join(' ')}
        >
          {game.isTimeTba ? 'Time TBA' : timeOfDay(game.dateLocal)}
        </span>
        {/* A scheduled game's status label is this same time; repeating it on the right read
            "3:30 PM … 3:30 PM". Only the chips are left to say there. */}
        {statusLabelIsTime(game, display.statusLabel) ? (
          showChips ? <GameChips display={display} className="justify-end" /> : null
        ) : (
          <StatusLabel display={display} showChips={showChips} className="justify-end" />
        )}
      </div>
      <div className="space-y-2" aria-hidden="true">
        <TeamLine
          side={display.away}
          showScore={display.showScores}
          chipSlot={chipSlot}
          showRecord={withRecords}
          scopeLeague={scopeLeague}
        />
        <TeamLine
          side={display.home}
          showScore={display.showScores}
          chipSlot={chipSlot}
          showRecord={withRecords}
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

/**
 * The compact "Next up" form: `5:30 PM  Homestead at Los Altos`. Normally one line; a matchup
 * that does not fit ("Scripps Ranch at Saint Francis" at 320) wraps WHOLE onto a second line,
 * clamped at two, rather than losing its home team to an ellipsis. The time and the trailing
 * tag stay centred on the pair (`items-center`).
 *
 * The trailing tag track is a FIXED 4rem, end-aligned, sized for the widest league code (SUNSET,
 * 59.5px). It was `auto`, so its width was the tag's own — NL 27.8px, SCVAL 51.6px — and the
 * matchup's width with it: "Valley Christian at Homestead" kept one line beside an NL row's tag
 * and wrapped beside a SCVAL row's. A postseason chip is a phrase no fixed track holds (`SCVAL
 * crossover` is 131px), so it goes on its own line under the matchup instead (GameChips `part`).
 * The final branch (FINAL and the code, wrapping inside the track) is not reached from NextSlate,
 * whose slate holds only games still to play.
 *
 * The time is NOT aria-hidden: it is the link's only statement of when, so the name reads
 * "5:30 PM Homestead at Los Altos SCVAL league game" (the chips' Tag labels carry the words).
 */
export function GameLine({ game, perspective, showChips = true, className }: GameViewProps) {
  const display = describeGame(game, perspective);
  const awayTeam = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  const homeTeam = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  return (
    <Link
      href={gameHref(game.contestId)}
      prefetch={false}
      className={[
        'sx-tap relative grid min-h-row-1 grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-x-3 px-gutter py-2 text-body no-underline',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="sx-num text-cell text-ink-2">
        {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 break-words text-ink">
          {awayTeam ? awayTeam.shortName : game.away.name}
          {game.site === 'neutral' ? ' vs ' : ' at '}
          {homeTeam ? homeTeam.shortName : game.home.name}
        </span>
        {showChips ? <GameChips display={display} part="phrase" className="mt-1" /> : null}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {display.kind === 'final' ? <StatusLabel display={display} showChips={false} /> : null}
        {showChips ? <GameChips display={display} part="codes" /> : null}
      </span>
    </Link>
  );
}

/**
 * A dense game-log line: `Sep 24 (L) 0–7 vs Saint Francis FINAL`. ONE row for a team page's log
 * AND the /game/[id] season series ("These two this season"), so the two lists that say the same
 * thing cannot drift apart in columns, names or type size. The series renders its own `<Link>`
 * (or, for the game being viewed, an `aria-current` band) around `GameLogRowBody` with
 * `gameLogRowClass`; a team log uses `GameLogRow`, which is exactly that link.
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
/** The log row's four-column grid, shared with the team page's JV list (components/teams/TeamJvGames.tsx). */
export const GAME_LOG_ROW_GRID =
  'relative @container grid min-h-row-1 grid-cols-[minmax(0,3.5rem)_minmax(0,1.25rem)_minmax(0,3.25rem)_minmax(0,1fr)] items-center gap-x-3 px-gutter py-2 text-meta';

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
          {statusLabelIsTime(game, display.statusLabel) ? (
            // An upcoming game's status IS its time: printed as the clock it is — mono 13px
            // ink-2, the face of every other clock on the site — not as a sans-caps status word.
            <>
              <span className="sx-num text-cell text-ink-2">
                {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
              </span>
              {showChips ? <GameChips display={display} /> : null}
            </>
          ) : (
            <StatusLabel display={display} showChips={showChips} className="max-w-full" />
          )}
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

export default GameRow;
