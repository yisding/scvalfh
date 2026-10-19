/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the LA independents (Southern Section), a group of schools in no league.
 */

import type { LeagueConfig } from '@/lib/model/league-config';

import { SS_BLUE_BOOK_FH_URL, SS_FIELD_HOCKEY_URL } from './documents';

/**
 * The LA independents (owner decisions, 2026-10-06: every California team with a 2026 varsity game
 * is covered, and Bonita and Chaminade are independents, not Sunset teams; DESIGN §24.9, §24.10). Five Southern
 * Section schools in no field hockey league:
 *  - Glendora, Harvard-Westlake and Thousand Oaks are each the only field hockey team in their all-sports
 *    MaxPreps league for 2026-27: Palomares (37e34960-…), League B (3b29b902-…) and Marmonte (05c0b9ef-…) each
 *    list one team (research-cifss.md §2a). The same was true in 2025-26 (25-26 Palomares 5d795f4f-…, League B
 *    c2922327-…, Marmonte 392fb703-…; fetched 2026-10-06).
 *  - Bonita and Chaminade sit in MaxPreps' and si.com's 2026-27 Sunset tables (as in MaxPreps' 2024-25 and
 *    2025-26 tables), but MaxPreps marks none of their nine 2026 games against the five Orange County Sunset
 *    schools as a league game (snapshot of 2026-10-06: Bonita–Marina, –Huntington Beach, –Newport Harbor,
 *    –Edison; Chaminade–Fountain Valley, –Edison, –Marina, –Huntington Beach, –Newport Harbor, all contestType 1),
 *    and each plays every other independent, home and away. The one game MaxPreps flags between an independent
 *    and a Sunset team, Bonita at Great Oak on Aug 27, counts for neither table (the Sunset's knownCause says so).
 *
 * So this is a group, not a league (`independents: true`): it sits last in LEAGUES, every count of "leagues"
 * leaves it out (LEAGUES_PROPER), and copy names it separately ("and the Southern Section’s five independents").
 * It HAS a table (owner decision, 2026-10-06): classification 'membership', as the San Diego divisions, counts
 * every game between two of the five (tournament and postseason rows left out, inside leaguePlay) whether or not
 * MaxPreps marks it a league game (it marks only Bonita's two games with Chaminade), ordered by this site's 3-1-0
 * points. The pairs meet twice, Chaminade–Thousand Oaks three times, so there is no fixed schedule (gamesPerTeam
 * null, as the Sunset). No MaxPreps table to compare, no postseason. The citations below claim no rule: there is
 * no league to have written one.
 */
