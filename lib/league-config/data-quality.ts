/**
 * The data-quality lists (SPEC §2.2) that are about a team, a league or a school, not about one game: MaxPreps
 * ghost teams to drop, si.com ids and MaxPreps leagues to ignore, and the schools search reports as not covered.
 * lib/leagues.ts assertLeagues() checks them against the config. What this site records of a single game (a row
 * that is no game, another day, another host, a result a better source has, a game no feed lists) is the fixture
 * ledger's (lib/fixtures/).
 */

import { bySport } from '../sports/current';
import type { DataQualityConfig } from './shape';

/** The captures behind the ghost and si.com entries are named in docs/DATA-SOURCES.md §5.5 (fixture provenance). */
const FIELD_HOCKEY_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    '8396a0d3-8021-458d-b592-a5cb2c4a366d': 'Del Norte (Crescent City): a MaxPreps ghost (no league, team size 0); its contest duplicates Tamalpais vs Del Norte (San Diego)',
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
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
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
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
  notCovered: [],
};

/** Volleyball's: MaxPreps rows that cannot be matches (read 2026-11-14). */
const VOLLEYBALL_DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    // A tournament's unset opponent has an id of its own (Los Altos' Menlo-Atherton and Spikefest rows), so the
    // all-zero TBA rule does not catch it.
    'b6e1f3f8-f345-4829-80a4-0653a9a36a1d': '“Tournament Opponent”: a MaxPreps placeholder for a tournament match whose opponent is not set, not a school',
  },
  sbliveIgnoredTeamIds: {},
  ignoredMaxprepsLeagueIds: {},
  notCovered: [],
};

export const DATA_QUALITY: DataQualityConfig = bySport<DataQualityConfig>({
  'field-hockey': FIELD_HOCKEY_DATA_QUALITY,
  soccer: SOCCER_DATA_QUALITY,
  basketball: BASKETBALL_DATA_QUALITY,
  volleyball: VOLLEYBALL_DATA_QUALITY,
  // The VAL's schedule page lists only its own eleven schools: nothing to exclude.
  'val-soccer': { ghostTeamIds: {}, sbliveIgnoredTeamIds: {}, ignoredMaxprepsLeagueIds: {}, notCovered: [] },
});
