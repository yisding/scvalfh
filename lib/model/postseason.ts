/**
 * The normalized domain model (lib/model/): the CCS playoffs block and the league postseason projections.
 */

import type { Game } from './game';
import type { CcsDivisionName, DivisionId, LeagueId, TeamId, TeamSlug } from './ids';
import type { PlayoffStatus } from './standings';

// ---------- CCS playoffs (the snapshot key stays `playoffs`) ----------

export interface CcsKeyDates {
  entriesDue: string;          // '2026-11-02T12:00:00'
  seedingMeeting: string;      // '2026-11-02T13:00:00'
  quarterfinals: string;       // '2026-11-07'
  semifinals: string;          // '2026-11-11'
  finals: string;              // '2026-11-14'
  evaluationMeeting: string;   // '2026-11-19T16:00:00'
  /** NEW: CCS end of league season. `crossover` MOVED to LEAGUES.scval (pairings + phases). */
  endOfLeagueSeason: string;   // '2026-10-31'
}

/** Numbers only. Keys = every league whose postseason.kind is 'ccs-ladder', plus atLarge and total. */
export interface CcsAutoQualifiers {
  [leagueId: string]: number;
  atLarge: number;
  total: number;
}

/** One VEVENT from `cifccs.org/calendar/Field_Hockey?print=ical` (SPEC §1.4). */
export type CcsEventKind =
  | 'entries-due'
  | 'quarterfinals'
  | 'semifinals'
  | 'finals'
  | 'evaluation'
  | 'other';

export interface CcsCalendarEvent {
  /** YYYY-MM-DD — these are all-day VEVENTs. */
  date: string;
  /** SUMMARY with the feed's "(Field Hockey) " prefix stripped. */
  summary: string;
  kind: CcsEventKind;
  uid: string | null;
  /** DESCRIPTION, which carries the clock time ("12:00 noon", "4:00 pm"). */
  detail: string | null;
}

export interface CcsPlayoffs {
  keyDates: CcsKeyDates;
  ccsCalendar?: CcsCalendarEvent[];
  keyDatesConfirmed?: boolean;
  format: {
    elimination: 'single';
    /** RENAMED from `divisions`. */
    ccsDivisions: Array<{ name: CcsDivisionName; seeds: [number, number] }>;
    autoQualifiers: CcsAutoQualifiers;
    highSeedHostsThrough: 'semifinals';
  };
  bracketPublished: boolean;
  bracketUrl: string;
  games: Game[];
}

// ---------- league postseason projections (derived in lib/data.ts, never stored) ----------

/** Who can take one seat. Empty = TBD; 2+ = a level place spans the seat (all are named). */
export type CrossoverSeat = Array<{ teamId: TeamId; slug: TeamSlug }>;

/** SCVAL crossover (×4) and BVAL play-in (×1): one generic, config-driven shape. */
export interface LeaguePairing {
  id: string;                          // 'scval-crossover-1' … 'scval-crossover-4', 'bval-play-in'
  leagueId: LeagueId;
  date: string;                        // YYYY-MM-DD
  time: string | null;                 // '11:00' (BVAL); null (SCVAL)
  seats: [CrossoverSeat, CrossoverSeat];
  seatLabels: [string, string];        // ['De Anza #4', 'El Camino #4'] | ['Santa Teresa #1', 'Mt. Hamilton #4']
  /** Index of the hosting seat; null = not stated (SCVAL crossover). BVAL: 0. */
  host: 0 | 1 | null;
  isPlayIn: boolean;
  label: string;
  /** The contest once MaxPreps has it (postseason tag + seat teams on the pairing date). */
  game: Game | null;
}

export interface LadderRow {
  teamId: TeamId;
  slug: TeamSlug;
  place: number;
  /** statuses[0] */
  status: PlayoffStatus;
  /** Every status still open, best first; >1 only when a level place straddles a rung boundary. */
  statuses: PlayoffStatus[];
  /** Written words from the league's ladder; 'No results reported' for a team without results. */
  label: string;
  shared: boolean;
}

/** Per CCS league. */
export interface PlayoffProjection {
  asOf: string;
  leagueId: LeagueId;
  /** { auto: autoQualifiers[league], total: 16 } */
  berths: { auto: number; total: number };
  byDivision: Record<DivisionId, LadderRow[]>;
  /** SCVAL: 4 crossover pairings; BVAL: the play-in; PCAL: []. */
  pairings: LeaguePairing[];
}

export type TournamentSlot =
  | { kind: 'seed'; seed: number; seat: CrossoverSeat }
  | { kind: 'winner-of'; gameId: TournamentGame['id']; label: string }
  | { kind: 'rule'; text: string };    // e.g. 'Lowest-ranked remaining seed'

export interface TournamentGame {
  id: 'play-in' | 'qf-1' | 'qf-2' | 'sf-1' | 'sf-2' | 'final';
  round: 'play-in' | 'quarterfinal' | 'semifinal' | 'final';
  date: string;
  time: string;                        // '16:00'
  home: TournamentSlot;
  away: TournamentSlot;
  /** 'Tamalpais' for the final (fixed site); null = the home seat's field. */
  site: string | null;
  /** The matched MCAL postseason contest, once it exists. */
  game: Game | null;
  /** e.g. the shootout caveat on a one-goal tournament result. */
  note: string | null;
}

export interface LeagueTournamentProjection {
  leagueId: LeagueId;
  asOf: string;
  status: 'projected' | 'seeded' | 'in-progress' | 'complete';
  /** Seeds 1..6; a seat with >1 contender = an unresolved 6th-place play-in or an undefined tie. */
  seeds: Array<{ seed: number; seat: CrossoverSeat }>;
  playInNeeded: 'no' | 'yes' | 'possible';
  playIn: TournamentGame | null;
  games: TournamentGame[];             // qf-1, qf-2, sf-1, sf-2, final (play-in is separate)
  notes: string[];
}
