/**
 * The 19 North County Conference seeds (CIF San Diego Section: Avocado 6, Palomar 7, Valley 6),
 * transcribed by script from tests/fixtures/seeds/registry-seed-sds.json (verified 2026-10-06;
 * checked field by field by tests/registry-seeds.test.ts). Seed order is alphabetical within each
 * division.
 *
 * Membership is the Section's 2026-27 League Alignment workbook. MaxPreps' Avocado table omits Mt.
 * Carmel and Rancho Bernardo, and MaxPreps publishes no Valley table at all. The workbook lists
 * Rancho Buena Vista under both Palomar and Valley; its league games place it in Palomar.
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload (Mission Vista's
 * mascot from the school's own site). Colours come from the MaxPreps standings row, else (commented
 * per team) from team-context's schoolColor1/schoolColor2: the same MaxPreps school-colour fields,
 * equal for all 34 SoCal teams that have both. Those carry colorSource 'maxpreps-standings', as
 * Prospect's do, because the only other value, 'placeholder', means invented colours. si.com team
 * ids, slugs and school ids were harvested from si.com league and team pages on 2026-10-06, never
 * guessed; si.com's league buckets are stale (it spreads the Valley six over its Avocado and
 * Palomar pages) and are never membership evidence. si.com's team search lists a second team named
 * Del Norte, Mission Vista, San Marcos and Westview, so those names are statewide namesakes
 * (STATEWIDE_AMBIGUOUS in lib/sources/sblive.ts) and si.com sides with them resolve by id only.
 */

import type { Seed } from './seed';

