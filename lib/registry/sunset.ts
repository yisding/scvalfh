/**
 * The 8 Sunset seeds (the CIF Southern Section's field hockey Sunset), transcribed by script from
 * tests/fixtures/seeds/registry-seed-ss.json (verified 2026-10-06; checked field by field by
 * tests/registry-seeds.test.ts). Seed order is alphabetical.
 *
 * The Sunset here is a field-hockey-only grouping of eight Southern Section schools in Orange and
 * Riverside counties, not the all-sports Sunset League. No Sunset document (site, bylaws, schedule
 * or standings) was found, so membership rests on MaxPreps: its 2024-25 and 2025-26 Sunset tables
 * list these eight and two more, Bonita and Chaminade, and in 2026-27 the eight play the games
 * MaxPreps marks as Sunset league games. Bonita and Chaminade are seeds of lib/registry/independents.ts
 * instead (owner decision, 2026-10-06; DESIGN §24.10): MaxPreps marks none of their 2026 games against
 * the five Orange County schools as a league game, and both play every other independent home and
 * away. MaxPreps' 2026-27 table lists three of the eight (Chaparral, Great Oak, Temecula Valley) with
 * those two; the five Orange County schools carry an all-zero league id this season (LEAGUES sunset
 * maxprepsMissing). si.com files Chaparral and Temecula Valley under "Southwestern": si.com league
 * buckets are never membership evidence. Mayfair (no 2026 varsity game on MaxPreps) is not a seed
 * (DATA_QUALITY.notCovered).
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload. Colours come from
 * the MaxPreps standings row, else (commented per team) from team-context's
 * schoolColor1/schoolColor2: the same MaxPreps school-colour fields, equal for all 34 SoCal teams
 * that have both. Those carry colorSource 'maxpreps-standings', as Prospect's do, because the only
 * other value, 'placeholder', means invented colours. si.com team ids, slugs and school ids were
 * harvested from si.com league and team pages on 2026-10-06, never guessed. si.com's team search
 * lists a second Marina (Marina, CA), so "Marina" is a statewide namesake (STATEWIDE_AMBIGUOUS in
 * lib/sources/sblive.ts) and resolves on si.com by id only; the other seven names are unique there.
 */

import type { Seed } from './seed';

