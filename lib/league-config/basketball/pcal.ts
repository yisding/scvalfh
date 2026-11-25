/**
 * The Pacific Coast Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its
 * teams are lib/registry/basketball/pcal.ts. Added with the PSAL at the owner's request (2026-11-25), so the build
 * covers every league of the CCS.
 *
 * Sources, all read 2026-11-25:
 *  - PCAL Sports Rules – Basketball (Boys and Girls), "Approved by PCAL Board of Managers – March 2024" (RULES below),
 *    linked from pcalathletics.org/governance/: divisions (§1.4), a double round robin (§1.5.1), no league tournament
 *    (§1.7), co- and tri-champions decided by the round robin (§1.8) and the eight boys CCS automatic qualifiers
 *    (§1.9).
 *  - The PCAL By-Laws, "As Revised thru May 21, 2025" (BYLAWS below), Article 23.3: the tiebreakers for a CCS berth.
 *  - The four 2026-27 schedules linked from pcalathletics.org/boys-basketball/ ("2026-2027 PCAL <division> Boys
 *    Basketball Schedule", each marked Final, one PDF a division): every division a double round robin. Gabilan
 *    (seven teams) and Santa Lucia (eight) play Mon Jan 4 to Thu Feb 11, 2027, twelve and fourteen games a team;
 *    Mission (eight) and Cypress (eight) Tue Jan 5 to Fri Feb 12, fourteen games. Each sheet gives the CCS's last
 *    league day (Tue Feb 16) and seeding meeting (Wed Feb 17). The PDFs are not bundled: a league game is a game
 *    between two members of one division inside its league play (`classification: 'membership'`).
 *  - MaxPreps' four "PCAL - <division>" boys basketball leagues (team-context and standings, read 2026-11-25):
 *    Gabilan and Santa Lucia match the league; Mission and Cypress do not (each division's knownCause says how).
 */

import type { LeagueConfig } from '../shape';

const PCAL_SITE = 'https://pcalathletics.org/';
const PCAL_BOYS_BASKETBALL = 'https://pcalathletics.org/boys-basketball/';
const PDF = 'https://pcalathletics.org/wp-content/pdf/';
const schedule = (division: string) => `${PDF}2026-2027-PCAL-Boys-Basketball.${division}.Final_.pdf`;
const GABILAN_SCHEDULE = schedule('Gabilan');
const MISSION_SCHEDULE = schedule('Mission');
const CYPRESS_SCHEDULE = schedule('Cypress');
const SANTA_LUCIA_SCHEDULE = schedule('Santa-Lucia');
const PCAL_BASKETBALL_RULES = `${PDF}Sports-Rules-Basketball-March-2024.pdf`;
const PCAL_BYLAWS = `${PDF}PCAL-By-Laws.Final_.Rev-May-2025-2.pdf`;
const RULES = 'PCAL Sports Rules – Basketball (Mar 2024)';
const BYLAWS = 'PCAL By-Laws (rev. May 2025)';
const note = (division: string, dates: string) =>
  `The PCAL publishes its ${division} boys basketball schedule as a PDF on pcalathletics.org, and this site does not copy it. A league game here is a game between two ${division} teams ${dates}, the dates of the schedule’s double round robin.`;
const COMPUTED = 'This table is computed from the PCAL’s own 2026-27 schedule.';