export const NORTH_COUNTY_SEEDS: readonly Seed[] = [
  // ----- Avocado (6; MaxPreps' table omits Mt. Carmel and Rancho Bernardo) -----
  {
    id: '91a207da-721f-4acf-a69c-cd7fa50a1f7a',
    slug: 'canyon-crest-academy',
    name: 'Canyon Crest Academy',
    // Whole words of the name, and an alias (the alignment's spelling).
    shortName: 'Canyon Crest',
    // 'CY': CC is Cathedral Catholic's, CA Carmel's and CR Corning's.
    abbr: 'CY',
    acronym: 'CCA',
    mascot: 'Ravens',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/canyon-crest-academy-ravens/field-hockey/',
    aliases: [
      'Canyon Crest Academy', 'CANYON CREST ACADEMY', 'Canyon Crest Academy Ravens', 'Canyon Crest',
      'Canyon Crest Academy (San Diego)',
    ],
    sbliveTeamId: '459041',
    sbliveSlug: '459041-canyon-crest-academy-ravens',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12935',
  },
  {
    id: '78ad824a-61a0-462b-aa6f-1d5f6fb1bd5f',
    slug: 'la-costa-canyon',
    name: 'La Costa Canyon',
    shortName: 'La Costa Canyon',
    abbr: 'LC',
    acronym: 'LCCHS',
    mascot: 'Mavericks',
    city: 'Carlsbad',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    colors: ['00824B', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/carlsbad/la-costa-canyon-mavericks/field-hockey/',
    aliases: [
      'La Costa Canyon', 'LA COSTA CANYON', 'La Costa Canyon High School', 'La Costa Canyon Mavericks',
      'La Costa Canyon (Carlsbad)',
    ],
    sbliveTeamId: '459043',
    sbliveSlug: '459043-la-costa-canyon-mavericks',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12936',
  },
  {
    id: '688ec7f8-2985-4e7e-900a-4d78f845b197',
    slug: 'mt-carmel',
    name: 'Mt. Carmel',
    shortName: 'Mt. Carmel',
    // 'MT': MC is Marin Catholic's.
    abbr: 'MT',
    acronym: 'MCHS',
    mascot: 'Sundevils',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC0022', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/mt-carmel-sundevils/field-hockey/',
    aliases: [
      'Mt. Carmel', 'MT. CARMEL', 'Mt. Carmel High School', 'Mt. Carmel Sundevils', 'Mt Carmel',
      'Mount Carmel', 'Mt. Carmel (San Diego)',
    ],
    sbliveTeamId: '458939',
    sbliveSlug: '458939-mt-carmel-sundevils',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12670',
  },
  {
    id: '132d806e-7fa4-4bce-b92a-9db38786cf7b',
    slug: 'rancho-bernardo',
    name: 'Rancho Bernardo',
    shortName: 'Rancho Bernardo',
    // 'RN': RB is held for Red Bluff (registry-seed-ns.json), and RV is Rancho Buena Vista's.
    abbr: 'RN',
    acronym: 'RBHS',
    mascot: 'Broncos',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['022C66', '737272'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/rancho-bernardo-broncos/field-hockey/',
    aliases: [
      'Rancho Bernardo', 'RANCHO BERNARDO', 'Rancho Bernardo High School', 'Rancho Bernardo Broncos',
      'Rancho Bernardo (San Diego)',
    ],
    sbliveTeamId: '458945',
    sbliveSlug: '458945-rancho-bernardo-broncos',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12672',
  },
  {
    id: 'ff3dcd2f-cdea-46e6-accf-fd929c0a4374',
    slug: 'san-marcos',
    name: 'San Marcos',
    shortName: 'San Marcos',
    abbr: 'SM',
    acronym: 'SMHS',
    mascot: 'Knights',
    city: 'San Marcos',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    colors: ['022C66', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-marcos/san-marcos-knights/field-hockey/',
    aliases: [
      'San Marcos', 'SAN MARCOS', 'San Marcos High School', 'San Marcos Knights',
    ],
    // si.com also lists a San Marcos of Santa Barbara (459073), so 'San Marcos' is in STATEWIDE_AMBIGUOUS
    // (lib/sources/sblive.ts) and si.com sides resolve to this team by these ids only.
    sbliveTeamId: '459066',
    sbliveSlug: '459066-san-marcos-knights',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '13021',
  },
  {
    id: 'ad43e80f-2296-4b96-a0a9-44e6a8ea76f2',
    slug: 'torrey-pines',
    name: 'Torrey Pines',
    shortName: 'Torrey Pines',
    abbr: 'TP',
    acronym: 'TPHS',
    mascot: 'Falcons',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'avocado',
    dataCoverage: 'full',
    colors: ['CC0022', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/torrey-pines-falcons/field-hockey/',
    aliases: [
      'Torrey Pines', 'TORREY PINES', 'Torrey Pines High School', 'Torrey Pines Falcons',
      'Torrey Pines (San Diego)',
    ],
    sbliveTeamId: '459049',
    sbliveSlug: '459049-torrey-pines-falcons',
    sbliveSchoolId: '12940',
  },
  // ----- Palomar (7) -----
  {
    id: 'ddf384b8-3189-4276-8703-71106d47a4d5',
    // Del Norte of San Diego. The Crescent City Del Norte on NorCal schedules is a MaxPreps ghost
    // (DATA_QUALITY.ghostTeamIds).
    slug: 'del-norte',
    name: 'Del Norte',
    shortName: 'Del Norte',
    abbr: 'DN',
    acronym: 'DNHS',
    mascot: 'Nighthawks',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['022C66', '00341E'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/del-norte-nighthawks/field-hockey/',
    aliases: [
      'Del Norte', 'DEL NORTE', 'Del Norte High School', 'Del Norte Nighthawks', 'Del Norte (San Diego)',
    ],
    // si.com also lists a Crescent City Del Norte (458609), and shows it playing Tamalpais and Davis on Oct
    // 16, the games MaxPreps gives this team. So 'Del Norte' is in STATEWIDE_AMBIGUOUS
    // (lib/sources/sblive.ts) and si.com sides resolve to this team by these ids only.
    sbliveTeamId: '458937',
    sbliveSlug: '458937-del-norte-nighthawks',
    sbliveSchoolId: '12669',
  },
  {
    id: '7453dc74-befb-4c36-92ec-35bf99c3c718',
    slug: 'fallbrook',
    name: 'Fallbrook',
    shortName: 'Fallbrook',
    abbr: 'FB',
    acronym: 'FHS',
    mascot: 'Warriors',
    city: 'Fallbrook',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['CC0022', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/fallbrook/fallbrook-warriors/field-hockey/',
    aliases: [
      'Fallbrook', 'FALLBROOK', 'Fallbrook High School', 'Fallbrook Warriors',
    ],
    sbliveTeamId: '458653',
    sbliveSlug: '458653-fallbrook-warriors',
    sbliveSchoolId: '10923',
  },
  {
    id: 'e9446588-3714-4a57-905e-cd9a097a48b0',
    slug: 'mission-vista',
    name: 'Mission Vista',
    shortName: 'Mission Vista',
    // 'MS': MV is Monta Vista's.
    abbr: 'MS',
    acronym: 'MVHS',
    // Neither MaxPreps (team-context and the 2026-27 team page: schoolMascot null) nor si.com (team 464852)
    // carries a mascot. 'Timberwolves' is from the school's own site, https://mvhs.vistausd.org/ (fetched
    // 2026-10-06: 'Home of the Timberwolves', logo alt text 'Mission Vista Timberwolves').
    mascot: 'Timberwolves',
    city: 'Oceanside',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['005B34', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/oceanside/mission-vista/field-hockey/',
    aliases: [
      'Mission Vista', 'MISSION VISTA', 'Mission Vista High School', 'Mission Vista Timberwolves',
      'Mission Vista (Oceanside)',
    ],
    // si.com lists a second Mission Vista (480754, located 'Vista, CA', whose games page serves si.com's
    // index); this one carries the games. 'Mission Vista' is in STATEWIDE_AMBIGUOUS (lib/sources/sblive.ts),
    // so si.com sides resolve to this team by these ids only.
    sbliveTeamId: '464852',
    sbliveSlug: '464852-mission-vista',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '31920',
  },
  {
    id: '9adef103-5c38-4dc2-a6c4-b36ea4f5400c',
    slug: 'poway',
    name: 'Poway',
    shortName: 'Poway',
    abbr: 'PW',
    acronym: 'PHS',
    mascot: 'Titans',
    city: 'Poway',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['00341E', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/poway/poway-titans/field-hockey/',
    aliases: [
      'Poway', 'POWAY', 'Poway High School', 'Poway Titans',
    ],
    sbliveTeamId: '458942',
    sbliveSlug: '458942-poway-titans',
    sbliveSchoolId: '12671',
  },
  {
    id: 'f1f0e644-5c98-4d70-bd3c-ae7fb8992410',
    slug: 'rancho-buena-vista',
    name: 'Rancho Buena Vista',
    // The CIF-SDS alignment's spelling; an alias too, as assertRegistry requires.
    shortName: 'RBV',
    abbr: 'RV',
    acronym: 'RBVHS',
    mascot: 'Longhorns',
    city: 'Vista',
    section: 'sds',
    league: 'north-county',
    // The alignment workbook lists it under both Palomar ('RBV') and Valley ('RANCHO BUENA VISTA'); its
    // league games (Del Norte, Poway, San Dieguito Academy) and MaxPreps' Palomar row place it in Palomar.
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['8F0018', '737272'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/vista/rancho-buena-vista-longhorns/field-hockey/',
    aliases: [
      'Rancho Buena Vista', 'RANCHO BUENA VISTA', 'Rancho Buena Vista High School',
      'Rancho Buena Vista Longhorns', 'RBV', 'Rancho Buena Vista (Vista)',
    ],
    sbliveTeamId: '459174',
    sbliveSlug: '459174-rancho-buena-vista-longhorns',
    sbliveSchoolId: '13718',
  },
  {
    id: 'a7064567-f2fe-442d-8200-34a28326d1b9',
    slug: 'san-dieguito-academy',
    name: 'San Dieguito Academy',
    // Whole words of the name, and an alias (the alignment's spelling).
    shortName: 'San Dieguito',
    abbr: 'SD',
    acronym: 'SDA',
    mascot: 'Mustangs',
    city: 'Encinitas',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['034CB2', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/encinitas/san-dieguito-academy-mustangs/field-hockey/',
    aliases: [
      'San Dieguito Academy', 'SAN DIEGUITO ACADEMY', 'San Dieguito Academy Mustangs', 'San Dieguito',
      'San Dieguito Academy (Encinitas)',
    ],
    sbliveTeamId: '459047',
    sbliveSlug: '459047-san-dieguito-academy-mustangs',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '12938',
  },
  {
    id: '673c037d-ae98-4fa1-a388-b127758ac382',
    slug: 'valley-center',
    name: 'Valley Center',
    shortName: 'Valley Center',
    // 'VE': VC is Valley Christian's.
    abbr: 'VE',
    acronym: 'VCHS',
    mascot: 'Jaguars',
    city: 'Valley Center',
    section: 'sds',
    league: 'north-county',
    division: 'palomar',
    dataCoverage: 'full',
    colors: ['222222', '108073'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/valley-center/valley-center-jaguars/field-hockey/',
    aliases: [
      'Valley Center', 'VALLEY CENTER', 'Valley Center High School', 'Valley Center Jaguars',
    ],
    sbliveTeamId: '459167',
    sbliveSlug: '459167-valley-center-jaguars',
    sbliveSchoolId: '13667',
  },
  // ----- Valley (6; MaxPreps publishes no Valley table) -----
  {
    id: '226ea389-d063-46bb-8ccb-ede6f10c2ca6',
    slug: 'escondido',
    name: 'Escondido',
    shortName: 'Escondido',
    abbr: 'ES',
    acronym: 'EHS',
    mascot: 'Cougars',
    city: 'Escondido',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC4E10', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/escondido/escondido-cougars/field-hockey/',
    aliases: [
      'Escondido', 'ESCONDIDO', 'Escondido High School', 'Escondido Cougars',
    ],
    sbliveTeamId: '458641',
    sbliveSlug: '458641-escondido-cougars',
    sbliveSchoolId: '10872',
  },
  {
    id: '643a8f19-47aa-42a2-b5a4-0f52421f80b9',
    slug: 'mission-hills',
    name: 'Mission Hills',
    shortName: 'Mission Hills',
    abbr: 'MH',
    acronym: 'MHHS',
    mascot: 'Grizzlies',
    city: 'San Marcos',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC0022', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-marcos/mission-hills-grizzlies/field-hockey/',
    aliases: [
      'Mission Hills', 'MISSION HILLS', 'Mission Hills High School', 'Mission Hills Grizzlies',
      'Mission Hills (San Marcos)',
    ],
    sbliveTeamId: '459063',
    sbliveSlug: '459063-mission-hills-grizzlies',
    sbliveSchoolId: '13020',
  },
  {
    id: '475c3bcb-9d28-457f-87b8-d979f9ff070f',
    slug: 'sage-creek',
    name: 'Sage Creek',
    shortName: 'Sage Creek',
    // 'SE': SC is Santa Clara's, SG Saratoga's and SK Silver Creek's.
    abbr: 'SE',
    acronym: 'SCHS',
    mascot: 'Bobcats',
    city: 'Carlsbad',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['00824B', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/carlsbad/sage-creek-bobcats/field-hockey/',
    aliases: [
      'Sage Creek', 'SAGE CREEK', 'Sage Creek High School', 'Sage Creek Bobcats', 'Sage Creek (Carlsbad)',
    ],
    sbliveTeamId: '464866',
    sbliveSlug: '464866-sage-creek-bobcats',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '31992',
  },
  {
    id: 'a1109c06-7436-4b72-a30e-459eb6d00925',
    slug: 'san-pasqual',
    name: 'San Pasqual',
    shortName: 'San Pasqual',
    abbr: 'SP',
    acronym: 'SPHS',
    mascot: 'Golden Eagles',
    city: 'Escondido',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/escondido/san-pasqual-golden-eagles/field-hockey/',
    aliases: [
      'San Pasqual', 'SAN PASQUAL', 'San Pasqual High School', 'San Pasqual Golden Eagles',
      'San Pasqual (Escondido)',
    ],
    sbliveTeamId: '458644',
    sbliveSlug: '458644-san-pasqual-golden-eagles',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '10874',
  },
  {
    id: '1f57d89b-3a6d-444a-9de1-2fba3f0017b6',
    slug: 'vista',
    name: 'Vista',
    shortName: 'Vista',
    abbr: 'VI',
    acronym: 'VHS',
    mascot: 'Panthers',
    city: 'Vista',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/vista/vista-panthers/field-hockey/',
    aliases: [
      'Vista', 'VISTA', 'Vista High School', 'Vista Panthers',
    ],
    sbliveTeamId: '464777',
    sbliveSlug: '464777-vista-panthers',
    sbliveSchoolId: '30660',
  },
  {
    id: '9ef67997-7f5d-4899-b500-2d0b5c758105',
    slug: 'westview',
    name: 'Westview',
    shortName: 'Westview',
    abbr: 'WV',
    acronym: 'WHS',
    mascot: 'Wolverines',
    city: 'San Diego',
    section: 'sds',
    league: 'north-county',
    division: 'valley',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['C8880A', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/westview-wolverines/field-hockey/',
    aliases: [
      'Westview', 'WESTVIEW', 'Westview High School', 'Westview Wolverines', 'Westview (San Diego)',
    ],
    // si.com has a second Westview, the Westview Wildcats of West Los Angeles (464882, which si.com shows
    // playing Sage Creek on Sep 30 and Oct 28), so 'Westview' is in STATEWIDE_AMBIGUOUS
    // (lib/sources/sblive.ts) and si.com sides resolve to this team by these ids only.
    sbliveTeamId: '458949',
    sbliveSlug: '458949-westview-wolverines',
    sbliveSchoolId: '12673',
  },
];
