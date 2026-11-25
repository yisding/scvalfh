/**
 * The Pacific Coast Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams are
 * lib/registry/soccer/pcal.ts. Added with the PSAL at the owner's request (2026-11-25), so the build covers every
 * league of the CCS.
 *
 * Sources, all read 2026-11-25:
 *  - PCAL Sport Rules – Soccer (Boys and Girls), "As Amended by PCAL Board of Managers – September 2022" (RULES below),
 *    linked from pcalathletics.org/governance/: four divisions (§1.4), a double round robin (§1.5.1), no overtime in
 *    league play (§1.6.3), 3-1-0 points (§1.6.4), no league tournament (§1.7), co- and tri-champions (§1.8) and the
 *    seven CCS automatic qualifiers (§1.9).
 *  - The PCAL By-Laws, "As Revised thru May 21, 2025" (BYLAWS below), Article 23.3: the tiebreakers for a CCS berth.
 *  - The four 2026-27 schedules linked from pcalathletics.org/girls-soccer/ ("2026-2027 PCAL-<division> Girls Soccer
 *    Schedule", each marked Final, one PDF a division): every division a double round robin. Gabilan (seven teams)
 *    and Mission (seven) play Tue Jan 5 to Fri Feb 12, 2027, twelve games a team; Cypress (six) Mon Jan 4 to Thu Feb
 *    11, ten games; Santa Lucia (seven) Mon Jan 4 to Thu Feb 11, twelve games. The Mission and Santa Lucia
 *    schedules add "Tues Feb 16 — Mission #2 at Santa Lucia #1 for CCS Play-in Game". The PDFs are not bundled: a
 *    league game is a game between two members of one division inside its league play (`classification:
 *    'membership'`).
 *  - MaxPreps' four "PCAL - <division>" girls soccer leagues (team-context and standings, read 2026-11-25): Cypress
 *    matches the league; the other three follow an older alignment (each division's knownCause says how).
 */

import type { LeagueConfig } from '../shape';

const PCAL_SITE = 'https://pcalathletics.org/';
const PCAL_GIRLS_SOCCER = 'https://pcalathletics.org/girls-soccer/';
const PDF = 'https://pcalathletics.org/wp-content/pdf/';
const GABILAN_SCHEDULE = `${PDF}2026-2027-PCAL-Girls-Soccer.Gabilan.Final_.pdf`;
const MISSION_SCHEDULE = `${PDF}2026-2027-PCAL-Girls-Soccer.Mission.Final_.With-Play-in-Game.pdf`;
const CYPRESS_SCHEDULE = `${PDF}2026-2027-PCAL-Girls-Soccer.Cypress.Final_.pdf`;
const SANTA_LUCIA_SCHEDULE = `${PDF}2026-2027-PCAL-Girls-Soccer.Santa-Lucia.Final_.With-Play-In-Game.pdf`;
const PCAL_SOCCER_RULES = `${PDF}PCAL-Sports-Rules-Soccer-September-2022.pdf`;
const PCAL_BYLAWS = `${PDF}PCAL-By-Laws.Final_.Rev-May-2025-2.pdf`;
const RULES = 'PCAL Sport Rules – Soccer (Sep 2022)';
const BYLAWS = 'PCAL By-Laws (rev. May 2025)';
const note = (division: string, dates: string) =>
  `The PCAL publishes its ${division} girls soccer schedule as a PDF on pcalathletics.org, and this site does not copy it. A league game here is a game between two ${division} teams ${dates}, the dates of the schedule’s double round robin.`;
const OLDER = 'MaxPreps’ PCAL girls soccer tables follow an older alignment, so its league records here can differ from ours. This table is computed from the PCAL’s own 2026-27 schedule.';

