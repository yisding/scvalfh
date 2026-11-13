/** The Marin County Athletic League (NCS): its LeagueConfig (SPEC §2.2), listed in LEAGUES by lib/leagues.ts. */

import type { LeagueConfig } from './shape';

const MCAL_HB = 'MCAL Field Hockey Handbook (rev. 10/19/24)';
const MCAL_TB = 'MCAL Tie-Breaking Criteria (rev. 3/26)';

export const MCAL: LeagueConfig = {
  id: 'mcal', sectionId: 'ncs',
  name: 'Marin County Athletic League', shortName: 'MCAL',
  cities: 'Marin County, San Francisco and Berkeley',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://www.mcalsports.org/FieldHockey.htm',
  links: [
    { label: 'MCAL field hockey', href: 'https://www.mcalsports.org/FieldHockey.htm' },
    { label: 'MCAL field hockey handbook (PDF)', href: 'https://www.mcalsports.org/Sports_handbook/FieldHockeyHB.pdf' },
    { label: 'MCAL tie-breaking criteria (PDF)', href: 'https://www.mcalsports.org/TiebreakingCriteria.pdf' },
    { label: 'MCAL 2026 play-off sheet (PDF)', href: 'https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_26.pdf' },
  ],
  sblive: { leagueSlugs: ['4212-marin-county'], backfill: true },
  officialCodes: {
    AW: 'archie-williams', R: 'redwood', T: 'tamalpais', B: 'berkeley', LW: 'lick-wilmerding',
    U: 'university-sf', MC: 'marin-catholic', CSH: 'convent-sacred-heart', CVS: 'convent-sacred-heart', MA: 'marin-academy',
  },
  officialNames: { University: 'university-sf', UNIVERSITY: 'university-sf', 'Convent & Stuart Hall': 'convent-sacred-heart' },
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'marin-county', leagueId: 'mcal', label: 'MCAL', searchAliases: ['Marin County', 'Marin County Athletic League'],
      maxprepsLeagueId: 'c15255d5-c2ad-49f5-9afb-cf4ba289875c',
      maxprepsName: 'Marin County', maxprepsSlug: 'marin-county',
      expectedTeams: 9, gamesPerTeam: 16,
      leaguePlay: { first: '2026-08-24', last: '2026-10-22' },
      official: {
        source: 'mcal-pdf', mode: 'bundled', bundledFile: 'data/official/mcal-2026.json',
        scheduleUrl: 'https://www.mcalsports.org/Schedules/Fall/FieldHockey_26.pdf',
        revisionCheckUrl: 'https://www.mcalsports.org/Schedules/Fall/FieldHockey_26.pdf',
        bundledSha256: 'aee4894e665be7aebbe37dcb9c14db37dcc5c177dfe7adca2586459eb4370319',
        revisedOn: null,
      },
      maxprepsTeamCount: 9, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps orders the MCAL table by winning percentage; MCAL orders it by points, so MaxPreps’ places differ from ours. After Oct 22, MaxPreps also counts MCAL tournament games in its league records; ours never do.',
      home: { miniRows: 7, lineAfter: 6, lineLabel: 'Tournament line' },
      ladderLine: { after: 6, label: 'Tournament line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    classification: 'official-fixtures', excludeContestTypes: [2, 4],
    postseasonFrom: '2026-10-23', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['h2h-win-pct', 'record-above-tie', 'draw-number'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip',
    drawNumbers: {
      'archie-williams': 1, redwood: 2, tamalpais: 3, berkeley: 4, 'lick-wilmerding': 5,
      'university-sf': 6, 'marin-catholic': 7, 'convent-sacred-heart': 8, 'marin-academy': 9,
    },
    leagueOvertime: 'none',
    citations: {
      points: `${MCAL_HB} §7a (3 points for a win, 1 for a tie)`,
      pointsShort: 'MCAL Handbook §7a',
      order: `${MCAL_HB} §7a (“The MCAL placement will be the order of team points”)`,
      doubleRoundRobin: `${MCAL_HB} §8a (double round robin, 16 league games each)`,
      overtime: 'MCAL Field Hockey Handbook §9 (“there is no overtime in regular season play”; ties stand)',
      coChampions: `${MCAL_HB} §7a (equal points: co-MCAL Champions)`,
      stages: {
        'h2h-win-pct': `${MCAL_TB} step 1 (head-to-head winning percentage)`,
        'record-above-tie': `${MCAL_TB} step 2 (record against the teams above the tie)`,
        'draw-number': `${MCAL_TB} step 3 (spring draw numbers, lowest wins: AW 1, R 2, T 3, B 4, LW 5, U 6, MC 7, CSH 8, MA 9)`,
        'play-in': `${MCAL_TB} (final play-off spot: a play-in game on Fri Oct 23 unless one team won the head-to-head 2-0; the higher draw number hosts)`,
      },
      incomplete: 'MCAL General Rules (with an incomplete schedule, winning percentage replaces points)',
    },
    coChampionsLabel: 'MCAL co-champions',
    unresolvedSuffix: '— a play-in on Fri Oct 23 decides it (MCAL Tie-Breaking Criteria)',
  },
  postseason: {
    kind: 'league-tournament', name: 'MCAL tournament', qualifiers: 6, byes: [1, 2],
    ladder: [
      { divisions: '*', places: [1, 2], status: 'bye', label: 'Semifinal bye',
        phrase: 'a semifinal bye', badge: 'Bye', legend: 'Places 1-2 — bye to the semifinals, Wed Oct 28' },
      { divisions: '*', places: [3, 6], status: 'tournament', label: 'MCAL tournament',
        phrase: 'an MCAL tournament place', badge: 'Top 6', legend: 'Places 3-6 — quarterfinal Mon Oct 26 (3 hosts 6, 4 hosts 5)' },
      { divisions: '*', places: [7, 99], status: 'below-line', label: 'Below the tournament line',
        phrase: 'below the tournament line', badge: 'Below line', legend: '7th or lower — outside the six-team MCAL tournament' },
    ],
    rounds: [
      { id: 'play-in', round: 'play-in', date: '2026-10-23', time: '16:00', optional: true,
        pairing: 'Only if two teams are level for 6th and neither won both meetings; the higher draw number hosts' },
      { id: 'qf-1', round: 'quarterfinal', date: '2026-10-26', time: '16:00', optional: false, pairing: '5 at 4' },
      { id: 'qf-2', round: 'quarterfinal', date: '2026-10-26', time: '16:00', optional: false, pairing: '6 at 3' },
      { id: 'sf-1', round: 'semifinal', date: '2026-10-28', time: '16:00', optional: false, pairing: 'Lowest-ranked remaining seed at 1' },
      { id: 'sf-2', round: 'semifinal', date: '2026-10-28', time: '16:00', optional: false, pairing: 'Highest-ranked remaining seed of 3-6 at 2' },
      { id: 'final', round: 'final', date: '2026-10-30', time: '16:00', optional: false, pairing: 'Semifinal winners, at Tamalpais' },
    ],
    finalSite: {
      slug: 'tamalpais', label: 'Tamalpais',
      venue: 'Tamalpais High School',
      // On campus: the schools' HomeCampus calendars (cifncshome.org; Redwood's Oct 30 event "MCAL Championship Game",
      // facility Tamalpais, 700 Miller Ave, Mill Valley, California, 94941, the address data/schools.json holds for
      // tamalpais; Tam's Oct 28 semifinal names the turf: "Tam Turf at Bruce Grant Field/Sam Chapman Stadium").
      // Research of 2026-10-29.
      admission: 'Adults $10; students, children and seniors $5; pre-sale on GoFan. No booster passes or student body cards; lifetime MCAL, NCS and CIF passes are honored.',
      admissionSource: 'MCAL 2026 Field Hockey Play-off sheet',
    },
    lastSpot: { place: 6, rule: 'play-in-unless-h2h-sweep', host: 'highest-draw-number' },
    citations: {
      format: 'MCAL 2026 Field Hockey Play-off sheet (six schools; seeds 1 and 2 have byes)',
      seeding: `${MCAL_HB} §7a and §8b (seeded by point total)`,
      semifinal: 'MCAL 2026 Play-off sheet (lowest-ranked remaining seed at #1, highest-ranked remaining of 3-6 at #2; confirmed by the 2025 bracket)',
      lastSpot: `${MCAL_TB} (6th place: a play-in unless one team won the head-to-head 2-0; the higher draw number hosts. A three-way tie for 5th: draw numbers place the 5th seed and the other two play in, hosted by the winner of their earlier meeting)`,
      qualifiersConflict: `${MCAL_HB} §8b says the top four qualify; the 2026 play-off sheet (and the 2025 tournament) use six. This site follows the 2026 sheet.`,
      pennant: 'MCAL General Rules, Pennants 1–3 (“Pennants for varsity league champions will be presented at the conclusion of the playoffs … If the winner of the playoffs is different than the regular season winner, they will also be awarded a pennant.”)',
    },
    titleNote: 'The regular-season points leader is MCAL Champion. If a different team wins the tournament, it also receives a pennant.',
    // Marin Independent Journal, Oct 28, 2026 ("The game was scoreless after regulation and two overtimes"; Tam "won 3-1 in
    // the shootout"): MaxPreps records the shootout tally as the score and the game as a regulation result, which the
    // one-goal caveat cannot catch. DATA_QUALITY.resultCorrections records the game as it was played (0-0, two
    // overtimes, a 3-1 shootout), so the snapshot holds that; this sentence says so on the bracket and the game page.
    resultNotes: {
      '7bb048ba-9e33-4ad1-a743-2348c6637602':
        'Level 0–0 after two overtimes; Tamalpais won the shootout 3–1 (Marin Independent Journal, Oct 28, 2026). MaxPreps records the shootout tally, 3–1, as the score.',
    },
    sourceUrl: 'https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_26.pdf',
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-10-30' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-22', label: 'Last MCAL league games' },
    { id: 'play-in', date: '2026-10-23', label: 'MCAL play-in (only if needed)' },
    { id: 'quarterfinals', date: '2026-10-26', label: 'MCAL quarterfinals' },
    { id: 'semifinals', date: '2026-10-28', label: 'MCAL semifinals' },
    { id: 'final', date: '2026-10-30', label: 'MCAL final at Tamalpais' },
  ],
  // Approved changes are posted here, not in the schedule PDF (DOSSIER-NCS). Hash of the 2026-10-02 cell text:
  // "Girls Field Hockey: Oct 12: Marin Catholic vs Lick Wilmerding moved to Oct 15 (Varsity at 4:30pm and JV at 5:15pm) Sept 24: Lick Wilmerding vs Berkeley moved to Sept. 29. (Varsity at 4:30pm and JV at 5:30pm at City College of San Francisco)"
  officialChanges: {
    url: 'https://www.mcalsports.org/Schedir.htm',
    cellMarker: 'Girls Field Hockey:',
    sha256: 'b1e5c523b251021522a77ed459d5d7035fe0c9100cb2b727f1ea63c467566b76',
  },
};
