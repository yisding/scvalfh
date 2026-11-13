/**
 * The Blossom Valley Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its
 * teams are lib/registry/soccer/bval.ts. Added so the ratings count SCVAL's non-league games against BVAL schools
 * (owner decision, 2026-11-13).
 *
 * Sources, all read 2026-11-13:
 *  - The BVAL Girls Soccer By-Laws, "Revised 3/10/25", linked from bval.org/constitution-bylaws/ (BYLAWS below).
 *    Sections cited as the document numbers them.
 *  - The three 2026-27 girls division schedules linked from bval.org/girls-soccer/ (Google Docs, each a .docx),
 *    transcribed to data/soccer/official/bval-2026.json by `pnpm build-bval-winter-fixtures` from their text
 *    (tests/fixtures/official/source/bval-soccer-girls-*.txt). Each is a double round robin (West Valley's from
 *    Dec 3, the others' from Jan 5, all to Feb 16); their headers give the game times (JV 5:00, varsity 7:00,
 *    unless a game's note says otherwise) and the CCS dates (seeding meeting Feb 18, first CCS contest Feb 20).
 *  - MaxPreps' three BVAL girls soccer leagues (leagues/{id}/v1 and their standings).
 */

import type { LeagueConfig } from '../shape';

const BVAL_SOCCER = 'https://bval.org/girls-soccer/';
export const BVAL_SOCCER_BYLAWS = 'https://docs.google.com/document/d/1uLAdiwHM0KwszXDN0rr-FOzpJA71I8wT/edit';
const BYLAWS = 'BVAL Girls Soccer By-Laws (rev. 3/10/25)';
const BUNDLE = 'data/soccer/official/bval-2026.json';
const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const download = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`;
const MH = '1S22661CC2U9OcxRWoxzVW6ixLYax7d7y';
const ST = '11FQiuy8k21XBz93b1lzKuCRjIp9gZrek';
const WV = '1QruwyPY6OQadMYlc2sbnDCgiqONZMyqI';

export const BVAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'bval', sectionId: 'ccs',
  name: 'Blossom Valley Athletic League', shortName: 'BVAL',
  cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
  alignmentSource: 'its official schedule',
  officialUrl: BVAL_SOCCER,
  links: [
    { label: 'BVAL girls soccer', href: BVAL_SOCCER },
    { label: 'BVAL Girls Soccer By-Laws (rev. 3/10/25)', href: BVAL_SOCCER_BYLAWS },
  ],
  // si.com is not read for soccer: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'mt-hamilton', leagueId: 'bval', label: 'Mt. Hamilton', searchAliases: ['Mount Hamilton', 'Mt Hamilton'],
      maxprepsLeagueId: '34ddb6c6-da1f-4dee-ab9b-50ae2d3a694f',
      maxprepsName: 'BVAL - Mt. Hamilton', maxprepsSlug: 'bval--mt-hamilton',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-16' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(MH), revisionCheckUrl: download(MH),
        bundledSha256: '5c662a352b2893905f27884e7a763dc0adca93888b5332e3391ca8502932414f',
        revisedOn: '10/27/26',
      },
      // MaxPreps keeps Gilroy's and Willow Glen's girls soccer teams in no league (read 2026-11-13).
      maxprepsTeamCount: 6, maxprepsMissing: ['gilroy', 'willow-glen'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps lists Gilroy and Willow Glen in no league, so its Mt. Hamilton table has six teams and leaves their games out of the others’ league records. This table is computed from BVAL’s official schedule.',
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'santa-teresa', leagueId: 'bval', label: 'Santa Teresa', searchAliases: [],
      maxprepsLeagueId: 'ab6d2929-ec57-4416-903a-cdbf92f32a38',
      maxprepsName: 'BVAL - Santa Teresa - West', maxprepsSlug: 'bval--santa-teresa--west',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-16' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(ST), revisionCheckUrl: download(ST),
        bundledSha256: '270d47692b8eb72215c8a327fa66d8f23c684c79c0aec83cc69fcf4e4971b9ca',
        revisedOn: '10/30/26',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 2, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 2, label: 'Automatic-berth line' },
    },
    {
      id: 'west-valley', leagueId: 'bval', label: 'West Valley', searchAliases: [],
      maxprepsLeagueId: '4234d452-ab66-464a-aa40-a0aa36b8ca6e',
      maxprepsName: 'BVAL - West Valley', maxprepsSlug: 'bval--west-valley',
      expectedTeams: 10, gamesPerTeam: 18,
      leaguePlay: { first: '2026-12-03', last: '2027-02-16' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(WV), revisionCheckUrl: download(WV),
        bundledSha256: '4f0c1c3fd4ef2a4117e680d1e9d0eef7de69db4ef6adb6dae5709a9244ea0849',
        revisedOn: '11/5/26',
      },
      maxprepsTeamCount: 10, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members counts when it is one of the official schedule's fixtures.
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-18', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §4.1a-c; the rest of §4.1 (a playoff game, then capped goal differential, capped goals for, goals against
    // and a coin flip) is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'h2h-goal-diff', 'record-vs-placed', 'coin-flip'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §4.1 (3 points for a win, 1 for a tie, 0 for a loss)`,
      pointsShort: 'BVAL by-laws §4.1',
      order: `${BYLAWS} §4.1 (the team with the most points after the double round robin is champion)`,
      doubleRoundRobin: `${BYLAWS} §7.2 and the 2026-27 schedules (double round robin: 14 games each in Mt. Hamilton and Santa Teresa, 18 in West Valley)`,
      overtime: `${BYLAWS} §4.3 (“There shall be no overtime periods in soccer”, so a level game stands as a tie)`,
      coChampions: `${BYLAWS} §4.1 (a tie on points goes to the tiebreakers below)`,
      stages: {
        'head-to-head': `${BYLAWS} §4.1a (head-to-head competition)`,
        'h2h-goal-diff': `${BYLAWS} §4.1b (head-to-head goal differential)`,
        'record-vs-placed': `${BYLAWS} §4.1c (results against common opponents, from the top of the standings down)`,
        'coin-flip': `${BYLAWS} §4.1d-h (a playoff game, then capped goal differential, capped goals for, goals against and a coin flip — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— BVAL By-Laws §4.1d-h settle it with a playoff game or goal figures, then a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 6,
    citation: `${BYLAWS} §10 (automatic CCS berths: Mt. Hamilton’s top three, Santa Teresa’s top two and the West Valley champion)`,
    ladder: [
      { divisions: ['mt-hamilton'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['mt-hamilton'], places: [4, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['santa-teresa'], places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: ['santa-teresa'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['west-valley'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['west-valley'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
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
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
