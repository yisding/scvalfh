/**
 * The Santa Clara Valley Athletic League (CCS), girls volleyball 2026 (lib/leagues.ts,
 * `SCVAL_SPORT=volleyball`). Its teams are lib/registry/volleyball/scval.ts.
 *
 * Sources, all read 2026-11-14:
 *  - The SCVAL Volleyball By-Laws - Girls', "BOM approved 1.22.26", linked from scval.com's fall page
 *    (SCVAL_VOLLEYBALL_BYLAWS below). Articles cited as the document numbers them.
 *  - The two official 2026-27 girls schedules, both dated 11/18/2025, transcribed to
 *    data/volleyball/official/scval-2026.json by `pnpm build-scval-volleyball-fixtures` from their text
 *    (tests/fixtures/official/source/scval-volleyball-girls-*.txt). Each is a double round robin: De Anza's seven
 *    teams over 14 dates, Thu Sep 10 to Mon Oct 26, one team on a bye each date; El Camino's eight over 14
 *    dates, Wed Sep 9 to Tue Oct 27. Their footers give the season's dates (first contest Aug 27, last SCVAL
 *    event Oct 28, CCS seeding meeting Oct 29, first CCS event Oct 31, last CCS event Nov 7, CIF NorCal
 *    Nov 10-17, CIF State Nov 20-21) and the starting times (JV 5:30, varsity 6:45).
 *  - MaxPreps' Santa Clara Valley - De Anza and Santa Clara Valley - El Camino girls volleyball leagues
 *    (leagues/{id}/v1 and their standings: the same seven and the same eight teams).
 *
 * What is volleyball's own here: a match is the best of five sets, so no match ends level and a team's score
 * is its sets won; the table is ordered on the league record (Article V §5); and a tie is broken on matches,
 * then sets, between the tied teams, then on the points scored in those sets, which this site does not have.
 */

import type { LeagueConfig } from '../shape';

const SCVAL_FALL = 'https://www.scval.com/fallSports/Fall_index.html';
export const SCVAL_VOLLEYBALL_BYLAWS = 'https://www.scval.com/fallSports/1%2026-27%20SCVAL%20Volleyball%20Girls\'%20By-Laws.pdf';
const BYLAWS = 'SCVAL Volleyball By-Laws - Girls’ (approved 1.22.26)';
const DA_SCHEDULE = 'https://www.scval.com/fallSports/26-27%20SCVAL%20VB%20-%20G%20DA%20Final.pdf';
const EC_SCHEDULE = 'https://www.scval.com/fallSports/26-27%20SCVAL%20VB%20-%20G%20EC%20Final.pdf';
const BUNDLE = 'data/volleyball/official/scval-2026.json';

export const SCVAL_VOLLEYBALL: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  cities: 'Santa Clara County',
  alignmentSource: 'its official schedule',
  officialUrl: SCVAL_FALL,
  links: [
    { label: 'SCVAL fall sports', href: SCVAL_FALL },
    { label: 'SCVAL Volleyball By-Laws - Girls’ (PDF)', href: SCVAL_VOLLEYBALL_BYLAWS },
    { label: 'SCVAL girls volleyball De Anza schedule 2026 (PDF)', href: DA_SCHEDULE },
    { label: 'SCVAL girls volleyball El Camino schedule 2026 (PDF)', href: EC_SCHEDULE },
  ],
  // si.com is not read for volleyball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  // The grids name each school in capitals; "MTN. VIEW" is Mountain View (also a registry alias).
  officialCodes: {
    CUPERTINO: 'cupertino', HOMESTEAD: 'homestead', 'LOS ALTOS': 'los-altos', 'LOS GATOS': 'los-gatos',
    MILPITAS: 'milpitas', 'MONTA VISTA': 'monta-vista', 'PALO ALTO': 'palo-alto',
    FREMONT: 'fremont', GUNN: 'gunn', LYNBROOK: 'lynbrook', MACDONALD: 'macdonald',
    'MTN. VIEW': 'mountain-view', 'SANTA CLARA': 'santa-clara', SARATOGA: 'saratoga', WILCOX: 'wilcox',
  },
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'de-anza', leagueId: 'scval', label: 'De Anza', searchAliases: [],
      maxprepsLeagueId: '276de40b-cd8a-4af6-9eae-db57277149b9',
      maxprepsName: 'Santa Clara Valley - De Anza', maxprepsSlug: 'santa-clara-valley--de-anza',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-10', last: '2026-10-26' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: DA_SCHEDULE, revisionCheckUrl: DA_SCHEDULE,
        bundledSha256: '89c48a6f9a6cbc3b326fd9d38bffe948a0084113ac5acfa4e84c4da4922f15b8',
        revisedOn: null,
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'el-camino', leagueId: 'scval', label: 'El Camino', searchAliases: [],
      maxprepsLeagueId: '212bd90a-2c53-4085-b62d-f5859215fae7',
      maxprepsName: 'Santa Clara Valley - El Camino', maxprepsSlug: 'santa-clara-valley--el-camino',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2026-09-09', last: '2026-10-27' },
      official: {
        source: 'scval-pdf', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: EC_SCHEDULE, revisionCheckUrl: EC_SCHEDULE,
        bundledSha256: '2e552d95a3e029ac4100bdf171c0108593421a94763105cb4274ca4342df4148',
        revisedOn: null,
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // A win is one and nothing else counts, so a team's `pts` is its league wins; the table is ordered on the
    // share of league matches won (orderBy 'win-pct'), which is what "league record" means while teams have
    // played different numbers of matches (De Anza's seven teams take turns on a bye).
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A match between two members counts when it is one of the official schedule's fixtures: members also meet
    // in tournaments, which MaxPreps types 2 (tournament) and which are often the best of three sets.
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2026-10-29', leagueGameOverrides: [],
    matcher: 'two-phase',
    // Article V §5.1-5.2, written for a tie for the last automatic berth and applied here to every place. The
    // third step (points scored less points given up in the sets between the tied teams) is not computed: the
    // feeds this site reads carry a match's sets won, not each set's points.
    tiebreaks: { default: ['head-to-head', 'h2h-set-ratio', 'set-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS}, Article V §5 (“A team’s league record determines their finish in league play”)`,
      pointsShort: 'Art. V §5',
      order: `${BYLAWS}, Article V §5 (a team’s league record determines its finish)`,
      doubleRoundRobin: 'Article III §3.4 (a double round robin at both varsity and JV level: 12 matches each in De Anza, 14 in El Camino)',
      overtime: 'Article IV §2.1 (a varsity match is the best of five sets, to 25 points and the fifth to 15, so no match ends level)',
      coChampions: 'Article V §5 (co-champions are declared if two or more teams tie for first)',
      stages: {
        'head-to-head': 'Article V §5.1.1a and §5.2.1.1 (matches won between the tied teams)',
        'h2h-set-ratio': 'Article V §5.1.1b and §5.2.1.2 (sets won between the tied teams: for three or more, their ratio of sets won to sets lost)',
        'set-points': 'Article V §5.1.1c and §5.2.1.3-4 (points scored less points given up in the sets between the tied teams, then the last league match between them — we do not have each set’s points, so the teams stay level)',
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— Article V §5 settles it on the points scored in the sets between the tied teams',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: 'Article V §1-§2 (the first three teams of the De Anza Division and the first-place team of the El Camino Division receive an automatic CCS playoff berth) and §3 (a team at .500 or better in league or out of league may apply for an at-large berth)',
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
    { phase: 'playoffs', through: '2026-11-07' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-27', label: 'Last SCVAL league matches' },
    { id: 'ccs-seeding', date: '2026-10-29', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
