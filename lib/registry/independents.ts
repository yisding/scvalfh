/**
 * The 5 LA independents (Bonita, Chaminade, Glendora, Harvard-Westlake, Thousand Oaks),
 * transcribed by script from tests/fixtures/seeds/registry-seed-ss.json (verified 2026-10-06; checked field
 * by field by tests/registry-seeds.test.ts). Seed order is alphabetical.
 *
 * Five Southern Section schools in no field hockey league, grouped by this site (LEAGUES 'independents',
 * `independents: true`, classification 'membership': the table counts their games against each other).
 * Glendora, Harvard-Westlake and Thousand Oaks are each the only field hockey team in their all-sports
 * MaxPreps league for 2026-27 (Palomares, League B, Marmonte), as in 2025-26. Bonita and Chaminade sit in
 * MaxPreps' and si.com's 2026-27 Sunset tables, but MaxPreps marks none of their 2026 games against the
 * five Orange County Sunset teams as a league game, and both play every other independent home and away,
 * so they are independents here (owner decision, 2026-10-06; DESIGN §24.10), not Sunset seeds.
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload. Bonita's and Chaminade's
 * colours come from their MaxPreps Sunset standings rows; the other three have no standings row with another
 * field hockey team, so theirs come from team-context's schoolColor1/schoolColor2, as for the five zero-GUID
 * Sunset teams (lib/registry/sunset.ts header): the same MaxPreps school-colour fields, colorSource
 * 'maxpreps-standings'. si.com team ids, slugs and school ids were harvested from the si.com league pages
 * 4249-sunset (Bonita, Chaminade), 4235-palomares, 4207-league-b and 4213-marmonte (each also lists
 * placeholder rows with no games), never guessed; the si.com team search finds no namesake of any of the
 * five names.
 */

import type { Seed } from './seed';

export const INDEPENDENTS_SEEDS: readonly Seed[] = [
  // ----- LA independents (5; no MaxPreps table groups them: all five are maxprepsMissing) -----
  {
    id: '4c2dd7e8-2f3e-43aa-891b-9218932cdf9d',
    slug: 'bonita',
    name: 'Bonita',
    shortName: 'Bonita',
    abbr: 'BN',
    acronym: 'BHS',
    mascot: 'Bearcats',
    city: 'La Verne',
    section: 'ss',
    league: 'independents',
    division: 'independents',
    dataCoverage: 'full',
    colors: ['00824B', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/la-verne/bonita-bearcats/field-hockey/',
    aliases: [
      'Bonita', 'BONITA', 'Bonita High School', 'Bonita Bearcats', 'Bonita (La Verne)',
    ],
    sbliveTeamId: '458494',
    sbliveSlug: '458494-bonita-bearcats',
    sbliveSchoolId: '10097',
  },
  {
    id: '742a32d0-2dc9-4aa8-ad92-8c4576f73a12',
    slug: 'chaminade',
    name: 'Chaminade',
    shortName: 'Chaminade',
    abbr: 'CM',
    acronym: 'CHS',
    mascot: 'Eagles',
    city: 'West Hills',
    section: 'ss',
    league: 'independents',
    division: 'independents',
    dataCoverage: 'full',
    colors: ['022C66', 'CC4E10'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/west-hills/chaminade-eagles/field-hockey/',
    aliases: [
      'Chaminade', 'CHAMINADE', 'Chaminade High School', 'Chaminade Eagles', 'Chaminade (West Hills)',
    ],
    sbliveTeamId: '456824',
    sbliveSlug: '456824-chaminade-eagles',
    sbliveSchoolId: '141',
  },
  {
    id: '1228375e-e4c0-453e-aed4-d0b0693b3c52',
    slug: 'glendora',
    name: 'Glendora',
    shortName: 'Glendora',
    abbr: 'GL',
    acronym: 'GHS',
    mascot: 'Tartans',
    city: 'Glendora',
    section: 'ss',
    league: 'independents',
    division: 'independents',
    dataCoverage: 'full',
    // No MaxPreps standings row with another field hockey team: colours from team-context (see the header).
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/glendora/glendora-tartans/field-hockey/',
    aliases: [
      'Glendora', 'GLENDORA', 'Glendora High School', 'Glendora Tartans',
    ],
    sbliveTeamId: '458698',
    sbliveSlug: '458698-glendora-tartans',
    sbliveSchoolId: '11109',
  },
  {
    id: '9dc04c54-8c9d-4b30-a1d2-fcc167363342',
    slug: 'harvard-westlake',
    name: 'Harvard-Westlake',
    shortName: 'Harvard-Westlake',
    abbr: 'HW',
    acronym: 'HWHS',
    mascot: 'Wolverines',
    city: 'Studio City',
    section: 'ss',
    league: 'independents',
    division: 'independents',
    dataCoverage: 'full',
    // No MaxPreps standings row with another field hockey team: colours from team-context (see the header).
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/studio-city/harvard-westlake-wolverines/field-hockey/',
    aliases: [
      'Harvard-Westlake', 'HARVARD-WESTLAKE', 'Harvard Westlake', 'Harvard-Westlake School',
      'Harvard-Westlake Wolverines', 'Harvard-Westlake (Studio City)',
    ],
    sbliveTeamId: '458394',
    sbliveSlug: '458394-harvardwestlake-wolverines',
    sbliveSchoolId: '9623',
  },
  {
    id: '70a363e2-26b8-4ef5-8ad0-20979f66399a',
    slug: 'thousand-oaks',
    name: 'Thousand Oaks',
    shortName: 'Thousand Oaks',
    abbr: 'TO',
    acronym: 'TOHS',
    mascot: 'Lancers',
    city: 'Thousand Oaks',
    section: 'ss',
    league: 'independents',
    division: 'independents',
    dataCoverage: 'full',
    // No MaxPreps standings row with another field hockey team: colours from team-context (see the header).
    colors: ['00824B', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/thousand-oaks/thousand-oaks-lancers/field-hockey/',
    aliases: [
      'Thousand Oaks', 'THOUSAND OAKS', 'Thousand Oaks High School', 'Thousand Oaks Lancers',
    ],
    sbliveTeamId: '458583',
    sbliveSlug: '458583-thousand-oaks-lancers',
    sbliveSchoolId: '10465',
  },
];
