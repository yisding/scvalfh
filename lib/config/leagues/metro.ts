/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the Metro Conference (San Diego Section).
 */

import type { LeagueConfig } from '@/lib/model/league-config';

import { SDS_FIELD_HOCKEY_URL } from './documents';
import {
  SDS_LEAGUE_PLAY_LAST, SDS_LINKS, sdsKeyDates, sdsOfficial, sdsPhases, sdsPostseason, sdsRules,
} from './sds';

export const METRO: LeagueConfig = {
  // The Metro Conference's two field hockey leagues, "MESA" and "SOUTH BAY" on the METRO tab [V] (the GROSSMONT
  // tab notes that El Capitan, Helix and Granite Hills play field hockey in the Metro Conference).
  id: 'metro', sectionId: 'sds',
  name: 'Metro Conference', shortName: 'Metro',
  cities: 'Chula Vista, La Mesa, Lakeside, El Cajon and San Diego',
  alignmentSource: 'the CIF-SDS 2026-27 League Alignment',
  officialUrl: SDS_FIELD_HOCKEY_URL,
  links: SDS_LINKS,
  sblive: { leagueSlugs: ['4214-metro-mesa', '4199-grossmont'], backfill: true },
  officialCodes: {},
  officialNames: {},
  // Santana is the 0-0-0 row of MaxPreps' "Grossmont" table (1125d6e8-…): no 2026 varsity game on MaxPreps or in
  // the Section's power rankings. Spellings from MaxPreps and si.com.
  withdrawnNames: ['Santana', 'SANTANA', 'Santana High School', 'Santana Sultans'],
  membershipNote: null,
  divisions: [
    {
      id: 'metro-mesa', leagueId: 'metro', label: 'Metro Mesa', searchAliases: [],
      // MaxPreps' "Metro- South Bay" table holds exactly the five Metro Mesa teams.
      maxprepsLeagueId: '6dfe5a12-b82f-45d7-b103-71a5c13c0093',
      maxprepsName: 'Metro- South Bay', maxprepsSlug: 'metro-south-bay',
      expectedTeams: 5, gamesPerTeam: 8,
      // Olympian v Otay Ranch, Sep 28.
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 5, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'MaxPreps files these five teams under ‘Metro- South Bay’. On Oct 5 MaxPreps listed Bonita Vista and Helix meeting once (Oct 23), so unless a second meeting is added each ends a game short of the eight.',
      home: { miniRows: 5, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      id: 'metro-south-bay', leagueId: 'metro', label: 'Metro South Bay', searchAliases: [],
      // MaxPreps' "Grossmont" table: El Capitan, Granite Hills and Santana.
      maxprepsLeagueId: 'ca8e2856-b13d-4aa7-8c15-37cb50a55c60',
      maxprepsName: 'Grossmont', maxprepsSlug: 'grossmont',
      expectedTeams: 4, gamesPerTeam: 6,
      // Hilltop v Southwest, Oct 7.
      leaguePlay: { first: '2026-10-07', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      // 3 rows + Hilltop and Southwest − Santana = 4.
      maxprepsTeamCount: 3, maxprepsMissing: ['hilltop', 'southwest'],
      maxprepsExtraRows: {
        '1125d6e8-e661-4190-a41d-5722364dee38': 'Santana: a 0-0-0 row; Santana has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings',
      },
      reportedTrust: 'informational',
      knownCause: 'MaxPreps files El Capitan and Granite Hills under ‘Grossmont’ with Santana, which has no varsity game, and lists no league for Hilltop or Southwest.',
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  rules: sdsRules('Metro'),
  postseason: sdsPostseason({
    'bonita-vista': 'II', eastlake: 'I', helix: 'II', olympian: 'II', 'otay-ranch': 'II',
    'el-capitan': 'II', 'granite-hills': 'II', hilltop: 'II', southwest: 'II',
  }),
  phases: sdsPhases(),
  keyDates: sdsKeyDates(),
  officialChanges: null,
};
