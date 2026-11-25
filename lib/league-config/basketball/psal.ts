/**
 * The Private School Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its
 * teams are lib/registry/basketball/psal.ts. Added with the PCAL at the owner's request (2026-11-25), so the build
 * covers every league of the CCS.
 *
 * Sources, all read 2026-11-25:
 *  - The PSAL Constitution ("Adopted 8-18-2016", a Google Doc linked from the league's site,
 *    sites.google.com/almaheights.org/psal, Governance; CONSTITUTION below): co-champions (§401.c), the tiebreakers
 *    for PSAL or CCS advancement (§406) and the basketball article (Article 12), which gives no CCS berth count.
 *  - "PSAL Boys Basketball 2026-27" (a Google Sheet linked from the same page as "Boys Basketball", "As of 3/8/26"):
 *    four divisions, each a double round robin. Bay (six teams): Thu Jan 14 to Tue Feb 16, 2027, ten games a team.
 *    Coast (six) and South (six): Tue Jan 5 to Thu Feb 11, ten games. North (five): Tue Jan 5 to Thu Feb 11, eight
 *    games. The Coast, North and South tabs add "Play-off Game (if necessary)" on Feb 15-16. The sheet is not
 *    bundled: a league game is a game between two members of one division inside its league play
 *    (`classification: 'membership'`).
 *  - The league's member schools page (sites.google.com/almaheights.org/psal/member-schools).
 *  - MaxPreps' four "Private School - <division>" boys basketball leagues (team-context and standings, read
 *    2026-11-25): the Coastal table matches the league; the other three do not (each division's knownCause says how).
 */

import type { LeagueConfig } from '../shape';

const PSAL_SITE = 'https://sites.google.com/almaheights.org/psal';
const PSAL_GOVERNANCE = 'https://sites.google.com/almaheights.org/psal/governance';
const PSAL_BASKETBALL_SCHEDULE = 'https://docs.google.com/spreadsheets/d/14zxebGuoYF8f9jpGhcLVZPKDP3MVxges4EyLBWUNoVg/edit';
const PSAL_CONSTITUTION = 'https://docs.google.com/document/d/1MIpTtsVq3pCI8JnFN3hhHrTyVpNEhE3irPqsdII64SM/edit';
const CONSTITUTION = 'PSAL Constitution';
const note = (division: string, dates: string) =>
  `The PSAL keeps its ${division} boys basketball schedule in a Google Sheet it edits through the season, so this site does not copy it. A league game here is a game between two ${division} teams ${dates}, the dates of the schedule’s double round robin.`;
const COMPUTED = 'This table is computed from the PSAL’s own 2026-27 schedule.';

