import { getStandingFor } from '../../lib/data';
import { SPORT_TIEBREAK_TAG, monthDay, recordWords } from '../../lib/format';
import { TEAMS, getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, Record3 } from '../../lib/types';

import GhostMonogram from '../ui/GhostMonogram';
import { ScoreGlyph } from '../ui/ScoreGlyph';
import { SourceMark, statusCase } from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import type { GameDisplay, SideView } from '../ui/describe-game';

/*
 * The pieces a game row is built from (DESIGN §33): the status slot, a side's logo, the note line's
 * parts (shootout, competition, venue), and the sr-only sentences for the game's kind and the
 * records. GameRow renders them in its own grid; `SummaryLead`, `SummaryTeams` and `TeamLine` are
 * the same pieces in the two-column shape Home's ResultRow still lays out.
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

/**
 * Whether a game shows records at all: a league game (one that counts for a league table,
 * SPEC §10.4 — never MaxPreps' own league flag) with nothing on the scoreboard yet. Both sides of
 * a counted game are in that league, so neither record is a cross-league one.
 */
export function recordsApply(game: Game, display: GameDisplay, showRecords: boolean): boolean {
  return showRecords && game.countsFor !== null && !display.showScores;
}

/**
 * The game's kind in words, for a row whose visible meta is aria-hidden: " SCVAL league game." /
 * " Non-league." / " SCVAL crossover." The same gate as the meta itself, so a bracket (showChips
 * false) does not repeat it per row.
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

/** The row's status word, in sentence case: `Final`, `3:00 PM`, `Postponed`. */
export function statusWords(display: Pick<GameDisplay, 'statusLabel'>): string {
  return statusCase(display.statusLabel);
}

/**
 * The competition of a game, for a row in a list that is NOT grouped by competition: its round
 * (`SCVAL crossover`), else the word `Non-league`; '' for a league game. `showChips` false (a list
 * under a competition's own strip, a bracket) leaves it out. The `seeds` argument is historical:
 * seeds are printed after each name (`#7`), never as a "7 v 2" line.
 */
export function gameMetaText(
  display: Pick<GameDisplay, 'postseasonTag' | 'isNonLeague'>,
  showChips: boolean,
  seeds?: { away: number | null; home: number | null },
): string {
  void seeds;
  if (!showChips) return '';
  return display.postseasonTag ?? (display.isNonLeague ? 'Non-league' : '');
}

/** The four states a row can be in. A final nobody reported, a postponed and a cancelled game are `off`. */
export type RowState = 'final' | 'live' | 'upcoming' | 'off';

export function rowState(game: Pick<Game, 'status'>, display: Pick<GameDisplay, 'kind'>): RowState {
  if (game.status === 'live') return 'live';
  if (display.kind === 'scheduled') return 'upcoming';
  return display.kind === 'final' ? 'final' : 'off';
}

/**
 * Where a game still to play is: `at Los Altos`. The host is the home side unless the site is
 * neutral; a venue name from the game's own page, or a MaxPreps location note written as a place
 * (`@ Saint Francis`), wins over it. (`venue.text` is otherwise a NOTE field, "Senior Night",
 * "White Uniforms", and is never printed as a place.) null for a neutral site nobody named.
 */
export function venueWords(game: Pick<Game, 'venue' | 'site'>, display: Pick<GameDisplay, 'kind' | 'home'>): string | null {
  if (display.kind !== 'scheduled') return null;
  const noted = game.venue.text?.startsWith('@ ') ? game.venue.text.slice(2).trim() : '';
  const named = game.venue.name ?? (noted || null);
  if (named) return `at ${named}`;
  return game.site === 'neutral' ? null : `at ${display.home.shortName}`;
}

/**
 * How a shootout was decided, for the note line: `Palo Alto wins shootout 3-2` when a tally is
 * stored, else the section's own words (`Corning wins on 1 v 1s`). null for every other game:
 * overtime needs no note, the status slot says `OT`.
 */
export function shootoutNote(game: Pick<Game, 'shootout'>, display: GameDisplay): string | null {
  const winner = display.home.weight === 'winner' ? display.home : display.away.weight === 'winner' ? display.away : null;
  if (!winner) return null;
  if (game.shootout) {
    const { home, away } = game.shootout;
    // 'wins shootout 3-2'; the soccer build's is 'wins on penalty kicks 3-2'.
    const how = SPORT_TIEBREAK_TAG === 'PK' ? 'on penalty kicks' : 'shootout';
    return `${winner.shortName} wins ${how} ${Math.max(home, away)}-${Math.min(home, away)}`;
  }
  if (display.deciderTag !== SPORT_TIEBREAK_TAG) return null;
  const how = (display.shootoutLabel ?? 'decided by a shootout').replace(/^decided /, '');
  return `${winner.shortName} wins ${how}`;
}

/** The second status line of a final: `OT`, `2 OT`, `SO` (soccer's `PK`), `F`. A stored shootout tally is `SO` too. */
function deciderWord(game: Pick<Game, 'shootout'>, display: Pick<GameDisplay, 'deciderTag'>): string | null {
  return display.deciderTag ?? (game.shootout ? SPORT_TIEBREAK_TAG : null);
}

/**
 * The status slot (`.sx-game-status`), the FIRST column of every row, in every state. Two lines
 * that sit on the two team lines:
 *
 *   upcoming   the start time (`TBD` when unset)      the date, when the list spans days (`showDate`)
 *   live       `Live` (red dot + red word)            —
 *   final      `Final`                                `OT` / `2 OT` / `SO` / `F`, then the date when asked
 *   off        `Postponed` (`PPD` at 320), `Canceled` (`CAN`), `No score` for an unreported final
 *
 * The † of a score from another source travels with the status. Decorative: the row's sentence
 * says all of it.
 */
