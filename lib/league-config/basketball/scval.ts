/**
 * The Santa Clara Valley Athletic League (CCS), boys basketball 2026-27: the basketball build's one league
 * (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its teams are lib/registry/basketball/scval.ts.
 *
 * Sources, all read 2026-11-10:
 *  - The SCVAL Basketball By-Laws, "approved 3.23.23", the current copy linked from scval.com's winter page
 *    (SCVAL_BASKETBALL_BYLAWS below; the file name says 23-24). Articles cited as the document numbers them.
 *  - The two official 2026-27 boys schedules (De Anza "Revised 5/4/2026", El Camino dated 3/17/2026),
 *    transcribed to data/basketball/official/scval-2026.json by `pnpm build-scval-basketball-fixtures` from
 *    their text (tests/fixtures/official/source/scval-basketball-*.txt). Each is a double round robin over 14
 *    dates, Sat Jan 2 to Tue Feb 16; their footers give the season's dates (first contest Nov 23, last SCVAL
 *    event Feb 16, CCS seeding meeting Feb 17, first CCS event Feb 19, last CCS event Feb 27, CIF NorCal
 *    Mar 2-10, CIF State Mar 12-13) and the starting times (JV 5:30 and varsity 7:00; on a quad day the boys
 *    varsity at 7:45 and the JV games at 3:00 and 4:30).
 *  - MaxPreps' Santa Clara Valley - De Anza and Santa Clara Valley - El Camino boys basketball leagues
 *    (leagues/{id}/v1 and their standings).
 *
 * What is basketball's own here: the table is ordered on the league record, not on points (Article VI §1),
 * a game cannot end level, and the JV teams play the same double round robin (Article V §2), which the
 * schedule times and the Monday Feb 15 JV round spell out (lib/official/schema.ts `jv`).
 */

import type { LeagueConfig } from '../shape';

const SCVAL_WINTER = 'https://scval.com/winterSports/Winter_index.html';
export const SCVAL_BASKETBALL_BYLAWS = 'https://scval.com/winterSports/23-24%20SCVAL%202%20Basketball%20By-Laws.pdf';
const BYLAWS = 'SCVAL Basketball By-Laws (approved 3.23.23)';
const DA_SCHEDULE = 'https://scval.com/winterSports/26-27%20SCVAL%20BB%20Schedule%20DA%20Boys%20Final%20Revised%205_4_26_1.pdf';
const EC_SCHEDULE = 'https://scval.com/winterSports/26-27%20SCVAL%20BB%20Schedule%20EC%20Boys%20Final_revSep25.pdf';
const BUNDLE = 'data/basketball/official/scval-2026.json';

export const SCVAL_BASKETBALL: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  cities: 'Santa Clara County',
  alignmentSource: 'its official schedule',
  officialUrl: SCVAL_WINTER,
  links: [
    { label: 'SCVAL winter sports', href: SCVAL_WINTER },
    { label: 'SCVAL Basketball By-Laws (PDF)', href: SCVAL_BASKETBALL_BYLAWS },
    { label: 'SCVAL boys basketball De Anza schedule 2026-27 (PDF)', href: DA_SCHEDULE },
    { label: 'SCVAL boys basketball El Camino schedule 2026-27 (PDF)', href: EC_SCHEDULE },
  ],
  // si.com is not read for basketball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  // The grids name each school in capitals; "MTN. VIEW" is Mountain View (also a registry alias).
  officialCodes: {
    GUNN: 'gunn', HOMESTEAD: 'homestead', 'LOS GATOS': 'los-gatos', LYNBROOK: 'lynbrook',
    MILPITAS: 'milpitas', 'MTN. VIEW': 'mountain-view', 'PALO ALTO': 'palo-alto',
    CUPERTINO: 'cupertino', FREMONT: 'fremont', 'LOS ALTOS': 'los-altos', MACDONALD: 'macdonald',
    'MONTA VISTA': 'monta-vista', 'SANTA CLARA': 'santa-clara', SARATOGA: 'saratoga', WILCOX: 'wilcox',
  },
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'de-anza', leagueId: 'scval', label: 'De Anza', searchAliases: [],
      maxprepsLeagueId: '8d1770da-1f9e-4d5f-b819-bfb9993a2ef1',
      maxprepsName: 'Santa Clara Valley - De Anza', maxprepsSlug: 'santa-clara-valley--de-anza',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-02', last: '2027-02-16' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: DA_SCHEDULE, revisionCheckUrl: DA_SCHEDULE,
        bundledSha256: 'b539c6d11939afd4df505e704fbbcdf1d7162c492d78204d5497f40caefcbb17',
        revisedOn: '5/4/2026',
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'el-camino', leagueId: 'scval', label: 'El Camino', searchAliases: [],
      maxprepsLeagueId: '375fe30d-1c5b-4256-b924-69457ecb9374',
      maxprepsName: 'Santa Clara Valley - El Camino', maxprepsSlug: 'santa-clara-valley--el-camino',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-02', last: '2027-02-16' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: EC_SCHEDULE, revisionCheckUrl: EC_SCHEDULE,
        bundledSha256: 'c30648939f1c56fd3d39b40a8cb1e8b39f402c4129d113cb35a980419943e7fc',
        revisedOn: null,
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // A win is one and nothing else counts, so a team's `pts` is its league wins; the table is ordered on the
    // share of league games won (orderBy 'win-pct'), which is what "league record" means while teams have
    // played different numbers of games (De Anza's seven teams take turns on a bye).
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A game between two members counts when it is one of the official schedule's fixtures: members also meet
    // in preseason tournaments, which MaxPreps types 2 (tournament).
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'coaches-vote'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS}, Article VI §1 (“A team’s league record determines their finish in league play”)`,
      pointsShort: 'Art. VI §1',
      order: `${BYLAWS}, Article VI §1 (a team’s league record determines its finish)`,
      doubleRoundRobin: 'Article V §2 (a double round robin at both varsity and JV level: 12 games each in De Anza, 14 in El Camino)',
      overtime: 'Article I (National Federation rules: a game level after four 8-minute quarters, Article IV §2.1, goes to overtime periods until one team leads, so no game ends level)',
      coChampions: 'Article VI §1 (co-champions are declared if two or more teams tie for first)',
      stages: {
        'head-to-head': 'Article VI §1.1 (head-to-head competition)',
        'record-vs-placed': 'Article VI §1.1 (record against the highest-placed opponent in the division, then the next, in descending order)',
        'coaches-vote': 'Article VI §1.1 (a blind coaches’ vote of the division, then a coin flip — we cannot compute either, so the teams stay level)',
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— Article VI §1.1 settles it by a blind coaches’ vote, then a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: 'Article VI §2.1 (the top three teams of the De Anza Division and the El Camino Division champion are automatic qualifiers for the CCS playoffs) and §2 (any team with a league record or an out-of-league record of .500 or better may apply for entry)',
    ladder: [
      { divisions: ['de-anza'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['de-anza'], places: [4, 99], status: 'out', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth; at .500 or better in league or out of league a team may apply for an at-large berth' },
      { divisions: ['el-camino'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: '1st place — automatic CCS qualifier' },
      { divisions: ['el-camino'], places: [2, 99], status: 'out', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth; at .500 or better in league or out of league a team may apply for an at-large berth' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-16', label: 'Last SCVAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
