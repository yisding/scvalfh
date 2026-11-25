/**
 * The thirty-one PCAL boys basketball seeds, 2026-27 (the basketball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=basketball`). Added with the PSAL at the owner's request (2026-11-25).
 *
 * Division membership is the PCAL's own: the four "2026-2027 PCAL <division> Boys Basketball Schedule" PDFs linked
 * from pcalathletics.org/boys-basketball/ (read 2026-11-25; lib/league-config/basketball/pcal.ts names them):
 *   Gabilan    : Carmel, Hollister, Monterey, Oakwood, Pacific Grove, Palma, Salinas
 *   Mission    : Alisal, Marina, Monte Vista Christian, North Salinas, Rancho San Juan, Soledad, St. Francis, Watsonville
 *   Cypress    : Everett Alvarez, Gonzales, Greenfield, King City, North Monterey County, Pajaro Valley, Seaside, Stevenson
 *   Santa Lucia: Anzar, Ceiba, Chartwell, Kirby, Monterey Bay Academy, Pacific Collegiate, Trinity Christian, York
 * A school's division can differ from its girls soccer one. MaxPreps' Mission and Cypress tables do not follow the
 * league's alignment; the league config records each difference.
 *
 * A school the soccer registry holds (lib/registry/soccer/pcal.ts) is that school's soccer seed on its basketball page
 * (lib/registry/basketball/from-soccer.ts). The other five (Oakwood, Ceiba, Chartwell, Kirby and Trinity Christian,
 * which field no PCAL girls soccer team) are written out: id, name, mascot, city, acronym and colors from each team's own row of
 * MaxPreps' boys basketball schedule payloads, `maxprepsPath` that row's `teamCanonicalUrl`, read 2026-11-25.
 *
 * si.com: each school's boys basketball team (team id, the `<id>-<slug>` of its games page and the school id in
 * `team.school`), read 2026-11-25 from each team's own games page, found through si.com's team search by name and
 * city; never guessed. No VNN site ids (the school calendars are read for field hockey only).
 */

