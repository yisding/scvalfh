/**
 * Which of the other sport sites cover a school, so its team page can link to its pages there
 * (components/teams/TeamOtherSports.tsx). A school is covered by a sport when that sport's registry
 * (lib/registry/, lib/registry/<sport>/) holds a seed with its MaxPreps id: a team id is the school's id in every
 * sport (docs/MULTI-SPORT.md, "Schools"), and every registry team has a team page in its sport's build. The link
 * uses the other registry's own slug, so it is right even if a school's slug ever differs between sports.
 *
 * Server-only: it reads every sport's registry.
 */

import { BVAL_SEEDS } from '../registry/bval';
import { CITY_SEEDS } from '../registry/city';
import { EAL_SEEDS } from '../registry/eal';
import { INDEPENDENTS_SEEDS } from '../registry/independents';
import { MCAL_SEEDS } from '../registry/mcal';
import { METRO_SEEDS } from '../registry/metro';
import { NORTH_COUNTY_SEEDS } from '../registry/north-county';
import { PCAL_SEEDS } from '../registry/pcal';
import { SCVAL_SEEDS } from '../registry/scval';
import { SUNSET_SEEDS } from '../registry/sunset';
import { BVAL_BASKETBALL_SEEDS } from '../registry/basketball/bval';
import { PAL_BASKETBALL_SEEDS } from '../registry/basketball/pal';
import { PCAL_BASKETBALL_SEEDS } from '../registry/basketball/pcal';
import { PSAL_BASKETBALL_SEEDS } from '../registry/basketball/psal';
import { SCCAL_BASKETBALL_SEEDS } from '../registry/basketball/sccal';
import { SCVAL_BASKETBALL_SEEDS } from '../registry/basketball/scval';
import { WBAL_BASKETBALL_SEEDS } from '../registry/basketball/wbal';
import { WCAL_BASKETBALL_SEEDS } from '../registry/basketball/wcal';
import { BVAL_SOCCER_SEEDS } from '../registry/soccer/bval';
import { PAL_SOCCER_SEEDS } from '../registry/soccer/pal';
import { PCAL_SOCCER_SEEDS } from '../registry/soccer/pcal';
import { PSAL_SOCCER_SEEDS } from '../registry/soccer/psal';
import { SCCAL_SOCCER_SEEDS } from '../registry/soccer/sccal';
import { SCVAL_SOCCER_SEEDS } from '../registry/soccer/scval';
import { WBAL_SOCCER_SEEDS } from '../registry/soccer/wbal';
import { WCAL_SOCCER_SEEDS } from '../registry/soccer/wcal';
import { BVAL_VOLLEYBALL_SEEDS } from '../registry/volleyball/bval';
import { SCVAL_VOLLEYBALL_SEEDS } from '../registry/volleyball/scval';
import { WBAL_VOLLEYBALL_SEEDS } from '../registry/volleyball/wbal';
import { WCAL_VOLLEYBALL_SEEDS } from '../registry/volleyball/wcal';
import type { Seed } from '../registry/seed';
import { VAL_SOCCER_SEEDS } from '../registry/val-soccer/val';
import { SPORT_ID, SPORT_IDS, type SportId } from '../sports/current';
import { SPORT_SITE_ORIGINS, programTitle } from '../sports/sites';
import type { TeamId, TeamSlug } from '../types';

/** Every sport's registry seeds, whatever this build's sport is. */
export const SEEDS_BY_SPORT: Readonly<Record<SportId, readonly Seed[]>> = {
  'field-hockey': [
    ...SCVAL_SEEDS,
    ...BVAL_SEEDS,
    ...PCAL_SEEDS,
    ...MCAL_SEEDS,
    ...EAL_SEEDS,
    ...SUNSET_SEEDS,
    ...CITY_SEEDS,
    ...NORTH_COUNTY_SEEDS,
    ...METRO_SEEDS,
    ...INDEPENDENTS_SEEDS,
  ],
  // Every league of each winter build (the PAL, the SCCAL, the PCAL and the PSAL since 2026-11-25 here, and the
  // WCAL and the WBAL in basketball), so a field hockey PCAL school links its soccer and basketball pages.
  soccer: [
    ...SCVAL_SOCCER_SEEDS, ...BVAL_SOCCER_SEEDS, ...WCAL_SOCCER_SEEDS, ...WBAL_SOCCER_SEEDS, ...PAL_SOCCER_SEEDS,
    ...SCCAL_SOCCER_SEEDS, ...PCAL_SOCCER_SEEDS, ...PSAL_SOCCER_SEEDS,
  ],
  basketball: [
    ...SCVAL_BASKETBALL_SEEDS, ...BVAL_BASKETBALL_SEEDS, ...WCAL_BASKETBALL_SEEDS, ...WBAL_BASKETBALL_SEEDS,
    ...PAL_BASKETBALL_SEEDS, ...SCCAL_BASKETBALL_SEEDS, ...PCAL_BASKETBALL_SEEDS, ...PSAL_BASKETBALL_SEEDS,
  ],
  volleyball: [...SCVAL_VOLLEYBALL_SEEDS, ...BVAL_VOLLEYBALL_SEEDS, ...WCAL_VOLLEYBALL_SEEDS, ...WBAL_VOLLEYBALL_SEEDS],
  // Middle schools: ids of our own (`val-<slug>`), so no high school site's team is ever taken for one of them.
  'val-soccer': VAL_SOCCER_SEEDS,
};

const SLUG_BY_SPORT: ReadonlyMap<SportId, ReadonlyMap<TeamId, TeamSlug>> = new Map(
  SPORT_IDS.map((id) => [id, new Map(SEEDS_BY_SPORT[id].map((s) => [s.id, s.slug]))]),
);

export interface OtherSportTeam {
  sport: SportId;
  /** The program's title: 'Girls Soccer'. */
  title: string;
  /** The school's team page on that sport's site: 'https://soccer.ncfh.net/teams/lynbrook'. */
  href: string;
}

/** The school's team pages on the other sport sites, in SPORT_IDS order; empty when no other sport covers it. */
export function otherSportTeams(teamId: TeamId): OtherSportTeam[] {
  return SPORT_IDS.flatMap((sport) => {
    const origin = SPORT_SITE_ORIGINS[sport];
    if (sport === SPORT_ID || origin === null) return [];
    const slug = SLUG_BY_SPORT.get(sport)?.get(teamId);
    return slug ? [{ sport, title: programTitle(sport), href: `${origin}/teams/${slug}` }] : [];
  });
}
