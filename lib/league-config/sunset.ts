/** The Sunset (Southern Section): its LeagueConfig (SPEC §2.2), listed in LEAGUES by lib/leagues.ts. */

import { SITE_POINTS_CITATIONS, SS_BLUE_BOOK_FH_URL, SS_FIELD_HOCKEY_URL } from './sections';
import type { LeagueConfig } from './shape';

/** The game page's sentence for a pair's earlier, non-league meeting (rules.nonLeagueGames). */
function nonLeague(a: string, b: string, leagueDate: string): string {
  return `${a} and ${b} met twice; this earlier game is not counted as a Sunset league game. Their league game is the ${leagueDate} meeting, which both schools list as a league game on cifsshome.org.`;
}

export const SUNSET: LeagueConfig = {
  // A field-hockey-only grouping, NOT the all-sports Sunset League (Orange County: Huntington Beach, Edison,
  // Fountain Valley, Marina, Los Alamitos, Newport Harbor, Corona del Mar [U]): hence the name, which the copy
  // rules keep apart from "Sunset League" (DESIGN-socal §2.4). Membership [V]: eight of the ten schools of
  // MaxPreps' 2024-25 (c538c7d2-…) and 2025-26 (1ab67ce6-…) Sunset tables; no Sunset site, bylaws, schedule or
  // standings document was found [U: not found] (research-cifss.md §2). The other two, Bonita and Chaminade,
  // are listed with the LA independents (owner decision, 2026-10-06; DESIGN §24.10): MaxPreps and si.com file
  // them under "Sunset", but MaxPreps marks none of their nine 2026 games against the five Orange County schools
  // as a league game, and both play every one of the other independents home and away.
  //
  // A single round robin (owner decision, 2026-11-14): each pair's ONE league game counts, seven a team. All 28
  // pairs met outside a tournament before the Tournament of Champions; seven met twice, and for each of those
  // cifsshome.org (the Section's schedule site, where each school enters its own games; read 2026-11-14) has the
  // later meeting as "League" in both schools' entries and the earlier one as "Non-League" in at least one, while
  // every one of the 21 single meetings is "League" in both. So the earlier meeting of each of the seven pairs is
  // a non-league game (rules.nonLeagueGames, with MaxPreps' and cifsshome.org's tags beside each).
  //
  // 'membership' (owner decision, 2026-10-06; DESIGN §24.11): MaxPreps' league flag does not decide what counts.
  // The flag follows whichever scorekeeper entered the game: Great Oak's two games
  // with Temecula Valley are flagged non-league (Sep 4) and league (Oct 2); Temecula Valley's games against the
  // five Orange County schools are all flagged, Great Oak's and Chaparral's mostly not; the Orange County schools'
  // games against each other are flagged only when Edison enters them. So MaxPreps' Sunset table (Great Oak
  // 3-1), si.com's (2-2) and the flag-based table this site drew until then (2-1) disagreed on one team's record.
  id: 'sunset', sectionId: 'ss',
  name: 'Sunset field hockey league', shortName: 'Sunset',
  cities: 'Huntington Beach, Newport Beach, Fountain Valley and Temecula',
  alignmentSource: 'MaxPreps’ 2024-25 and 2025-26 Sunset tables',
  officialUrl: SS_FIELD_HOCKEY_URL,
  links: [
    { label: 'CIF Southern Section field hockey', href: SS_FIELD_HOCKEY_URL },
    { label: 'CIF-SS Blue Book 2026-27, Field Hockey (PDF)', href: SS_BLUE_BOOK_FH_URL },
  ],
  // si.com's Sunset table (also on scores.cifss.org) holds six of the eight, Bonita and Chaminade (the
  // independents here) and two 0-0 rows (Westlake, Los Alamitos); its Chaparral and Temecula Valley sit in
  // 4245-southwestern, harvested by name only via TEAMS.
  sblive: { leagueSlugs: ['4249-sunset'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote:
    'The Sunset here is a field hockey grouping of eight Southern Section schools in Orange and Riverside counties, not the all-sports Sunset League.',
  divisions: [
    {
      id: 'sunset', leagueId: 'sunset', label: 'Sunset', searchAliases: ['Sunset'],
      // MaxPreps' 2026-27 Sunset table: five rows (Great Oak, Temecula Valley, Chaparral, and Bonita and Chaminade,
      // the independents here: maxprepsExtraRows), ordered by conference winning percentage; the five Orange County
      // schools carry the zero-GUID league this season.
      maxprepsLeagueId: 'aa46adc4-c188-4e3b-b5fd-857064176297',
      maxprepsName: 'Sunset', maxprepsSlug: 'sunset',
      // No published schedule, so no "of N" (null): the seven league games a team are this site's reading of the
      // schools' own tags (rules.nonLeagueGames), and a set count here means a double round robin (assertLeagues).
      expectedTeams: 8, gamesPerTeam: null,
      // First: Chaparral at Edison, Tue Sep 15, the first league game (the seven earlier games between two of the
      // eight, Aug 25 to Sep 11, are six of the non-league meetings and a tournament game).
      // Last: the Section's last allowable contest, Sat Oct 31 (Blue Book Bylaw 2006; 2026-27 Sports Calendar).
      leaguePlay: { first: '2026-09-15', last: '2026-10-31' },
      official: {
        mode: 'none',
        note: 'No Sunset document exists that we could find: no league site, bylaws, schedule or standings. The eight teams here are eight of the ten in MaxPreps’ Sunset table in 2024-25 and 2025-26; the other two, Bonita and Chaminade, are listed with the LA independents (that group’s note says why). For 2026-27, MaxPreps’ table lists three of the eight, with Bonita and Chaminade, and assigns the five Orange County schools to no league; si.com’s table (also shown on the Southern Section’s scores site) lists six of the eight, with Bonita, Chaminade, and Westlake and Los Alamitos with no games, and puts Chaparral and Temecula Valley in a separate table. This site counts one league game for each pair of the eight, seven a team: all 28 pairs met outside a tournament, and where a pair met twice the league game is the later meeting, the one both schools list as a league game on the Section’s schedule site (cifsshome.org); the earlier meeting, which at least one of the two lists as non-league, does not count. MaxPreps’ own flag is not used: it follows whoever entered the game (it marks none of the Orange County schools’ games against each other except Edison’s), so no two sources agree on a record.',
      },
      // 5 rows + the 5 Orange County schools MaxPreps assigns to no league − the 2 independents = 8.
      maxprepsTeamCount: 5,
      maxprepsMissing: ['edison', 'fountain-valley', 'huntington-beach', 'marina', 'newport-harbor'],
      // MaxPreps' Sunset rows for the two schools this site lists with the LA independents (its schoolId GUIDs:
      // lib/registry/independents.ts). Skipped by the reported-table step, never compared.
      maxprepsExtraRows: {
        '4c2dd7e8-2f3e-43aa-891b-9218932cdf9d': 'Bonita: listed with the LA independents here (MaxPreps marks none of its games against the five Orange County schools as a league game)',
        '742a32d0-2dc9-4aa8-ad92-8c4576f73a12': 'Chaminade: listed with the LA independents here (MaxPreps marks none of its games against the five Orange County schools as a league game)',
      },
      reportedTrust: 'informational',
      knownCause: 'MaxPreps’ Sunset table lists three of the eight teams, with Bonita and Chaminade, counts only the games its scorekeepers flagged as league games, and orders them by winning percentage. This site counts one league game for each pair of the eight (the later meeting where a pair met twice), orders all eight by 3-1-0 points, and lists Bonita and Chaminade with the LA independents, so Great Oak’s Aug 27 win over Bonita, which MaxPreps counts, is not counted here. si.com uses its own league labels, so its Sunset records differ from both.',
      home: { miniRows: 8, lineAfter: null, lineLabel: null },
      // No postseason, so no line to draw.
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'league',
    // A game between two of the eight inside leaguePlay counts (lib/classify.ts 'membership', as the San Diego
    // divisions and the LA independents) unless it is a pair's earlier, non-league meeting (nonLeagueGames);
    // tournament (2) and postseason (4) rows never do.
    classification: 'membership', excludeContestTypes: [2, 4],
    postseasonFrom: null, leagueGameOverrides: [],
    // The earlier meeting of each pair that met twice (see the header). After each: MaxPreps' flag for the two
    // meetings, then cifsshome.org's two entries for each (read 2026-11-14). Six are dated before leaguePlay.first
    // and are listed all the same, so the list is the whole account; Edison–Fountain Valley (Sep 16) is inside it.
    nonLeagueGames: {
      // MaxPreps: non-league, then league (Oct 5). cifsshome.org: Non-League/Non-League, then League/League.
      '11de52a1-9d07-43b3-9d49-bc29e7d1d914': nonLeague('Chaparral', 'Temecula Valley', 'Oct 5'),
      // MaxPreps: non-league, then league (Oct 13). cifsshome.org: Non-League/Non-League, then League/League.
      'ebdd1733-1ab9-447a-89db-34971dce5356': nonLeague('Edison', 'Newport Harbor', 'Oct 13'),
      // MaxPreps: non-league, then league (Sep 30). cifsshome.org: Non-League/Non-League, then League/League.
      'c9eb7c63-ceab-450a-b092-8a3b8c1cab39': nonLeague('Edison', 'Marina', 'Sep 30'),
      // MaxPreps: non-league, then league (Oct 2). cifsshome.org: League/Non-League, then League/League.
      '0994415b-6a76-45f1-8d63-0347a8f03e08': nonLeague('Great Oak', 'Temecula Valley', 'Oct 2'),
      // MaxPreps: league both times (Sep 11, Oct 16). cifsshome.org: League/Non-League, then League/League.
      '252ac948-674c-4374-aa07-5a0fa074ef17': nonLeague('Chaparral', 'Great Oak', 'Oct 16'),
      // MaxPreps: non-league both times (Sep 11, Oct 12). cifsshome.org: League/Non-League, then League/League.
      'd942ef67-ae4c-4e16-bf03-1128c425be53': nonLeague('Fountain Valley', 'Marina', 'Oct 12'),
      // MaxPreps: non-league, then league (Oct 9). cifsshome.org: League/Non-League, then League/League.
      'ee4807e9-e585-4d86-b92d-0f4fe84a5a56': nonLeague('Edison', 'Fountain Valley', 'Oct 9'),
    },
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    // 'none' keeps D2 rule 4c (a phantom si.com 0-0 tie) and records a level game as a tie: no rule says otherwise.
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      ...SITE_POINTS_CITATIONS,
      doubleRoundRobin: 'no league schedule is published; the eight play a single round robin, seven league games a team, and where a pair met twice the league game is the later meeting, which both schools list as a league game on cifsshome.org',
      overtime: 'No league or Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules). Two Sunset league games have been decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2; Huntington Beach 1-0 Edison, Oct 8) and none has ended level, so this site records each game as it is reported',
      coChampions: 'no published rule names a champion; teams level on points at the top are shown level',
      stages: {
        'no-rule': 'No Sunset document exists that we could find, so no rule breaks this tie and it is left as it is',
      },
    },
    coChampionsLabel: 'Sunset co-leaders',
    unresolvedSuffix: '',
  },
  postseason: {
    kind: 'no-postseason',
    ladder: [
      { divisions: '*', places: [1, 99], status: 'no-postseason', label: 'Tournament of Champions',
        phrase: 'the Tournament of Champions', badge: 'TOC',
        legend: 'The Tournament of Champions, run by the Los Angeles Field Hockey Association, is the postseason for the Sunset and the LA independents (CIF-SS holds none: Blue Book 2011.1, 3500.2)' },
    ],
    note: 'The Sunset’s postseason is the Tournament of Champions, Oct 22–29, which it shares with the LA independents. The Los Angeles Field Hockey Association runs it, since the CIF Southern Section holds no field hockey championship (Blue Book Bylaws 2011.1 and 3500.2) and CIF no regional or state one; a Sunset team not in it ends its season with its last game, Oct 31 at the latest.',
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