import { PCAL_SOCCER_SEEDS } from '../soccer/pcal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const PCAL_BASKETBALL_SEEDS: readonly Seed[] = [
  // ----- gabilan (7) -----
  ...basketballSeedsOf(PCAL_SOCCER_SEEDS, 'gabilan', {
    carmel: { teamId: '154015', slug: '154015-carmel-padres', schoolId: '10223' },
    hollister: { teamId: '159918', slug: '159918-hollister-haybalers', schoolId: '12876' },
    monterey: { teamId: '158277', slug: '158277-monterey-toreadores', schoolId: '12098' },
    'pacific-grove': { teamId: '158903', slug: '158903-pacific-grove-breakers', schoolId: '12435' },
    palma: { teamId: '141086', slug: '141086-palma-chieftains', schoolId: '170' },
    salinas: { teamId: '159908', slug: '159908-salinas-cowboys', schoolId: '12870' },
  }),
  {
    id: '907cf09d-6f40-4fab-a06e-fcfb1f185047',
    slug: 'oakwood',
    name: 'Oakwood',
    shortName: 'Oakwood',
    abbr: 'OA',
    acronym: 'OHS',
    mascot: 'Hawks',
    city: 'Morgan Hill',
    section: 'ccs',
    league: 'pcal',
    division: 'gabilan',
    dataCoverage: 'full',
    colors: ['00341E', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/morgan-hill/oakwood-hawks/basketball/',
    sbliveTeamId: '148668',
    sbliveSlug: '148668-oakwood-hawks',
    sbliveSchoolId: '3892',
    aliases: [
      'Oakwood', 'Oakwood Hawks', 'Oakwood High School',
    ],
  },
  // ----- mission (8) -----
  ...basketballSeedsOf(PCAL_SOCCER_SEEDS, 'mission', {
    alisal: { teamId: '159890', slug: '159890-alisal-trojans', schoolId: '12866' },
    'marina-mariners': { teamId: '158272', slug: '158272-marina-mariners', schoolId: '12097' },
    'monte-vista-christian': { teamId: '141283', slug: '141283-monte-vista-christian-mustangs', schoolId: '248' },
    'north-salinas': { teamId: '159902', slug: '159902-north-salinas-vikings', schoolId: '12869' },
    'rancho-san-juan': { teamId: '487427', slug: '487427-rancho-san-juan-trailblazers', schoolId: '39813' },
    soledad: { teamId: '160804', slug: '160804-soledad-aztecs', schoolId: '13298' },
    'st-francis-watsonville': { teamId: '15309', slug: '15309-st-francis-sharks', schoolId: '3905' },
    watsonville: { teamId: '158927', slug: '158927-watsonville-wildcatz', schoolId: '12442' },
  }),
  // ----- cypress (8) -----
  ...basketballSeedsOf(PCAL_SOCCER_SEEDS, 'cypress', {
    'everett-alvarez': { teamId: '159896', slug: '159896-everett-alvarez-eagles', schoolId: '12867' },
    gonzales: { teamId: '156082', slug: '156082-gonzales-spartans', schoolId: '11121' },
    greenfield: { teamId: '157013', slug: '157013-greenfield-bruins', schoolId: '11486' },
    'king-city': { teamId: '157019', slug: '157019-king-city-mustangs', schoolId: '11487' },
    'north-monterey-county': { teamId: '158650', slug: '158650-north-monterey-county-condors', schoolId: '12288' },
    'pajaro-valley': { teamId: '158921', slug: '158921-pajaro-valley-grizzlies', schoolId: '12440' },
    seaside: { teamId: '45657', slug: '45657-seaside-spartans', schoolId: '12100' },
    stevenson: { teamId: '141227', slug: '141227-stevenson-pirates', schoolId: '227' },
  }),
  // ----- santa-lucia (8) -----
  ...basketballSeedsOf(PCAL_SOCCER_SEEDS, 'santa-lucia', {
    anzar: { teamId: '153360', slug: '153360-anzar-hawks', schoolId: '9947' },
    'monterey-bay-academy': { teamId: '141503', slug: '141503-monterey-bay-academy', schoolId: '358' },
    'pacific-collegiate': { teamId: '207735', slug: '207735-pacific-collegiate-pumas', schoolId: '31955' },
    york: { teamId: '141218', slug: '141218-york-falcons', schoolId: '224' },
  }),
  {
    id: '2c2fa8ba-a22b-4979-bfa9-0321cae496cd',
    slug: 'ceiba',
    name: 'Ceiba College Preparatory Academy',
    shortName: 'Ceiba',
    abbr: 'CC',
    acronym: 'CCPA',
    mascot: 'Spartans',
    city: 'Watsonville',
    section: 'ccs',
    league: 'pcal',
    division: 'santa-lucia',
    dataCoverage: 'full',
    colors: ['108073', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/watsonville/ceiba-college-preparatory-academy-spartans/basketball/',
    sbliveTeamId: '481326',
    sbliveSlug: '481326-ceiba-college-preparatory-academy-spartans',
    sbliveSchoolId: '31765',
    aliases: [
      'Ceiba College Preparatory Academy', 'Ceiba College Preparatory Academy Spartans', 'Ceiba', 'Ceiba College Prep',
    ],
  },
  {
    id: '7183d93f-3632-41bb-8d10-f158f2eb0889',
    slug: 'chartwell',
    name: 'Chartwell',
    shortName: 'Chartwell',
    abbr: 'CA',
    acronym: 'CHS',
    mascot: 'Bulldogs',
    city: 'Seaside',
    section: 'ccs',
    league: 'pcal',
    division: 'santa-lucia',
    dataCoverage: 'full',
    colors: ['222222', '00824B'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/seaside/chartwell-bulldogs/basketball/',
    sbliveTeamId: '582080',
    sbliveSlug: '582080-chartwell-school',
    sbliveSchoolId: '6917',
    aliases: [
      'Chartwell', 'Chartwell Bulldogs', 'Chartwell High School', 'Chartwell School',
    ],
  },
  {
    id: 'e0e64a76-72d8-451e-ac0f-5e8017b2c51c',
    slug: 'kirby',
    name: 'Kirby Prep',
    shortName: 'Kirby',
    abbr: 'KP',
    acronym: 'KP',
    mascot: 'Griffins',
    city: 'Santa Cruz',
    section: 'ccs',
    league: 'pcal',
    division: 'santa-lucia',
    dataCoverage: 'full',
    colors: ['222222', '034CB2'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/santa-cruz/kirby-prep-griffins/basketball/',
    sbliveTeamId: '151448',
    sbliveSlug: '151448-kirby-prep',
    sbliveSchoolId: '8041',
    aliases: [
      'Kirby Prep', 'Kirby Prep Griffins', 'Kirby', 'Kirby School',
    ],
  },
  {
    id: 'bc77f6b7-1674-4bf9-b06e-812926f746ad',
    slug: 'trinity-christian',
    name: 'Trinity Christian',
    shortName: 'Trinity',
    abbr: 'TC',
    acronym: 'TCHS',
    mascot: 'Warriors',
    city: 'Monterey',
    section: 'ccs',
    league: 'pcal',
    division: 'santa-lucia',
    dataCoverage: 'full',
    colors: ['022C66', '1580A5'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/monterey/trinity-christian-warriors/basketball/',
    sbliveTeamId: '148661',
    sbliveSlug: '148661-trinity-christian-warriors',
    sbliveSchoolId: '3874',
    aliases: [
      'Trinity Christian', 'Trinity Christian Warriors', 'Trinity Christian High School', 'Trinity Christian (Monterey)',
    ],
  },];
