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
 * si.com: each school's boys basketball team (`basketballSeedsOf`'s third argument: team id, the `<id>-<slug>` of its
 * games page and the school id in `team.school`), read 2026-11-21 from si.com's WCAL boys basketball standings and
 * each team's own games page; never guessed. No VNN site ids (the school calendars are read for field hockey only).
 */

import { WCAL_SOCCER_SEEDS } from '../soccer/wcal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

const fromSoccer = (teams: Parameters<typeof basketballSeedsOf>[2]) => basketballSeedsOf(WCAL_SOCCER_SEEDS, 'wcal', teams);

export const WCAL_BASKETBALL_SEEDS: readonly Seed[] = [
  ...fromSoccer({
    mitty: { teamId: '120604', slug: '120604-archbishop-mitty-monarchs', schoolId: '31718' },
    riordan: { teamId: '141033', slug: '141033-archbishop-riordan-crusaders', schoolId: '159' },
  }),
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
    sbliveTeamId: '147281',
    sbliveSlug: '147281-bellarmine-college-prep-bells',
    sbliveSchoolId: '2826',
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
    sbliveTeamId: '141046',
    sbliveSlug: '141046-serra-padres',
    sbliveSchoolId: '162',
    aliases: [
      'Junipero Serra', 'JUNIPERO SERRA', 'Serra', 'SERRA', 'Junipero Serra Padres', 'Junípero Serra High School',
      'Junipero Serra High School', 'Serra High School',
    ],
  },
  ...fromSoccer({
    'sacred-heart-cathedral': { teamId: '141034', slug: '141034-sacred-heart-cathedral-preparatory-fightin-irish', schoolId: '160' },
    'saint-francis': { teamId: '147264', slug: '147264-saint-francis-lancers', schoolId: '2822' },
    'st-ignatius': { teamId: '120490', slug: '120490-st-ignatius-wildcats', schoolId: '161' },
    'valley-christian': { teamId: '141411', slug: '141411-valley-christian-warriors', schoolId: '319' },
  }),
];
