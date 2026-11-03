/** The Sunset (Southern Section): its LeagueConfig (SPEC §2.2), listed in LEAGUES by lib/leagues.ts. */

import { SITE_POINTS_CITATIONS, SS_BLUE_BOOK_FH_URL, SS_FIELD_HOCKEY_URL } from './sections';
import type { LeagueConfig } from './shape';

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
  // 'membership' (owner decision, 2026-10-06; DESIGN §24.11): every game between two of the eight counts, whatever
  // MaxPreps' league flag says. The flag follows whichever scorekeeper entered the game: Great Oak's two games
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
      // No fixed schedule: the 28 pairs meet {2: 7, 1: 21} times outside tournaments (snapshot of 2026-10-06), so no "of N".
      expectedTeams: 8, gamesPerTeam: null,
      // First: Chaparral–Temecula Valley, Aug 25 (the first game between two of the eight; it counts: membership).
      // Last: the Section's last allowable contest, Sat Oct 31 (Blue Book Bylaw 2006; 2026-27 Sports Calendar).
      leaguePlay: { first: '2026-08-25', last: '2026-10-31' },
      official: {
        mode: 'none',
        note: 'No Sunset document exists that we could find: no league site, bylaws, schedule or standings. The eight teams here are eight of the ten in MaxPreps’ Sunset table in 2024-25 and 2025-26; the other two, Bonita and Chaminade, are listed with the LA independents (that group’s note says why). For 2026-27, MaxPreps’ table lists three of the eight, with Bonita and Chaminade, and assigns the five Orange County schools to no league; si.com’s table (also shown on the Southern Section’s scores site) lists six of the eight, with Bonita, Chaminade, and Westlake and Los Alamitos with no games, and puts Chaparral and Temecula Valley in a separate table. This site counts every game between two of the eight outside a tournament as a Sunset game, whether or not MaxPreps marks it as one: MaxPreps’ flag follows whoever entered the game (it marks one of Great Oak’s two games with Temecula Valley and none of the Orange County schools’ games against each other except Edison’s), so no two sources agree on a record. Teams play different numbers of games.',
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
      knownCause: 'MaxPreps’ Sunset table lists three of the eight teams, with Bonita and Chaminade, counts only the games its scorekeepers flagged as league games, and orders them by winning percentage. This site counts every game between two of the eight, orders all eight by 3-1-0 points, and lists Bonita and Chaminade with the LA independents, so Great Oak’s Aug 27 win over Bonita, which MaxPreps counts, is not counted here. si.com uses its own league labels, so its Sunset records differ from both.',
      home: { miniRows: 8, lineAfter: null, lineLabel: null },
      // No postseason, so no line to draw.
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'league',
    // Every game between two of the eight inside leaguePlay counts (lib/classify.ts 'membership', as the San Diego
    // divisions and the LA independents); tournament (2) and postseason (4) rows never do.
    classification: 'membership', excludeContestTypes: [2, 4],
    postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    // 'none' keeps D2 rule 4c (a phantom si.com 0-0 tie) and records a level game as a tie: no rule says otherwise.
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      ...SITE_POINTS_CITATIONS,
      doubleRoundRobin: 'no league schedule is published and there is no round robin: a Sunset game is any game between two of the eight on MaxPreps’ schedules outside a tournament, and the pairs meet once or twice',
      overtime: 'No league or Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules). A Sunset game has ended level (Fountain Valley 1-1 Marina, Sep 11) and one has been decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2), so this site records each game as it is reported',
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
