/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the North County Conference (San Diego Section).
 */

import type { LeagueConfig } from '@/lib/model/league-config';

import { SDS_FIELD_HOCKEY_URL } from './documents';
import {
  SDS_LEAGUE_PLAY_LAST, SDS_LINKS, sdsKeyDates, sdsOfficial, sdsPhases, sdsPostseason, sdsRules,
} from './sds';

export const NORTH_COUNTY: LeagueConfig = {
  // The North County Conference's three field hockey leagues, "NC AVOCADO", "NC PALOMAR" and "NC VALLEY" on the
  // NORTH COUNTY tab ("UPDATED 9/20/26") [V]. Rancho Buena Vista is listed under both Palomar and Valley; its
  // league games are Palomar's and MaxPreps' Palomar table lists it, so it is Palomar's here.
  id: 'north-county', sectionId: 'sds',
  // shortName 'North' (owner decision, 2026-10-06: 'North County' made the chip too wide); copy that prints it
  // alone sits beside City and Metro ('City, North and Metro', 'North teams'). 'North County' still finds the
  // conference in search: the league's search keys are its short name and its name (lib/shared/search.ts).
  name: 'North County Conference', shortName: 'North',
  // Alone as a control's target, 'North' reads as a direction ('Jump to North ↓'): there it is 'North County'.
  standaloneName: 'North County',
  cities: 'Carlsbad, Encinitas, Escondido, Fallbrook, Oceanside, Poway, San Marcos, Valley Center, Vista and north San Diego',
  alignmentSource: 'the CIF-SDS 2026-27 League Alignment',
  officialUrl: SDS_FIELD_HOCKEY_URL,
  links: SDS_LINKS,
  // si.com's buckets are stale (the Valley six are spread across avocado-east, avocado-west and palomar):
  // harvested for team pages only, never membership.
  sblive: { leagueSlugs: ['4170-avocado-east', '4171-avocado-west', '4234-palomar'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'avocado', leagueId: 'north-county', label: 'Avocado', searchAliases: [],
      maxprepsLeagueId: '75ed156b-09c9-4a0c-ac58-11a371443815',
      maxprepsName: 'Avocado', maxprepsSlug: 'avocado',
      expectedTeams: 6, gamesPerTeam: 10,
      // Rancho Bernardo v La Costa Canyon, Sep 28.
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      // 4 rows + Mt. Carmel and Rancho Bernardo (zero-GUID league on MaxPreps) = 6.
      maxprepsTeamCount: 4, maxprepsMissing: ['mt-carmel', 'rancho-bernardo'], maxprepsExtraRows: {},
      reportedTrust: 'informational',
      knownCause: 'MaxPreps’ Avocado table leaves out Mt. Carmel and Rancho Bernardo, and MaxPreps marks only some games between Avocado teams as league games, so its records differ from ours.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      id: 'palomar', leagueId: 'north-county', label: 'Palomar', searchAliases: [],
      maxprepsLeagueId: 'e4a7e9c3-986b-446f-8547-8348be95e282',
      maxprepsName: 'Palomar', maxprepsSlug: 'palomar',
      expectedTeams: 7, gamesPerTeam: 12,
      // Del Norte v Rancho Buena Vista, Sep 9.
      leaguePlay: { first: '2026-09-09', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'The alignment sheet also lists Rancho Buena Vista under Valley; its league games are against Palomar teams.',
      home: { miniRows: 7, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      // MaxPreps has no Valley table: all six teams carry its zero-GUID league. Nothing is requested for it and
      // the MaxPreps comparison is skipped ("MaxPreps publishes no table for this division"), so no knownCause.
      id: 'valley', leagueId: 'north-county', label: 'Valley', searchAliases: [],
      maxprepsLeagueId: null, maxprepsName: null, maxprepsSlug: null,
      expectedTeams: 6, gamesPerTeam: 10,
      // Escondido v Sage Creek, Sep 28 (both rows contestType 1: MaxPreps flags few Valley games).
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 0,
      maxprepsMissing: ['escondido', 'mission-hills', 'sage-creek', 'san-pasqual', 'vista', 'westview'],
      maxprepsExtraRows: {}, reportedTrust: 'informational', knownCause: null,
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  // The co-leaders label keeps the conference's full words: 'North co-leaders' would read as a direction.
  rules: sdsRules('North County'),
  postseason: sdsPostseason({
    'canyon-crest-academy': 'I', 'la-costa-canyon': 'I', 'mt-carmel': 'I', 'rancho-bernardo': 'I', 'san-marcos': 'I', 'torrey-pines': 'I',
    'del-norte': 'I', fallbrook: 'I', 'mission-vista': 'II', poway: 'I', 'rancho-buena-vista': 'II', 'san-dieguito-academy': 'I', 'valley-center': 'II',
    escondido: 'II', 'mission-hills': 'II', 'sage-creek': 'II', 'san-pasqual': 'II', vista: 'II', westview: 'II',
  }),
  phases: sdsPhases(),
  keyDates: sdsKeyDates(),
  officialChanges: null,
};