export const SUNSET_SEEDS: readonly Seed[] = [
  // ----- Sunset (8; MaxPreps' 2026-27 table lists three of them: the Orange County five are maxprepsMissing) -----
  {
    id: 'd9fa2972-0bc2-4d7b-baa4-aaa7d69c119e',
    slug: 'chaparral',
    name: 'Chaparral',
    shortName: 'Chaparral',
    abbr: 'CP',
    acronym: 'CHS',
    mascot: 'Pumas',
    city: 'Temecula',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    colors: ['022C66', '00824B'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/temecula/chaparral-pumas/field-hockey/',
    aliases: [
      'Chaparral', 'CHAPARRAL', 'Chaparral High School', 'Chaparral Pumas', 'Chaparral (Temecula)',
    ],
    sbliveTeamId: '459144',
    sbliveSlug: '459144-chaparral-pumas',
    sbliveSchoolId: '13456',
  },
  {
    id: 'c5a36b71-74a5-431f-94a3-8337d66dfbbb',
    slug: 'edison',
    name: 'Edison',
    shortName: 'Edison',
    abbr: 'ED',
    acronym: 'EHS',
    mascot: 'Chargers',
    city: 'Huntington Beach',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['00824B', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/huntington-beach/edison-chargers/field-hockey/',
    aliases: [
      'Edison', 'EDISON', 'Edison High School', 'Edison Chargers', 'Edison (Huntington Beach)',
    ],
    sbliveTeamId: '458743',
    sbliveSlug: '458743-edison-chargers',
    sbliveSchoolId: '11313',
  },
  {
    id: '79582922-a3b0-44a5-b210-8e51f3cfb731',
    slug: 'fountain-valley',
    name: 'Fountain Valley',
    shortName: 'Fountain Valley',
    abbr: 'FV',
    acronym: 'FVHS',
    mascot: 'Barons',
    city: 'Fountain Valley',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/fountain-valley/fountain-valley-barons/field-hockey/',
    aliases: [
      'Fountain Valley', 'FOUNTAIN VALLEY', 'Fountain Valley High School', 'Fountain Valley Barons',
    ],
    sbliveTeamId: '458744',
    sbliveSlug: '458744-fountain-valley-barons',
    sbliveSchoolId: '11314',
  },
  {
    id: 'a36c1c30-9183-4514-8cd6-26824a6d7c50',
    slug: 'great-oak',
    name: 'Great Oak',
    shortName: 'Great Oak',
    abbr: 'GO',
    acronym: 'GOHS',
    mascot: 'Wolfpack',
    city: 'Temecula',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    colors: ['CC0022', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/temecula/great-oak-wolfpack/field-hockey/',
    aliases: [
      'Great Oak', 'GREAT OAK', 'Great Oak High School', 'Great Oak Wolfpack', 'Great Oak (Temecula)',
    ],
    sbliveTeamId: '459145',
    sbliveSlug: '459145-great-oak-wolfpack',
    sbliveSchoolId: '13457',
  },
  {
    id: 'f60cf593-eddc-4900-b1c9-b6362f852856',
    slug: 'huntington-beach',
    name: 'Huntington Beach',
    shortName: 'Huntington Beach',
    abbr: 'HB',
    acronym: 'HBHS',
    mascot: 'Oilers',
    city: 'Huntington Beach',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC4E10', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/huntington-beach/huntington-beach-oilers/field-hockey/',
    aliases: [
      'Huntington Beach', 'HUNTINGTON BEACH', 'Huntington Beach High School', 'Huntington Beach Oilers',
    ],
    sbliveTeamId: '458746',
    sbliveSlug: '458746-huntington-beach-oilers',
    sbliveSchoolId: '11316',
  },
  {
    id: '96f0228e-b1db-4993-ad1e-5427b5592bcf',
    slug: 'marina',
    name: 'Marina',
    shortName: 'Marina',
    // 'MR': MA is Marin Academy's.
    abbr: 'MR',
    acronym: 'MHS',
    mascot: 'Vikings',
    city: 'Huntington Beach',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['022C66', '046DFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/huntington-beach/marina-vikings/field-hockey/',
    aliases: [
      'Marina', 'MARINA', 'Marina High School', 'Marina Vikings', 'Marina (Huntington Beach)',
    ],
    // si.com also lists a Marina of Marina, CA (500865, no games: the Central Coast school with no 2026-27
    // varsity team), so 'Marina' is in STATEWIDE_AMBIGUOUS (lib/sources/sblive.ts) and si.com sides resolve
    // to this team by these ids only.
    sbliveTeamId: '458748',
    sbliveSlug: '458748-marina-vikings',
    sbliveSchoolId: '11317',
  },
  {
    id: '86009247-6ae1-40e1-acfa-58c200528743',
    slug: 'newport-harbor',
    name: 'Newport Harbor',
    shortName: 'Newport Harbor',
    abbr: 'NH',
    acronym: 'NHHS',
    mascot: 'Sailors',
    city: 'Newport Beach',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['022C66', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/newport-beach/newport-harbor-sailors/field-hockey/',
    aliases: [
      'Newport Harbor', 'NEWPORT HARBOR', 'Newport Harbor High School', 'Newport Harbor Sailors',
      'Newport Harbor (Newport Beach)',
    ],
    sbliveTeamId: '458870',
    sbliveSlug: '458870-newport-harbor-sailors',
    sbliveSchoolId: '12274',
  },
  {
    id: '8f350275-199e-4549-b574-2257e718069f',
    slug: 'temecula-valley',
    name: 'Temecula Valley',
    shortName: 'Temecula Valley',
    abbr: 'TV',
    acronym: 'TVHS',
    mascot: 'Golden Bears',
    city: 'Temecula',
    section: 'ss',
    league: 'sunset',
    division: 'sunset',
    dataCoverage: 'full',
    colors: ['4F311C', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/temecula/temecula-valley-golden-bears/field-hockey/',
    aliases: [
      'Temecula Valley', 'TEMECULA VALLEY', 'Temecula Valley High School', 'Temecula Valley Golden Bears',
      'Temecula Valley (Temecula)',
    ],
    sbliveTeamId: '459147',
    sbliveSlug: '459147-temecula-valley-golden-bears',
    sbliveSchoolId: '13461',
  },
];
