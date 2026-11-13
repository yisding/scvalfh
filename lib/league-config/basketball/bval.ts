/**
 * The Blossom Valley Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`).
 * Its teams are lib/registry/basketball/bval.ts. Added so the ratings count SCVAL's non-league games against BVAL
 * schools (owner decision, 2026-11-13).
 *
 * Sources, all read 2026-11-13:
 *  - The BVAL Basketball By-Laws, "Revised 5/29/26", linked from bval.org/constitution-bylaws/ (BYLAWS below).
 *    Sections cited as the document numbers them.
 *  - The four 2026-27 boys division schedules linked from bval.org/boys-basketball/ (Google Docs, each a .docx),
 *    transcribed to data/basketball/official/bval-2026.json by `pnpm build-bval-winter-fixtures` from their text
 *    (tests/fixtures/official/source/bval-basketball-boys-*.txt). Each is a double round robin, Jan 6 to Feb 16;
 *    their headers give the game times (JV 5:30, varsity 7:00) and the CCS dates (first contest Nov 23, seeding
 *    meeting Feb 17, first CCS contest Feb 19).
 *  - MaxPreps' four BVAL boys basketball leagues (leagues/{id}/v1 and their standings), whose tables do not
 *    follow BVAL's divisions: each division's `knownCause` says how.
 */

import type { LeagueConfig } from '../shape';

