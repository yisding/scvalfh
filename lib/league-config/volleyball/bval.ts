/**
 * The Blossom Valley Athletic League (CCS), girls volleyball 2026 (lib/leagues.ts, `SCVAL_SPORT=volleyball`).
 * Its teams are lib/registry/volleyball/bval.ts.
 *
 * Sources, all read 2026-11-14:
 *  - The BVAL Girls Volleyball By-Laws, "Revised 8/4/26", linked from bval.org/constitution-bylaws/ (BYLAWS
 *    below). Sections cited as the document numbers them.
 *  - The four 2026 girls division schedules linked from bval.org/girls-volleyball/ (Google Docs, each a .docx),
 *    transcribed to data/volleyball/official/bval-2026.json by `pnpm build-bval-winter-fixtures` from their text
 *    (tests/fixtures/official/source/bval-volleyball-girls-*.txt). Each is a double round robin, Sep 1 to
 *    Oct 28; their headers give the game times (JV 5:30, varsity 7:00) and the CCS dates (first contest Aug 27,
 *    seeding meeting Oct 29, first CCS contest Oct 31). The Santa Teresa and West Valley documents end with the
 *    play-in for the league's last automatic berth, Wed Oct 28. The West Valley document's header still reads
 *    "2025 - 2026"; its weekdays are 2026's.
 *  - MaxPreps' four BVAL girls volleyball leagues (leagues/{id}/v1 and their standings): BVAL - Mt. Hamilton,
 *    - Santa Teresa, - Almaden Valley and - West Valley, the same four divisions with the same teams.
 */

import type { LeagueConfig } from '../shape';

