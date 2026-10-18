/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the Santa Clara Valley Athletic League (CCS).
 */

import type { LeagueConfig } from '@/lib/model/league-config';

export const SCVAL: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  cities: 'Santa Clara County and San Francisco',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://scval.com/fallSports/Fall_index.html',
  links: [
    { label: 'SCVAL fall sports', href: 'https://scval.com/fallSports/Fall_index.html' },
    { label: 'SCVAL Field Hockey By-Laws 2026-27 (PDF)', href: 'https://scval.com/fallSports/1%2026-27%20SCVAL%20Field%20Hockey%20By-Laws.pdf' },
  ],
  sblive: { leagueSlugs: ['4242-santa-clara-valley-de-anza', '4243-santa-clara-valley-el-camino'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: ['Wilcox', 'WILCOX', 'Wilcox Chargers', 'Wilcox High School', 'Adrian Wilcox', 'Adrian Wilcox High School'],
  membershipNote: null,
  divisions: [
    {
      id: 'de-anza', leagueId: 'scval', label: 'De Anza', searchAliases: [],
      maxprepsLeagueId: 'ea062dfe-9fb9-45c7-9839-0801993d6ac6',
      maxprepsName: 'Santa Clara Valley - De Anza', maxprepsSlug: 'santa-clara-valley--de-anza',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-09', last: '2026-10-28' },
      official: {
        source: 'scval-pdf', mode: 'live-pdf', bundledFile: null, revisionCheckUrl: null, bundledSha256: null, revisedOn: null,
        scheduleUrl: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf',
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 3, label: 'AQ line' },
    },
    {
      id: 'el-camino', leagueId: 'scval', label: 'El Camino', searchAliases: [],
      maxprepsLeagueId: '7bdfb2a7-8dde-4a21-88c9-832f1593554d',
      maxprepsName: 'Santa Clara Valley - El Camino', maxprepsSlug: 'santa-clara-valley--el-camino',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2026-09-09', last: '2026-10-28' },
      official: {
        source: 'scval-pdf', mode: 'live-pdf', bundledFile: null, revisionCheckUrl: null, bundledSha256: null, revisedOn: null,
        scheduleUrl: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 3, label: 'AQ line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    classification: 'contest-type', excludeContestTypes: [], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'legacy',
    tiebreaks: { default: ['head-to-head', 'division-wins', 'h2h-goals-against', 'h2h-goal-diff', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'zero', drawNumbers: null, leagueOvertime: 'sudden-victory',
    // ↓ VERBATIM from the original lib/config/season.ts BYLAW_CITATIONS (golden-gated)
    citations: {
      points: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie)',
      pointsShort: 'Art. VI §2',
      order: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (standings are the order of points)',
      doubleRoundRobin: 'Article VI §1 (double round robin; division games only count to the division record)',
      overtime: 'Article IV (one 7-minute sudden-victory period; still tied ⇒ the game ends in a tie)',
      coChampions: 'Article VI §2 (a tie at the top means co-champions)',
      stages: {
        'head-to-head': 'Article VI §3 (better head-to-head record among the tied teams)',
        'division-wins': 'Article VI §4 (greater number of wins in division play)',
        'h2h-goals-against': 'Article VI §5 (least goals given up between the tied teams)',
        'h2h-goal-diff': 'Article VI §6 (goal differential between the tied teams)',
        'coin-flip': 'Article VI §7 (coin flip — we cannot compute it, so the teams stay tied)',
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— Article VI §7 decides it with a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 7,
    citation: 'Article VII §2 (first three in each division are automatic qualifiers; fourth place plays in for the SCVAL 7th AQ; the play-in loser and both fifth-place teams go to CCS for at-large consideration)',
    // ↓ VERBATIM from the original PLAYOFF_STATUS_LABELS / OUTCOME_PHRASES / STATUS_BADGE / statusLabel()
    ladder: [
      { divisions: '*', places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: '*', places: [4, 4], status: 'play-in', label: 'Play-in game Oct 30',
        phrase: 'the Oct 30 play-in', badge: 'Play-in', legend: '4th place — play-in {date} for the SCVAL 7th berth' },
      { divisions: '*', places: [5, 5], status: 'at-large', label: 'At-large consideration',
        phrase: 'at-large consideration', badge: 'At-large', legend: '5th place — submitted to CCS for at-large consideration' },
      { divisions: '*', places: [6, 99], status: 'out', label: 'No automatic path',
        phrase: 'no automatic path', badge: 'No AQ', legend: '6th or lower — no automatic path' },
    ],
    pairings: [1, 2, 3, 4].map((seed) => ({
      id: `scval-crossover-${seed}`, date: '2026-10-30', time: null, tag: 'scval-crossover' as const,
      seats: [{ division: 'de-anza', place: seed }, { division: 'el-camino', place: seed }] as const,
      seatLabels: [`De Anza #${seed}`, `El Camino #${seed}`] as const, host: null,
      isPlayIn: seed === 4,
      // ↓ VERBATIM from the original crossoverPairings()
      label: seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
    })),
  },
  phases: [
    { phase: 'regular', through: 'data' },        // the original formula (§5.9)
    { phase: 'crossover', through: '2026-10-30' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last SCVAL league games' },
    { id: 'crossover', date: '2026-10-30', label: 'SCVAL crossover and 4th-place play-in' },
  ],
  officialChanges: null,
};
