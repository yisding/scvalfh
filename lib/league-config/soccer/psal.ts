/**
 * The Private School Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams are
 * lib/registry/soccer/psal.ts. Added with the PCAL at the owner's request (2026-11-25), so the build covers every
 * league of the CCS.
 *
 * Sources, all read 2026-11-25:
 *  - The PSAL Constitution ("Adopted 8-18-2016", a Google Doc linked from the league's site,
 *    sites.google.com/almaheights.org/psal, Governance; CONSTITUTION below): 3-1-0 points (§1402.b), no overtime in
 *    league games (§1403.a), co-champions (§401.c), the soccer tiebreakers (§406.B) and the two CCS automatic
 *    qualifiers (§1409).
 *  - "PSAL Girls Winter Soccer 2026-27" (a Google Sheet linked from the same page as "Girls Winter Soccer", "as of
 *    3/2/26"): a Bay and a Central division of seven teams each, both a double round robin of twelve games a team,
 *    Wed Jan 6 to Fri Feb 12, 2027, then "Play in game (if necessary)" on Feb 15-17. (The Central tab's heading
 *    still reads 2025-26; its dates are 2027's.) The sheet is not bundled: a league game is a game between two
 *    members of one division inside its league play (`classification: 'membership'`).
 *  - The league's member schools page (sites.google.com/almaheights.org/psal/member-schools).
 *  - MaxPreps' "PSAL - Bay" and "PSAL - Central" girls soccer leagues (team-context and standings, read 2026-11-25):
 *    the same fourteen teams. The league names MaxPreps as its official site for schedules and stats.
 */

import type { LeagueConfig } from '../shape';

const PSAL_SITE = 'https://sites.google.com/almaheights.org/psal';
const PSAL_GOVERNANCE = 'https://sites.google.com/almaheights.org/psal/governance';
const PSAL_SOCCER_SCHEDULE = 'https://docs.google.com/spreadsheets/d/159rS7mxIO3cqUYYEqjU8lburl73cysplt2h_21tH8nw/edit';
const PSAL_CONSTITUTION = 'https://docs.google.com/document/d/1MIpTtsVq3pCI8JnFN3hhHrTyVpNEhE3irPqsdII64SM/edit';
const CONSTITUTION = 'PSAL Constitution';
const note = (division: string) =>
  `The PSAL keeps its ${division} girls soccer schedule in a Google Sheet it edits through the season, so this site does not copy it. A league game here is a game between two ${division} teams from January 6 to February 12, 2027, the dates of the schedule’s double round robin.`;

export const PSAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'psal', sectionId: 'ccs',
  name: 'Private School Athletic League', shortName: 'PSAL',
  cities: 'small private and charter schools from Pacifica to San Jose',
  alignmentSource: 'its official schedule',
  officialUrl: PSAL_SITE,
  links: [
    { label: 'PSAL girls soccer schedule (Google Sheet)', href: PSAL_SOCCER_SCHEDULE },
    { label: 'PSAL Constitution (Google Doc)', href: PSAL_CONSTITUTION },
    { label: 'PSAL governance and schedules', href: PSAL_GOVERNANCE },
  ],
  // si.com's standings slugs (read 2026-11-25 from the teams' own si.com standings pages): used only to harvest team ids
  // and for the daily league scoreboards, never for membership. si.com files the PSAL's girls teams in a North and a
  // South table, not the league's Bay and Central. Its scores cross-check MaxPreps' and backfill under D2's rules
  // (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['3900-psal-north', '3901-psal-south'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'psal-bay', leagueId: 'psal', label: 'Bay', searchAliases: ['PSAL Bay', 'Private School Bay'],
      maxprepsLeagueId: '4aeeb133-f482-4861-a405-fe28118a6543',
      maxprepsName: 'PSAL - Bay', maxprepsSlug: 'psal--bay',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-06', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: PSAL_SOCCER_SCHEDULE, note: note('Bay') },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
    {
      id: 'psal-central', leagueId: 'psal', label: 'Central', searchAliases: ['PSAL Central', 'Private School Central'],
      maxprepsLeagueId: '30c5fc08-a9a2-48c0-a523-c81135fef8ca',
      maxprepsName: 'PSAL - Central', maxprepsSlug: 'psal--central',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2027-01-06', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: PSAL_SOCCER_SCHEDULE, note: note('Central') },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Play-in line' },
      ladderLine: { after: 1, label: 'Play-in line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts. The postseason opens with the
    // schedule's play-in days (Feb 15-17): Bay #2 hosts the Central champion for the PSAL's second berth (§1409).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-15', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §406.B: head-to-head, then a play-in game if time permits, then head-to-head goal difference and the later
    // steps, each capped at ±3 a game. The play-in and the capped steps are not computed, so a tie that reaches them
    // stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${CONSTITUTION} §1402(b) (a win is 3 points, a tie 1 point, a loss 0 points)`,
      pointsShort: 'PSAL Constitution §1402(b)',
      order: `${CONSTITUTION} §1402(b) (league standings are decided on points) and §401(a) (champions by round-robin play)`,
      doubleRoundRobin: 'PSAL girls winter soccer schedule 2026-27 (double round robin: 12 league games each in the Bay and the Central)',
      overtime: `${CONSTITUTION} §1403(a) (two 40-minute halves, “no overtime for league games”, so a level game stands as a tie)`,
      coChampions: `${CONSTITUTION} §401(c) (a tie for first place means co-champions)`,
      stages: {
        'head-to-head': `${CONSTITUTION} §406.B(a) (head-to-head competition)`,
        'coin-flip': `${CONSTITUTION} §406.B(b-h) (a play-in game if time permits, then head-to-head goal difference, head-to-head against the next-highest finisher, goal difference, goals for and goals against, each capped at ±3 a game, then a coin flip — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— PSAL Constitution §406.B settles it by a play-in game or the later steps, ending in a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${CONSTITUTION} §1409 (two automatic CCS qualifiers: the Bay champion, and the winner of a play-in game between the Bay’s 2nd-place team and the Central champion, hosted by the Bay’s 2nd-place team)`,
    ladder: [
      { divisions: ['psal-bay'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['psal-bay'], places: [2, 2], status: 'play-in', label: 'Hosts the CCS play-in',
        phrase: 'hosting the CCS play-in', badge: 'Play-in host',
        legend: '2nd place — hosts the Central champion in a play-in game for the PSAL’s 2nd berth' },
      { divisions: ['psal-bay'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['psal-central'], places: [1, 1], status: 'play-in', label: 'CCS play-in',
        phrase: 'the CCS play-in', badge: 'Play-in',
        legend: 'Division champion — plays at the Bay’s 2nd-place team in a play-in game for the PSAL’s 2nd berth' },
      { divisions: ['psal-central'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-12', label: 'Last PSAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
