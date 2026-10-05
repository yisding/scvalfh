/**
 * The pure display helper behind StatusLabel, GameRow, GameCard, GameLogRow and ScoreBoard.
 *
 * DESIGN §5.2 is a table of eleven rows; this module is the single place that table is
 * implemented, and tests/ui/render-score.test.ts walks every row of it. Nothing in
 * components/ PRINTS `game.home.score` / `game.away.score`: every printed score comes from
 * `renderScore()` in lib/format.ts (directly, or through `describeGame()`), and every glyph from
 * `scoreGlyph()`. The raw reads that remain are null-guarded comparisons and arithmetic that
 * print no score: the level check in game-view's `resultConflictNoteFor` and its
 * `isOneGoalFinal`, day-summary's headline-game margin and leaders-view's goal totals.
 *
 * Deviation from DESIGN §5.2 worth knowing: the data model has no `cancelled` status, because
 * MaxPreps contestState 1 (Deleted) rows are dropped rather than stored (SPEC §5.5.2). The
 * cancelled branch below is therefore reachable only if a future source adds the status; it is
 * kept so the §5.2 table stays implemented end to end.
 */

import { EN_DASH, MINUS, renderScore, scoreGlyph, scoreSentence, timeOfDay } from '../../lib/format';
import { findDivision, findLeague, leagueOfDivision } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, Outcome, PostseasonTag, ScoreView, TeamSlug } from '../../lib/types';

/** The chip a side or a row carries. `none` = no chip at all (a scheduled game). */
export type ChipKind = Outcome | 'pending' | 'cancelled' | 'postponed' | 'none';

export type StatusTone = 'ink' | 'ink-2' | 'ink-3' | 'accent';

export interface SideView {
  name: string;
  /**
   * The registry's short name for one of the teams this site follows ("Mitty", "St Ignatius"), and the source
   * name unchanged for everyone else. A dense row — a game list, a bracket — renders this, because
   * the row gives the name roughly 120px once the score and the status label have taken their
   * share and "Archbishop Mitty High School" truncates to "Archbish…". The full name stays on the
   * side view for a page that has room for it, and in `sentence`, which is what a screen reader
   * hears.
   */
  shortName: string;
  slug: TeamSlug | null;
  /** '7', a genuine '0', or an en dash. Never coerced (DESIGN §5.3). */
  glyph: string;
  /** false ⇒ the glyph is the en dash and carries an sr-only "score not reported". */
  hasScore: boolean;
  /** Winner-by-weight is the fourth redundant channel (DESIGN §6.5, R-19). */
  weight: 'winner' | 'loser' | 'level';
  chip: ChipKind;
}

export interface GameDisplay {
  kind: ScoreView['kind'] | 'cancelled';
  /** FINAL · LIVE · SCORE NOT REPORTED · POSTPONED · CANCELLED · '5:30 PM' · TIME TBA */
  statusLabel: string;
  statusTone: StatusTone;
  /** The body sentence under a row that needs one, e.g. the unreported promise. */
  note: string | null;
  /** Mono superscript tags after the score: 'OT', '2 OT', 'SO', 'F'. */
  deciderTag: string | null;
  /** '(4–3 SO)' — never produced by this league (By-Laws Article IV) but modelled. */
  shootoutText: string | null;
  /**
   * Non-league carries the word, a 2px rule and (in MarginStrip) an outline column. From
   * `countsFor` (SPEC §10.4): a game that counts for no division table and is not a postseason
   * game. A postseason game carries `postseasonTag` instead.
   */
  isNonLeague: boolean;
  /** The league chip (`SCVAL`, `BVAL`, …) of a counted game: the league of `countsFor`. null otherwise. */
  leagueTag: string | null;
  /**
   * `SCVAL crossover` · `BVAL play-in` · `MCAL tournament` · `EAL Super Regional` · `CCS` when
   * `postseason` is set.
   */
  postseasonTag: string | null;
  /** 'si.com' when D2 published si.com's score (`provenance.scores === 'sblive'`): the † marker. */
  sourceMark: 'si.com' | null;
  /** A forfeit is excluded from GF/GA/GD and from MarginStrip; the row prints a dagger. */
  isForfeit: boolean;
  /** true ⇒ render the two score cells. false ⇒ the time/label takes the column. */
  showScores: boolean;
  /** Only the TIME is struck through on a cancelled game; names never are. */
  strikeTime: boolean;
  /** LIVE gets an 8px accent dot, a pulse, and the words "scheduled window". */
  liveDot: boolean;
  home: SideView;
  away: SideView;
  /** 'vs' | 'at' from `perspective`'s point of view; null when there is no perspective. */
  versus: 'vs' | 'at' | null;
  /** The result from `perspective`'s side, for a form chip or a game-log row. */
  perspectiveOutcome: Outcome | null;
  /** One screen-reader sentence for the whole score (DESIGN §10.6). */
  sentence: string;
}

