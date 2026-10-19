/**
 * Sections, regions and leagues as the site lists them (SPEC §13.3): one summary per league with its
 * divisions' team counts, the region → section → league tree, the teams grouped the same way, and each
 * league's data health.
 */

import { LEAGUES, REGIONS, SECTIONS, getSection } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { getSnapshot } from '@/lib/datasets/snapshot';
import type { LeagueHealth } from '@/lib/model/health';
import type { DivisionId, LeagueId, RegionId, SectionId } from '@/lib/model/ids';
import type { LeagueConfig, RegionConfig, SectionConfig } from '@/lib/model/league-config';
import type { Team } from '@/lib/model/team';
import { getTeams } from './teams';

const snapshot = getSnapshot();

// ---------------------------------------------------------------- sections and leagues

export interface LeagueSummary {
  id: LeagueId;
  name: string;
  shortName: string;
  /** NorCal or SoCal: the league's section's region (DESIGN-socal §2.1.1), for the region switcher and wrappers. */
  region: RegionId;
  /** Plain words for the league card ('Chico, Corning, Susanville, Davis and Fair Oaks'): LeagueConfig.cities. */
  cities: string;
  section: { id: SectionId; name: string; shortName: SectionConfig['shortName'] };
  singleDivision: boolean;
  divisions: Array<{ id: DivisionId; label: string; heading: string | null; teamCount: number }>;
  teamCount: number;
  officialUrl: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}

function summaryOf(league: LeagueConfig): LeagueSummary {
  const section = getSection(league.sectionId);
  const divisions = league.divisions.map((d) => ({
    id: d.id,
    label: d.label,
    heading: divisionHeading(d.id),
    teamCount: getTeams(d.id).length,
  }));
  return {
    id: league.id,
    name: league.name,
    shortName: league.shortName,
    region: section.region,
    cities: league.cities,
    section: { id: section.id, name: section.name, shortName: section.shortName },
    singleDivision: league.divisions.length === 1,
    divisions,
    teamCount: divisions.reduce((n, d) => n + d.teamCount, 0),
    officialUrl: league.officialUrl,
    links: league.links,
  };
}

const SUMMARIES: LeagueSummary[] = LEAGUES.map(summaryOf);

/**
 * One summary per league, config order (scval, bval, pcal, mcal, eal, sunset, city, north-county, metro), or
 * one region's (LEAGUES lists NorCal first, so each region's run keeps config order).
 */
export function getLeagueSummaries(region?: RegionId): LeagueSummary[] {
  return region ? SUMMARIES.filter((s) => s.region === region) : SUMMARIES;
}

/** One region of the site (DESIGN-socal §2.4): its sections, each with its leagues' summaries, config order. */
export interface RegionSummary {
  region: RegionConfig;
  sections: Array<{ section: SectionConfig; leagues: LeagueSummary[] }>;
  /** The region's registry teams (NorCal 49, SoCal 50). */
  teamCount: number;
}

/**
 * Regions → sections → leagues, config order (NorCal, then SoCal): what a page that renders each region in
 * its own wrapper (the region switcher's two halves) iterates. Every region has a section and every section a
 * league (lib/config/leagues.ts asserts both), so nothing here is empty.
 */
export function getRegionSummaries(): RegionSummary[] {
  return REGIONS.map((region) => {
    const sections = SECTIONS.filter((s) => s.region === region.id).map((section) => ({
      section: section as SectionConfig,
      leagues: SUMMARIES.filter((l) => l.section.id === section.id),
    }));
    return {
      region,
      sections,
      teamCount: sections.reduce((n, s) => n + s.leagues.reduce((m, l) => m + l.teamCount, 0), 0),
    };
  });
}

export function getLeagueSummary(id: string): LeagueSummary | undefined {
  return SUMMARIES.find((s) => s.id === id);
}

export function getLeagueHealth(id: LeagueId): LeagueHealth {
  const row = snapshot.leagueHealth.find((h) => h.leagueId === id);
  if (!row) throw new Error(`lib/queries/leagues.ts: no leagueHealth row for ${id}`);
  return row;
}

/** Section → league → division → teams, config order, for /teams; `region` keeps one region's sections. */
export function getTeamsGrouped(region?: RegionId): Array<{
  section: SectionConfig;
  leagues: Array<{
    league: LeagueSummary;
    divisions: Array<{ id: DivisionId; heading: string | null; teams: readonly Team[] }>;
  }>;
}> {
  return SECTIONS.filter((section) => !region || section.region === region).map((section) => ({
    section,
    leagues: SUMMARIES.filter((s) => s.section.id === section.id).map((league) => ({
      league,
      divisions: league.divisions.map((d) => ({ id: d.id, heading: d.heading, teams: getTeams(d.id) })),
    })),
  })).filter((g) => g.leagues.length > 0);
}
