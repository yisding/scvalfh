/**
 * The 3 Southern Section independents (Glendora, Harvard-Westlake, Thousand Oaks), transcribed by script
 * from tests/fixtures/seeds/registry-seed-ss.json (verified 2026-10-05 Pacific; checked field by field by
 * tests/registry-seeds.test.ts). Seed order is alphabetical.
 *
 * Each is the only field hockey team in its all-sports MaxPreps league for 2026-27 (Palomares, League B,
 * Marmonte), and none plays a game MaxPreps marks as a league game; MaxPreps' 2025-26 tables of the same
 * three leagues each list only that school too. So they are a group with no league table (LEAGUES
 * 'independents', classification 'independent'), not a league: every game they play is a non-league game.
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload. No MaxPreps standings row
 * groups any of them with another field hockey team, so colours come from team-context's
 * schoolColor1/schoolColor2, as for the five zero-GUID Sunset teams (lib/registry/sunset.ts header): the
 * same MaxPreps school-colour fields, colorSource 'maxpreps-standings'. si.com team ids, slugs and school
 * ids were harvested from the si.com league pages 4235-palomares, 4207-league-b and 4213-marmonte (each
 * also lists placeholder rows with no games), never guessed; the si.com team search finds no namesake of
 * any of the three names.
 */

import type { Seed } from './seed';

export const INDEPENDENTS_SEEDS: readonly Seed[] = [
  // ----- Southern Section independents (3; no MaxPreps table groups them: all three are maxprepsMissing) -----
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
