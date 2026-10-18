/**
 * The normalized domain model (lib/model/): the published cross-checks (MaxPreps, si.com, cifsshome.org).
 */

import type { BackfillProvenance, GameStatus } from './game';
import type { ContestId, TeamSlug } from './ids';

// ---------- cross-checks ----------

export interface CrossCheckRow {
  slug: TeamSlug;
  field: string;
  ours: string;
  theirs: string;
  url: string;
  /** NEW. The division's known reason this table differs (DivisionConfig.knownCause). */
  knownCause?: string;
}

/** Plain disagreement (D2 rule 5): MaxPreps stays. */
export interface ScoreConflictRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", using our display names. */
  label: string;
  /** What we publish. MaxPreps is never overwritten. */
  maxpreps: { home: number; away: number };
  sblive: { home: number; away: number };
  /** false ⇒ the two SBLive names could not be matched to our home/away slots. */
  aligned: boolean;
  maxprepsUrl: string | null;
  sbliveUrl: string | null;
  note: string;
}
/** A si.com-only score that D2 did NOT publish, and why. */
export interface SbliveOnlyRow {
  contestId: ContestId;
  dateKey: string;
  label: string;
  sblive: { home: number; away: number };
  aligned: boolean;
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
  status: GameStatus;
  note: string;
}

/** NEW. One si.com value D2 published or used to override MaxPreps. */
export interface BackfillRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", our display names. */
  label: string;
  rule: BackfillProvenance['rule'];
  sblive: { home: number; away: number };
  maxpreps: { home: number; away: number } | null;
  sbliveUrl: string;
  maxprepsUrl: string | null;
  note: string;
}

export interface SbliveCrossCheck {
  sbliveFetchedAt: string;
  compared: number;
  agreements: number;
  conflicts: ScoreConflictRow[];
  sbliveOnlyScored: SbliveOnlyRow[];
  /** NEW. Every si.com value D2 published (rules 2-4), with both values and the rule. */
  backfilled: BackfillRow[];
}

/** A game cifsshome.org and MaxPreps both score, with different numbers. MaxPreps' score stands. */
export interface CifssConflictRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", our display names. */
  label: string;
  maxpreps: { home: number; away: number };
  /** Aligned to MaxPreps' home and away teams. */
  cifss: { home: number; away: number };
  /** The widget's date for the game (MaxPreps' `dateKey` can be up to three days away). */
  cifssDateKey: string;
  maxprepsUrl: string | null;
  /** The widget listing of that Section on that date. */
  cifssUrl: string;
  note: string;
}

/**
 * A cifsshome.org score MaxPreps does not have: either MaxPreps lists the game with no score
 * (`contestId` is its contest), or MaxPreps has no contest for the pair within three days of the date
 * (`contestId` is `cifss:<row id>`). Never published as a result.
 */
export interface CifssOnlyRow {
  contestId: string;
  dateKey: string;
  label: string;
  /** Aligned to MaxPreps' home and away when MaxPreps lists the game; the widget's own otherwise. */
  cifss: { home: number; away: number };
  /** The two sides' lib/registry/resolve.ts sideJoinKey, `a~b` sorted: how a later run tells whether MaxPreps has the game yet. */
  pairKey: string;
  /** The widget's date for the game. */
  cifssDateKey: string;
  maxprepsUrl: string | null;
  cifssUrl: string;
  note: string;
}

/**
 * The cifsshome.org score cross-check: every scored widget row with one of our teams, season to
 * date, joined to MaxPreps on (date, unordered pair), or the pair's nearest game within three days.
 */
export interface CifssCrossCheck {
  /** The run that read the widget (season start through that run's local date). */
  cifssFetchedAt: string;
  /** Games both sources score: `agreements + conflicts.length`. */
  compared: number;
  agreements: number;
  conflicts: CifssConflictRow[];
  /** Games MaxPreps lists with no score yet. */
  cifssOnlyScored: CifssOnlyRow[];
  /** Games MaxPreps has no contest for (nor a deleted or dropped one). */
  notOnMaxPreps: CifssOnlyRow[];
}
