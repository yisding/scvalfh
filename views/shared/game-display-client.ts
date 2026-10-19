/**
 * The shapes describeGame() returns (views/shared/describe-game.ts), on their own so a client
 * component can name them without importing the describer: describe-game reads the league config
 * and the registry, which must never reach a phone (tests/arch/client-boundary.test.ts). TYPES
 * ONLY: this module imports nothing but types from lib/model and lib/format (layers rule h,
 * tests/arch/layers.test.ts), so it vanishes at compile time.
 */

import type { ScoreView } from '@/lib/format/score';
import type { Outcome } from '@/lib/model/game';
import type { TeamSlug } from '@/lib/model/ids';

/** The chip a side or a row carries. `none` = no chip at all (a scheduled game). */
export type ChipKind = Outcome | 'pending' | 'cancelled' | 'postponed' | 'none';

export type StatusTone = 'ink' | 'ink-2' | 'ink-3';

export interface SideView {
  name: string;
  /**
   * The registry's short name for one of the teams this site follows ("Mitty", "Sobrato"), and the source
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
  /** FINAL · SCORE NOT REPORTED · POSTPONED · CANCELLED · '5:30 PM' · TIME TBA */
  statusLabel: string;
  statusTone: StatusTone;
  /** The body sentence under a row that needs one, e.g. the unreported promise. */
  note: string | null;
  /**
   * Mono superscript tags after the score: 'OT', '2 OT', 'SO', 'F'. 'SO' is a shootout win in a section
   * whose shootouts are verified (SectionConfig.shootout.inference 'verified': the EAL's 1 v 1s). A San
   * Diego Section level final MaxPreps marks W and L carries no tag: no source confirms a shootout decided
   * it, so the row shows the level score and the W/L chips, and the sentence says the win is credited.
   */
  deciderTag: string | null;
  /**
   * The words a screen reader hears for an 'SO' `deciderTag`, in the words of the section whose rule
   * decided the game (SectionConfig.shootout.words through `shootoutPhrases(…).decidedOn`): 'decided
   * on 1 v 1s' for an EAL game (the Northern Section's 1 v 1s, the string StatusLabel has always
   * read). Resolved here, on the server, because StatusLabel is client-safe and cannot read the
   * registry; the home My-team card carries it through its slim marks. null whenever `deciderTag` is not
   * 'SO', so null for every San Diego Section game (its inference is 'unverified').
   */
  shootoutLabel: string | null;
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
   * `SCVAL crossover` · `BVAL play-in` · `MCAL tournament` · `EAL Super Regional` · `San Diego Section
   * playoffs` · `CCS` when `postseason` is set.
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
  home: SideView;
  away: SideView;
  /** 'vs' | 'at' from `perspective`'s point of view; null when there is no perspective. */
  versus: 'vs' | 'at' | null;
  /** The result from `perspective`'s side, for a form chip or a game-log row. */
  perspectiveOutcome: Outcome | null;
  /** One screen-reader sentence for the whole score (DESIGN §10.6). */
  sentence: string;
}

/** The three kinds of game the site tells apart (SPEC §10.4). */
export type GameKind = 'league' | 'postseason' | 'non-league';