const UNREPORTED_NOTE = 'We will update when MaxPreps posts it.';

/** The word after the league's short name in a postseason chip; `ccs` is the section's own chip. */
const POSTSEASON_WORD: Readonly<Record<PostseasonTag['kind'], string | null>> = {
  'scval-crossover': 'crossover',
  'bval-play-in': 'play-in',
  'mcal-tournament': 'tournament',
  // The fallback word; an unbracketed league's tag names its event instead (postseasonTagOf).
  'league-postseason': 'postseason',
  ccs: null,
  other: null,
};

/**
 * ` · SCVAL` after a side from a league other than the list's own (`scopeLeague`); '' otherwise,
 * and '' for a side outside the registry or a list with no league of its own. The one rule behind
 * GameRow's and LatestScores' cross-league names.
 */
export function otherLeagueSuffix(slug: TeamSlug | null, scopeLeague: LeagueId | null | undefined): string {
  if (!scopeLeague || !slug) return '';
  const team = getTeamBySlug(slug);
  if (!team || team.league === scopeLeague) return '';
  const league = findLeague(team.league);
  return league ? ` · ${league.shortName}` : '';
}

/** The league chip of a counted game (`countsFor` → its league's short name). */
function leagueTagOf(game: Pick<Game, 'countsFor'>): string | null {
  if (game.countsFor === null) return null;
  const division = findDivision(game.countsFor);
  return division ? (findLeague(division.leagueId)?.shortName ?? null) : null;
}

/**
 * `SCVAL crossover`, `BVAL play-in`, `MCAL tournament`, `EAL Super Regional`, `CCS`; null for no
 * or an unnamed postseason.
 */
export function postseasonTagOf(game: Pick<Game, 'postseason'>): string | null {
  const tag = game.postseason;
  if (!tag) return null;
  if (tag.kind === 'ccs') return 'CCS';
  const word = POSTSEASON_WORD[tag.kind];
  if (!word) return null;
  // Every league kind carries its league (lib/classify.ts postseasonTag); only 'ccs' and 'other' may not.
  if (tag.leagueId === null) return null;
  const league = findLeague(tag.leagueId);
  if (!league) return null;
  // An unbracketed league's postseason has a name of its own ('EAL Super Regional').
  if (tag.kind === 'league-postseason' && league.postseason.kind === 'unbracketed-tournament') {
    return `${league.shortName} ${league.postseason.name}`;
  }
  return `${league.shortName} ${word}`;
}

/** The three kinds of game the site tells apart (SPEC §10.4). */
export type GameKind = 'league' | 'postseason' | 'non-league';

/**
 * What kind of game this is (SPEC §10.4): `league` when it counts for a division table
 * (`countsFor`), else `postseason` when it carries a postseason tag, else `non-league`. The one
 * definition of the split; `isNonLeague` below and every count of league, postseason and
 * non-league games read it.
 */
export function gameKind(game: Pick<Game, 'countsFor' | 'postseason'>): GameKind {
  if (game.countsFor !== null) return 'league';
  return game.postseason !== null ? 'postseason' : 'non-league';
}

