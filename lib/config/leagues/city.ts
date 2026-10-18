/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the City Conference (San Diego Section).
 */

import type { LeagueConfig } from '@/lib/model/league-config';

import { SDS_FIELD_HOCKEY_URL } from './documents';
import {
  SDS_LEAGUE_PLAY_LAST, SDS_LINKS, sdsKeyDates, sdsOfficial, sdsPhases, sdsPostseason, sdsRules,
} from './sds';

export const CITY: LeagueConfig = {
  // The City Conference's two field hockey leagues, "WESTERN" and "EASTERN" on the CITY tab of the League
  // Alignment ("LAST UPDATE: September 10, 2026") [V].
  id: 'city', sectionId: 'sds',
  name: 'City Conference', shortName: 'City',
  cities: 'San Diego and La Jolla',
  alignmentSource: 'the CIF-SDS 2026-27 League Alignment',
  officialUrl: SDS_FIELD_HOCKEY_URL,
  links: SDS_LINKS,
  sblive: { leagueSlugs: ['4179-city-western', '4178-city-eastern'], backfill: true },
  officialCodes: {},
  officialNames: {},
  // Madison is MaxPreps' 0-0-0 City - Eastern row (fef1da70-…): no 2026 varsity game on MaxPreps or in the
  // Section's power rankings, and not in the alignment's field hockey block. Spellings from MaxPreps and si.com.
  withdrawnNames: ['Madison', 'MADISON', 'Madison High School', 'Madison Warhawks'],
  membershipNote: null,
  divisions: [
    {
      id: 'city-western', leagueId: 'city', label: 'City Western', searchAliases: [],
      maxprepsLeagueId: '35dc98fe-887a-475b-992c-0edfe7fc4c58',
      maxprepsName: 'City - Western', maxprepsSlug: 'city--western',
      expectedTeams: 6, gamesPerTeam: 10,
      // Scripps Ranch v La Jolla, Sep 1.
      leaguePlay: { first: '2026-09-01', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'MaxPreps counts Mission Bay’s five games against City Eastern teams as league games; the alignment puts Mission Bay in City Western, so they count in neither table here.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      id: 'city-eastern', leagueId: 'city', label: 'City Eastern', searchAliases: [],
      maxprepsLeagueId: '6f9a29a0-78af-4d30-a087-cfa9feb91b89',
      maxprepsName: 'City - Eastern', maxprepsSlug: 'city--eastern',
      expectedTeams: 6, gamesPerTeam: 10,
      // La Jolla Country Day v Mira Mesa, Sep 15.
      leaguePlay: { first: '2026-09-15', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      // 6 rows (Madison's included) + Patrick Henry − Madison = 6.
      maxprepsTeamCount: 6, maxprepsMissing: ['patrick-henry'],
      maxprepsExtraRows: {
        'fef1da70-bea2-4958-a60b-9962851f6a1d': 'Madison: a 0-0-0 row; Madison has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings',
      },
      reportedTrust: 'informational',
      knownCause: 'MaxPreps’ table leaves out Patrick Henry and lists Madison, which has no varsity game; MaxPreps marks none of Patrick Henry’s league games as league games. MaxPreps also counts the City Eastern teams’ games against Mission Bay as league games; the alignment puts Mission Bay in City Western, so they count in neither table here.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  rules: sdsRules('City'),
  // From the Section's 2026 Divisions sheet (research-cifsds.md §3.2, §6.1).
  postseason: sdsPostseason({
    bishops: 'I', 'canyon-hills': 'I', 'cathedral-catholic': 'I', 'la-jolla': 'I', 'mission-bay': 'I', 'scripps-ranch': 'I',
    clairemont: 'I', 'la-jolla-country-day': 'I', 'mira-mesa': 'II', 'patrick-henry': 'II', 'point-loma': 'II', 'university-city': 'I',
  }),
  phases: sdsPhases(),
  keyDates: sdsKeyDates(),
  officialChanges: null,
};