const BVAL_BASKETBALL = 'https://bval.org/boys-basketball/';
export const BVAL_BASKETBALL_BYLAWS = 'https://docs.google.com/document/d/1w-3bl3JXEm95gqYUKTZIygVFAmQu_Dbe/edit';
const BYLAWS = 'BVAL Basketball By-Laws (rev. 5/29/26)';
const BUNDLE = 'data/basketball/official/bval-2026.json';
const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const download = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`;
const MH = '1XR_3ocg9pQmhe7OByIuf1lE3jyCXXuXI';
const ST = '1mOt9YVvhlMTpD-2_RTg1GhweTxANtcxe';
const AV = '1SQhjTzxhe7QnwtFDHxcM7KhnJCTkXcbA';
const WV = '1pHT1ZNodauWX0RX1J3_8MoVx2saqsHcP';

const COMPUTED = 'This table is computed from BVAL’s official schedule.';

export const BVAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'bval', sectionId: 'ccs',
  name: 'Blossom Valley Athletic League', shortName: 'BVAL',
  cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
  alignmentSource: 'its official schedule',
  officialUrl: BVAL_BASKETBALL,
  links: [
    { label: 'BVAL boys basketball', href: BVAL_BASKETBALL },
    { label: 'BVAL Basketball By-Laws (rev. 5/29/26)', href: BVAL_BASKETBALL_BYLAWS },
  ],
  // si.com is not read for basketball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'mt-hamilton', leagueId: 'bval', label: 'Mt. Hamilton', searchAliases: ['Mount Hamilton', 'Mt Hamilton'],
      maxprepsLeagueId: '2ec699c1-3045-4c49-a367-005478c6de05',
      maxprepsName: 'BVAL - Mt. Hamilton', maxprepsSlug: 'bval--mt-hamilton',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-06', last: '2027-02-16' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(MH), revisionCheckUrl: download(MH),
        bundledSha256: '6c24b33883200a28ac55acdd0a758ec0ee0eed07d0db80e8b18f918683629b26',
        revisedOn: '10/12/26',
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'santa-teresa', leagueId: 'bval', label: 'Santa Teresa', searchAliases: [],
      maxprepsLeagueId: 'a03875b0-be6f-4ce7-a6b6-db6ea0610172',
      maxprepsName: 'BVAL - Santa Teresa - South', maxprepsSlug: 'bval--santa-teresa--south',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-13', last: '2027-02-12' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(ST), revisionCheckUrl: download(ST),
        bundledSha256: '9c9afaa021a3fea7002d09fe73a3cd5cd1f62e2dae038ee92cd73011e2260506',
        revisedOn: '10/12/26',
      },
      maxprepsTeamCount: 7, maxprepsMissing: [],
      maxprepsExtraRows: { 'fa72c6cc-34dc-4bb4-a184-9c4efaa643d3': 'Gilroy, an Almaden Valley team in BVAL’s alignment (MaxPreps’ “Santa Teresa - South”, read 2026-11-13)' },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ table for this division also lists Gilroy, which plays in Almaden Valley, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'almaden-valley', leagueId: 'bval', label: 'Almaden Valley', searchAliases: [],
      maxprepsLeagueId: '0f028220-7294-4c2c-bf2f-05fd90b90781',
      maxprepsName: 'BVAL - Santa Teresa - North', maxprepsSlug: 'bval--santa-teresa--north',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-08', last: '2027-02-12' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(AV), revisionCheckUrl: download(AV),
        bundledSha256: '16c96915204856d9f27705ca50b3486dd29528e749e0f22c190ffb83004131df',
        revisedOn: '10/14/26',
      },
      maxprepsTeamCount: 4, maxprepsMissing: ['gilroy', 'oak-grove'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: `MaxPreps has no Almaden Valley table: its “Santa Teresa - North” holds four of the division’s six teams and lists Gilroy and Oak Grove in other divisions, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'west-valley', leagueId: 'bval', label: 'West Valley', searchAliases: [],
      maxprepsLeagueId: 'bf8c5248-6b38-4086-a327-36400a553e98',
      maxprepsName: 'BVAL - West Valley', maxprepsSlug: 'bval--west-valley',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-06', last: '2027-02-12' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(WV), revisionCheckUrl: download(WV),
        bundledSha256: 'abaf8f4619b0191c93def7bc32499e7c3dcd692c74a61b78e853360686bb84c9',
        revisedOn: '10/12/26',
      },
      maxprepsTeamCount: 7, maxprepsMissing: ['mt-pleasant'],
      maxprepsExtraRows: { 'b5c6ef6d-8399-41f6-99b5-2b536ea2b71a': 'Oak Grove, an Almaden Valley team in BVAL’s alignment (MaxPreps’ “West Valley”, read 2026-11-13)' },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ West Valley table lists Oak Grove, which plays in Almaden Valley, and keeps Mt. Pleasant in no league, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // "The team with the most wins is the League Champion" (§9): a win is one and nothing else counts, so a team's
    // `pts` is its league wins, and every team of a division plays the same number of league games.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A game between two members counts when it is one of the official schedule's fixtures: members also meet in
    // preseason tournaments, which MaxPreps types 2 (tournament).
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §10.3, the tiebreaker for an automatic berth, applied to every place; its fourth step (point differential
    // against common opponents, from the top of the standings down) is not computed, so a tie that reaches it
    // stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'h2h-goal-diff', 'coin-flip'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS} §9 (“The team with the most wins is the League Champion”)`,
      pointsShort: 'BVAL by-laws §9',
      order: `${BYLAWS} §9 (the champion is the team with the most wins in the double round robin)`,
      doubleRoundRobin: 'BVAL 2026-27 boys basketball schedules (double round robin: 12 games each in Mt. Hamilton and West Valley, 10 in Santa Teresa and Almaden Valley)',
      overtime: `${BYLAWS} §1 (National Federation rules: a game level after four 8-minute quarters, §7.1, goes to overtime periods until one team leads, so no game ends level)`,
      coChampions: `${BYLAWS} §9 (teams level on wins at the top are co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §10.3.1 (head-to-head competition)`,
        'record-vs-placed': `${BYLAWS} §10.3.2 (record against common opponents, from the top of the standings down)`,
        'h2h-goal-diff': `${BYLAWS} §10.3.3 (point differential in league games between the tied teams)`,
        'coin-flip': `${BYLAWS} §10.3.4-5 (point differential against common opponents, then a coin toss — we compute neither, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— BVAL By-Laws §10.3 settles it on point differential against common opponents, then a coin toss',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 6,
    citation: `${BYLAWS} §10.2 (automatic qualifiers: Mt. Hamilton’s top three and the Santa Teresa, Almaden Valley and West Valley champions)`,
    ladder: [
      { divisions: ['mt-hamilton'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['mt-hamilton'], places: [4, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['santa-teresa', 'almaden-valley', 'west-valley'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['santa-teresa', 'almaden-valley', 'west-valley'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-16', label: 'Last BVAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