const BVAL_VOLLEYBALL = 'https://bval.org/girls-volleyball/';
export const BVAL_VOLLEYBALL_BYLAWS = 'https://docs.google.com/document/d/1TnVHb_b8wdqCF1EQ0oLgoxSF2mwirJHL/edit';
const BYLAWS = 'BVAL Girls Volleyball By-Laws (rev. 8/4/26)';
const BUNDLE = 'data/volleyball/official/bval-2026.json';
const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const download = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`;
const MH = '183-sF9j6RwFgSSKszwbKi8dLB2lSlcio';
const ST = '1-shhDVVGjV8AkJR1O9L2kudpTFVvFCcC';
const AV = '1bCYhzrDIrv-pw5vvdwJqk2jl06SpaDAw';
const WV = '1QD2tKBwVA-oPoN1vhKM6JEhemC7Fl66F';

export const BVAL_VOLLEYBALL_LEAGUE: LeagueConfig = {
  id: 'bval', sectionId: 'ccs',
  name: 'Blossom Valley Athletic League', shortName: 'BVAL',
  cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
  alignmentSource: 'its official schedule',
  officialUrl: BVAL_VOLLEYBALL,
  links: [
    { label: 'BVAL girls volleyball', href: BVAL_VOLLEYBALL },
    { label: 'BVAL Girls Volleyball By-Laws (rev. 8/4/26)', href: BVAL_VOLLEYBALL_BYLAWS },
  ],
  // si.com is not read for volleyball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'mt-hamilton', leagueId: 'bval', label: 'Mt. Hamilton', searchAliases: ['Mount Hamilton', 'Mt Hamilton'],
      maxprepsLeagueId: 'b45d3f42-b179-49ad-839a-62de75dff46b',
      maxprepsName: 'BVAL - Mt. Hamilton', maxprepsSlug: 'bval--mt-hamilton',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-15', last: '2026-10-28' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(MH), revisionCheckUrl: download(MH),
        bundledSha256: '4a01f0a2318b3c2a29d4838840aca19478c4e0ce9a58d1bda60be3abe6a1a8ba',
        revisedOn: '9/7/26',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'santa-teresa', leagueId: 'bval', label: 'Santa Teresa', searchAliases: [],
      maxprepsLeagueId: 'fd923157-a05d-4a01-8449-a5222c7e7c8c',
      maxprepsName: 'BVAL - Santa Teresa', maxprepsSlug: 'bval--santa-teresa',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-17', last: '2026-10-26' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(ST), revisionCheckUrl: download(ST),
        bundledSha256: '44b92c7022e6d0585c597add6c997d6e1483a174d2231ad10641745db4ba4d41',
        revisedOn: '5/26/26',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'almaden-valley', leagueId: 'bval', label: 'Almaden Valley', searchAliases: [],
      maxprepsLeagueId: '62f7ff4e-4492-48b8-b816-db27318ad480',
      maxprepsName: 'BVAL - Almaden Valley', maxprepsSlug: 'bval--almaden-valley',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-15', last: '2026-10-26' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(AV), revisionCheckUrl: download(AV),
        bundledSha256: 'ab42b90af4cc51e2c57b29da3886c59a7de27901a848a98f16bd3554f458300e',
        revisedOn: '9/21/26',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'west-valley', leagueId: 'bval', label: 'West Valley', searchAliases: [],
      maxprepsLeagueId: '64a5a638-db8f-4fe5-8307-43eee6fd32f4',
      maxprepsName: 'BVAL - West Valley', maxprepsSlug: 'bval--west-valley',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2026-09-01', last: '2026-10-22' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: BUNDLE,
        scheduleUrl: doc(WV), revisionCheckUrl: download(WV),
        bundledSha256: '94baad9cd57b8e6774b306de4eeab92cf28d9c32cc9046f12105dbf0e0bfa2cc',
        revisedOn: '5/26/26',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Play-in line' },
      ladderLine: { after: 1, label: 'Play-in line' },
    },
  ],
  rules: {
    // "The League champion will be determined by the team with the best record" (§3.4): a win is one and nothing
    // else counts, so a team's `pts` is its league wins.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A match between two members counts when it is one of the official schedule's fixtures: members also meet in
    // tournaments, which MaxPreps types 2 (tournament).
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: '2026-10-29', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §7.3, the tie-breaker, applied to every place; its fourth step (the winner of the second-round match
    // between the tied teams) is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'h2h-sets-won', 'record-vs-placed', 'second-meeting'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §3.4 (“The League champion will be determined by the team with the best record”)`,
      pointsShort: 'BVAL by-laws §3.4',
      order: `${BYLAWS} §3.4 (the champion is the team with the best record in the double round robin)`,
      doubleRoundRobin: `${BYLAWS} §3.1 (a double round robin: 10 matches each in Mt. Hamilton, Santa Teresa and Almaden Valley, 14 in West Valley)`,
      overtime: `${BYLAWS} §3.7 (a varsity match is three out of five games, so no match ends level)`,
      coChampions: `${BYLAWS} §3.4 (teams level on the best record are co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §7.3.1 (head-to-head)`,
        'h2h-sets-won': `${BYLAWS} §7.3.2 (sets won in the head-to-head league matches)`,
        'record-vs-placed': `${BYLAWS} §7.3.3 (head-to-head against the division’s other teams, from the top of the standings down)`,
        'second-meeting': `${BYLAWS} §7.3.4 (the winner of the second-round match between the tied teams — we do not compute it, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— BVAL By-Laws §7.3.4 settles it on the second-round match between the tied teams',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 6,
    citation: `${BYLAWS} §3.5 (automatic qualifiers: Mt. Hamilton’s top three, the Santa Teresa and Almaden Valley champions, and the winner of a play-in, Santa Teresa’s second-place team at the West Valley champion)`,
    ladder: [
      { divisions: ['mt-hamilton'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['mt-hamilton'], places: [4, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['santa-teresa', 'almaden-valley'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['santa-teresa'], places: [2, 2], status: 'play-in', label: 'Play-in game Oct 28',
        phrase: 'the Oct 28 play-in', badge: 'Play-in',
        legend: '2nd place — plays at the West Valley champion {date} for BVAL’s last automatic berth' },
      { divisions: ['santa-teresa'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['almaden-valley'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['west-valley'], places: [1, 1], status: 'play-in', label: 'Hosts the play-in Oct 28',
        phrase: 'hosting the Oct 28 play-in', badge: 'Play-in host',
        legend: 'Champion — hosts Santa Teresa #2 {date} for BVAL’s last automatic berth' },
      { divisions: ['west-valley'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [{
      id: 'bval-play-in', date: '2026-10-28', time: null, tag: 'bval-play-in',
      seats: [{ division: 'west-valley', place: 1 }, { division: 'santa-teresa', place: 2 }],
      seatLabels: ['West Valley #1', 'Santa Teresa #2'], host: 0, isPlayIn: true,
      label: 'Santa Teresa #2 at West Valley #1 — play-in for BVAL’s last automatic CCS berth',
    }],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2026-11-07' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last BVAL league matches' },
    { id: 'play-in', date: '2026-10-28', label: 'BVAL play-in' },
    { id: 'ccs-seeding', date: '2026-10-29', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
