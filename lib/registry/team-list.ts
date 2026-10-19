/**
 * The registry's teams: every seed made a Team (`toTeam`), assembled in LEAGUES order
 * (lib/config/leagues.ts), with the by-id and by-slug lookups over them. Private to the package: read
 * TEAMS and the lookups through the door, lib/registry/teams.ts. The seeds stay private to this module.
 */

import { LEAGUES } from '@/lib/config/leagues';
import { MAXPREPS_WEB, SBLIVE_WEB } from '@/lib/config/source-urls';
import type { GameSide } from '@/lib/model/game';
import type { DivisionId, LeagueId, TeamId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';

import { BVAL_SEEDS } from './bval';
import { CITY_SEEDS } from './city';
import { EAL_SEEDS } from './eal';
import { INDEPENDENTS_SEEDS } from './independents';
import { onPrimaryInk } from './ink';
import { MCAL_SEEDS } from './mcal';
import { METRO_SEEDS } from './metro';
import { NORTH_COUNTY_SEEDS } from './north-county';
import { PCAL_SEEDS } from './pcal';
import { SCVAL_SEEDS } from './scval';
import type { Seed } from './seed';
import { SUNSET_SEEDS } from './sunset';

const VNN = 'https://mmboltapi.azurewebsites.net/api/v2/events/calendar';

function toTeam(s: Seed): Team {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    shortName: s.shortName,
    abbr: s.abbr,
    acronym: s.acronym,
    mascot: s.mascot,
    city: s.city,
    aliases: s.aliases,
    section: s.section,
    league: s.league,
    division: s.division,
    dataCoverage: s.dataCoverage,
    colors: {
      primary: s.colors[0],
      secondary: s.colors[1],
      onPrimary: onPrimaryInk(s.colors[0]),
      source: s.colorSource,
    },
    // The mascot gif is deliberately not read: no hotlinking (DESIGN §12.4).
    mascotUrl: null,
    external: {
      maxprepsTeamId: s.id,
      maxprepsTeamUrl: s.maxprepsPath ? MAXPREPS_WEB + s.maxprepsPath : null,
      maxprepsScheduleUrl: s.maxprepsPath ? `${MAXPREPS_WEB + s.maxprepsPath}schedule/` : null,
      ...(s.sbliveTeamId ? { sbliveTeamId: s.sbliveTeamId } : {}),
      ...(s.sbliveSchoolId ? { sbliveSchoolId: s.sbliveSchoolId } : {}),
      ...(s.sbliveSlug ? { sbliveGamesUrl: `${SBLIVE_WEB}/teams/${s.sbliveSlug}/games` } : {}),
      ...(s.vnnSiteId
        ? { vnnSiteId: s.vnnSiteId, vnnIcsUrl: `${VNN}/${s.vnnSiteId}/0/calendar.ics` }
        : {}),
    },
  };
}

const SEEDS_BY_LEAGUE: Readonly<Record<LeagueId, readonly Seed[]>> = {
  scval: SCVAL_SEEDS,
  bval: BVAL_SEEDS,
  pcal: PCAL_SEEDS,
  mcal: MCAL_SEEDS,
  eal: EAL_SEEDS,
  sunset: SUNSET_SEEDS,
  city: CITY_SEEDS,
  'north-county': NORTH_COUNTY_SEEDS,
  metro: METRO_SEEDS,
  independents: INDEPENDENTS_SEEDS,
};

/** The registry (102), in LEAGUES order; within a league, the seed file's order. */
export const TEAMS: readonly Team[] = LEAGUES.flatMap((l) => SEEDS_BY_LEAGUE[l.id] ?? []).map(toTeam);

/** Teams whose games MaxPreps actually publishes — one schedule request each (all 102 today). */
export const FETCHABLE_TEAMS: readonly Team[] = TEAMS.filter(
  (t) => t.dataCoverage !== 'none',
);

const BY_ID = new Map<string, Team>(TEAMS.map((t) => [t.id, t]));
const BY_SLUG = new Map<string, Team>(TEAMS.map((t) => [t.slug, t]));

export function getTeamById(id: TeamId): Team | undefined {
  return BY_ID.get(id);
}

export function getTeamBySlug(slug: string): Team | undefined {
  return BY_SLUG.get(slug);
}

/**
 * A registry team's short name ("Mitty" on a 358px card, never "Archbishop Mitty High School"), by slug
 * or by MaxPreps GUID (the two never collide: ids are GUIDs, slugs are ours and kebab-case); anyone the
 * registry does not hold is the `fallback`, the name as the source printed it. `null` (a side with no
 * slug) is the fallback too. The one lookup behind every "short name of this side" in the copy.
 */
export function teamShortName(slugOrId: string | null | undefined, fallback: string): string {
  const team = slugOrId ? (BY_SLUG.get(slugOrId) ?? BY_ID.get(slugOrId as TeamId)) : undefined;
  return team ? team.shortName : fallback;
}

/** A game side by its registry short name, else the name the source gave it (by slug, like the page copy). */
export function sideShortName(side: Pick<GameSide, 'name' | 'slug'>): string {
  return teamShortName(side.slug, side.name);
}

/** The registry team on one side of a game: by MaxPreps GUID first, then by slug. */
export function teamOfSide(side: Pick<GameSide, 'teamId' | 'slug'>): Team | undefined {
  return (side.teamId ? BY_ID.get(side.teamId) : undefined) ?? (side.slug ? BY_SLUG.get(side.slug) : undefined);
}

export function teamsInDivision(division: DivisionId): readonly Team[] {
  return TEAMS.filter((t) => t.division === division);
}

export function teamsInLeague(leagueId: LeagueId): readonly Team[] {
  return TEAMS.filter((t) => t.league === leagueId);
}
