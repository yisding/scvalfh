/**
 * The Santa Clara Valley Athletic League (CCS), girls soccer 2026-27: the soccer build's one league
 * (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams are lib/registry/soccer/scval.ts.
 *
 * Sources, all read 2026-11-06:
 *  - The SCVAL Soccer By-Laws, "approved 3.23.23", the current copy linked from scval.com's winter page
 *    (SCVAL_SOCCER_BYLAWS below; the file name says 23-24). Articles cited as the document numbers them.
 *  - The two official 2026-27 girls schedules (De Anza, El Camino), dated 4/20/2026, transcribed to
 *    data/soccer/official/scval-2026.json. Each is a double round robin; their footers give the season's
 *    dates (first contest Nov 23, last SCVAL event Feb 17, CCS seeding meeting Feb 18, first CCS event
 *    Feb 20, last CCS event Feb 27, CIF NorCal Mar 2-6).
 *  - MaxPreps' SCVAL - De Anza and SCVAL - El Camino girls soccer leagues (leagues/{id}/v1 and their
 *    standings).
 */

import type { LeagueConfig } from '../shape';

const SCVAL_WINTER = 'https://scval.com/winterSports/Winter_index.html';
export const SCVAL_SOCCER_BYLAWS = 'https://scval.com/winterSports/23-24%20%20SCVAL%202%20Soccer%20By-Laws_sept25.pdf';
const BYLAWS = 'SCVAL Soccer By-Laws (approved 3.23.23)';
const DA_SCHEDULE = 'https://scval.com/winterSports/26-27%20SCVAL%20Soccer%20Girls%20DA%20Schedule%20Final_sept17.pdf';
const EC_SCHEDULE = 'https://scval.com/winterSports/26-27%20SCVAL%20Soccer%20Girls%20EC%20Schedule%20Final_sept17.pdf';
const BUNDLE = 'data/soccer/official/scval-2026.json';

export const SCVAL_SOCCER: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  cities: 'Santa Clara County',
  alignmentSource: 'its official schedule',
  officialUrl: SCVAL_WINTER,
  links: [
    { label: 'SCVAL winter sports', href: SCVAL_WINTER },
    { label: 'SCVAL Soccer By-Laws (PDF)', href: SCVAL_SOCCER_BYLAWS },
    { label: 'SCVAL girls soccer De Anza schedule 2026-27 (PDF)', href: DA_SCHEDULE },
    { label: 'SCVAL girls soccer El Camino schedule 2026-27 (PDF)', href: EC_SCHEDULE },
  ],
  // si.com is not read for soccer: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  // The grids name each school in capitals; "MTN. VIEW" is Mountain View (also a registry alias).
  officialCodes: {
    GUNN: 'gunn', HOMESTEAD: 'homestead', 'LOS ALTOS': 'los-altos', 'LOS GATOS': 'los-gatos',
    'MTN. VIEW': 'mountain-view', 'PALO ALTO': 'palo-alto', 'SANTA CLARA': 'santa-clara',
    CUPERTINO: 'cupertino', FREMONT: 'fremont', LYNBROOK: 'lynbrook', MACDONALD: 'macdonald',
    MILPITAS: 'milpitas', 'MONTA VISTA': 'monta-vista', SARATOGA: 'saratoga', WILCOX: 'wilcox',
  },
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'de-anza', leagueId: 'scval', label: 'De Anza', searchAliases: [],
      maxprepsLeagueId: '57fa3fa4-67eb-405d-92b6-87e8b9d12c3f',
      maxprepsName: 'SCVAL - De Anza', maxprepsSlug: 'scval--de-anza',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-06', last: '2027-02-17' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: DA_SCHEDULE, revisionCheckUrl: DA_SCHEDULE,
        bundledSha256: 'deebbe084e738da43f96daa551421f504733974ca114214b6aa383df31f849a0',
        revisedOn: null,
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'el-camino', leagueId: 'scval', label: 'El Camino', searchAliases: [],
      maxprepsLeagueId: '73cc7932-8a91-4671-ab68-b5145c5df339',
      maxprepsName: 'SCVAL - El Camino', maxprepsSlug: 'scval--el-camino',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-16' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: EC_SCHEDULE, revisionCheckUrl: EC_SCHEDULE,
        bundledSha256: '0e3ac5101828faaa4be19ef4078ff9fb32c55e788ea6228d56141ca6f0189abf',
        revisedOn: null,
      },
      // MaxPreps keeps Fremont's girls soccer team in no league (read 2026-11-06), so its table has seven rows.
      maxprepsTeamCount: 7, maxprepsMissing: ['fremont'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps lists Fremont in no league, so its El Camino table has seven teams and leaves Fremont’s games out of the others’ league records. This table is computed from SCVAL’s official schedule.',
      home: { miniRows: 4, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members counts when it is one of the official schedule's fixtures.
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-18', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['head-to-head', 'ccs-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'zero', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS}, Article V §1 (3 points for a win, 1 for a tie, 0 for a loss)`,
      pointsShort: 'Art. V §1',
      order: `${BYLAWS}, Article V §1 (the winner of the double round robin is the division champion, on points)`,
      doubleRoundRobin: 'Article V §1 (double round robin: 12 games each in De Anza, 14 in El Camino)',
      overtime: 'Article I (NFHS rules) and Article V §1 (a tie is worth 1 point; the by-laws set no league overtime, so a level game stands as a tie)',
      coChampions: 'Article V §3.1 (a tie for first means co-champions for league purposes)',
      stages: {
        'head-to-head': 'Article V §3.2-3.4 (head to head; three or more level: points in the games among the tied teams, then §3.2 again)',
        'ccs-points': 'Article V §3.2 (CCS at-large points in division games, then in the last 18 games, then a coin flip — we cannot compute these, so the teams stay tied)',
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— Article V §3.2 breaks it on CCS points, then a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: 'Article V §2 (De Anza’s first three and El Camino’s first-place team represent SCVAL in the CCS playoffs) and §4 (any team at .500 or better in league or overall may apply to CCS for an at-large berth, ordered by CCS power points)',
    ladder: [
      { divisions: ['de-anza'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['de-anza'], places: [4, 99], status: 'out', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth; at .500 or better a team may apply for an at-large berth' },
      { divisions: ['el-camino'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: '1st place — automatic CCS qualifier' },
      { divisions: ['el-camino'], places: [2, 99], status: 'out', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth; at .500 or better a team may apply for an at-large berth' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-17', label: 'Last SCVAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
