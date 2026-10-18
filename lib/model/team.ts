/**
 * The normalized domain model (lib/model/): a registry team as the snapshot stores it.
 */

import type { DivisionId, LeagueId, SectionId, TeamId, TeamSlug } from './ids';

// ---------- team ----------

export interface TeamColors {
  /** hex, no '#' */
  primary: string;
  secondary: string;
  /** Ink that clears AA on `primary`, computed at build (DESIGN §12.4). */
  onPrimary: '#0e1116' | '#ffffff';
  /** 'placeholder' when no upstream row exists. */
  source: 'maxpreps-standings' | 'placeholder';
}

export interface TeamExternalIds {
  maxprepsTeamId: TeamId;
  maxprepsTeamUrl: string | null;
  maxprepsScheduleUrl: string | null;
  /** numeric si.com TEAM id, e.g. "458850". Never guessed. */
  sbliveTeamId?: string;
  /** NEW. numeric si.com SCHOOL id from a logo URL `/uploads/production/school/{id}/`. Never guessed. */
  sbliveSchoolId?: string;
  sbliveGamesUrl?: string;
  vnnSiteId?: string;
  vnnIcsUrl?: string;
}

export interface Team {
  id: TeamId;
  slug: TeamSlug;
  /**
   * The school's one canonical full name, everywhere the site names it in full: the name people
   * use, without "High School" or "College Preparatory" ('St. Ignatius', 'Archbishop Mitty').
   * Source spellings ('ST. IGNATIUS', 'MItty', 'Presentation HS') are aliases, never shown.
   */
  name: string;
  /**
   * The one canonical short name (≤ 16 characters), for rows and tiles too narrow for `name`: the
   * name the school goes by ('Mitty', 'Sobrato', 'Convent', 'SF University'). It is `name` itself,
   * whole words of it, or one of the school's aliases (a spelling a source uses), never a made-up
   * abbreviation; enforced at load (lib/teams.ts). Display only: resolution never keys on it.
   */
  shortName: string;
  /** 2 letters, unique across the whole registry (102 teams). */
  abbr: string;
  /** MaxPreps `schoolNameAcronym`. Display only: NOT unique; indexed for resolution only when unique. */
  acronym: string;
  mascot: string;
  city: string;
  /** Globally unambiguous spellings only. League-grid codes live in LeagueConfig.officialCodes. */
  aliases: string[];
  /**
   * The section of the team's field hockey league (where its field hockey postseason is held), not
   * necessarily the school's CIF membership: Davis and Bella Vista are Sac-Joaquin Section schools in
   * the Northern Section's EAL.
   */
  section: SectionId;
  /** NEW — replaces `isScvalMember: true`. */
  league: LeagueId;
  division: DivisionId;
  /** 'none' = in the league's official alignment, absent from every data source. */
  dataCoverage: 'full' | 'partial' | 'none';
  colors: TeamColors;
  mascotUrl: string | null;
  external: TeamExternalIds;
}