const GAME_KIND_LABEL: Readonly<Record<GameKind, 'League' | 'Postseason' | 'Non-league'>> = {
  league: 'League',
  postseason: 'Postseason',
  'non-league': 'Non-league',
};

/**
 * The one word for what kind of game this is, as the team page's Last and Next headers print it
 * (SPEC §10.4): `League` for a counted game, `Postseason` for a tagged one, `Non-league` otherwise.
 */
export function gameKindLabel(game: Pick<Game, 'countsFor' | 'postseason'>): 'League' | 'Postseason' | 'Non-league' {
  return GAME_KIND_LABEL[gameKind(game)];
}

function chipsFor(game: Game): Pick<GameDisplay, 'isNonLeague' | 'leagueTag' | 'postseasonTag' | 'sourceMark'> {
  return {
    isNonLeague: gameKind(game) === 'non-league',
    leagueTag: leagueTagOf(game),
    postseasonTag: postseasonTagOf(game),
    sourceMark: game.provenance.scores === 'sblive' ? 'si.com' : null,
  };
}
const LIVE_NOTE = 'A scheduled window, not a running score — we do not collect live scores.';

/**
 * true when MaxPreps' overtime count cannot be right for the game's league: a counted game in a
 * league that plays one overtime period and then 1 v 1s (`leagueOvertime` 'shootout', the EAL)
 * with more than one overtime period recorded. MaxPreps may have stored a 1 v 1 win as a goal, so
 * the view shows the score as MaxPreps has it with no overtime tag and no "after overtime".
 */
export function overtimeInDoubt(game: Game): boolean {
  if (game.countsFor === null || game.otPeriods <= 1) return false;
  const division = findDivision(game.countsFor);
  return division !== undefined && leagueOfDivision(division.id).rules.leagueOvertime === 'shootout';
}

function deciderTagFor(game: Game): string | null {
  if (game.isForfeit || game.decider === 'FORFEIT') return 'F';
  // A 1 v 1 win with no stored tally; a game with a tally prints it as `shootoutText` instead.
  if (game.decider === 'SO') return game.shootout ? null : 'SO';
  if (overtimeInDoubt(game)) return null;
  if (game.decider === '2OT') return '2 OT';
  if (game.decider === 'OT') return 'OT';
  return null;
}

function sideView(
  name: string,
  slug: TeamSlug | null,
  score: number | null,
  weight: SideView['weight'],
  chip: ChipKind,
): SideView {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return {
    name,
    shortName: team?.shortName ?? name,
    slug,
    glyph: scoreGlyph(score),
    hasScore: score !== null,
    weight,
    chip,
  };
}

/**
 * Everything a game row needs in order to render, derived once. `perspective` is one of our
 * team slugs; it orients "vs / at" and the W/L/T without changing the away-on-top layout.
 */
