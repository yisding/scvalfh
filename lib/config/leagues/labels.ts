/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file (public): the words a league or a division goes by in copy (standalone names, the league with its
 * sport, standings links, division labels and headings). Built on the door's lookups, so it imports the door;
 * the door never imports it.
 */

import { getDivision, getLeague, isIndependentLeague, isSingleDivision, leagueOfDivision } from '@/lib/config/leagues';
import type { DivisionId, LeagueId } from '@/lib/model/ids';


/**
 * A league's words where its short name would stand alone as a control's target ('Jump to … ↓',
 * 'Show … here'): `LeagueConfig.standaloneName`, else the short name.
 */
export function standaloneName(id: LeagueId): string {
  const league = getLeague(id);
  return league.standaloneName ?? league.shortName;
}

/**
 * The league's name with the sport, for copy that says what a page covers: 'Santa Clara Valley Athletic
 * League girls varsity field hockey', but 'Sunset field hockey league, girls varsity', whose own name
 * already says the sport (never "… field hockey league girls varsity field hockey").
 */
export function leagueSportWords(id: LeagueId): string {
  const { name } = getLeague(id);
  return /field hockey/i.test(name) ? `${name}, girls varsity` : `${name} girls varsity field hockey`;
}

/** '<SHORT> standings' as a link's or a title's words ('LA standings' for the LA independents). */
export function standingsLabel(id: LeagueId): string {
  return `${getLeague(id).shortName} standings`;
}

/** 'De Anza' | 'Mt. Hamilton' | 'PCAL' | 'MCAL' | 'EAL' */
export function divisionLabel(id: DivisionId): string {
  return getDivision(id).label;
}

/** THE single gate for division labels: null for a single-division league. */
export function divisionHeading(id: DivisionId): string | null {
  const d = getDivision(id);
  return isSingleDivision(d.leagueId) ? null : d.label;
}

/** 'BVAL · Mt. Hamilton' | 'MCAL' | 'SCVAL · De Anza' */
export function divisionDisplay(id: DivisionId): string {
  const league = leagueOfDivision(id);
  const heading = divisionHeading(id);
  return heading === null ? league.shortName : `${league.shortName} · ${heading}`;
}

/**
 * A league's heading where a page lists leagues side by side: 'SCVAL — Santa Clara Valley Athletic
 * League', but a group of independents by its name alone ('LA independents'), because its short name
 * ('LA') is an adjective and not a league. One rule for /standings, /teams, /recruiting, /about and
 * /playoffs.
 */
export function leagueTitle(id: LeagueId): string {
  const league = getLeague(id);
  return league.independents === true ? league.name : `${league.shortName} — ${league.name}`;
}

/**
 * The league as a reader names it in a sentence about every table: its short name, but a group of
 * independents by its `standaloneName` ('the LA independents'; 'LA' alone names a place).
 */
export function readerName(id: LeagueId): string {
  return isIndependentLeague(id) ? standaloneName(id) : getLeague(id).shortName;
}

/** The teams a group of independents is configured for (its divisions' expected teams, summed). */
export function independentTeamCount(group: { divisions: readonly { expectedTeams: number }[] }): number {
  return group.divisions.reduce((n, d) => n + d.expectedTeams, 0);
}
