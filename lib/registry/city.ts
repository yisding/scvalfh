/**
 * The 12 City Conference seeds (CIF San Diego Section: City Western 6, City Eastern 6), transcribed
 * by script from tests/fixtures/seeds/registry-seed-sds.json (verified 2026-10-06; checked field by
 * field by tests/registry-seeds.test.ts). Seed order is alphabetical within each division.
 *
 * Membership is the Section's 2026-27 League Alignment workbook. MaxPreps' City - Eastern table
 * omits Patrick Henry, whose City Eastern games MaxPreps does not mark as league games, and lists
 * Madison, which has no 2026 varsity game on MaxPreps (LEAGUES city withdrawnNames and
 * maxprepsExtraRows). Mission Bay also plays City Eastern teams in games MaxPreps marks as league
 * games; those count in neither division's table.
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload. Colours come from
 * the MaxPreps standings row, else (commented per team) from team-context's
 * schoolColor1/schoolColor2: the same MaxPreps school-colour fields, equal for all 34 SoCal teams
 * that have both. Those carry colorSource 'maxpreps-standings', as Prospect's do, because the only
 * other value, 'placeholder', means invented colours. si.com team ids, slugs and school ids were
 * harvested from si.com league and team pages on 2026-10-06, never guessed; si.com's league buckets
 * are stale (it files Patrick Henry under City Western) and are never membership evidence.
 */

import type { Seed } from './seed';

