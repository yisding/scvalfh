/**
 * The normalized domain model (lib/model/): games, their sides, tags and provenance.
 */

import type { ContestId, DivisionId, LeagueId, OfficialSourceId, SourceId, TeamId, TeamSlug } from './ids';

// ---------- game ----------

export type GameStatus =
  /** contestState 2 */
  | 'scheduled'
  /**
   * contestState 3 — never observed. Rendered exactly like 'scheduled': the pages are static and
   * refreshed once or twice a day, so a LIVE label would be stale by the time anyone read it.
   */
  | 'live'
  /** contestState 4 */
  | 'final'
  /** contestState 5 ScoreNotReported */
  | 'score-pending'
  /** inferred from a /reschedul/i location note — [U] (SPEC §4 notes) */
  | 'postponed';
// NOTE: contestState 1 (Deleted) rows are DROPPED, never stored as a canceled game,
// because such rows can carry real scrimmage scores (SPEC §5.5.2).

export type Outcome = 'W' | 'L' | 'T';

/**
 * 'SO' = a level final that MaxPreps flags W/L between two teams of a SECTION whose `shootout` rule is set
 * (SectionConfig.shootout in lib/model/league-config.ts): the Northern Section's EAL (1 v 1s, NS
 * Guidelines §VII.E.4) and the San Diego Section (a 5-player shootout; the San Diego Field Hockey
 * Officials Association 2026 Mercy & Overtime Procedures credit the winner one goal, but MaxPreps often keeps the level score and
 * marks it W and L). Keyed on the section, not the league, because the San Diego rule covers every varsity
 * game in the Section, across its three conferences. `Game.shootout` may then be null (the tally is not
 * stored). The CCS, NCS and Southern Section leagues never produce it.
 */
export type Decider = 'REG' | 'OT' | '2OT' | 'SO' | 'FORFEIT';

export interface Record3 { w: number; l: number; t: number }

/** One side of a contest. `teamId` null ⇒ a non-SCVAL opponent, name only (SPEC §4 notes). */
export interface GameSide {
  teamId: TeamId | null;
  /** Our slug when this side is a registry member. */
  slug: TeamSlug | null;
  name: string;
  city?: string;
  /** null, never coerced to 0 (SPEC §5.5.3). */
  score: number | null;
  /** MaxPreps `teams[].result`; null before the game. */
  result: Outcome | null;
}

export interface GameVenue {
  /** `contest.location` — a NOTE field, not a venue field ("Senior Night", "Too be rescheduled"). */
  text: string | null;
  /** Only from a game page's ld+json Place. Fetched lazily, never in the sweep. */
  name?: string;
  address?: { street: string; city: string; region: string; postalCode: string };
}

/**
 * Why a game is postseason. A postseason game never counts for a table. (SCVAL classifies by contest-type: a
 * crossover or play-in is never same-division, and a same-division game tagged 'ccs' is excluded — lib/classify.ts.)
 */
export interface PostseasonTag {
  /**
   * 'mcal-tournament' is the tag of any league whose postseason.kind is 'league-tournament' (MCAL today); the
   * literal is kept for snapshot stability (lib/snapshot-schema.ts PostseasonTagSchema). lib/classify.ts assigns.
   * 'section-playoffs' is the San Diego Section's playoffs (DESIGN-socal §2.1.7): any game between two
   * teams of a section whose leagues' postseason.kind is 'section-playoffs', dated on or after the
   * leagues' `postseasonFrom` (Nov 2) or carrying contestType 4, whether or not the two share a conference;
   * one label for the whole tournament, never 'league-postseason'.
   */
  kind: 'scval-crossover' | 'bval-play-in' | 'mcal-tournament' | 'league-postseason' | 'section-playoffs' | 'ccs' | 'other';
  /**
   * Set for every league-scoped kind. 'ccs', 'other' and 'section-playoffs' may be null: no shared registry
   * league (a San Diego playoff game between two conferences has none).
   */
  leagueId: LeagueId | null;
  /**
   * 'section-postseason-window' = dated on or after the section-playoffs leagues' `postseasonFrom` (the
   * section-wide counterpart of 'league-postseason-window'); a contestType-4 row stays 'contest-type-4'.
   */
  via: 'config-pairing' | 'contest-type-4' | 'league-postseason-window' | 'section-postseason-window' | 'ccs-window';
}

/** Set when a contest matched a fixture in a league's official schedule. */
export interface OfficialStamp {
  /** The official date, YYYY-MM-DD. Differs from dateKey when the game moved. */
  scheduledDate: string;
  /** The FIXTURE's division — the classifier's evidence. */
  division: DivisionId;
  source: OfficialSourceId;
  /** OfficialFixture.id */
  fixtureId: string;
  pass: 'same-date' | 'same-date-swapped' | 'rescheduled';
}