export function GameStatus({
  game,
  display,
  showDate = false,
  extra,
  className,
}: {
  game: Game;
  display: GameDisplay;
  showDate?: boolean;
  /** One more second-line item (Home's ResultRow puts the competition here). */
  extra?: string;
  className?: string;
}) {
  const state = rowState(game, display);
  const second = [
    state === 'final' ? deciderWord(game, display) : null,
    showDate ? monthDay(game.dateLocal) : null,
    extra || null,
  ].filter(Boolean);
  const first =
    state === 'live' ? (
      <span className="sx-live">Live</span>
    ) : state === 'upcoming' ? (
      <span className="sx-num sx-game-time">{game.isTimeTba ? 'TBD' : statusWords(display)}</span>
    ) : state === 'final' ? (
      <span>Final</span>
    ) : display.kind === 'unreported' ? (
      <span>No score</span>
    ) : (
      <span>
        <span className="sx-long">{display.kind === 'cancelled' ? 'Canceled' : 'Postponed'}</span>
        <abbr className="sx-short" title={display.kind === 'cancelled' ? 'Canceled' : 'Postponed'}>
          {display.kind === 'cancelled' ? 'CAN' : 'PPD'}
        </abbr>
      </span>
    );
  return (
    <span className={['sx-game-status', className].filter(Boolean).join(' ')} aria-hidden="true">
      {first}
      {second.length > 0 || display.sourceMark !== null ? (
        <small>
          {second.join(' ')}
          <SourceMark display={display} />
        </small>
      ) : null}
    </span>
  );
}

/** A side's logo, or the ghost letters of a team this site does not follow. */
export function SideCrest({ side }: { side: SideView }) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return team ? (
    <TeamMonogram team={team} size={24} />
  ) : (
    <GhostMonogram name={side.name} size={24} title={NON_MEMBER_NOTE} />
  );
}

/**
 * @deprecated A row prints a name, its seed and the star, nothing else (DESIGN §33): the league of
 * a side from another league and a pre-game record are not drawn. Renders nothing; kept for callers.
 */
export function SideNotes(props: { side: SideView; showRecord?: boolean; scopeLeague?: LeagueId | null }) {
  void props;
  return null;
}

/** `data-won` for the winner: the name and the score are 700 (winner = weight, never a mark). */
export function wonAttr(side: Pick<SideView, 'weight'>): '' | undefined {
  return side.weight === 'winner' ? '' : undefined;
}

/** `data-lost` for the loser: the name 400 and the score 500, both `--sx-text-3`. A tie has neither. */
export function lostAttr(side: Pick<SideView, 'weight'>): '' | undefined {
  return side.weight === 'loser' ? '' : undefined;
}

/**
 * One side as one line: logo, name, and the score at the line's end. The two-column shape (Home's
 * ResultRow); GameRow lays the same pieces out in its own grid.
 */
export function TeamLine({
  side,
  showScore,
  monogram = true,
}: {
  side: SideView;
  /** @deprecated Seeds are printed by GameRow after the name. */
  seed?: number | null;
  showScore: boolean;
  /** @deprecated W/L marks are for team-perspective rows only (GameLogRow). */
  chipSlot?: boolean;
  /** false drops the logo (Home's ResultRow, held to a markup budget: SPEC §12.4). */
  monogram?: boolean;
  /** @deprecated Not drawn. */
  showRecord?: boolean;
  /** @deprecated Not drawn. */
  scopeLeague?: LeagueId | null;
}) {
  return (
    <span
      className="sx-game-team sx-pinnable"
      data-team-slug={side.slug ?? undefined}
      data-won={wonAttr(side)}
      data-lost={lostAttr(side)}
    >
      {monogram ? <SideCrest side={side} /> : null}
      {/* The dense row renders the SHORT name; `display.sentence` keeps the full name for a screen reader. */}
      <span className="sx-game-name">{side.shortName}</span>
      {showScore && side.hasScore ? <ScoreGlyph side={side} size="score" className="ml-auto pl-3" /> : null}
    </span>
  );
}

/** The lead column of a two-column summary row (Home's ResultRow): the status slot, the competition on its second line. */
export function SummaryLead({
  game,
  display,
  showDate = false,
  showChips = true,
}: {
  game: Game;
  display: GameDisplay;
  showDate?: boolean;
  /** @deprecated The status slot is the same whatever the game's state. */
  showTime?: boolean;
  showChips?: boolean;
}) {
  return (
    // A wrapper of its own: `.sx-game-status` names a grid area of GameRow's grid, which the host's grid does not have.
    <span className="flex min-w-0 flex-col self-start">
      <GameStatus game={game} display={display} showDate={showDate} extra={gameMetaText(display, showChips)} />
    </span>
  );
}

/** The two team lines of a summary row, away over home (Home's ResultRow). */
export function SummaryTeams({
  display,
  monogram = true,
}: {
  display: GameDisplay;
  /** @deprecated Not drawn. */
  showRecords?: boolean;
  /** @deprecated Not drawn. */
  scopeLeague?: LeagueId | null;
  monogram?: boolean;
  /** @deprecated Seeds are printed by GameRow after the name. */
  seeds?: { away: number | null; home: number | null };
}) {
  return (
    <span className="flex min-w-0 flex-col" aria-hidden="true">
      <TeamLine side={display.away} showScore={display.showScores} monogram={monogram} />
      <TeamLine side={display.home} showScore={display.showScores} monogram={monogram} />
    </span>
  );
}