export const PCAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'pcal', sectionId: 'ccs',
  name: 'Pacific Coast Athletic League', shortName: 'PCAL',
  cities: 'Monterey County, San Benito County and south Santa Cruz County',
  alignmentSource: 'its official schedules',
  officialUrl: PCAL_SITE,
  links: [
    { label: 'PCAL girls soccer schedules', href: PCAL_GIRLS_SOCCER },
    { label: 'PCAL Sport Rules – Soccer (PDF)', href: PCAL_SOCCER_RULES },
    { label: 'PCAL By-Laws (PDF)', href: PCAL_BYLAWS },
  ],
  // si.com's standings slugs (read 2026-11-25 from the teams' own si.com standings pages): used only to harvest team ids
  // and for the daily league scoreboards, never for membership. si.com's PCAL tables are an older alignment, with a fifth
  // division (Arroyo: Anzar, York). Its scores cross-check MaxPreps' and backfill under D2's rules
  // (lib/crosscheck/backfill.ts).
  sblive: {
    leagueSlugs: ['3894-pcal-gabilan', '3895-pcal-mission', '3893-pcal-cypress', '3896-pcal-santa-lucia', '3892-pcal-arroyo'],
    backfill: true,
  },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'gabilan', leagueId: 'pcal', label: 'Gabilan', searchAliases: ['PCAL Gabilan', 'Pacific Coast Gabilan'],
      maxprepsLeagueId: '0cfa4172-5769-479c-b72a-9f0499b81dd0',
      maxprepsName: 'PCAL - Gabilan', maxprepsSlug: 'pcal--gabilan',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: GABILAN_SCHEDULE, note: note('Gabilan', 'from January 5 to February 12, 2027') },
      // Read 2026-11-25: MaxPreps' Gabilan table lists Pajaro Valley and Soledad (Mission teams) and leaves out
      // Pacific Collegiate and Watsonville, which it lists in its Mission table.
      maxprepsTeamCount: 7, maxprepsMissing: ['pacific-collegiate', 'watsonville'],
      maxprepsExtraRows: {
        '42da7c92-54e6-4c5a-9bd7-c62a5ff40f8d': 'Pajaro Valley, a Mission team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Gabilan”, read 2026-11-25)',
        '41b63d87-2795-4ed9-9264-e6d7e19c5971': 'Soledad, a Mission team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Gabilan”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ Gabilan table lists Pajaro Valley and Soledad, which play in the Mission, and leaves out Pacific Collegiate and Watsonville. ${OLDER}`,
      home: { miniRows: 5, lineAfter: 4, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 4, label: 'Automatic-berth line' },
    },
    {
      id: 'mission', leagueId: 'pcal', label: 'Mission', searchAliases: ['PCAL Mission', 'Pacific Coast Mission'],
      maxprepsLeagueId: '84fe06a2-77b4-41d3-92f0-75af136c0c56',
      maxprepsName: 'PCAL - Mission', maxprepsSlug: 'pcal--mission',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: MISSION_SCHEDULE, note: note('Mission', 'from January 5 to February 12, 2027') },
      // Read 2026-11-25: MaxPreps' Mission table lists Pacific Collegiate and Watsonville (Gabilan teams) and leaves
      // out Gonzales, Pajaro Valley and Soledad.
      maxprepsTeamCount: 6, maxprepsMissing: ['gonzales', 'pajaro-valley', 'soledad'],
      maxprepsExtraRows: {
        'eddcc26a-1a48-4c33-a8e9-7cd666f7d42a': 'Pacific Collegiate, a Gabilan team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Mission”, read 2026-11-25)',
        '78ab1d8a-38ee-4c32-a9a5-ea05afd088a4': 'Watsonville, a Gabilan team in the PCAL’s 2026-27 alignment (MaxPreps’ “PCAL - Mission”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ Mission table lists Pacific Collegiate and Watsonville, which play in the Gabilan, and leaves out Gonzales, Pajaro Valley and Soledad. ${OLDER}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'cypress', leagueId: 'pcal', label: 'Cypress', searchAliases: ['PCAL Cypress', 'Pacific Coast Cypress'],
      maxprepsLeagueId: 'cb0661f6-55a8-4d1d-9105-dce6886db892',
      maxprepsName: 'PCAL - Cypress', maxprepsSlug: 'pcal--cypress',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-04', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: CYPRESS_SCHEDULE, note: note('Cypress', 'from January 4 to February 11, 2027') },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'santa-lucia', leagueId: 'pcal', label: 'Santa Lucia', searchAliases: ['PCAL Santa Lucia', 'Pacific Coast Santa Lucia'],
      maxprepsLeagueId: 'fa2841e1-35d8-4c25-a0e1-4ef3aa19ff7e',
      maxprepsName: 'PCAL - Santa Lucia', maxprepsSlug: 'pcal--santa-lucia',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-04', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: SANTA_LUCIA_SCHEDULE, note: note('Santa Lucia', 'from January 4 to February 11, 2027') },
      // Read 2026-11-25: MaxPreps' Santa Lucia table holds Anzar and Marina, and Ceiba, Oakwood and Trinity Christian,
      // none of which is on the PCAL's 2026-27 girls soccer schedules; the other five teams are in no MaxPreps league.
      maxprepsTeamCount: 5,
      maxprepsMissing: ['monterey-bay-academy', 'pacific-grove', 'st-francis-watsonville', 'santa-catalina', 'york'],
      maxprepsExtraRows: {
        '2c2fa8ba-a22b-4979-bfa9-0321cae496cd': 'Ceiba, on none of the PCAL’s 2026-27 girls soccer schedules (MaxPreps’ “PCAL - Santa Lucia”, read 2026-11-25)',
        '907cf09d-6f40-4fab-a06e-fcfb1f185047': 'Oakwood, on none of the PCAL’s 2026-27 girls soccer schedules (MaxPreps’ “PCAL - Santa Lucia”, read 2026-11-25)',
        'bc77f6b7-1674-4bf9-b06e-812926f746ad': 'Trinity Christian, on none of the PCAL’s 2026-27 girls soccer schedules (MaxPreps’ “PCAL - Santa Lucia”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ Santa Lucia table lists Ceiba, Oakwood and Trinity Christian, which are on none of the PCAL’s girls soccer schedules, and keeps Monterey Bay Academy, Pacific Grove, St. Francis, Santa Catalina and York in no league. ${OLDER}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Play-in host' },
      ladderLine: { after: 1, label: 'Play-in host' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts. The postseason opens with the CCS
    // play-in, Mission #2 at Santa Lucia #1 on Tue Feb 16 (the Mission and Santa Lucia schedules).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-16', leagueGameOverrides: [],
    matcher: 'two-phase',
    // BYLAWS §23.3 (RULES §1.9 sends every tie for a berth there): head-to-head, then the record against the teams
    // placed above (from the champion down), then against those placed below, in order of finish — which is
    // 'record-vs-placed'; a tie for first skips the teams above, as §23.3.1-23.3.2 do. CCS points and the coin flip
    // or blind draw are not computed, so a tie that reaches them stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'ccs-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${RULES} §1.6.4 (the international scoring system: a win is 3 points, a tie 1 point, a loss 0 points)`,
      pointsShort: 'PCAL soccer rules §1.6.4',
      order: `${RULES} §1.6.4 and §1.8 (league standings by points; each division’s champion is decided by its round robin)`,
      doubleRoundRobin: `${RULES} §1.5.1 and the 2026-27 schedules (double round robin: 12 league games each in the Gabilan, Mission and Santa Lucia, 10 in the Cypress)`,
      overtime: `${RULES} §1.6.3 (“There shall be no overtime for regular league or preseason games”, so a level game stands as a tie)`,
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
    kind: 'ccs-ladder', autoBerths: 7,
    citation: `${RULES} §1.9 (seven automatic CCS qualifiers: the Gabilan’s top four, the Mission’s and the Cypress’s top finishers, and the winner of a play-in game between the Mission’s #2 at the Santa Lucia’s #1)`,
    ladder: [
      { divisions: ['gabilan'], places: [1, 4], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-4 — automatic CCS qualifier' },
      { divisions: ['gabilan'], places: [5, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '5th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['mission'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['mission'], places: [2, 2], status: 'play-in', label: 'CCS play-in',
        phrase: 'the CCS play-in', badge: 'Play-in',
        legend: '2nd place — plays at the Santa Lucia champion on Tue Feb 16 for the PCAL’s 7th berth' },
      { divisions: ['mission'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['cypress'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['cypress'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['santa-lucia'], places: [1, 1], status: 'play-in', label: 'Hosts the CCS play-in',
        phrase: 'hosting the CCS play-in', badge: 'Play-in host',
        legend: 'Division champion — hosts the Mission’s 2nd-place team on Tue Feb 16 for the PCAL’s 7th berth' },
      { divisions: ['santa-lucia'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
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
    { id: 'pcal-play-in', date: '2027-02-16', label: 'PCAL CCS play-in: Mission #2 at Santa Lucia #1' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
