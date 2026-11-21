/**
 * The six SCCAL girls soccer seeds, 2026-27 (the soccer build's registry: lib/teams.ts, `SCVAL_SPORT=soccer`).
 * Added with the PAL at the owner's request (2026-11-21).
 *
 * Membership is the SCCAL's own: "SCCAL 2026-27 Girls Soccer (6 teams)", linked from sccal.org/sports-schedules/
 * (read 2026-11-21; lib/league-config/soccer/sccal.ts names it): Aptos, Harbor, San Lorenzo Valley, Santa Cruz,
 * Scotts Valley and Soquel. Mount Madonna, the league's seventh member school, fields no girls soccer team. The
 * CCS's League Placement and Classification by Sport 2026-27 and MaxPreps' "Santa Cruz Coast" girls soccer table
 * (standings read 2026-11-21) hold the same six.
 *
 * A school's id is MaxPreps' school id; the slug, short name and abbr are ours. The name, mascot and city are each
 * school's own row of its MaxPreps boys basketball schedule payload, the acronym each team's `schoolNameAcronym`
 * and the colors its `schoolColor1` / `schoolColor2` on the SCCAL girls soccer standings, and `maxprepsPath`
 * that row's `teamCanonicalUrl` (all read 2026-11-21). The mascots are the ones SCCAL Constitution Article XIX
 * names. lib/registry/basketball/sccal.ts takes each school's seed from here.
 *
 * si.com ids (`sbliveTeamId`, `sbliveSlug`, `sbliveSchoolId`): each read from the team's own si.com girls soccer games page
 * (si.com/high-school/stats/california/girls-soccer/teams/<id>-<slug>/games, 2026-11-21: name, mascot, Varsity, the school id
 * in `team.school`), found through si.com's league standings pages or the league's other teams' games pages; never guessed.
 * No VNN site ids (the school calendars are read for field hockey only).
 */

import type { Seed } from '../seed';

export const SCCAL_SOCCER_SEEDS: readonly Seed[] = [
  {
    id: 'ebb8c443-1d2c-41d8-b859-67bce76d43b2',
    slug: 'aptos',
    name: 'Aptos',
    shortName: 'Aptos',
    abbr: 'AP',
    acronym: 'AHS',
    mascot: 'Mariners',
    city: 'Aptos',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['022C66', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/aptos/aptos-mariners/soccer/girls/winter/',
    sbliveTeamId: '367016',
    sbliveSlug: '367016-aptos-mariners',
    sbliveSchoolId: '12438',
    aliases: [
      'Aptos', 'APTOS', 'Aptos Mariners', 'Aptos High School',
    ],
  },
  {
    id: 'f0378a8c-c57d-4759-a27b-d53843f786a5',
    slug: 'harbor',
    name: 'Harbor',
    shortName: 'Harbor',
    abbr: 'HR',
    acronym: 'HHS',
    mascot: 'Pirates',
    city: 'Santa Cruz',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['00824B', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/santa-cruz/harbor-pirates/soccer/girls/winter/',
    sbliveTeamId: '368144',
    sbliveSlug: '368144-harbor-pirates',
    sbliveSchoolId: '13093',
    aliases: [
      'Harbor', 'HARBOR', 'Harbor Pirates', 'Harbor High School', 'Harbor (Santa Cruz)',
    ],
  },
  {
    id: '1b3a82da-476f-4a32-9652-c238da7764c7',
    slug: 'san-lorenzo-valley',
    name: 'San Lorenzo Valley',
    shortName: 'SLV',
    abbr: 'SL',
    acronym: 'SLVHS',
    mascot: 'Cougars',
    city: 'Felton',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['CC0022', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/felton/san-lorenzo-valley-cougars/soccer/girls/winter/',
    sbliveTeamId: '368004',
    sbliveSlug: '368004-san-lorenzo-valley-cougars',
    sbliveSchoolId: '13014',
    aliases: [
      'San Lorenzo Valley', 'SAN LORENZO VALLEY', 'San Lorenzo Valley Cougars', 'San Lorenzo Valley High School', 'SLV',
    ],
  },
  {
    id: '1773c871-ed53-4aae-8f45-9fa13cb9836a',
    slug: 'santa-cruz',
    name: 'Santa Cruz',
    shortName: 'Santa Cruz',
    abbr: 'SZ',
    acronym: 'SCHS',
    mascot: 'Cardinals',
    city: 'Santa Cruz',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['CC0022', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/santa-cruz/santa-cruz-cardinals/soccer/girls/winter/',
    sbliveTeamId: '368149',
    sbliveSlug: '368149-santa-cruz-cardinals',
    sbliveSchoolId: '13094',
    aliases: [
      'Santa Cruz', 'SANTA CRUZ', 'Santa Cruz Cardinals', 'Santa Cruz High School',
    ],
  },
  {
    id: '83a217c2-c6de-4103-8da0-7d4e4761e121',
    slug: 'scotts-valley',
    name: 'Scotts Valley',
    shortName: 'Scotts Valley',
    abbr: 'SV',
    acronym: 'SVHS',
    mascot: 'Falcons',
    city: 'Scotts Valley',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['8F0018', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/scotts-valley/scotts-valley-falcons/soccer/girls/winter/',
    sbliveTeamId: '368264',
    sbliveSlug: '368264-scotts-valley-falcons',
    sbliveSchoolId: '13187',
    aliases: [
      'Scotts Valley', 'SCOTTS VALLEY', 'Scotts Valley Falcons', 'Scotts Valley High School',
    ],
  },
  {
    id: 'a8cc3305-2fa6-4e76-91ea-5bea8583505a',
    slug: 'soquel',
    name: 'Soquel',
    shortName: 'Soquel',
    abbr: 'SQ',
    acronym: 'SHS',
    mascot: 'Knights',
    city: 'Soquel',
    section: 'ccs',
    league: 'sccal',
    division: 'sccal',
    dataCoverage: 'full',
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/soquel/soquel-knights/soccer/girls/winter/',
    sbliveTeamId: '368152',
    sbliveSlug: '368152-soquel-knights',
    sbliveSchoolId: '13095',
    aliases: [
      'Soquel', 'SOQUEL', 'Soquel Knights', 'Soquel High School',
    ],
  },];
