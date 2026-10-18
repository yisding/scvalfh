/**
 * The normalized domain model (lib/model/): the season (sections, leagues, divisions, windows) and its phases.
 */

import type { DivisionId, LeagueId, SectionId } from './ids';

// ---------- season ----------

export interface SeasonWindow {
  /** min dateLocal over the games in scope. */
  firstGame: string | null;
  /**
   * Global window: max dateLocal where `isLeague` (the original single-league semantics, unchanged).
   * League window: max dateLocal where `countsFor` is one of the league's divisions (any status).
   */
  lastLeagueGame: string | null;
  /** max dateLocal over the games in scope. */
  lastGame: string | null;
}

export interface SeasonSection {
  id: SectionId;
  name: string;                       // 'Central Coast Section'
  maxprepsSectionId: string;
  holdsFieldHockeyChampionship: boolean;
}

export interface SeasonDivision {
  id: DivisionId;
  /** Our UI label ('De Anza', 'Mt. Hamilton', 'PCAL', 'MCAL', 'EAL'). MaxPreps' own name is NOT stored. */
  label: string;
  /**
   * MaxPreps' league GUID for this division's table, copied from config. null where MaxPreps publishes no
   * table for the division (the San Diego Section's Valley: its six teams all sit in MaxPreps' zero-GUID
   * "no league", inventory 2026-10-06), so the pipeline requests nothing for it.
   */
  maxprepsLeagueId: string | null;
}

/**
 * Every LeagueConfig['postseason']['kind'] (lib/model/league-config.ts), as the snapshot stores it.
 * 'no-postseason' is the Sunset (the CIF Southern Section holds no field hockey playoffs: Blue Book
 * 2026-27 Bylaws 2011.1 and 3500.2); 'section-playoffs' is the three San Diego Section leagues (the
 * Section's own Open/I/II playoffs, placed from its power rankings: Green Book 2026-27 Bylaw 2000.1).
 */
export type PostseasonKind =
  | 'ccs-ladder' | 'league-tournament' | 'unbracketed-tournament' | 'no-postseason' | 'section-playoffs';

export interface SeasonLeague {
  id: LeagueId;
  sectionId: SectionId;
  name: string;                       // 'Blossom Valley Athletic League'
  shortName: string;                  // 'BVAL'
  divisions: SeasonDivision[];
  /** NEW. Copied from config (LEAGUES[].postseason.kind) and validated against it (checkAgainstConfig #6). Lets scripts read the tournament leagues from the snapshot. */
  postseasonKind: PostseasonKind;
  /**
   * Over games with at least one registry side in this league AND `postseason === null` (crossover, play-in,
   * MCAL tournament and CCS games never extend it). Drives this league's phase.
   */
  window: SeasonWindow;
}

export interface Season {
  /** "26-27" */
  year: string;
  label: string;
  sportSeasonId: string;
  allSeasonId: string;
  genderSport: 'girls,fieldhockey';
  teamLevel: 'Varsity' | 'JV';
  /** Config order: ccs, ncs, ns, ss, sds. */
  sections: SeasonSection[];
  /** Config order: scval, bval, pcal, mcal, eal, sunset, city, north-county, metro. */
  leagues: SeasonLeague[];
  /** Global window over every kept contest — the original single-league semantics, unchanged. */
  window: SeasonWindow;
}

export type SeasonPhase =
  | 'preseason'
  | 'regular'
  | 'crossover'     // SCVAL only
  | 'play-in'       // BVAL only (Oct 31)
  | 'tournament'    // MCAL (Oct 23-30), EAL (Oct 29-31), San Diego Section playoffs (Nov 2-14)
  | 'playoffs'      // CCS bracket window (CCS leagues only)
  | 'complete';
