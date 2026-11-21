/**
 * The eight WCAL boys basketball seeds, 2026-27 (the basketball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=basketball`). Added with the WBAL, the PAL and the SCCAL at the owner's request (2026-11-21).
 *
 * Membership is the WCAL's own: the "West Catholic Athletic League 2026-27 Composite Varsity Boys Basketball Schedule"
 * linked from wcalsports.org/schedules/ has eight columns (AM, AR, BCP, JS, SHC, SF, SI, VC), read 2026-11-21
 * (lib/league-config/basketball/wcal.ts names it). The CCS's League Placement and Classification by Sport 2026-27
 * and MaxPreps' "West Catholic" boys basketball table (standings read 2026-11-21) hold the same eight.
 *
 * Six are the soccer registry's WCAL schools (lib/registry/soccer/wcal.ts), each that school's soccer seed on its
 * basketball page (lib/registry/basketball/from-soccer.ts). Bellarmine College Preparatory and Junípero Serra, boys'
 * schools, are new to the site: the id is MaxPreps' school id; the slug, short name and abbr are ours; the name,
 * mascot and city are each school's own row of its MaxPreps boys basketball schedule payload, the acronym its
 * `schoolNameAcronym` and the colors its `schoolColor1` / `schoolColor2` on the WCAL boys basketball standings, and
 * `maxprepsPath` that row's `teamCanonicalUrl` (all read 2026-11-21).
 *
 * No si.com or VNN ids: the basketball build reads neither.
 */

import { WCAL_SOCCER_SEEDS } from '../soccer/wcal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

const fromSoccer = (slugs: readonly string[]) => basketballSeedsOf(WCAL_SOCCER_SEEDS, 'wcal', slugs);

export const WCAL_BASKETBALL_SEEDS: readonly Seed[] = [
  ...fromSoccer(['mitty', 'riordan']),
  {
    id: '032ce3ae-f13d-47f2-ad35-57d995127648',
    slug: 'bellarmine',
    name: 'Bellarmine College Prep',
    shortName: 'Bellarmine',
    abbr: 'BE',
    acronym: 'BCP',
    mascot: 'Bells',
    city: 'San Jose',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['034CB2', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/bellarmine-college-prep-bells/basketball/',
    aliases: [
      'Bellarmine College Prep', 'BELLARMINE', 'Bellarmine', 'Bellarmine Bells',
      'Bellarmine College Preparatory', 'Bellarmine College Prep Bells',
    ],
  },
  {
    id: '16e16363-66d8-45af-b777-7820b3256850',
    slug: 'serra',
    name: 'Junípero Serra',
    shortName: 'Serra',
    abbr: 'JS',
    acronym: 'JSHS',
    mascot: 'Padres',
    city: 'San Mateo',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-mateo/junipero-serra-padres/basketball/',
    aliases: [
      'Junipero Serra', 'JUNIPERO SERRA', 'Serra', 'SERRA', 'Junipero Serra Padres', 'Junípero Serra High School',
      'Junipero Serra High School', 'Serra High School',
    ],
  },
  ...fromSoccer(['sacred-heart-cathedral', 'saint-francis', 'st-ignatius', 'valley-christian']),
];
