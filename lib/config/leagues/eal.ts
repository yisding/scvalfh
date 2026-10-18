/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the Eastern Athletic League (Northern Section) and its guidelines citation.
 */

import type { LeagueConfig } from '@/lib/model/league-config';

import { NS_GUIDELINES_URL } from './documents';

export const NS_FH = 'CIF Northern Section Field Hockey Guidelines 2026-28';
// NS_GUIDELINES_URL (./documents.ts) is the same document's PDF.

export const EAL: LeagueConfig = {
  id: 'eal', sectionId: 'ns',
  name: 'Eastern Athletic League', shortName: 'EAL',
  cities: 'Chico, Corning, Susanville, Davis and Fair Oaks',
  alignmentSource: 'MaxPreps’ table and league flag',
  officialUrl: 'https://www.cifns.org/sports/fh/index',
  links: [
    { label: 'CIF Northern Section field hockey', href: 'https://www.cifns.org/sports/fh/index' },
    { label: 'Northern Section Field Hockey Guidelines 2026-28 (PDF)', href: NS_GUIDELINES_URL },
  ],
  sblive: { leagueSlugs: ['4190-eastern-athletic'], backfill: true },
  officialCodes: {},
  officialNames: {},
  // Red Bluff is still a 0-0-0 row in MaxPreps' table but is not fielding a varsity team in 2026 (Wilcox/York precedent).
  withdrawnNames: ['Red Bluff', 'RED BLUFF', 'Red Bluff High School', 'Red Bluff Spartans', 'Red Bluff Union High School'],
  membershipNote: 'Chico, Corning, Lassen and Pleasant Valley are Northern Section schools; Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL.',
  divisions: [
    {
      // One division (Guidelines §I: "All participating schools are considered to be in the same division").
      id: 'eal', leagueId: 'eal', label: 'EAL', searchAliases: ['Eastern Athletic', 'Eastern Athletic League'],
      maxprepsLeagueId: '60959b47-b0cf-4d7d-b054-d8ea140870ef',
      maxprepsName: 'Eastern Athletic', maxprepsSlug: 'eastern-athletic',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-08-24', last: '2026-10-28' },
      // No league or Section schedule exists. The umpires' grid is NOT official and is never linked or bundled.
      official: {
        mode: 'none',
        note: 'The EAL publishes no schedule or standings document of its own. Its league games are the games MaxPreps marks as league games; on Oct 4 all 30 of them matched, by date and home side, the 2026 league grid posted on the EAL/SRL umpires’ site (fieldhockeyumpires.org).',
      },
      // MaxPreps lists 7 rows: the six members plus Red Bluff (7 + 0 − 1 = 6).
      maxprepsTeamCount: 7, maxprepsMissing: [],
      maxprepsExtraRows: {
        '4d3da788-bbe2-4ab9-b854-d95aa9786cda': 'Red Bluff: a 0-0-0 row with no games; not fielding a varsity team in 2026',
      },
      reportedTrust: 'records-only',
      knownCause: 'MaxPreps orders the EAL table by winning percentage; the EAL decides its title on points (Northern Section Field Hockey Guidelines §VII.C.2) and publishes no standings, so MaxPreps’ places can differ from ours. MaxPreps also lists Red Bluff, which is not fielding a varsity team in 2026.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      // Every team is inside the Super Regional's top six, so there is no line to draw.
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'title', gamesWord: 'league',
    // No official document: MaxPreps' league flag, as for SCVAL. 5 = the 2025 EAL tournament's contestType.
    classification: 'contest-type', excludeContestTypes: [2, 4, 5],
    postseasonFrom: '2026-10-30', leagueGameOverrides: [],
    matcher: 'two-phase',
    // The Guidelines use points only for the title and break no tie in the league table; a tie for
    // first means co-champions (§VII.C).
    tiebreaks: { default: ['no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'shootout',
    citations: {
      points: `${NS_FH} §VII.C.2 (to decide the league championship: 3 points for a win, 1 for a tie, 0 for a loss)`,
      pointsShort: 'NS Guidelines §VII.C.2',
      order: `${NS_FH} §VII.C.2 (points decide the league championship; the Guidelines give no rule for ordering the league table — the §III.E.1 Super Regional seeding criteria are not applied here — so this site orders the whole table by the same points)`,
      doubleRoundRobin: `${NS_FH} §III.A.1 (double round robin; in 2026 six teams play ten league games each)`,
      overtime: `${NS_FH} §VII.E.4 (varsity: a 10-minute sudden-victory period, then 1 v 1s until there is a winner, so a league game never ends level)`,
      coChampions: `${NS_FH} §VII.C (“In the case of a tie, duplicate awards will be given”)`,
      stages: {
        'no-rule': 'The Northern Section’s Field Hockey Guidelines break no tie in the league table: a tie for first means co-champions (§VII.C), and the Super Regional seeding criteria (§III.E.1) are the coaches’ to apply, so this tie is left as it is',
      },
    },
    coChampionsLabel: 'EAL co-champions',
    unresolvedSuffix: '',
  },
  postseason: {
    kind: 'unbracketed-tournament', name: 'Super Regional', qualifiers: 6,
    dates: { first: '2026-10-30', last: '2026-10-31' },
    ladder: [
      { divisions: '*', places: [1, 6], status: 'tournament', label: 'Super Regional place',
        phrase: 'a Super Regional place', badge: 'Top 6', legend: 'Places 1-6 — the Super Regional, Oct 30-31 (the top six qualify)' },
      { divisions: '*', places: [7, 99], status: 'below-line', label: 'Outside the top six',
        phrase: 'outside the top six', badge: 'Below line', legend: '7th or lower — outside the Super Regional’s top six' },
    ],
    citations: {
      qualification: `${NS_FH} §III.E.1 and §IV (the top six EAL/SRL schools compete; varsity only)`,
      format: `${NS_FH} §IV (“The format will be determined at the preseason tournament meeting”; none is published)`,
      seeding: `${NS_FH} §III.E.1 (“Seeding will be based on League record, Head-to-Head Goal differential (Capped at six (6) per game, Goal against, Coin flip.”) — quoted as written; this site does not apply it`,
      eligibility: `${NS_FH} §VII.J (a school without all its scores reported by noon the day after the last contest of the season is not eligible for the playoffs)`,
      noFurtherPath: `${NS_FH} §V and §VI (NorCal and State qualification: “Not Applicable”)`,
    },
    note: 'The Northern Section’s field hockey postseason is the Super Regional, Oct 30–31: the top six schools qualify. The coaches set its format and seeding, its site is to be announced, and no bracket is published yet. There is no NorCal or State path.',
    sourceUrl: NS_GUIDELINES_URL,
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-10-31' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last EAL league games' },
    { id: 'super-regional', date: '2026-10-30', label: 'Super Regional, Oct 30–31 (site to be announced)' },
  ],
  officialChanges: null,
};