/** How a si.com value entered a published game (owner decision D2, rules 2-4). */
export interface BackfillProvenance {
  rule: 'absent-fixture' | 'score-pending' | 'contradictory-result' | 'off-schedule-date' | 'phantom-tie';
  sbliveGameId: string;
  /** What MaxPreps said, when it said anything (rules 3-4). */
  maxpreps: { home: number; away: number } | null;
  /** One sentence, safe to render verbatim. */
  note: string;
}

export interface Game {
  contestId: ContestId;
  dateLocal: string;
  dateUtc: string;
  dateKey: string;
  isDateTba: boolean;
  isTimeTba: boolean;
  home: GameSide;
  away: GameSide;
  site: 'home' | 'away' | 'neutral';
  status: GameStatus;
  /** "What MaxPreps says": contestType === 0 on either row. Evidence for SCVAL only; never overwritten. */
  isLeague: boolean;
  /** Membership only: both sides are registry members of the SAME division. Necessary, not sufficient. */
  leagueDivision: DivisionId | null;
  /** NEW. Raw MaxPreps contestType per row (0 league, 1 non-league, 2 neutral/tournament, 4 postseason); null when unknown or si.com-only. */
  contestTypes: { home: number | null; away: number | null };
  /**
   * NEW. THE classification (lib/classify.ts classifyGame), for ANY status: the division whose table
   * this game belongs to. Standings count it once status === 'final'. Chips, filters and counts read it.
   */
  countsFor: DivisionId | null;
  /** NEW. Crossover, play-in, MCAL tournament, EAL Super Regional, San Diego Section playoff and CCS games. */
  postseason: PostseasonTag | null;
  otPeriods: number;
  isOt: boolean;
  isForfeit: boolean;
  forfeitBy: 'home' | 'away' | null;
  decider: Decider | null;
  /**
   * A tally, when one is stored (none today). An EAL 1 v 1 win, and a San Diego Section shootout win that
   * MaxPreps records as a level score marked W and L, have decider 'SO' and shootout null; MCAL tournament
   * shootouts are stored by MaxPreps as goals (see caveat copy).
   */
  shootout: { home: number; away: number } | null;
  venue: GameVenue;
  timeConfirmed?: boolean;
  /** WIDENED: any league's official schedule. */
  official?: OfficialStamp;
  urls: {
    maxpreps: string | null;
    sblive?: string;
    nfhsStream: string | null;
    goFan: string | null;
  };
  provenance: {
    /** 'sblive' when D2 published a si.com score. */
    scores: SourceId;
    schedule: SourceId;
    /** Plain disagreement (D2 rule 5) or the overridden MaxPreps value (rule 4). */
    scoreConflict?: { sblive: { home: number; away: number }; note: string };
    /** NEW. Set on every game whose published score came from si.com. */
    backfill?: BackfillProvenance;
    fetchedAt: string;
    maxprepsModifiedOn?: string;
    /**
     * When the pipeline last saw this game's published content change (ISO UTC, a run's `fetchedAt`):
     * set by lib/pipeline/steps/assemble.ts against the previous snapshot's copy of the game, every
     * field compared but the fetch stamps and MaxPreps' own `maxprepsModifiedOn` (lib/content-dates.ts
     * stampContentChanges). Absent on a game unchanged since the stamp was introduced. Read by the
     * sitemap's `lastmod`, never shown.
     */
    contentChangedAt?: string;
    leagueFlagConflict?: string;
    hostConflict?: string;
    /** NEW. D2 rule 4a evidence: result flags contradict the score, or the two rows disagree. */
    resultConflict?: string;
    /** NEW. Why a same-division game does NOT count (e.g. "Not on the official BVAL schedule; not counted"). */
    classificationNote?: string;
    /**
     * NEW. Set when DATA_QUALITY.contestDateOverrides (lib/leagues.ts) moved this contest off MaxPreps' date:
     * MaxPreps' own `dateLocal` and the override's source sentence, so the game page can say the date was
     * corrected, from what, and on whose word.
     */
    dateCorrection?: { maxprepsDateLocal: string; maxprepsTimeTba: boolean; source: string };
    /**
     * NEW. Set when MaxPreps records no overtime but the coach's game note says the game went to it
     * (lib/normalize.ts overtimeFromNote): the note, so the game page can say where the OT came from.
     */
    overtimeNote?: string;
  };
}
