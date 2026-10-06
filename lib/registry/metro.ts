/**
 * The 9 Metro Conference seeds (CIF San Diego Section: Metro Mesa 5, Metro South Bay 4),
 * transcribed by script from tests/fixtures/seeds/registry-seed-sds.json (verified 2026-10-06;
 * checked field by field by tests/registry-seeds.test.ts). Seed order is alphabetical within each
 * division.
 *
 * Membership is the Section's 2026-27 League Alignment workbook. MaxPreps' table names do not match
 * the divisions: its "Metro- South Bay" table holds the five Metro Mesa teams, and its "Grossmont"
 * table holds Metro South Bay's El Capitan and Granite Hills plus Santana, which has no 2026
 * varsity game on MaxPreps (LEAGUES metro withdrawnNames and maxprepsExtraRows). Hilltop and
 * Southwest are in no MaxPreps table. Castle Park, Chula Vista, Montgomery and Sweetwater have no
 * 2026 varsity game on MaxPreps or in the Section's power rankings, so they are not seeds
 * (DATA_QUALITY.notCovered).
 *
 * Names, acronyms, mascots and cities come from MaxPreps' team-context payload. Colours come from
 * the MaxPreps standings row, else (commented per team) from team-context's
 * schoolColor1/schoolColor2: the same MaxPreps school-colour fields, equal for all 34 SoCal teams
 * that have both. Those carry colorSource 'maxpreps-standings', as Prospect's do, because the only
 * other value, 'placeholder', means invented colours. si.com team ids, slugs and school ids were
 * harvested from si.com league and team pages on 2026-10-06, never guessed; si.com's league buckets
 * are stale (it files Hilltop and Southwest under Metro Mesa) and are never membership evidence.
 * si.com's team search lists two other teams named Granite Hills and one named Southwest (El
 * Centro), so those names are statewide namesakes (STATEWIDE_AMBIGUOUS in lib/sources/sblive.ts)
 * and resolve on si.com by id only.
 */

import type { Seed } from './seed';

