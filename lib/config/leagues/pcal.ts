/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the Pacific Coast Athletic League (CCS) and its rules and by-laws citations.
 */

import type { LeagueConfig } from '@/lib/model/league-config';

export const PCAL_RULES = 'PCAL Sports Rules — Field Hockey (Jan 2022)';
export const PCAL_BYLAWS = 'PCAL By-laws (rev. May 2025)';

export const PCAL: LeagueConfig = {
  id: 'pcal', sectionId: 'ccs',
  name: 'Pacific Coast Athletic League', shortName: 'PCAL',
  cities: 'Monterey County and Hollister',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://pcalathletics.org/field-hockey/',
  links: [
    { label: 'PCAL field hockey', href: 'https://pcalathletics.org/field-hockey/' },
    { label: 'PCAL Sports Rules — Field Hockey (PDF)', href: 'https://pcalathletics.org/wp-content/pdf/Sports-Rules-Field-Hockey-Jan-2022.pdf' },
    { label: 'PCAL By-laws (PDF)', href: 'https://pcalathletics.org/wp-content/pdf/PCAL-By-Laws.Final_.Rev-May-2025-2.pdf' },
  ],
  sblive: { leagueSlugs: ['4231-pacific-coast-gabilan', '4232-pacific-coast-mission'], backfill: true },
  officialCodes: {
    CAR: 'carmel', GRE: 'greenfield', HOL: 'hollister', MON: 'monterey', SAL: 'salinas',
    CAT: 'santa-catalina', SCAT: 'santa-catalina', 'CAT/YOR': 'santa-catalina', STE: 'stevenson',
  },
  officialNames: {},
  withdrawnNames: ['York', 'YORK', 'YOR', 'York Falcons', 'York School'],
  membershipNote: null,
  divisions: [
    {
      // One division. Its MaxPreps name is DATA ONLY and never rendered.
      // 'Pacific Coast - Mission' (6e1f97d4-…) is NOT configured: standings HTTP 400, no teams.
      id: 'pcal', leagueId: 'pcal', label: 'PCAL', searchAliases: ['Pacific Coast Athletic League'],
      maxprepsLeagueId: '50ac53cd-e46f-4df9-824b-5a954c583b95',
      maxprepsName: 'Pacific Coast - Gabilan', maxprepsSlug: 'pacific-coast--gabilan',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-02', last: '2026-10-29' },
      official: {
        source: 'pcal-pdf', mode: 'bundled', bundledFile: 'data/official/pcal-2026.json',
        scheduleUrl: 'https://pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf',
        revisionCheckUrl: 'https://pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf',
        bundledSha256: '6b99480a4a1b44b0eea2c352e81e93e14ca97e44cbcced0c131f188546b3d224',
        revisedOn: null,
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'MaxPreps is missing some of PCAL’s official league games and dates others differently, so its PCAL records differ from ours. This table is computed from PCAL’s official schedule.',
      home: { miniRows: 7, lineAfter: 2, lineLabel: 'AQ line' },
      ladderLine: { after: 2, label: 'AQ line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: {
      // §23.3 applies only "for an Automatic Qualifier berth": a tie whose points bucket starts at 3rd or lower is left level.
      default: ['no-rule'],
      byBucketStart: {
        // co-/tri-champions (§23.3.1, §23.3.2): three-way H2H, then two-way H2H (partition-restart), then vs lower-placed
        1: ['head-to-head', 'record-vs-lower-placed', 'ccs-points'],
        // tie for 2nd (§23.3.3): H2H (multi-team per §23.3.2 a-b), vs higher-placed from the champion down, vs lower-placed
        2: ['head-to-head', 'record-vs-higher-placed', 'record-vs-lower-placed', 'ccs-points'],
      },
    },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${PCAL_RULES} §1.7 (3 points for a win, 1 for a tie)`,
      pointsShort: 'PCAL Sports Rules §1.7',
      order: `${PCAL_RULES} §1.7 (standings are the order of points)`,
      doubleRoundRobin: `${PCAL_RULES} §1.4 (one division; the 2026 schedule is a double round robin)`,
      overtime: `${PCAL_RULES} §1.6.4 (overtime applies to single round robin or bracket play; a tie is 1 point either way)`,
      coChampions: `${PCAL_BYLAWS} §22.3 (two teams level at the top are co-champions; three are tri-champions)`,
      stages: {
        'head-to-head': `${PCAL_BYLAWS} §23.3 (head-to-head in league contests; three level: three-way, then two-way)`,
        'record-vs-lower-placed': `${PCAL_BYLAWS} §23.3.1(b) / §23.3.3(c) (record against each lower-placed team, in standings order)`,
        'record-vs-higher-placed': `${PCAL_BYLAWS} §23.3.3 (record against each higher-placed team, from the champion down)`,
        'ccs-points': `${PCAL_BYLAWS} §23.3 (the CCS-points step applies only to sports seeded by CCS points; then a coin flip or blind draw — we cannot compute either, so the teams stay tied)`,
        'no-rule': 'PCAL’s by-laws break ties only for the two CCS places; this tie is left as it is',
      },
    },
    coChampionsLabel: 'Co-champions (tri-champions when three are level)',
    unresolvedSuffix: '— PCAL By-laws §23.3 ends in a coin flip or blind draw by the Commissioner',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${PCAL_RULES} §1.8.1 (the top two of the final round-robin standings are automatic CCS qualifiers)`,
    ladder: [
      { divisions: '*', places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: '*', places: [3, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '3rd or lower — no automatic-berth route; may apply for at-large (PCAL By-laws §23.4)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-29', label: 'Last PCAL league games' },
    { id: 'last-allowed', date: '2026-10-31', label: 'Last allowed PCAL league date' },
  ],
  officialChanges: null,
};
