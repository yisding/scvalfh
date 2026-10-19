/**
 * The normalized domain model (lib/model/): tiebreak stages, playoff statuses and standings rows.
 */

import type { Outcome, Record3 } from './game';
import type { DivisionId, TeamId, TeamSlug } from './ids';

// ---------- standings ----------

/** Each member is code in lib/engine/standings.ts. The ORDER of a chain is config (lib/config/leagues.ts). */
export type TiebreakStage =
  | 'points'                   // placed on points alone
  | 'head-to-head'             // SCVAL §3, BVAL §6b, PCAL §23.3 — SCVAL's original stage
  | 'division-wins'            // SCVAL §4, BVAL §6c
  | 'h2h-goals-against'        // SCVAL §5
  | 'h2h-goal-diff'            // SCVAL §6, BVAL §6d
  | 'division-goals-against'   // BVAL §6e — fewest goals allowed in ALL division games
  | 'record-vs-higher-placed'  // PCAL §23.3.3
  | 'record-vs-lower-placed'   // PCAL §23.3.1(b), §23.3.3(c)
  | 'h2h-win-pct'              // MCAL criterion 1
  | 'record-above-tie'         // MCAL criterion 2
  | 'draw-number'              // MCAL criterion 3 — lowest spring draw number wins; always resolves
  | 'ccs-points'               // PCAL — uncomputable terminal; teams stay level
  | 'coin-flip'                // SCVAL §7, BVAL §6f — uncomputable terminal; teams stay level
  | 'no-rule'                  // PCAL ties whose points bucket starts at 3rd or lower — no tiebreak; teams stay level
  | 'play-in';                 // MCAL last tournament place — a play-in decides it unless one team swept 2-0; teams stay level

/** Union over every league's ladder. Labels are per league (config), never global. */
export type PlayoffStatus =
  | 'aq'           // automatic CCS berth by place
  | 'play-in'      // SCVAL 4th (Oct 30); BVAL Mt. Hamilton 4th and Santa Teresa 1st (Oct 31)
  | 'at-large'     // SCVAL 5th: submitted to CCS for at-large consideration
  | 'out'          // SCVAL 6th+: "No automatic path" (the original SCVAL wording)
  | 'no-aq-route'  // BVAL/PCAL off the ladder: "No automatic-berth route" — never "eliminated"
  | 'bye'          // MCAL seeds 1-2
  | 'tournament'   // MCAL seeds 3-6; EAL places 1-6 (Super Regional); San Diego 1st (a designated league
                   //   champion is guaranteed at least a play-in, Green Book 2000.1)
  | 'below-line'   // MCAL 7th+
  | 'selection'    // San Diego 2nd+: no league route; the Section places teams from its power rankings
  | 'no-postseason'; // the Sunset, every place: the CIF Southern Section holds no field hockey playoffs

export interface ComputedRecord {
  gp: number;
  w: number;
  l: number;
  t: number;
  /** (w + t/2) / gp — CIF convention, asserted against MaxPreps (SPEC §5.6). 0 when gp === 0. */
  winPct: number;
  /** 3*w + 1*t — By-Laws Article VI §2. THE ordering key. */
  pts: number;
  gf: number;
  ga: number;
  gd: number;
  streak: { count: number; result: Outcome } | null;
  /** Oldest → newest, at most 5 (DESIGN §5.5). */
  last5: Outcome[];
  homeRecord: Record3;
  awayRecord: Record3;
  neutralRecord: Record3;
  /** 1-based. Teams sharing a place after §7 share the number. */
  place: number;
}

/** MaxPreps' own row, verbatim, for the published cross-check (DESIGN §9). */
export interface ReportedRecord {
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  overallWins: number;
  overallLosses: number;
  overallTies: number;
  conferencePoints: number;
  conferencePointsAgainst: number;
  points: number;
  pointsAgainst: number;
  conferenceContestsPlayed: number;
  overallContestsPlayed: number;
  conferenceStandingPlacement: number | null;
  conferenceWinningPercentage: number;
  winningPercentage: number;
  streak: number;
  streakResult: Outcome | null;
  homeWins: number; homeLosses: number; homeTies: number;
  awayWins: number; awayLosses: number; awayTies: number;
  neutralWins: number; neutralLosses: number; neutralTies: number;
  modifiedOn: string;
}

export interface TiebreakInfo {
  /** The Article VI step that placed this team. */
  resolvedBy: TiebreakStage;
  /** One sentence, citing the by-law, safe to render verbatim. */
  note: string;
  /** Other teams that share this exact place (empty unless `shared`). */
  tiedWith: TeamId[];
  /** true ⇒ Article VI §7 coin flip; render as tied, footnote it (ADDENDUM §7). */
  shared: boolean;
}

/** SHAPE UNCHANGED — only field types widen. Derived per-row facts live in lib/data.ts StandingContext. */
export interface Standing {
  teamId: TeamId;
  slug: TeamSlug;
  division: DivisionId;
  computed: ComputedRecord;
  overall: ComputedRecord;
  reported: ReportedRecord | null;
  mismatch: boolean;
  mismatchDetail?: string;
  tiebreak: TiebreakInfo;
  playoffStatus: PlayoffStatus;
  hasReportedResults: boolean;
}
