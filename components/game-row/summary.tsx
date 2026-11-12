import { getStandingFor } from '../../lib/data';
import { monthDay, recordString, recordWords } from '../../lib/format';
import { TEAMS, getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, Record3 } from '../../lib/types';

import GhostMonogram from '../ui/GhostMonogram';
import { ScoreGlyph } from '../ui/ScoreGlyph';
import { SourceMark, statusCase } from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { otherLeagueSuffix, type GameDisplay, type SideView } from '../ui/describe-game';

/*
 * The pieces a game row is built from (DESIGN §33): the status cell, a side's crest, name and
 * footnotes, the one meta item, and the sr-only sentences for the game's kind and the records.
 * GameRow renders them in its own grid; `SummaryLead`, `SummaryTeams` and `TeamLine` are the same
 * pieces in the two-column shape Home's ResultRow still lays out.
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
 * The ONE meta item of a row: the seed line of a bracket game (`7 v 2`), else its round
 * (`SCVAL crossover`), else the word `Non-league`; '' for a league game, whose heading already says
 * it. `showChips` false (a bracket, where every game is the same kind) leaves only the seed line.
 */
export function gameMetaText(
  display: Pick<GameDisplay, 'postseasonTag' | 'isNonLeague'>,
  showChips: boolean,
  seeds?: { away: number | null; home: number | null },
): string {
  if (seeds && seeds.away !== null && seeds.home !== null) return `${seeds.away} v ${seeds.home}`;
  if (!showChips) return '';
  return display.postseasonTag ?? (display.isNonLeague ? 'Non-league' : '');
}

/**
 * The status cell (`.sx-game-status`): the status word, and in its `<small>` the decider (`OT`,
 * `SO`, `F`), a shootout tally, the † of a score from another source, and the date when asked.
 * Decorative: the row's sentence says all of it.
 */
export function GameStatus({
  game,
  display,
  showDate = false,
  className,
}: {
  game: Game;
  display: GameDisplay;
  showDate?: boolean;
  className?: string;
}) {
  const small = [display.deciderTag, display.shootoutText, showDate ? monthDay(game.dateLocal) : null].filter(Boolean);
  return (
    <span className={['sx-game-status', className].filter(Boolean).join(' ')} aria-hidden="true">
      {statusWords(display)}
      {small.length > 0 || display.sourceMark !== null ? (
        <small>
          {small.join(' ')}
          <SourceMark display={display} />
        </small>
      ) : null}
    </span>
  );
}

/** A side's crest: the school's mascot tile, or the ghost letters of a team this site does not follow. */
export function SideCrest({ side }: { side: SideView }) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return team ? (
    <TeamMonogram team={team} size={24} />
  ) : (
    <GhostMonogram name={side.name} size={24} title={NON_MEMBER_NOTE} />
  );
}

/**
 * What follows a side's name in 13px ink-3: its bracket seed is NOT here (the meta carries the seed
 * line); the league of a side from another league on a league-scoped list (`SCVAL`), and its league
 * record before a league game (`1-4-0`, already gated by the row). A counted game never has a side
 * from another league, so the two never stack.
 */
export function SideNotes({
  side,
  showRecord = false,
  scopeLeague,
}: {
  side: SideView;
  showRecord?: boolean;
  scopeLeague?: LeagueId | null;
}) {
  const league = otherLeagueSuffix(side.slug, scopeLeague).replace(/^ · /, '');
  const record = showRecord ? leagueRecord(side) : null;
  if (!league && !record) return null;
  return (
    <span className="sx-game-sub">
      {league}
      {record ? <span className="sx-num">{record}</span> : null}
    </span>
  );
}

/** `data-won` for the winner: the name is 700 and the score 800 (winner = weight, never a mark). */
export function wonAttr(side: Pick<SideView, 'weight'>): '' | undefined {
  return side.weight === 'winner' ? '' : undefined;
}

/**
 * One side as one line: crest, name, footnotes, and the score at the line's end. The two-column
 * shape (Home's ResultRow); GameRow lays the same pieces out in its own grid. The pinned team's name
 * takes the highlighter (`sx-pinnable` + `data-team-slug`).
 */
export function TeamLine({
  side,
  showScore,
  monogram = true,
  showRecord = false,
  scopeLeague,
}: {
  side: SideView;
  /** @deprecated The meta carries the seed line (`7 v 2`). */
  seed?: number | null;
  showScore: boolean;
  /** @deprecated W/L marks are for team-perspective rows only (GameLogRow). */
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
  return (
    <span className="sx-game-team sx-pinnable" data-team-slug={side.slug ?? undefined} data-won={wonAttr(side)}>
      {monogram ? <SideCrest side={side} /> : null}
      {/* The dense row renders the SHORT name; `display.sentence` keeps the full name for a screen reader. */}
      <span className="sx-game-name">{side.shortName}</span>
      <SideNotes side={side} showRecord={showRecord} scopeLeague={scopeLeague} />
      {showScore ? <ScoreGlyph side={side} size="score" className="ml-auto pl-3" /> : null}
    </span>
  );
}

/**
 * The lead column of a two-column summary row (Home's ResultRow): the status cell, with the row's
 * one meta item under it.
 */
export function SummaryLead({
  game,
  display,
  showDate = false,
  showChips = true,
}: {
  game: Game;
  display: GameDisplay;
  showDate?: boolean;
  /** @deprecated The status cell is one line whatever the game's state. */
  showTime?: boolean;
  showChips?: boolean;
}) {
  const meta = gameMetaText(display, showChips);
  return (
    <span className="flex min-w-0 flex-col" aria-hidden="true">
      {/* `self-start`: the cell centres itself in GameRow's grid; in this column that would centre it sideways. */}
      <GameStatus game={game} display={display} showDate={showDate} className="self-start" />
      {meta ? <span className="sx-game-meta">{meta}</span> : null}
    </span>
  );
}

/** The two team lines of a summary row, away over home (Home's ResultRow). */
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
  /** @deprecated The meta carries the seed line. */
  seeds?: { away: number | null; home: number | null };
}) {
  return (
    <span className="flex min-w-0 flex-col" aria-hidden="true">
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
