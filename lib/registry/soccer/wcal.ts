/**
 * The six WCAL girls soccer seeds, 2026-27 (the soccer build's registry: lib/teams.ts, `SCVAL_SPORT=soccer`).
 * Added with the WBAL at the owner's request (2026-11-14); the basketball build does not have them.
 *
 * Membership is the WCAL's own: the "2026-27 Composite Women's Varsity Soccer Schedule" linked from
 * wcalsports.org/schedules/ has six columns (AM, AR, SHC, SF, SI, VC), read 2026-11-14
 * (lib/league-config/soccer/wcal.ts names it). Presentation, a WCAL member in 2025-26, plays in the WBAL's
 * Foothill division in 2026-27 (lib/registry/soccer/wbal.ts). MaxPreps' WCAL girls soccer table (standings read
 * 2026-11-14) holds the same six.
 *
 * A school's id is MaxPreps' school id; the slug, name, short name and abbr are ours, the same as field hockey's
 * for the four schools that registry holds (Mitty, Saint Francis, St. Ignatius, Valley Christian). The acronym,
 * mascot and city are each team's `schoolNameAcronym`, `schoolMascot` and `schoolCity` in MaxPreps'
 * team-context payload, the colors its `schoolColor1` / `schoolColor2` on the WCAL girls soccer standings, and
 * `maxprepsPath` the team's girls soccer page (all read 2026-11-14).
 *
 * si.com ids (`sbliveTeamId`, `sbliveSlug`, `sbliveSchoolId`): each read from the team's own si.com girls soccer games page
 * (si.com/high-school/stats/california/girls-soccer/teams/<id>-<slug>/games, 2026-11-21: name, mascot, city, Varsity, the school
 * id in `team.school`), found through si.com's WCAL standings pages or its team search; never guessed.
 * No VNN site ids (the school calendars are read for field hockey only).
 */

import type { Seed } from '../seed';

export const WCAL_SOCCER_SEEDS: readonly Seed[] = [
  {
    id: '0f63870a-34f3-4d5b-9dbf-653c8410f969',
    slug: 'mitty',
    name: 'Archbishop Mitty',
    shortName: 'Mitty',
    abbr: 'MI',
    acronym: 'AMHS',
    mascot: 'Monarchs',
    city: 'San Jose',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['222222', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/archbishop-mitty-monarchs/soccer/girls/winter/',
    sbliveTeamId: '400413',
    sbliveSlug: '400413-archbishop-mitty-monarchs',
    sbliveSchoolId: '31718',
    aliases: [
      'Archbishop Mitty', 'MITTY', 'Mitty', 'Archbishop Mitty Monarchs',
      'Archbishop Mitty High School', 'Mitty High School',
    ],
  },
  {
    id: 'ea81d3e5-b4ae-4673-afda-207b10865ffe',
    slug: 'riordan',
    name: 'Archbishop Riordan',
    shortName: 'Riordan',
    abbr: 'AR',
    acronym: 'ARHS',
    mascot: 'Crusaders',
    city: 'San Francisco',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['754ACC', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-francisco/archbishop-riordan-crusaders/soccer/girls/winter/',
    sbliveTeamId: '496907',
    sbliveSlug: '496907-archbishop-riordan-crusaders',
    sbliveSchoolId: '159',
    aliases: [
      'Archbishop Riordan', 'RIORDAN', 'Riordan', 'Archbishop Riordan Crusaders',
      'Archbishop Riordan High School', 'Riordan High School',
    ],
  },
  {
    id: '1806a4eb-3371-4e7c-a755-835229bc515e',
    slug: 'sacred-heart-cathedral',
    name: 'Sacred Heart Cathedral',
    shortName: 'SHC',
    abbr: 'SH',
    acronym: 'SHCP',
    mascot: 'Fighting Irish',
    city: 'San Francisco',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['005B34', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-francisco/sacred-heart-cathedral-preparatory-fighting-irish/soccer/girls/winter/',
    sbliveTeamId: '354479',
    sbliveSlug: '354479-sacred-heart-cathedral-preparatory-fightin-irish',
    sbliveSchoolId: '160',
    aliases: [
      'Sacred Heart Cathedral', 'Sacred Heart Cathedral Preparatory', 'SACRED HEART CATHEDRAL', 'Sacred Heart Cathedral Prep',
      'SHC', 'SHCP', 'Sacred Heart Cathedral Preparatory Fighting Irish', 'Sacred Heart Cathedral Fighting Irish',
    ],
  },
  {
    id: 'de6d3780-e8f6-4a2a-93f2-b5d89499f9b0',
    slug: 'saint-francis',
    name: 'Saint Francis',
    shortName: 'Saint Francis',
    abbr: 'SF',
    acronym: 'SFHS',
    mascot: 'Lancers',
    city: 'Mountain View',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['503604', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/mountain-view/saint-francis-lancers/soccer/girls/winter/',
    sbliveTeamId: '359171',
    sbliveSlug: '359171-saint-francis-lancers',
    sbliveSchoolId: '2822',
    aliases: [
      'Saint Francis', 'ST. FRANCIS', 'St. Francis', 'St Francis',
      'Saint Francis Lancers', 'Saint Francis High School', 'Saint Francis (Mountain View)',
    ],
  },
  {
    id: '1dc4836b-4daf-4573-b525-27b474bd5366',
    slug: 'st-ignatius',
    name: 'St. Ignatius',
    shortName: 'St. Ignatius',
    abbr: 'SI',
    acronym: 'SICP',
    mascot: 'Wildcats',
    city: 'San Francisco',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['CC0022', '034CB2'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-francisco/st-ignatius-college-preparatory-wildcats/soccer/girls/winter/',
    sbliveTeamId: '354485',
    sbliveSlug: '354485-st-ignatius-wildcats',
    sbliveSchoolId: '161',
    aliases: [
      'St. Ignatius College Preparatory', 'ST. IGNATIUS', 'Saint Ignatius', 'St. Ignatius',
      'St Ignatius', 'SICP', 'St. Ignatius College Prep', 'St. Ignatius Wildcats',
      'St. Ignatius College Preparatory High School',
    ],
  },
  {
    id: '8a8c04d2-5606-44cf-9993-34db55474240',
    slug: 'valley-christian',
    name: 'Valley Christian',
    shortName: 'Valley Christian',
    abbr: 'VC',
    acronym: 'VCHS',
    mascot: 'Warriors',
    city: 'San Jose',
    section: 'ccs',
    league: 'wcal',
    division: 'wcal',
    dataCoverage: 'full',
    colors: ['022C66', '046DFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/valley-christian-warriors/soccer/girls/winter/',
    sbliveTeamId: '354754',
    sbliveSlug: '354754-valley-christian-warriors',
    sbliveSchoolId: '319',
    aliases: [
      'Valley Christian', 'VALLEY CHRISTIAN', 'Valley Christian Warriors', 'Valley Christian High School',
      'Valley Christian (San Jose)',
    ],
  },
];