export const CITY_SEEDS: readonly Seed[] = [
  // ----- City Western (6) -----
  {
    id: '9d14d198-9976-4ed2-872d-047b9f317035',
    slug: 'bishops',
    name: "Bishop's",
    shortName: "Bishop's",
    abbr: 'BI',
    acronym: 'BHS',
    mascot: 'Knights',
    city: 'La Jolla',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['8F0018', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/la-jolla/bishops-knights/field-hockey/',
    aliases: [
      "Bishop's", "BISHOP'S", "Bishop's Knights", 'Bishops', "The Bishop's School", "Bishop's School",
      'Bishops Knights', "Bishop's (La Jolla)",
    ],
    sbliveTeamId: '456843',
    sbliveSlug: '456843-bishops-knights',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '201',
  },
  {
    id: '5bcd4caa-2727-404f-8ea0-627dc9d0b1b1',
    slug: 'canyon-hills',
    name: 'Canyon Hills',
    shortName: 'Canyon Hills',
    // 'CN': CH is Christopher's.
    abbr: 'CN',
    acronym: 'CHHS',
    // MaxPreps writes 'Rattlers ' with a trailing space; trimmed.
    mascot: 'Rattlers',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['222222', 'CC0022'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/canyon-hills-rattlers/field-hockey/',
    aliases: [
      'Canyon Hills', 'CANYON HILLS', 'Canyon Hills High School', 'Canyon Hills Rattlers',
      'Canyon Hills (San Diego)',
    ],
    sbliveTeamId: '459034',
    sbliveSlug: '459034-canyon-hills-rattlers',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12931',
  },
  {
    id: '15c34e49-1a29-4298-8a84-00a2ec6ae36b',
    slug: 'cathedral-catholic',
    name: 'Cathedral Catholic',
    // Whole words of the name. Bare 'Cathedral' is deliberately not an alias: Cathedral (Los Angeles) and
    // Cathedral City (si.com 458908) are statewide namesakes.
    shortName: 'Cathedral',
    abbr: 'CC',
    acronym: 'CCHS',
    mascot: 'Dons',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['CC0022', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/cathedral-catholic-dons/field-hockey/',
    aliases: [
      'Cathedral Catholic', 'CATHEDRAL CATHOLIC', 'Cathedral Catholic High School', 'Cathedral Catholic Dons',
      'Cathedral Catholic (San Diego)',
    ],
    sbliveTeamId: '458202',
    sbliveSlug: '458202-cathedral-catholic-dons',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '6107',
  },
  {
    id: '582fa2b1-19ed-467d-85af-fc6971dd5a71',
    slug: 'la-jolla',
    name: 'La Jolla',
    shortName: 'La Jolla',
    abbr: 'LJ',
    acronym: 'LJHS',
    mascot: 'Vikings',
    city: 'La Jolla',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/la-jolla/la-jolla-vikings/field-hockey/',
    aliases: [
      'La Jolla', 'LA JOLLA', 'La Jolla High School', 'La Jolla Vikings',
    ],
    sbliveTeamId: '459019',
    sbliveSlug: '459019-la-jolla-vikings',
    sbliveSchoolId: '12915',
  },
  {
    id: 'f2ec9dd0-0f24-4161-a2c3-2a9df393f220',
    slug: 'mission-bay',
    name: 'Mission Bay',
    shortName: 'Mission Bay',
    abbr: 'MB',
    acronym: 'MBHS',
    mascot: 'Buccaneers',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['222222', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/mission-bay-buccaneers/field-hockey/',
    aliases: [
      'Mission Bay', 'MISSION BAY', 'Mission Bay High School', 'Mission Bay Buccaneers',
      'Mission Bay (San Diego)',
    ],
    sbliveTeamId: '459025',
    sbliveSlug: '459025-mission-bay-buccaneers',
    sbliveSchoolId: '12919',
  },
  {
    id: '7a80ea9f-8ed1-4b25-99cf-ad1b0fcd41a5',
    slug: 'scripps-ranch',
    name: 'Scripps Ranch',
    shortName: 'Scripps Ranch',
    abbr: 'SR',
    acronym: 'SRHS',
    mascot: 'Falcons',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-western',
    dataCoverage: 'full',
    colors: ['CC0022', '022C66'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/scripps-ranch-falcons/field-hockey/',
    aliases: [
      'Scripps Ranch', 'SCRIPPS RANCH', 'Scripps Ranch High School', 'Scripps Ranch Falcons',
      'Scripps Ranch (San Diego)',
    ],
    sbliveTeamId: '459032',
    sbliveSlug: '459032-scripps-ranch-falcons',
    sbliveSchoolId: '12930',
  },
  // ----- City Eastern (6; MaxPreps' table omits Patrick Henry and lists Madison) -----
  {
    id: '50ebec25-d857-4178-9f5a-1a6241c43b85',
    slug: 'clairemont',
    name: 'Clairemont',
    shortName: 'Clairemont',
    abbr: 'CL',
    acronym: 'CHS',
    // MaxPreps' mascot; si.com says Chieftains (its slug below), so both spellings are aliases.
    mascot: 'Captains',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-eastern',
    dataCoverage: 'full',
    colors: ['034CB2', 'D5350B'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/clairemont-captains/field-hockey/',
    aliases: [
      'Clairemont', 'CLAIREMONT', 'Clairemont High School', 'Clairemont Captains', 'Clairemont Chieftains',
      'Clairemont (San Diego)',
    ],
    sbliveTeamId: '459017',
    sbliveSlug: '459017-clairemont-chieftains',
    sbliveSchoolId: '12896',
  },
  {
    id: 'c24601db-aee8-4989-ba5d-bfbf0a91b927',
    slug: 'la-jolla-country-day',
    name: 'La Jolla Country Day',
    // The CIF-SDS alignment's spelling and MaxPreps' acronym; an alias too, as assertRegistry requires.
    shortName: 'LJCD',
    // 'CD' (Country Day): LJ is La Jolla's and LC La Costa Canyon's.
    abbr: 'CD',
    acronym: 'LJCD',
    mascot: 'Torreys',
    city: 'La Jolla',
    section: 'sds',
    league: 'city',
    division: 'city-eastern',
    dataCoverage: 'full',
    colors: ['034CB2', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/la-jolla/la-jolla-country-day-torreys/field-hockey/',
    aliases: [
      'La Jolla Country Day', 'LA JOLLA COUNTRY DAY', 'La Jolla Country Day Torreys', 'LJCD',
      'La Jolla Country Day School', 'La Jolla Country Day (La Jolla)',
    ],
    sbliveTeamId: '456865',
    sbliveSlug: '456865-la-jolla-country-day-torreys',
    sbliveSchoolId: '256',
  },
  {
    id: 'e551f0f0-28a3-4c13-8ade-1b9909ffa28c',
    slug: 'mira-mesa',
    name: 'Mira Mesa',
    shortName: 'Mira Mesa',
    abbr: 'MM',
    acronym: 'MMHS',
    mascot: 'Marauders',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-eastern',
    dataCoverage: 'full',
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/mira-mesa-marauders/field-hockey/',
    aliases: [
      'Mira Mesa', 'MIRA MESA', 'Mira Mesa High School', 'Mira Mesa Marauders', 'Mira Mesa (San Diego)',
    ],
    sbliveTeamId: '459023',
    sbliveSlug: '459023-mira-mesa-marauders',
    sbliveSchoolId: '12918',
  },
  {
    id: 'e71f479e-b2c8-48da-a8b4-4f270c3afb92',
    slug: 'patrick-henry',
    name: 'Patrick Henry',
    shortName: 'Patrick Henry',
    abbr: 'PH',
    acronym: 'PHHS',
    mascot: 'Patriots',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    // Membership from the CIF-SDS 2026-27 League Alignment only: MaxPreps' City - Eastern table omits it and
    // marks none of its ten City Eastern games as league games.
    division: 'city-eastern',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['00824B', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/patrick-henry-patriots/field-hockey/',
    aliases: [
      'Patrick Henry', 'PATRICK HENRY', 'Patrick Henry High School', 'Patrick Henry Patriots',
      'Patrick Henry (San Diego)',
    ],
    sbliveTeamId: '464779',
    sbliveSlug: '464779-patrick-henry-patriots',
    sbliveSchoolId: '30661',
  },
  {
    id: '91a74b43-700f-4e74-819e-d62b6dba12f7',
    slug: 'point-loma',
    name: 'Point Loma',
    shortName: 'Point Loma',
    abbr: 'PL',
    acronym: 'PLHS',
    mascot: 'Pointers',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-eastern',
    dataCoverage: 'full',
    colors: ['8F0018', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/point-loma-fighting-pointers/field-hockey/',
    aliases: [
      'Point Loma', 'POINT LOMA', 'Point Loma High School', 'Point Loma Pointers',
      'Point Loma Fighting Pointers', 'Point Loma (San Diego)',
    ],
    sbliveTeamId: '459029',
    sbliveSlug: '459029-point-loma-pointers',
    sbliveSchoolId: '12921',
  },
  {
    id: '32f08693-bcfd-4a62-a463-77b91360f53b',
    slug: 'university-city',
    name: 'University City',
    shortName: 'University City',
    abbr: 'UC',
    acronym: 'UCHS',
    mascot: 'Centurions',
    city: 'San Diego',
    section: 'sds',
    league: 'city',
    division: 'city-eastern',
    dataCoverage: 'full',
    colors: ['022C66', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/university-city-centurions/field-hockey/',
    // Never bare 'University': San Francisco University's (MCAL) and Irvine's on si.com
    // (STATEWIDE_AMBIGUOUS).
    aliases: [
      'University City', 'UNIVERSITY CITY', 'University City High School', 'University City Centurions',
      'University City (San Diego)',
    ],
    sbliveTeamId: '459037',
    sbliveSlug: '459037-university-city-centurions',
    sbliveSchoolId: '12934',
  },
];