export const PSAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'psal', sectionId: 'ccs',
  name: 'Private School Athletic League', shortName: 'PSAL',
  cities: 'small private and charter schools from San Francisco to San Jose',
  alignmentSource: 'its official schedule',
  officialUrl: PSAL_SITE,
  links: [
    { label: 'PSAL boys basketball schedule (Google Sheet)', href: PSAL_BASKETBALL_SCHEDULE },
    { label: 'PSAL Constitution (Google Doc)', href: PSAL_CONSTITUTION },
    { label: 'PSAL governance and schedules', href: PSAL_GOVERNANCE },
  ],
  // si.com's standings slugs (read 2026-11-25 from the teams' own si.com standings pages): used only to harvest team ids
  // and for the daily league scoreboards, never for membership; si.com's tables are an older alignment and it has no
  // Coast table. Its scores cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['30792-psal-bay', '2272-psal-north', '2273-psal-south'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'psal-bay', leagueId: 'psal', label: 'Bay', searchAliases: ['PSAL Bay', 'Private School Bay'],
      maxprepsLeagueId: '4239e1cd-c75a-4ba0-a5e7-3cbc072ff2ac',
      maxprepsName: 'Private School - Bay', maxprepsSlug: 'private-school--bay',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-14', last: '2027-02-16' },
      official: { mode: 'none', scheduleUrl: PSAL_BASKETBALL_SCHEDULE, note: note('Bay', 'from January 14 to February 16, 2027') },
      // Read 2026-11-25: MaxPreps lists Design Tech in its North table.
      maxprepsTeamCount: 5, maxprepsMissing: ['design-tech'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: `MaxPreps lists Design Tech in its North table, so its Bay table has five teams and leaves Design Tech’s games out of the others’ league records. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Division title line' },
      ladderLine: { after: 1, label: 'Division title line' },
    },
    {
      id: 'psal-coast', leagueId: 'psal', label: 'Coast', searchAliases: ['PSAL Coast', 'PSAL Coastal', 'Private School Coastal'],
      maxprepsLeagueId: '2d64b722-7334-44a4-8e7c-77be0854c098',
      maxprepsName: 'Private School - Coastal', maxprepsSlug: 'private-school--coastal',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-05', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: PSAL_BASKETBALL_SCHEDULE, note: note('Coast', 'from January 5 to February 11, 2027') },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Division title line' },
      ladderLine: { after: 1, label: 'Division title line' },
    },
    {
      id: 'psal-north', leagueId: 'psal', label: 'North', searchAliases: ['PSAL North', 'Private School North'],
      maxprepsLeagueId: '7afef49d-8c4e-4f94-b48e-aac6020960de',
      maxprepsName: 'Private School - North', maxprepsSlug: 'private-school--north',
      expectedTeams: 5, gamesPerTeam: 8,
      leaguePlay: { first: '2027-01-05', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: PSAL_BASKETBALL_SCHEDULE, note: note('North', 'from January 5 to February 11, 2027') },
      // Read 2026-11-25: MaxPreps' North table lists Design Tech (a Bay team), East Palo Alto Academy and
      // Mid-Peninsula (South teams), and keeps KIPP Esperanza in its South table and Summit Prep in no league.
      maxprepsTeamCount: 6, maxprepsMissing: ['summit-prep', 'kipp-esperanza'],
      maxprepsExtraRows: {
        'ccd2acd7-1720-4166-bcf3-cdd292bbdb36': 'Design Tech, a Bay team in the PSAL’s 2026-27 alignment (MaxPreps’ “Private School - North”, read 2026-11-25)',
        '95ced4cf-1cce-4eea-aacf-dd046216df07': 'East Palo Alto Academy, a South team in the PSAL’s 2026-27 alignment (MaxPreps’ “Private School - North”, read 2026-11-25)',
        '2c817f3b-7c83-4413-8b33-bb4b702dac18': 'Mid-Peninsula, a South team in the PSAL’s 2026-27 alignment (MaxPreps’ “Private School - North”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ North table lists Design Tech, East Palo Alto Academy and Mid-Peninsula, which play in other divisions, and leaves out KIPP Esperanza and Summit Prep, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Division title line' },
      ladderLine: { after: 1, label: 'Division title line' },
    },
    {
      id: 'psal-south', leagueId: 'psal', label: 'South', searchAliases: ['PSAL South', 'Private School South'],
      maxprepsLeagueId: 'a53e522e-9fbf-4957-a9b0-bd0ec4472ddf',
      maxprepsName: 'Private School - South', maxprepsSlug: 'private-school--south',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-05', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: PSAL_BASKETBALL_SCHEDULE, note: note('South', 'from January 5 to February 11, 2027') },
      // Read 2026-11-25: MaxPreps' South table lists KIPP Esperanza (a North team) and leaves out East Palo Alto
      // Academy and Mid-Peninsula, which it lists in its North table.
      maxprepsTeamCount: 5, maxprepsMissing: ['mid-peninsula', 'east-palo-alto-academy'],
      maxprepsExtraRows: {
        '1f690420-95b8-4d69-8130-ba161d4ef703': 'KIPP Esperanza, a North team in the PSAL’s 2026-27 alignment (MaxPreps’ “Private School - South”, read 2026-11-25)',
      },
      reportedTrust: 'records-only',
      knownCause: `MaxPreps’ South table lists KIPP Esperanza, which plays in the North, and leaves out East Palo Alto Academy and Mid-Peninsula, so its league records here can differ from ours. ${COMPUTED}`,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Division title line' },
      ladderLine: { after: 1, label: 'Division title line' },
    },
  ],
  rules: {
    // Champions are "determined based upon PSAL round-robin play" (§401.a): a win is one and nothing else counts,
    // ordered on the share of league games won.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts; members also meet in preseason
    // tournaments, which MaxPreps types 2 (tournament). The Bay's last league day is Tue Feb 16, so the league's
    // postseason opens with the CCS seeding day.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §406: head-to-head, then a play-in game if time permits, the second-round record, head-to-head against the
    // next-highest finisher, the second-round winner and a drawing. Only the first is computed; a tie that reaches
    // the play-in stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${CONSTITUTION} §401(a) (champions are determined by PSAL round-robin play)`,
      pointsShort: 'PSAL Constitution §401(a)',
      order: `${CONSTITUTION} §401(a) and §403 (the round robin’s results, recorded by the league matrix)`,
      doubleRoundRobin: 'PSAL boys basketball schedule 2026-27 (double round robin: 10 league games each in the Bay, Coast and South, 8 in the North)',
      overtime: `${CONSTITUTION} §1201(a) (National Federation rules: a game level after four quarters goes to overtime periods until one team leads, so no game ends level)`,
      coChampions: `${CONSTITUTION} §401(c) (a tie for first place means co-champions; a play-in, if time permits, decides the higher seed)`,
      stages: {
        'head-to-head': `${CONSTITUTION} §406(a) (head-to-head competition)`,
        'coin-flip': `${CONSTITUTION} §406(b-f) (a play-in game if time permits, then the second-round record, head-to-head against the next-highest finisher, the second-round winner and a drawing — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— PSAL Constitution §406 settles it by a play-in game or the later steps, ending in a drawing',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${CONSTITUTION} Article 12 (Basketball) and §406 (ties are broken “for PSAL or CCS advancement”); no PSAL document gives the boys basketball CCS berth count, so each division’s champion is marked`,
    ladder: [
      { divisions: ['psal-bay', 'psal-coast', 'psal-north', 'psal-south'], places: [1, 1], status: 'aq', label: 'Division champion',
        phrase: 'the division title', badge: 'Champion',
        legend: 'Division champion — marked as the division’s CCS berth (no PSAL document gives the basketball count)' },
      { divisions: ['psal-bay', 'psal-coast', 'psal-north', 'psal-south'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth named',
        phrase: 'no automatic berth named by the league', badge: 'No AQ',
        legend: '2nd or lower — the PSAL’s documents name no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-16', label: 'Last PSAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