export const PCAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'pcal', sectionId: 'ccs',
  name: 'Pacific Coast Athletic League', shortName: 'PCAL',
  cities: 'Monterey County, San Benito County, south Santa Cruz County and Morgan Hill',
  alignmentSource: 'its official schedules',
  officialUrl: PCAL_SITE,
  links: [
    { label: 'PCAL boys basketball schedules', href: PCAL_BOYS_BASKETBALL },
    { label: 'PCAL Sports Rules – Basketball (PDF)', href: PCAL_BASKETBALL_RULES },
    { label: 'PCAL By-Laws (PDF)', href: PCAL_BYLAWS },
  ],
  // si.com's standings slugs (read 2026-11-25 from the teams' own si.com standings pages): used only to harvest team ids
  // and for the daily league scoreboards, never for membership; si.com's tables are an older alignment. Its scores
  // cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: {
    leagueSlugs: ['2260-pcal-gabilan', '2261-pcal-mission', '2259-pcal-cypress', '2262-pcal-santa-lucia'],
    backfill: true,
  },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'gabilan', leagueId: 'pcal', label: 'Gabilan', searchAliases: ['PCAL Gabilan', 'Pacific Coast Gabilan'],
      maxprepsLeagueId: 'a6e0d39b-a4ee-4b5d-856a-c568355564f5',
      maxprepsName: 'PCAL - Gabilan', maxprepsSlug: 'pcal--gabilan',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-04', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: GABILAN_SCHEDULE, note: note('Gabilan', 'from January 4 to February 11, 2027') },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 5, lineAfter: 4, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 4, label: 'Automatic-berth line' },
    },
    {
      id: 'mission', leagueId: 'pcal', label: 'Mission', searchAliases: ['PCAL Mission', 'Pacific Coast Mission'],
      maxprepsLeagueId: 'd59622e1-1704-4241-a1a2-ccede1413eb9',
      maxprepsName: 'PCAL - Mission', maxprepsSlug: 'pcal--mission',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: MISSION_SCHEDULE, note: note('Mission', 'from January 5 to February 12, 2027') },
      // Read 2026-11-25: MaxPreps' Mission table also lists three Cypress teams.
      maxprepsTeamCount: 11, maxprepsMissing: [],
      maxprepsExtraRows: {
        '03d12475-a2f6-44c3-9332-0f682de3a31f': 'North Monterey County, a Cypress team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Mission”, read 2026-11-25)',
        '42da7c92-54e6-4c5a-9bd7-c62a5ff40f8d': 'Pajaro Valley, a Cypress team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Mission”, read 2026-11-25)',
        'e9a4a782-76c5-4b15-8dd6-f03b87464aa4': 'Stevenson, a Cypress team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Mission”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ Mission table also lists North Monterey County, Pajaro Valley and Stevenson, which play in the Cypress, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 2, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 2, label: 'Automatic-berth line' },
    },
    {
      id: 'cypress', leagueId: 'pcal', label: 'Cypress', searchAliases: ['PCAL Cypress', 'Pacific Coast Cypress'],
      maxprepsLeagueId: '679058ae-14a2-48e3-9d7d-5708641701e0',
      maxprepsName: 'PCAL - Cypress', maxprepsSlug: 'pcal--cypress',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: CYPRESS_SCHEDULE, note: note('Cypress', 'from January 5 to February 12, 2027') },
      // Read 2026-11-25: MaxPreps lists three Cypress teams in its Mission table.
      maxprepsTeamCount: 5, maxprepsMissing: ['north-monterey-county', 'pajaro-valley', 'stevenson'], maxprepsExtraRows: {},
      reportedTrust: 'records-only',
      knownCause: `MaxPreps lists North Monterey County, Pajaro Valley and Stevenson in its Mission table, so its Cypress table has five teams and leaves their games out of the others’ league records. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'santa-lucia', leagueId: 'pcal', label: 'Santa Lucia', searchAliases: ['PCAL Santa Lucia', 'Pacific Coast Santa Lucia'],
      maxprepsLeagueId: '3973448e-dd0a-4438-bf6c-44127306ca9c',
      maxprepsName: 'PCAL - Santa Lucia', maxprepsSlug: 'pcal--santa-lucia',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-04', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: SANTA_LUCIA_SCHEDULE, note: note('Santa Lucia', 'from January 4 to February 11, 2027') },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // "Each of the Divisions shall have a champion, determined by the league (division) round robin results" (§1.8):
    // a win is one and nothing else counts, ordered on the share of league games won.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts; members also meet in preseason
    // tournaments, which MaxPreps types 2 (tournament). The league holds no tournament (§1.7).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // BYLAWS §23.3 (RULES §1.9 sends every tie for a berth there): head-to-head, then the record against the teams
    // placed above (from the champion down), then against those placed below, in order of finish — which is
    // 'record-vs-placed'; a tie for first skips the teams above, as §23.3.1-23.3.2 do. CCS points and the coin flip
    // or blind draw are not computed, so a tie that reaches them stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'ccs-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${RULES} §1.8 (each division’s champion is “determined by the league (division) round robin results”)`,
      pointsShort: 'PCAL basketball rules §1.8',
      order: `${RULES} §1.8 and ${BYLAWS} §23.2 (the final division standings of the round robin)`,
      doubleRoundRobin: `${RULES} §1.5.1 and the 2026-27 schedules (double round robin: 14 league games each in the Mission, Cypress and Santa Lucia, 12 in the Gabilan)`,
      overtime: `${RULES} §1.6.1 (National Federation rules: a game level after four quarters goes to overtime periods until one team leads, so no game ends level)`,
      coChampions: `${RULES} §1.8 and ${BYLAWS} §22.3 (two teams level for first are co-champions, three are tri-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §23.3.1(a), §23.3.2(a-b) and §23.3.3(a) (head-to-head in league contests; three level: three-way, then two-way)`,
        'record-vs-placed': `${BYLAWS} §23.3.3(b-c) and §23.3.1(b) (the record against each team placed above, from the champion down, then against each team placed below, in order of finish)`,
        'ccs-points': `${BYLAWS} §23.3 (CCS points where a sport seeds on them, then a coin flip or blind draw by the Commissioner — we compute neither, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions (tri-champions when three are level)',
    unresolvedSuffix: '— PCAL By-Laws §23.3 end in CCS points, then a coin flip or blind draw by the Commissioner',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 8,
    citation: `${RULES} §1.9 (eight automatic CCS qualifiers for boys: the Gabilan’s top four, the Mission’s top two, and the Cypress’s and the Santa Lucia’s top finishers)`,
    ladder: [
      { divisions: ['gabilan'], places: [1, 4], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-4 — automatic CCS qualifier' },
      { divisions: ['gabilan'], places: [5, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '5th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['mission'], places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: ['mission'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['cypress', 'santa-lucia'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['cypress', 'santa-lucia'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-12', label: 'Last PCAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
