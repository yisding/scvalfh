/**
 * The data-quality corrections (SPEC §2.2): MaxPreps ghost teams and contests to drop, si.com ids and MaxPreps
 * leagues to ignore, date corrections, moved fixtures, and the schools search reports as not covered.
 * lib/leagues.ts assertLeagues() checks them against the config.
 */

import { IS_BASKETBALL, IS_FIELD_HOCKEY, IS_VOLLEYBALL } from '../sports/current';
import type { DataQualityConfig } from './shape';

/** The captures behind the ghost and si.com entries are named in docs/DATA-SOURCES.md §5.5 (fixture provenance). */
const FIELD_HOCKEY_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    '8396a0d3-8021-458d-b592-a5cb2c4a366d': 'Del Norte (Crescent City): a MaxPreps ghost (no league, team size 0); its contest duplicates Tamalpais vs Del Norte (San Diego)',
  },
  excludedContestIds: {
    '5b9ff911-a640-4947-b9fd-8a629e775b33': 'Tamalpais vs the Del Norte (Crescent City) ghost; duplicates a05bedf5 (Tamalpais vs Del Norte, San Diego)',
    '5cf5e3df-6e72-4f44-9b8d-e69da30b85c5': 'Archie Williams at Marin Academy, Aug 18: not on the official MCAL schedule; a spurious unscored row',
    // Two stray Palomar rows (MaxPreps schedules read Mon Oct 5 Pacific): each sits on a date with no time, and its
    // pair already has its two meetings, so counting either would add a third game and a false "league result
    // missing" row. c7dbdbcc (Oct 9) has Poway at home, as in the Sep 15 meeting (67865f1e), while Fallbrook hosts
    // the Oct 13 one (0b3cfb7d), so no source ties it to either meeting and its note names neither as the original.
    // 9c027452 (Oct 30) has Mission Vista at home, as in 5067646d (Oct 29), one day earlier.
    'c7dbdbcc-5f41-4192-b8b2-eb79cca2523a': 'Poway vs Fallbrook, Oct 9 with no time: a third MaxPreps row for the pair, which already has both of its Palomar meetings on the schedule (Sep 15, 67865f1e; Oct 13, 0b3cfb7d)',
    '9c027452-e21e-4e47-9eac-d2e800bfb42c': 'Mission Vista vs Fallbrook, Oct 30 with no time: a second MaxPreps row for their Palomar game on Oct 29 (5067646d); both of the pair’s meetings are on the schedule',
    // Two Tournament of Champions rows (research of 2026-10-29): MaxPreps, si.com and the CIF-SS widget all carry
    // Harvard-Westlake 6-0 Temecula Valley twice, on Thu Oct 22 (b5fbcc70) and Fri Oct 23; the other round-1
    // games were Thu Oct 22, so the Oct 23 row is the duplicate. Newport Harbor at Glendora was moved from Thu
    // Oct 22 to Sat Oct 24 (45732090, 3-0); the Oct 22 row stayed behind without a score.
    // A scrimmage (owner, 2026-11-14): MaxPreps lists it as a non-league final with the note "Scrimmage".
    '5c14da41-b4c8-412f-aff3-34c8b454af35': 'Presentation at Willow Glen, Aug 31: a scrimmage (MaxPreps’ own note on the row says so), not a game',
    // Two stray San Diego rows found in the data audit of 2026-11-13, each a third counted meeting of a pair in a
    // double round robin. 8c6b3f6a (Oct 13, no time) repeats the Oct 6 game (72a06852): same host, same 4-0, and
    // on Oct 13 both teams played other Avocado games at other schools (Torrey Pines home to Canyon Crest at 4:00,
    // ec577909; La Costa Canyon at Mt. Carmel at 6:00, b45e6b34); it gave both 11 league games of a possible 10.
    // e767ad95 (Oct 30, never scored, last edited Sep 10) is the slot the pair's second game was moved out of: they
    // played Oct 21 at Southwest (35e91119) and Oct 27 at El Capitan (2a4f1334).
    '8c6b3f6a-4a53-4e4e-87c2-690b6b45d182': 'Torrey Pines at La Costa Canyon, Oct 13 with no time: a second MaxPreps row for their Avocado game of Oct 6 (72a06852), both 4-0; each team played another league game elsewhere that day, and the pair’s return game is Oct 29 (f1388bcc)',
    'e767ad95-30ad-4777-b1bb-0dac58d9db3f': 'Southwest at El Capitan, Oct 30 with no score: a third MaxPreps row for a Metro South Bay pair whose two games were played Oct 21 (35e91119) and Oct 27 (2a4f1334)',
    '0017b5bb-5319-4742-84df-e6585dcb7056': 'Temecula Valley at Harvard-Westlake, Oct 23: a second MaxPreps row for their Tournament of Champions round-1 game of Oct 22 (b5fbcc70), both 6-0',
    '3702e126-9414-4c0b-a13c-61e78ead2ed9': 'Newport Harbor at Glendora, Oct 22 with no score: the Tournament of Champions round-1 game was played Sat Oct 24 (45732090, Newport Harbor 3-0)',
  },
  sbliveIgnoredTeamIds: {
    '456851': 'York (PCAL): JV only',
    '512156': 'Tamalpais JV',
    '485528': 'Wilcox (SCVAL): not fielding a team',
    '490259': 'Red Bluff (EAL): not fielding a varsity team in 2026',
    '490260': 'Red Bluff JV: not a varsity team',
    '635037': 'Educational Outreach Academy (Red Bluff): a si.com placeholder carrying Red Bluff’s original 2026 EAL fixtures, which si.com marks CANC, all without a score',
  },
  ignoredMaxprepsLeagueIds: {
    '6e1f97d4-5211-4d98-bf59-282cd754bc5c': 'Pacific Coast - Mission: 0 teams, standings HTTP 400',
  },
  contestDateOverrides: {
    // Valley Center 0 @ Fallbrook 11 (Palomar). MaxPreps dates it Fri Sep 25, 4:00 PM, the same home slot as
    // Fallbrook's game against Rancho Buena Vista (f96f16e7, 3-0), on a day Valley Center also played at Del
    // Norte (cb79ab02, 6:00 PM): two games for each school at once. [V] the Section's power-rankings detail
    // pages (cifsdshome.org, read Mon Oct 5 Pacific) both list it on 09/29/2026, with no time, and both list
    // the RBV and Del Norte games on 09/25; MaxPreps' own Fallbrook feed also has a deleted row for the pair
    // (91f3b7e0) dated 09/29. The result and the W-L are unchanged; only the date and the row order move.
    'fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0': {
      dateKey: '2026-09-29',
      timeTba: true,
      source: 'CIF-SDS power-rankings details, school_id 662 (Fallbrook) and 746 (Valley Center): both list the game on 09/29/2026 with no time; MaxPreps dates it 09/25 at 4:00 PM, the same slot as Fallbrook’s game against Rancho Buena Vista',
    },
  },
  resultCorrections: {
    // The data audit of 2026-11-13. MaxPreps' game PAGE prints a box with an SO column that its schedule feed, which
    // the pipeline reads, does not carry; both pages were read that day.
    //  - CCS Division 1 semifinal, Nov 11: "Archbishop Mitty -- -- 1 2 / Saint Francis -- -- 1 5" (columns 1, 2,
    //    Final, SO). No overtime column is shown, so none is recorded.
    //  - EAL Super Regional final, Oct 31: "Chico 0 0 0 2 / Pleasant Valley 0 0 0 3".
    '7d6e0426-a989-44cc-9f3e-e69e6ee0cec6': {
      goals: { 'saint-francis': 1, mitty: 1 },
      otPeriods: 0,
      shootout: { 'saint-francis': 5, mitty: 2 },
      source: 'MaxPreps’ page for the game, read Nov 13, 2026: level 1-1 at the final, and its shootout column has Saint Francis 5, Archbishop Mitty 2; MaxPreps’ schedule feed carries only the level score and the winner',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/archbishop-mitty-san-jose-vs-saint-francis-mountain-view/11-11-2026/?c=7d6e0426-a989-44cc-9f3e-e69e6ee0cec6',
    },
    'ca27178a-9f11-46c0-9397-8289585bdb76': {
      goals: { 'pleasant-valley': 0, chico: 0 },
      // Double overtime: Chico's own account (owner, 2026-11-14), "our girls pushed PV into double overtime and shootouts".
      otPeriods: 2,
      shootout: { 'pleasant-valley': 3, chico: 2 },
      source: 'MaxPreps’ page for the game, read Nov 13, 2026: level 0-0 at the final, and its shootout column has Pleasant Valley 3, Chico 2; Chico High field hockey’s own account says the final went to “double overtime and shootouts”',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/chico-vs-pleasant-valley-chico/10-31-2026/?c=ca27178a-9f11-46c0-9397-8289585bdb76',
    },
    // The San Diego Section's own bracket sheet (read Nov 13, 2026) has two results MaxPreps lacks or shortens:
    // the Division II quarterfinal "Game Moved to Friday, November 6th", "Olympian HS", "6-0", which MaxPreps still
    // lists with no score a week on (Olympian then played the Nov 11 semifinal); and the Division I first-round
    // game Mission Bay won "3-2(OT)", which MaxPreps has as 3-2 with no overtime.
    'dba373ca-9805-4eb4-a479-553059994aee': {
      goals: { olympian: 6, 'sage-creek': 0 },
      otPeriods: 0,
      shootout: null,
      source: 'the San Diego Section’s Division II bracket sheet, read Nov 13, 2026: the quarterfinal, moved to Fri Nov 6 at Olympian, ended 6-0; MaxPreps lists the game with no score',
      url: 'https://docs.google.com/spreadsheets/d/1A8tsHqwGiRLD5EBSnCFoAAK5Qg13v6wQlen3HEGspeU/edit#gid=742825713',
    },
    // Sunset, Thu Oct 8: Huntington Beach 1, Edison 0 (owner, 2026-11-14). cifsshome.org lists the game twice, once per
    // school, both 1-0 and both "League"; one entry's note is "Overtime". MaxPreps has the score and no overtime. The
    // note gives no count of periods, so one is recorded.
    '95a91c87-abfe-418e-9c40-bda8bdfef138': {
      goals: { 'huntington-beach': 1, edison: 0 },
      otPeriods: 1,
      shootout: null,
      source: 'cifsshome.org, read Nov 14, 2026: Huntington Beach 1, Edison 0 with the note “Overtime” on one of its two entries for the game; MaxPreps has the score and records no overtime',
      url: 'https://www.cifsshome.org/widget/schedule-score?section_id=1&year=2026&sport_id=30&date_from=10%2F08%2F2026&date_to=10%2F08%2F2026',
      certainty: 'reported',
    },
    '10c379a5-577c-4dc7-b70f-2a49ed09ca51': {
      goals: { 'mission-bay': 3, 'la-jolla-country-day': 2 },
      otPeriods: 1,
      shootout: null,
      source: 'the San Diego Section’s Division I bracket sheet, read Nov 13, 2026: “3-2(OT)”; MaxPreps has the score and records no overtime',
      url: 'https://docs.google.com/spreadsheets/d/1A8tsHqwGiRLD5EBSnCFoAAK5Qg13v6wQlen3HEGspeU/edit#gid=1795050195',
    },
    // Metro Mesa, Oct 7: MaxPreps has listed the game with no score since; the Section's score widget (cifsshome.org,
    // the snapshot's cifss cross-check row for the contest) has Helix 2, Bonita Vista 1. One source, entered by a
    // school, but the only one: both teams sat at 7 league results of 8 without it.
    '3a37744f-8264-47f8-baa3-6c660b8e3892': {
      goals: { helix: 2, 'bonita-vista': 1 },
      otPeriods: 0,
      shootout: null,
      certainty: 'reported',
      source: 'cifsshome.org, the San Diego Section’s score listing for Oct 7, 2026: Helix 2, Bonita Vista 1; MaxPreps lists the game with no score',
      url: 'https://www.cifsshome.org/widget/schedule-score?section_id=3&year=2026&sport_id=30&date_from=10%2F07%2F2026&date_to=10%2F07%2F2026',
    },
    // The source search of 2026-11-14: MaxPreps' game pages (not its feed) for every level game with the winner
    // marked and every doubtful overtime, read beside cifsshome.org and si.com. The page's box has a Final column
    // (goals in play) and, after a shootout, an SO column. cifsshome.org and si.com show the same games as the level
    // score, as the level score plus one goal, or as the level score plus the tally. A correction marked 'reported'
    // is this site's reading of a box that does not say it in words, or one whose sources disagree on the tally.
    'f99ce5ed-794d-4957-99c1-95494dc3d4d6': {
      goals: { clairemont: 0, eastlake: 0 },
      otPeriods: 0,
      shootout: { eastlake: 2, clairemont: 0 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 0-0 at the final, shootout column Eastlake 2, Clairemont 0; cifsshome.org and si.com have 0-0',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/clairemont-san-diego-vs-eastlake-chula-vista/9-1-2026/?c=f99ce5ed-794d-4957-99c1-95494dc3d4d6',
    },
    'd8aad805-99f8-4c64-8a1b-3c305465fd88': {
      goals: { poway: 0, 'mt-carmel': 0 },
      otPeriods: 1,
      shootout: { 'mt-carmel': 2, poway: 0 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 0-0 at the final, shootout column Mt. Carmel 2, Poway 0; cifsshome.org has 2-0 with the note “Overtime”, and si.com 2-0, the shootout entered as the score',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/mt-carmel-san-diego-vs-poway/9-11-2026/?c=d8aad805-99f8-4c64-8a1b-3c305465fd88',
    },
    'e6488575-c728-4e7f-8060-be08967000b1': {
      goals: { 'university-city': 0, 'rancho-bernardo': 0 },
      otPeriods: 0,
      shootout: { 'university-city': 3, 'rancho-bernardo': 2 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 0-0 at the final, shootout column University City 3, Rancho Bernardo 2; cifsshome.org has 3-2 and 1-0, si.com 3-2',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/rancho-bernardo-san-diego-vs-university-city-san-diego/9-22-2026/?c=e6488575-c728-4e7f-8060-be08967000b1',
    },
    '829af66a-3bd6-43f4-a969-06a046bb1fab': {
      goals: { 'canyon-crest-academy': 0, 'cathedral-catholic': 0 },
      otPeriods: 1,
      shootout: { 'cathedral-catholic': 3, 'canyon-crest-academy': 2 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 0-0 at the final, shootout column Cathedral Catholic 3, Canyon Crest Academy 2; cifsshome.org and si.com have 0-0, and Cathedral Catholic’s goalkeeper played 10 overtime minutes',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/canyon-crest-academy-san-diego-vs-cathedral-catholic-san-diego/9-22-2026/?c=829af66a-3bd6-43f4-a969-06a046bb1fab',
    },
    '096fffe7-ce79-4463-be5e-3b7f80131a10': {
      goals: { vista: 0, escondido: 0 },
      otPeriods: 1,
      shootout: { vista: 3, escondido: 2 },
      certainty: 'reported',
      source: 'cifsshome.org, read Nov 14, 2026: Vista 3, Escondido 2 with the note “Overtime > Shootouts”, and si.com the same; MaxPreps’ page has 0-0 at the final and a shootout column of Vista 4, Escondido 3, so the tally is 3-2 in two listings and 4-3 in one',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/escondido-vs-vista/10-5-2026/?c=096fffe7-ce79-4463-be5e-3b7f80131a10',
    },
    'e73eb917-8a7b-4471-9b89-1a7cb923675a': {
      goals: { 'canyon-crest-academy': 1, 'rancho-bernardo': 1 },
      otPeriods: 0,
      shootout: { 'canyon-crest-academy': 3, 'rancho-bernardo': 1 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 1-1 at the final, shootout column Canyon Crest Academy 3, Rancho Bernardo 1; cifsshome.org and si.com have 2-1, the level score with the one goal credited to the winner',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/canyon-crest-academy-san-diego-vs-rancho-bernardo-san-diego/10-6-2026/?c=e73eb917-8a7b-4471-9b89-1a7cb923675a',
    },
    '9fc49911-f3da-4f81-8baf-5be5e0b157d9': {
      goals: { westview: 1, 'mission-vista': 1 },
      otPeriods: 0,
      shootout: { 'mission-vista': 3, westview: 2 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 1-1 at the final, shootout column Mission Vista 3, Westview 2; cifsshome.org and si.com also carry 4-3, the level score with the shootout added',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/mission-vista-oceanside-vs-westview-san-diego/10-17-2026/?c=9fc49911-f3da-4f81-8baf-5be5e0b157d9',
    },
    '747082fd-259d-4fb8-8837-ece21a945993': {
      goals: { 'university-sf': 0, gilroy: 0 },
      otPeriods: 0,
      shootout: { 'university-sf': 3, gilroy: 2 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 0-0 at the final, shootout column University 3, Gilroy 2',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/gilroy-vs-university-san-francisco/9-12-2026/?c=747082fd-259d-4fb8-8837-ece21a945993',
    },
    '9afebd05-777b-4c8a-82d5-c41b556788bb': {
      goals: { chico: 1, davis: 1 },
      otPeriods: 0,
      shootout: { chico: 2, davis: 1 },
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: level 1-1 at the final, shootout column Chico 2, Davis 1; the Chico Enterprise-Record (Oct 1, 2026) reports that Chico won “a penalty shootout” at home against Davis',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/chico-vs-davis-sr/9-28-2026/?c=9afebd05-777b-4c8a-82d5-c41b556788bb',
    },
    'ad3d21f9-9b02-43a3-9f08-f4a85ca8da8e': {
      goals: { 'la-jolla': 0, 'scripps-ranch': 0 },
      otPeriods: 1,
      shootout: { 'la-jolla': 2, 'scripps-ranch': 1 },
      certainty: 'reported',
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: La Jolla 1-0 at the final with a shootout column of La Jolla 2, Scripps Ranch 1, and La Jolla’s goalkeeper played 10 overtime minutes; read as level 0-0 in play and a 2-1 shootout, the 1-0 being the one goal the San Diego officials’ procedure credits the shootout winner (no source says so in words)',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/la-jolla-vs-scripps-ranch-san-diego/9-24-2026/?c=ad3d21f9-9b02-43a3-9f08-f4a85ca8da8e',
    },
    'f2c12a72-8c12-44e3-b431-9c28599e064b': {
      goals: { 'cathedral-catholic': 0, 'mission-bay': 0 },
      otPeriods: 1,
      shootout: { 'mission-bay': 2, 'cathedral-catholic': 1 },
      certainty: 'reported',
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: Mission Bay 1-0 at the final with a shootout column of Mission Bay 2, Cathedral Catholic 1, and Cathedral Catholic’s goalkeeper played 10 overtime minutes; read as level 0-0 in play and a 2-1 shootout, the 1-0 being the one goal the San Diego officials’ procedure credits the shootout winner (no source says so in words)',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/cathedral-catholic-san-diego-vs-mission-bay-san-diego/10-29-2026/?c=f2c12a72-8c12-44e3-b431-9c28599e064b',
    },
    '59b0f6a5-dd40-4dd1-8ce9-07e9eea393c1': {
      goals: { 'mission-hills': 1, 'del-norte': 1 },
      otPeriods: 2,
      shootout: { 'del-norte': 2, 'mission-hills': 0 },
      certainty: 'reported',
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: 1-1 after regulation, two overtime periods, a shootout column of Del Norte 2, Mission Hills 0, and one goal each in the team totals; read as level 1-1 through overtime and a 2-0 shootout, the second Del Norte goal being the one credited to the shootout winner (no source says so in words)',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/del-norte-san-diego-vs-mission-hills-san-marcos/9-14-2026/?c=59b0f6a5-dd40-4dd1-8ce9-07e9eea393c1',
    },
    '8ed6f41f-8746-462e-8e12-bbe2509aa47d': {
      goals: { greenfield: 1, hollister: 3 },
      otPeriods: 0,
      shootout: null,
      certainty: 'reported',
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: the box has six period columns, labelled 1, 2 and OT1 to OT4, with Hollister ahead 1-0 after the third and 3-0 after the fifth, which no overtime allows; si.com has 3-1 with no overtime, so the columns are the game’s periods and no overtime was played',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/greenfield-vs-hollister/9-30-2026/?c=8ed6f41f-8746-462e-8e12-bbe2509aa47d',
    },
    'a8fc056b-e3e2-4edb-8f2e-95892e3bfdbc': {
      goals: { corning: 2, 'bella-vista': 0 },
      otPeriods: 0,
      shootout: null,
      certainty: 'reported',
      source: 'MaxPreps’ page for the game, read Nov 14, 2026: Corning led 1-0 after the first column and its second goal is under “OT1”; a game that was not level has no overtime, so the goal is a later period’s and no overtime was played',
      url: 'https://www.maxpreps.com/ca/field-hockey/game/bella-vista-fair-oaks-vs-corning/10-5-2026/?c=a8fc056b-e3e2-4edb-8f2e-95892e3bfdbc',
    },
    // EAL, Sep 2: MaxPreps has Pleasant Valley 1-0 at Chico with three overtime periods (box 0 0 0 0 1), which the
    // Section's rule of overtime and then 1 v 1s cannot give. Chico's own account, on the Oct 31 final (owner,
    // 2026-11-14): "For the second time this season, our girls pushed PV into double overtime and shootouts"; and
    // the Chico Enterprise-Record (Oct 1) calls the Sep 28 Davis game Chico's shootout "for the second time this
    // season". Their other meeting (Oct 6) was a 2-1 regulation game, so Sep 2 is that first one: level 0-0 through
    // two overtime periods, Pleasant Valley winning the 1 v 1s, the 1 in MaxPreps' fifth column being that win.
    '8a4d7c70-1907-4b38-a059-28fd0c679f0c': {
      goals: { chico: 0, 'pleasant-valley': 0 },
      otPeriods: 2,
      shootout: null,
      shootoutWinner: 'pleasant-valley',
      source: 'Chico High field hockey’s own account (given by the owner, Nov 14, 2026): the Oct 31 final was “the second time this season” Chico took Pleasant Valley to “double overtime and shootouts”, and this is the first; MaxPreps records the 1 v 1 win as a 1-0 score after three overtime periods',
      url: 'https://www.instagram.com/p/DfXyOZlD8eY/',
    },
    // Metro South Bay, Oct 30: MaxPreps has Granite Hills 1-0 with no overtime. East County Sports (Nov 2, 2026):
    // "Granite Hills prevailed 1-0 in overtime ... Kendall Ehlers, Molina and Stonier delivered scoring conversions
    // during the overtime procedure". So the game was level 0-0 in play and settled in the shootout, the 1-0 being
    // the credited goal; the report gives three Granite Hills conversions and no Hilltop count.
    'dbac5f77-1d98-4463-9b49-739a7943446b': {
      goals: { 'granite-hills': 0, hilltop: 0 },
      otPeriods: 1,
      shootout: null,
      shootoutWinner: 'granite-hills',
      source: 'East County Sports, Nov 2, 2026: Granite Hills “prevailed 1-0 in overtime” on three “scoring conversions during the overtime procedure”, so the game was level 0-0 in play and won in the shootout; MaxPreps has the credited 1-0 and no overtime',
      url: 'https://www.eastcountysports.com/2026/11/02/eagles-complete-stunning-title-run/',
    },
    // MCAL tournament semifinal, Wed Oct 28: MaxPreps has Tamalpais 3, Marin Catholic 1 as a regulation result. The
    // Marin Independent Journal (Oct 28, 2026): "The game was scoreless after regulation and two overtimes"; Tamalpais
    // "won 3-1 in the shootout". So the goals in play are 0-0, two overtime periods were played and 3-1 is the tally.
    '7bb048ba-9e33-4ad1-a743-2348c6637602': {
      goals: { tamalpais: 0, 'marin-catholic': 0 },
      otPeriods: 2,
      shootout: { tamalpais: 3, 'marin-catholic': 1 },
      source: 'Marin Independent Journal, Oct 28, 2026: scoreless after regulation and two overtimes, and Tamalpais won the shootout 3-1; MaxPreps records the shootout tally as the score',
      url: null,
    },
  },
  addedGames: [
    // The LAFHA Tournament of Champions' third-place game, Thu Oct 29: on no MaxPreps schedule. Daily Pilot (Los
    // Angeles Times), Oct 30, 2026, in its report of the final: Edison beat Newport Harbor 3-2 in sudden-death
    // overtime in the third-place game (given by the owner, 2026-11-14). Miller Field is where Huntington Beach's
    // program site puts the "3rd Playoff" (lib/league-config/sections.ts TOC).
    {
      dateKey: '2026-10-29',
      time: null,
      home: 'edison',
      away: 'newport-harbor',
      goals: { edison: 3, 'newport-harbor': 2 },
      forfeitBy: null,
      otPeriods: 1,
      from: 'derived',
      neutral: true,
      note: 'Tournament of Champions third-place game',
      source: 'Daily Pilot (Los Angeles Times), Oct 30, 2026: Edison beat Newport Harbor 3-2 in sudden-death overtime in the Tournament of Champions third-place game; MaxPreps does not list the game',
      url: 'https://www.latimes.com/socal/daily-pilot/sports/story/2026-10-30/harvard-westlake-rallies-to-top-huntington-beach-field-hockey-in-toc-final',
    },
    // The EAL Super Regional, Sat Oct 31 (the Northern Section's postseason): all six teams, the top two on byes.
    // The day's game schedule (a Google Sheet headed "10/31/2026 games. Note: Morning games are at both venues",
    // given by the owner on 2026-11-14, home listed first) has seven games:
    //   8:30  Chico vs. Corning (3v6), Chico HS          8:30  Lassen vs Bella Vista (4v5), PV HS
    //   10:00 Davis vs (3 vs 6 winner), Chico HS         10:00 PV vs (4 vs 5 winner), PV HS
    //   12:30 5th place (losers of 8:30 games), PV HS    1:30  3rd place (losers of 10:00 games), PV HS
    //   2:30  1st place (winners of 10:00 games), PV HS
    // MaxPreps has two of the seven: Pleasant Valley 2-0 Bella Vista (10:00) and the final (2:30). Who won the
    // others: Chico beat Corning and then Davis (Chico High field hockey's own account, instagram.com/
    // chicohighfieldhockey, posts DfIfh7TFtXO and DfXyOZlD8eY, given by the owner: "Our girls worked their way up
    // from an 8:30 AM game, then immediately into another competitive game to reach the championship. With two
    // beautiful goals against Davis ... our girls secured their spot in the championship game against PV");
    // Bella Vista beat Lassen (it played the 10:00 semifinal); Davis beat Bella Vista for third place (owner, citing
    // Stick Together). No source gives the winner of the 5th-place game, or the score of any of the five, so each
    // is listed without a score, never as a guess. (The NFHS Network's listings for the day pair the first-round
    // teams the other way; they were set beforehand and are not followed.)
    {
      dateKey: '2026-10-31',
      time: '08:30',
      home: 'chico',
      away: 'corning',
      goals: null,
      forfeitBy: null,
      otPeriods: 0,
      from: 'derived',
      venue: 'Chico High School',
      winner: 'chico',
      note: 'Super Regional first round. Chico won and went on to the semifinal; no source has published the score',
      source: 'the day’s game schedule (“10/31/2026 games”, given by the owner Nov 14, 2026); Chico High field hockey’s own account for the result',
      url: 'https://www.instagram.com/p/DfIfh7TFtXO/',
    },
    {
      dateKey: '2026-10-31',
      time: '08:30',
      home: 'lassen',
      away: 'bella-vista',
      goals: null,
      forfeitBy: null,
      otPeriods: 0,
      from: 'derived',
      neutral: true,
      venue: 'Pleasant Valley High School',
      winner: 'bella-vista',
      note: 'Super Regional first round. Bella Vista won and went on to the semifinal; no source has published the score',
      source: 'the day’s game schedule (“10/31/2026 games”, given by the owner Nov 14, 2026); Bella Vista played the 10:00 semifinal',
      url: 'https://docs.google.com/spreadsheets/d/110pWPbVlFahEQNPYEvQkd_ColS3kDTEQS5uI87v9s8k/edit?gid=0#gid=0',
    },
    {
      dateKey: '2026-10-31',
      time: '10:00',
      home: 'davis',
      away: 'chico',
      goals: null,
      forfeitBy: null,
      otPeriods: 0,
      from: 'derived',
      neutral: true,
      venue: 'Chico High School',
      winner: 'chico',
      note: 'Super Regional semifinal. Chico won with two goals to reach the final; no source has published the score',
      source: 'the day’s game schedule (“10/31/2026 games”, given by the owner Nov 14, 2026); Chico High field hockey’s own account: “With two beautiful goals against Davis ... our girls secured their spot in the championship game against PV”',
      url: 'https://www.instagram.com/p/DfXyOZlD8eY/',
    },
    {
      dateKey: '2026-10-31',
      time: '12:30',
      home: 'corning',
      away: 'lassen',
      goals: null,
      forfeitBy: null,
      otPeriods: 0,
      from: 'derived',
      neutral: true,
      venue: 'Pleasant Valley High School',
      note: 'Super Regional fifth-place game. No source has published the result',
      source: 'the day’s game schedule (“10/31/2026 games”, given by the owner Nov 14, 2026)',
      url: 'https://docs.google.com/spreadsheets/d/110pWPbVlFahEQNPYEvQkd_ColS3kDTEQS5uI87v9s8k/edit?gid=0#gid=0',
    },
    {
      dateKey: '2026-10-31',
      time: '13:30',
      home: 'davis',
      away: 'bella-vista',
      goals: null,
      forfeitBy: null,
      otPeriods: 0,
      from: 'derived',
      neutral: true,
      venue: 'Pleasant Valley High School',
      winner: 'davis',
      note: 'Super Regional third-place game. Davis won; no source has published the score',
      source: 'the day’s game schedule (“10/31/2026 games”, given by the owner Nov 14, 2026); the owner’s report, citing Stick Together, that Davis won',
      url: 'https://docs.google.com/spreadsheets/d/110pWPbVlFahEQNPYEvQkd_ColS3kDTEQS5uI87v9s8k/edit?gid=0#gid=0',
    },
    // Palomar, Fri Oct 30: the pair's second league game. cifsshome.org (the San Diego Section's own score listing,
    // read Nov 14, 2026): Poway 0, Valley Center 1, 6:00 PM, League, "Game forfeited by Poway"; si.com has the
    // same 1-0. MaxPreps listed the fixture on Oct 6 and has since removed it from both schedules.
    {
      dateKey: '2026-10-30',
      time: '18:00',
      home: 'poway',
      away: 'valley-center',
      goals: { poway: 0, 'valley-center': 1 },
      forfeitBy: 'poway',
      from: 'cifss',
      certainty: 'reported',
      otPeriods: 0,
      source: 'cifsshome.org, the San Diego Section’s score listing for Oct 30, 2026: Poway 0, Valley Center 1, a league game, “Game forfeited by Poway”; MaxPreps no longer lists the game',
      url: 'https://www.cifsshome.org/widget/schedule-score?section_id=3&year=2026&sport_id=30&date_from=10%2F30%2F2026&date_to=10%2F30%2F2026',
    },
  ],
  fixtureMoves: {
    // SCVAL De Anza: the PDF has Homestead at Cupertino on Wed Sep 9; it was not played then (no MaxPreps contest of
    // the pair until their Oct 5 meeting). si.com (6575658) and the NFHS Network (game82e9fefce, on Homestead's
    // channel) both have it on Tue Oct 13 at 4:45 PM at Homestead, Homestead 3-0, read 2026-10-22; MaxPreps still
    // has no contest for it. si.com's 5-5 Sep 11 row of the pair (6762239) has no recap and is not this game.
    'de-anza:2026-09-09:homestead@cupertino': {
      dateKey: '2026-10-13',
      home: 'homestead',
      source: 'si.com and the NFHS Network both have it on Oct 13 at Homestead.',
    },
  },
  notCovered: [
    { name: 'York', keys: ['York', 'York School', 'York Falcons'], reason: 'York plays JV field hockey only, so it has no varsity results here.' },
    { name: 'Wilcox', keys: ['Wilcox', 'Adrian Wilcox'], reason: 'Wilcox is not fielding a varsity team in 2026.' },
    { name: 'Red Bluff', keys: ['Red Bluff', 'Red Bluff High School', 'Red Bluff Spartans'], reason: 'Red Bluff is not fielding a varsity team in 2026.' },
    // San Diego Section schools with a 2026-27 MaxPreps team and no game: Madison and Santana are 0-0-0 rows of
    // MaxPreps tables (LEAGUES city and metro withdrawnNames); the other four carry MaxPreps' zero-GUID league.
    // None has a game in the Section's power rankings (Castle Park is listed there with 0 points). Mascots
    // from si.com team slugs where si.com has one (research-cifsds.md §8).
    {
      name: 'Madison', keys: ['Madison High School', 'Madison Warhawks'],
      reason: 'Madison has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    {
      name: 'Santana', keys: ['Santana High School', 'Santana Sultans'],
      reason: 'Santana has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    {
      name: 'Castle Park', keys: ['Castle Park High School', 'Castle Park Trojans'],
      reason: 'Castle Park has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    {
      name: 'Chula Vista', keys: ['Chula Vista High School', 'Chula Vista Spartans'],
      reason: 'Chula Vista has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    {
      name: 'Montgomery', keys: ['Montgomery High School'],
      reason: 'Montgomery has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    {
      name: 'Sweetwater', keys: ['Sweetwater High School'],
      reason: 'Sweetwater has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    },
    // Three more California schools with a 2026-27 MaxPreps varsity team and no game (schedule-calculated/v1 returned
    // no rows for each, read 2026-10-06; scratchpad inventory norcalSchoolsNotInRegistry and the Sac-Joaquin
    // Section's one team): not fielding a varsity team in 2026 is the rule that keeps Wilcox and Red Bluff out too.
    {
      name: 'River Valley', keys: ['River Valley', 'River Valley High School', 'River Valley Falcons'],
      reason: 'River Valley (Yuba City, Sac-Joaquin Section) has no 2026 varsity game on MaxPreps, so it has no page here.',
    },
    {
      name: 'North Salinas', keys: ['North Salinas', 'North Salinas High School', 'North Salinas Vikings'],
      reason: 'North Salinas has no 2026 varsity game on MaxPreps, so it has no page here.',
    },
    {
      name: 'Notre Dame (Salinas)', keys: ['Notre Dame', 'Notre Dame Salinas', 'Notre Dame High School Salinas', 'Notre Dame Spirits'],
      reason: 'Notre Dame (Salinas) has no 2026 varsity game on MaxPreps, so it has no page here.',
    },
    // MaxPreps' one-team "Suburban" league; not on the Southern Section's 2026-27 list of participating schools
    // (the Season Preview, June 2026).
    { name: 'Mayfair', keys: ['Mayfair High School'], reason: 'Mayfair has no 2026 varsity game on MaxPreps and is not on the Southern Section’s list of participating schools.' },
  ],
};

/** Soccer's: nothing yet. Every entry above names a field hockey contest, team or fixture. */
const SOCCER_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {},
  excludedContestIds: {},
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
  contestDateOverrides: {},
  resultCorrections: {},
  addedGames: [],
  fixtureMoves: {},
  notCovered: [],
};

/** This build's sport's corrections (lib/sports/current.ts). */
/** Basketball's: the preseason schedule audit of 2026-11-13 (MaxPreps rows that cannot be games). */
const BASKETBALL_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    // Four Lynbrook varsity rows (Dec 3, 4, 11, 12) and four Palo Alto JV rows are against this placeholder, which has
    // an id of its own, so the all-zero TBA rule that drops the other 106 placeholder rows does not catch it.
    'b6e1f3f8-f345-4829-80a4-0653a9a36a1d': '“Tournament Opponent”: a MaxPreps placeholder for a tournament game whose opponent is not set, not a school',
  },
  excludedContestIds: {
    // Christopher's Jan 13 league game is at Pioneer of San Jose (18b406ab, on the BVAL schedule); this second row, the
    // same night at the same time, names Pioneer of Woodland.
    '30211366-90ce-40c4-aef9-983a7275b0c6': 'Christopher at Pioneer (Woodland), Jan 13: a second MaxPreps row for Christopher’s Mt. Hamilton game at Pioneer (San Jose) the same night (18b406ab), with the wrong Pioneer',
    // The BVAL schedule has Pioneer at Christopher on Wed Feb 3 (37af39e8, matched); on Mon Feb 1 Pioneer is at Leigh
    // (380c16d6, on the schedule). This row is the game's earlier date left behind.
    '946b7447-4c09-499c-84a2-7b57b8c8585b': 'Pioneer at Christopher, Feb 1: a stale MaxPreps row for their Mt. Hamilton game of Feb 3 (37af39e8); Pioneer plays at Leigh on Feb 1',
  },
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
  contestDateOverrides: {},
  resultCorrections: {},
  addedGames: [],
  fixtureMoves: {},
  notCovered: [],
};

/** Volleyball's: MaxPreps rows that cannot be matches (read 2026-11-14). */
const VOLLEYBALL_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    // A tournament's unset opponent has an id of its own (Los Altos' Menlo-Atherton and Spikefest rows), so the
    // all-zero TBA rule does not catch it.
    'b6e1f3f8-f345-4829-80a4-0653a9a36a1d': '“Tournament Opponent”: a MaxPreps placeholder for a tournament match whose opponent is not set, not a school',
  },
  excludedContestIds: {},
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
  contestDateOverrides: {},
  resultCorrections: {},
  addedGames: [],
  fixtureMoves: {},
  notCovered: [],
};

export const DATA_QUALITY: DataQualityConfig = IS_FIELD_HOCKEY
  ? FIELD_HOCKEY_DATA_QUALITY
  : IS_BASKETBALL
    ? BASKETBALL_DATA_QUALITY
    : IS_VOLLEYBALL
      ? VOLLEYBALL_DATA_QUALITY
      : SOCCER_DATA_QUALITY;