export const INDEPENDENTS: LeagueConfig = {
  id: 'independents', sectionId: 'ss',
  // "LA" (owner decision, 2026-10-06; DESIGN §24.11): the five are Los Angeles-area schools (La Verne, West Hills,
  // Glendora and Studio City in Los Angeles County; Thousand Oaks in Ventura County). The id and the URL stay
  // 'independents'.
  name: 'LA independents', shortName: 'LA',
  independents: true,
  // 'Show LA here' names a place: alone as a control's target the group is 'the LA independents'.
  standaloneName: 'the LA independents',
  cities: 'Glendora, La Verne, Studio City, Thousand Oaks and West Hills',
  alignmentSource: 'MaxPreps’ 2026-27 team pages and schedules (five Southern Section schools in no field hockey league, which play each other)',
  officialUrl: SS_FIELD_HOCKEY_URL,
  links: [
    { label: 'CIF Southern Section field hockey', href: SS_FIELD_HOCKEY_URL },
    { label: 'CIF-SS Blue Book 2026-27, Field Hockey (PDF)', href: SS_BLUE_BOOK_FH_URL },
  ],
  // si.com's one-school league pages (each also lists placeholder rows with no games); harvested for the team
  // pages only, never membership. Bonita's and Chaminade's si.com rows are in the Sunset's bucket (4249-sunset).
  sblive: { leagueSlugs: ['4235-palomares', '4207-league-b', '4213-marmonte'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote:
    'The LA independents are five Los Angeles-area Southern Section schools in no field hockey league. The table counts their games against each other.',
  divisions: [
    {
      id: 'independents', leagueId: 'independents', label: 'LA', searchAliases: ['LA independents', 'Independents', 'independent'],
      // No MaxPreps table groups the five (MaxPreps files Bonita and Chaminade under the Sunset, the other three
      // alone in their all-sports leagues), so nothing is requested.
      maxprepsLeagueId: null, maxprepsName: null, maxprepsSlug: null,
      // No fixed schedule: the 10 pairs meet {2: 9, 3: 1} times (snapshot of 2026-10-06), so no "of N".
      expectedTeams: 5, gamesPerTeam: null,
      // First: Chaminade–Thousand Oaks and Harvard-Westlake–Glendora, Sep 8 (the first games between two of the
      // five). Last: the Section's last allowable contest, Sat Oct 31 (Blue Book Bylaw 2006; 2026-27 Sports Calendar).
      leaguePlay: { first: '2026-09-08', last: '2026-10-31' },
      official: {
        mode: 'none',
        note: 'No league gathers these five schools. Glendora, Harvard-Westlake and Thousand Oaks are the only field hockey teams in their all-sports leagues on MaxPreps (the Palomares League, League B and the Marmonte League). MaxPreps and si.com list Bonita and Chaminade in the Sunset, but MaxPreps marks none of their games against the five Orange County Sunset teams as a league game, and each plays every other independent home and away, so this site lists them here. The table counts every game between two of the five, whether or not MaxPreps marks it as a league game (it marks only Bonita’s two games with Chaminade), and orders them by this site’s 3-1-0 points.',
      },
      maxprepsTeamCount: 0,
      maxprepsMissing: ['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks'],
      maxprepsExtraRows: {},
      reportedTrust: 'informational',
      knownCause: null,
      home: { miniRows: 5, lineAfter: null, lineLabel: null },
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'league',
    // Every game between two of the five counts (lib/engine/classify.ts 'membership'); tournament (2) and postseason (4)
    // rows never do.
    classification: 'membership', excludeContestTypes: [2, 4],
    postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: 'this site’s 3-1-0 points (there is no league to publish a points rule)',
      pointsShort: 'site 3-1-0',
      order: 'no league exists to order the table; this site orders it by its own 3-1-0 points',
      doubleRoundRobin: 'no league schedule exists: a game here is any game between two of the five on MaxPreps’ schedules outside a tournament, and nine of the ten pairs meet home and away',
      overtime: 'No Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules), so this site records each game as it is reported',
      coChampions: 'no league names a champion; teams level on points at the top are shown level',
      stages: {
        'no-rule': 'No league exists, so no rule breaks this tie and it is left as it is',
      },
    },
    coChampionsLabel: 'LA co-leaders',
    unresolvedSuffix: '',
  },
  postseason: {
    kind: 'no-postseason',
    ladder: [
      { divisions: '*', places: [1, 99], status: 'no-postseason', label: 'No section playoffs',
        phrase: 'no postseason', badge: 'No playoffs',
        legend: 'The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)' },
    ],
    note: 'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaws 2011.1 and 3500.2), and CIF holds no regional or state championship, so each independent’s season ends with its last game, Oct 31 at the latest.',
    citations: {
      noPlayoffs: 'CIF-SS Blue Book 2026-27, Bylaw 2011.1 (“No playoffs - See Bylaw 3500.2”) and Bylaw 3500.2 (“No playoffs will be conducted by the CIF Southern Section Office when less than 20% of the membership field teams in that sport”)',
    },
    sourceLabel: 'CIF-SS Blue Book 2026-27',
    sourceUrl: SS_BLUE_BOOK_FH_URL,
  },
  phases: [{ phase: 'regular', through: 'league-play' }],
  keyDates: [{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }],
  officialChanges: null,
};
