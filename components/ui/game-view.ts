/**
 * The pure display helper behind ScoreCell, StatusLabel, GameRow, GameCard and ScoreBoard.
 *
 * DESIGN §5.2 is a table of eleven rows; this module is the single place that table is
 * implemented, and tests/ui/render-score.test.ts walks every row of it. Nothing in
 * components/ reads `game.home.score` / `game.away.score` directly — every score comes through
 * `renderScore()` in lib/format.ts, and every glyph through `scoreGlyph()`.
 *
 * Deviation from DESIGN §5.2 worth knowing: the data model has no `cancelled` status, because
 * MaxPreps contestState 1 (Deleted) rows are dropped rather than stored (SPEC §5.5.2). The
 * cancelled branch below is therefore reachable only if a future source adds the status; it is
 * kept so the §5.2 table stays implemented end to end.
 */

import { EN_DASH, MINUS, renderScore, scoreGlyph, scoreSentence, timeOfDay } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, Outcome, ScoreView, TeamSlug } from '../../lib/types';

/** The chip a side or a row carries. `none` = no chip at all (a scheduled game). */
export type ChipKind = Outcome | 'pending' | 'cancelled' | 'postponed' | 'none';

export type StatusTone = 'ink' | 'ink-2' | 'ink-3' | 'accent';

export interface SideView {
  name: string;
  /**
   * The registry's short name for one of our 16 schools ("Mitty", "St Ignatius"), and the source
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
  /** Mono superscript tags after the score: 'OT', '2 OT', 'F'. */
  deciderTag: string | null;
  /** '(4–3 SO)' — never produced by this league (By-Laws Article IV) but modelled. */
  shootoutText: string | null;
  /** Non-league carries the word, a 2px rule and (in MarginStrip) an outline column. */
  isNonLeague: boolean;
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
const LIVE_NOTE = 'A scheduled window, not a running score — we do not collect live scores.';

function deciderTagFor(game: Game): string | null {
  if (game.isForfeit || game.decider === 'FORFEIT') return 'F';
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
  const isNonLeague = !game.isLeague;
  const isForfeit = game.isForfeit;
  const mineIsHome = perspective ? game.home.slug === perspective : null;
  const versus: GameDisplay['versus'] =
    mineIsHome === null ? null : game.site === 'neutral' ? 'vs' : mineIsHome ? 'vs' : 'at';

  const base = {
    note: null as string | null,
    deciderTag: null as string | null,
    shootoutText: null as string | null,
    isNonLeague,
    isForfeit,
    strikeTime: false,
    liveDot: false,
    versus,
    sentence: scoreSentence(game),
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
    isNonLeague: !game.isLeague,
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

/** 'Tue 5:30 PM' style label for a scheduled row, or 'TIME TBA'. */
export function scheduledTime(game: Game): string {
  return game.isTimeTba ? 'TIME TBA' : timeOfDay(game.dateLocal);
}

/** '+3' / '−7' / '0' for a per-game margin. */
export function signedMargin(margin: number): string {
  if (margin === 0) return '0';
  return margin > 0 ? `+${margin}` : `${MINUS}${Math.abs(margin)}`;
}
