/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the data-quality table (MaxPreps ghosts, excluded and re-dated contests, ignored si.com and
 * MaxPreps ids, schools not covered).
 */

import type { DataQualityConfig } from '@/lib/model/league-config';

/** The captures behind the ghost and si.com entries are named in docs/DATA-SOURCES.md §5.5 (fixture provenance). */
export const DATA_QUALITY: DataQualityConfig = {
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
