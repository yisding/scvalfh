/**
 * The Santa Cruz Coast Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its
 * teams are lib/registry/basketball/sccal.ts. Added with the PAL, the WCAL and the WBAL at the owner's request
 * (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - SCCAL Article XXXII – Boys & Girls Basketball (BYLAWS below, cited as "Article XXXII – Basketball"), the SCCAL Policy Section "SCCAL Automatic
 *    Qualifiers to CCS" (POLICY below) and "End-of-Season SCCAL Tournaments Format" (TOURNAMENT below), all linked
 *    from sccal.org/constitution-and-sport-by-laws/. Sections cited as the documents number them.
 *  - "SCCAL 2026-27 B & G Basketball (6 teams)", linked from sccal.org/sports-schedules/: a double round robin of
 *    ten games a team, Fri Jan 8 to Fri Feb 5, 2027, then the SCCAL tournament in the week of Feb 8; the regular
 *    season ends Tue Feb 16 and the CCS seeding meeting is Wed Feb 17. A league game is a game between two of the
 *    six inside league play (`classification: 'membership'`), so the tournament's games are not league games.
 *  - The CCS's League Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026"): the same six schools.
 *  - MaxPreps' "Santa Cruz Coast" boys basketball league (leagues/{id}/v1 and its standings): the same six.
 */

import type { LeagueConfig } from '../shape';

const SCCAL_SITE = 'https://sccal.org/';
const SCCAL_SCHEDULES = 'https://sccal.org/sports-schedules/';
const SCCAL_BYLAWS_PAGE = 'https://sccal.org/constitution-and-sport-by-laws/';
const SCCAL_BASKETBALL_SCHEDULE = 'https://sccal.org/wp-content/uploads/pdf/2026-2027-SCCAL-Boys-Girls-Basketball.pdf';
const SCCAL_BASKETBALL_BYLAWS = 'https://sccal.org/wp-content/uploads/pdf/ARTICLE-XXXII-BG-Basketball.pdf';
// The article is titled “Boys & Girls Basketball”; the site names no other program (scripts/copy-rules.ts).
const BYLAWS = 'SCCAL Article XXXII – Basketball';
const POLICY = 'SCCAL Policy Section, Automatic Qualifiers to CCS';
const TOURNAMENT = 'SCCAL Policy Section, End-of-Season SCCAL Tournaments Format';

export const SCCAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'sccal', sectionId: 'ccs',
  name: 'Santa Cruz Coast Athletic League', shortName: 'SCCAL',
  cities: 'Santa Cruz County',
  alignmentSource: 'its official schedule',
  officialUrl: SCCAL_SITE,
  links: [
    { label: 'SCCAL schedules', href: SCCAL_SCHEDULES },
    { label: 'SCCAL basketball schedule (PDF)', href: SCCAL_BASKETBALL_SCHEDULE },
    { label: 'SCCAL basketball by-laws (Article XXXII, PDF)', href: SCCAL_BASKETBALL_BYLAWS },
    { label: 'SCCAL constitution, by-laws and policies', href: SCCAL_BYLAWS_PAGE },
  ],
  // si.com's standings slugs (read 2026-11-21): used only to harvest team ids, never for membership.
  // Its scores cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['2284-sccal'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'sccal', leagueId: 'sccal', label: 'SCCAL', searchAliases: ['Santa Cruz Coast Athletic League', 'Santa Cruz Coast'],
      maxprepsLeagueId: 'b0226f09-28fc-48f2-8f14-d886cb0b6738',
      maxprepsName: 'Santa Cruz Coast', maxprepsSlug: 'santa-cruz-coast',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-08', last: '2027-02-05' },
      official: {
        mode: 'none', scheduleUrl: SCCAL_BASKETBALL_SCHEDULE,
        note: 'The SCCAL publishes its basketball schedule as a PDF on sccal.org, and this site does not copy it. A league game here is a game between two SCCAL teams from January 8 to February 5, 2027, the dates of the schedule’s double round robin; the SCCAL tournament that follows is not league play.',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // "The league champion is the team with the best record in SCCAL play" (§E.1): a win is one and nothing else
    // counts, ordered on the share of league games won.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'league',
    // A game between two of the six inside league play counts; members also meet in preseason tournaments, which
    // MaxPreps types 2 (tournament).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // POLICY §2.d, as in the soccer build; the coin toss is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS} §E.1 (“The league champion is the team with the best record in SCCAL play”)`,
      pointsShort: 'SCCAL Art. XXXII §E.1',
      order: `${BYLAWS} §E.1 (the best record in SCCAL play) and ${TOURNAMENT} §1.a (the other places by their finish in the regular season)`,
      doubleRoundRobin: 'SCCAL 2026-27 basketball schedule (double round robin: 10 league games each)',
      overtime: 'National Federation rules (a game level after four quarters goes to overtime periods until one team leads, so no game ends level)',
      coChampions: `${BYLAWS} §E.1 (teams tied after the regular season are co-champions; the tournament champion is not a league co-champion, §E.3.b)`,
      stages: {
        'head-to-head': `${POLICY} §2.a.i.2.a and §2.d.i (head-to-head competition against each other)`,
        'record-vs-placed': `${POLICY} §2.d.ii-iii and §2.a.i.2.b (head-to-head competition against the league finishers above, then against the remaining league finishers, in descending order)`,
        'coin-flip': `${POLICY} §2.a.i.2.c and §2.d.iv (a coin toss, or a drawing for three or more teams, by the League Commissioner — we do not compute it, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— the SCCAL’s Automatic Qualifiers policy settles it by a coin toss or a drawing',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${BYLAWS} §E.2-3 (the regular season champion is the league’s #1 seed for the CCS playoffs, and an end-of-season SCCAL tournament decides its #2 seed) and ${POLICY} §1.b.i (if the champion also wins the tournament, the second-place team earns the other berth)`,
    ladder: [
      { divisions: ['sccal'], places: [1, 1], status: 'aq', label: 'League’s #1 CCS seed',
        phrase: 'the league’s #1 CCS seed', badge: '#1 seed', legend: 'League champion — the SCCAL’s #1 seed to the CCS' },
      { divisions: ['sccal'], places: [2, 99], status: 'play-in', label: 'SCCAL tournament',
        phrase: 'the SCCAL tournament for the league’s #2 seed', badge: 'Tournament',
        legend: '2nd or lower — the SCCAL tournament (week of February 8) decides the league’s #2 CCS seed; if the champion wins it, the 2nd-place team takes the berth' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-05', label: 'Last SCCAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