export function describeGame(game: Game, perspective?: TeamSlug | null): GameDisplay {
  const view = renderScore(game);
  const isForfeit = game.isForfeit;
  const mineIsHome = perspective ? game.home.slug === perspective : null;
  const versus: GameDisplay['versus'] =
    mineIsHome === null ? null : game.site === 'neutral' ? 'vs' : mineIsHome ? 'vs' : 'at';

  const base = {
    note: null as string | null,
    deciderTag: null as string | null,
    shootoutText: null as string | null,
    ...chipsFor(game),
    isForfeit,
    strikeTime: false,
    liveDot: false,
    versus,
    sentence: scoreSentence(game, { quietOvertime: overtimeInDoubt(game) }),
  };

  switch (view.kind) {
    case 'final': {
      const homeWon = view.outcome === 'W';
      const awayWon = view.outcome === 'L';
      const tie = view.outcome === 'T';
      const homeChip: ChipKind = tie ? 'T' : homeWon ? 'W' : 'L';
      const awayChip: ChipKind = tie ? 'T' : awayWon ? 'W' : 'L';
      const perspectiveOutcome: Outcome | null =
        mineIsHome === null
          ? null
          : tie
            ? 'T'
            : mineIsHome === homeWon
              ? 'W'
              : 'L';
      return {
        ...base,
        kind: 'final',
        statusLabel: 'FINAL',
        statusTone: 'ink-3',
        deciderTag: deciderTagFor(game),
        shootoutText: view.shootout
          ? `(${view.shootout.home}${EN_DASH}${view.shootout.away} SO)`
          : null,
        showScores: true,
        home: sideView(
          game.home.name,
          game.home.slug,
          view.home,
          tie ? 'level' : homeWon ? 'winner' : 'loser',
          homeChip,
        ),
        away: sideView(
          game.away.name,
          game.away.slug,
          view.away,
          tie ? 'level' : awayWon ? 'winner' : 'loser',
          awayChip,
        ),
        perspectiveOutcome,
      };
    }
    case 'unreported':
      return {
        ...base,
        kind: 'unreported',
        statusLabel: 'SCORE NOT REPORTED',
        statusTone: 'ink-3',
        note: UNREPORTED_NOTE,
        showScores: true, // two en dashes, never two zeroes
        home: sideView(game.home.name, game.home.slug, null, 'level', 'pending'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'pending'),
        perspectiveOutcome: null,
      };
    case 'live':
      return {
        ...base,
        kind: 'live',
        statusLabel: 'LIVE',
        statusTone: 'accent',
        note: LIVE_NOTE,
        liveDot: true,
        showScores: false,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'none'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'none'),
        perspectiveOutcome: null,
      };
    case 'postponed':
      return {
        ...base,
        kind: 'postponed',
        statusLabel: 'POSTPONED',
        statusTone: 'ink-3',
        note: view.newDate ? null : 'A new date has not been posted.',
        showScores: false,
        strikeTime: true,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'postponed'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'postponed'),
        perspectiveOutcome: null,
      };
    case 'scheduled':
      return {
        ...base,
        kind: 'scheduled',
        statusLabel: view.time ?? 'TIME TBA',
        statusTone: 'ink-2',
        showScores: false,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'none'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'none'),
        perspectiveOutcome: null,
      };
  }
}

/**
 * The §5.2 "cancelled" row. The status does not exist in the snapshot today (contestState 1 rows
 * are dropped), so this is reached only through an explicit call — it keeps the table complete
 * and gives /about#conventions something true to document.
 */
export function describeCancelled(game: Game, note: string | null = null): GameDisplay {
  return {
    kind: 'cancelled',
    statusLabel: 'CANCELLED',
    statusTone: 'ink-3',
    note,
    deciderTag: null,
    shootoutText: null,
    ...chipsFor(game),
    sourceMark: null,
    isForfeit: false,
    showScores: false,
    strikeTime: true,
    liveDot: false,
    home: sideView(game.home.name, game.home.slug, null, 'level', 'cancelled'),
    away: sideView(game.away.name, game.away.slug, null, 'level', 'cancelled'),
    versus: game.site === 'neutral' ? 'vs' : null,
    perspectiveOutcome: null,
    sentence: `${game.away.name} versus ${game.home.name}: cancelled.`,
  };
}

/**
 * true when a game's status label IS its own clock time ("4:00 PM", "TIME TBA") — every
 * scheduled game. A row, a card, a log line or the scoreboard that already prints the time then
 * has nothing left to say in the status slot but the NL tag; printing the label as well read
 * "3:30 PM … 3:30 PM". One definition, so GameRow, GameCard, GameLogRow and ScoreBoard cannot
 * drift apart on what counts as "a time".
 */
export function statusLabelIsTime(game: Game, statusLabel: string): boolean {
  return (
    statusLabel === 'TIME TBA' || (!game.isTimeTba && statusLabel === timeOfDay(game.dateLocal))
  );
}

/** '+3' / '−7' / '0' for a per-game margin. */
export function signedMargin(margin: number): string {
  if (margin === 0) return '0';
  return margin > 0 ? `+${margin}` : `${MINUS}${Math.abs(margin)}`;
}