export const METRO_SEEDS: readonly Seed[] = [
  // ----- Metro Mesa (5; MaxPreps' table for these five is named 'Metro- South Bay') -----
  {
    id: '7f4d50f0-8690-493c-b4bc-262b512e8851',
    slug: 'bonita-vista',
    name: 'Bonita Vista',
    shortName: 'Bonita Vista',
    // 'BT': BV is Bella Vista's.
    abbr: 'BT',
    acronym: 'BVHS',
    mascot: 'Barons',
    city: 'Chula Vista',
    section: 'sds',
    league: 'metro',
    division: 'metro-mesa',
    dataCoverage: 'full',
    colors: ['022C66', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/chula-vista/bonita-vista-barons/field-hockey/',
    aliases: [
      'Bonita Vista', 'BONITA VISTA', 'Bonita Vista High School', 'Bonita Vista Barons',
      'Bonita Vista (Chula Vista)',
    ],
    sbliveTeamId: '459119',
    sbliveSlug: '459119-bonita-vista-barons',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '13407',
  },
  {
    id: '6aa8e46b-7aa9-4df3-9512-89a9d4827f7f',
    slug: 'eastlake',
    name: 'Eastlake',
    shortName: 'Eastlake',
    abbr: 'EL',
    acronym: 'EHS',
    mascot: 'Titans',
    city: 'Chula Vista',
    section: 'sds',
    league: 'metro',
    division: 'metro-mesa',
    dataCoverage: 'full',
    colors: ['034CB2', '00824B'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/chula-vista/eastlake-titans/field-hockey/',
    aliases: [
      'Eastlake', 'EASTLAKE', 'Eastlake High School', 'Eastlake Titans', 'Eastlake (Chula Vista)',
    ],
    sbliveTeamId: '459128',
    sbliveSlug: '459128-eastlake-titans',
    sbliveSchoolId: '13412',
  },
  {
    id: '186dcece-fefd-4b67-b4c7-877b3e12beb2',
    slug: 'helix',
    name: 'Helix',
    shortName: 'Helix',
    abbr: 'HX',
    acronym: 'HHS',
    // MaxPreps' mascot; si.com says Highlanders (its slug below), so both spellings are aliases.
    mascot: 'Scotties',
    city: 'La Mesa',
    section: 'sds',
    league: 'metro',
    division: 'metro-mesa',
    dataCoverage: 'full',
    colors: ['00824B', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/la-mesa/helix-scotties/field-hockey/',
    aliases: [
      'Helix', 'HELIX', 'Helix High School', 'Helix Scotties', 'Helix Highlanders', 'Helix (La Mesa)',
    ],
    sbliveTeamId: '458715',
    sbliveSlug: '458715-helix-highlanders',
    // si.com school id from the team page's school.id: no school-logo URL was observed for it.
    sbliveSchoolId: '11156',
  },
  {
    id: '0465e8ea-3eb0-4619-a74a-183e70c697e2',
    slug: 'olympian',
    name: 'Olympian',
    shortName: 'Olympian',
    abbr: 'OL',
    acronym: 'OHS',
    mascot: 'Eagles',
    city: 'Chula Vista',
    section: 'sds',
    league: 'metro',
    division: 'metro-mesa',
    dataCoverage: 'full',
    colors: ['222222', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/chula-vista/olympian-eagles/field-hockey/',
    aliases: [
      'Olympian', 'OLYMPIAN', 'Olympian High School', 'Olympian Eagles', 'Olympian (Chula Vista)',
    ],
    sbliveTeamId: '480708',
    sbliveSlug: '480708-olympian-eagles',
    sbliveSchoolId: '13417',
  },
  {
    id: '77e5b6a4-a166-4a88-b114-a38a9b28ccc4',
    slug: 'otay-ranch',
    name: 'Otay Ranch',
    shortName: 'Otay Ranch',
    abbr: 'OR',
    acronym: 'ORHS',
    mascot: 'Mustangs',
    city: 'Chula Vista',
    section: 'sds',
    league: 'metro',
    division: 'metro-mesa',
    dataCoverage: 'full',
    colors: ['022C66', '046DFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/chula-vista/otay-ranch-mustangs/field-hockey/',
    aliases: [
      'Otay Ranch', 'OTAY RANCH', 'Otay Ranch High School', 'Otay Ranch Mustangs', 'Otay Ranch (Chula Vista)',
    ],
    sbliveTeamId: '459134',
    sbliveSlug: '459134-otay-ranch-mustangs',
    sbliveSchoolId: '13419',
  },
  // ----- Metro South Bay (4; MaxPreps' 'Grossmont' table holds two of them) -----
  {
    id: '15d5e874-4af2-4d24-8e6b-be895937cb8c',
    slug: 'el-capitan',
    name: 'El Capitan',
    shortName: 'El Capitan',
    abbr: 'EC',
    acronym: 'ECHS',
    mascot: 'Vaqueros',
    city: 'Lakeside',
    section: 'sds',
    league: 'metro',
    division: 'metro-south-bay',
    dataCoverage: 'full',
    colors: ['222222', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/lakeside/el-capitan-vaqueros/field-hockey/',
    aliases: [
      'El Capitan', 'EL CAPITAN', 'El Capitan High School', 'El Capitan Vaqueros', 'El Capitan (Lakeside)',
    ],
    sbliveTeamId: '458711',
    sbliveSlug: '458711-el-capitan-vaqueros',
    sbliveSchoolId: '11149',
  },
  {
    id: 'aa2f89a2-0150-4223-89b4-ac73cbf343e9',
    slug: 'granite-hills',
    name: 'Granite Hills',
    shortName: 'Granite Hills',
    abbr: 'GH',
    acronym: 'GHHS',
    mascot: 'Eagles',
    city: 'El Cajon',
    section: 'sds',
    league: 'metro',
    division: 'metro-south-bay',
    dataCoverage: 'full',
    colors: ['022C66', '046DFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/el-cajon/granite-hills-eagles/field-hockey/',
    aliases: [
      'Granite Hills', 'GRANITE HILLS', 'Granite Hills High School', 'Granite Hills Eagles',
      'Granite Hills (El Cajon)',
    ],
    // si.com also lists Granite Hills of Porterville (554634) and of Apple Valley (458466), so 'Granite
    // Hills' is in STATEWIDE_AMBIGUOUS (lib/sources/sblive.ts) and si.com sides resolve to this team by these
    // ids only.
    sbliveTeamId: '458713',
    sbliveSlug: '458713-granite-hills-eagles',
    sbliveSchoolId: '11152',
  },
  {
    id: 'ec21ffde-b216-47cc-9923-6308e239e9e0',
    slug: 'hilltop',
    name: 'Hilltop',
    shortName: 'Hilltop',
    abbr: 'HT',
    acronym: 'HHS',
    mascot: 'Lancers',
    city: 'Chula Vista',
    section: 'sds',
    league: 'metro',
    division: 'metro-south-bay',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['00824B', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/chula-vista/hilltop-lancers/field-hockey/',
    aliases: [
      'Hilltop', 'HILLTOP', 'Hilltop High School', 'Hilltop Lancers', 'Hilltop (Chula Vista)',
    ],
    sbliveTeamId: '459131',
    sbliveSlug: '459131-hilltop-lancers',
    sbliveSchoolId: '13413',
  },
  {
    id: '19409229-6768-4537-b8d7-4a7d2814aaad',
    slug: 'southwest',
    // MaxPreps' and si.com's schoolName is 'Southwest SD' (kept in the aliases and in maxprepsPath).
    // Southwest of El Centro has no field hockey team on MaxPreps, but si.com lists one (583246, no games),
    // so bare 'Southwest' is in STATEWIDE_AMBIGUOUS (lib/sources/sblive.ts): si.com sides resolve to this
    // team by its ids or by 'Southwest SD', never by 'Southwest'.
    name: 'Southwest',
    shortName: 'Southwest',
    abbr: 'SW',
    acronym: 'SSDHS',
    mascot: 'Raiders',
    city: 'San Diego',
    section: 'sds',
    league: 'metro',
    division: 'metro-south-bay',
    dataCoverage: 'full',
    // No 2026-27 MaxPreps standings row: colours from team-context (see the header).
    colors: ['CC0022', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-diego/southwest-sd-raiders/field-hockey/',
    aliases: [
      'Southwest', 'SOUTHWEST', 'Southwest High School', 'Southwest Raiders', 'Southwest SD', 'SOUTHWEST SD',
      'Southwest SD Raiders', 'Southwest SD (San Diego)', 'Southwest (San Diego)',
    ],
    sbliveTeamId: '459138',
    sbliveSlug: '459138-southwest-sd-raiders',
    sbliveSchoolId: '13422',
  },
];
