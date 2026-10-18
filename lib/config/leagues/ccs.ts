/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the CCS section block (section data, not league data).
 */

import type { CcsConfig } from '@/lib/model/league-config';

import { CCS_BRACKET_URL } from '@/lib/config/season';

import { CCS_BYLAWS_URL } from './documents';

/** The CCS section block (section data, not league data). */
export const CCS: CcsConfig = {
  autoQualifiers: { scval: 7, bval: 4, pcal: 2, atLarge: 3, total: 16 },
  ccsDivisions: [
    { name: 'Division 1', seeds: [1, 8] },
    { name: 'Division 2', seeds: [9, 16] },
  ],
  keyDates: {
    entriesDue: '2026-11-02T12:00:00', seedingMeeting: '2026-11-02T13:00:00',
    quarterfinals: '2026-11-07', semifinals: '2026-11-11', finals: '2026-11-14',
    evaluationMeeting: '2026-11-19T16:00:00', endOfLeagueSeason: '2026-10-31',
  },
  highSeedHostsThrough: 'semifinals',
  // CCS_BRACKET_URL is imported from lib/config/season.ts, which builds it on the MaxPreps base (season stays a leaf).
  bracketUrl: CCS_BRACKET_URL,
  tournament: {
    id: 'b97830de-ad65-4dc2-b4be-b76080093330',
    division1BracketId: '30408977-466b-441e-ac1a-18a5cf483aa6',
    division2BracketId: 'b9c27987-34de-415a-b599-3dbec8f1e23d',
  },
  /** CCS iCal/bracket polling opens here: before the last league games (BVAL Oct 30), the BVAL play-in (Oct 31) and entries (Nov 2). */
  pollFrom: '2026-10-25',
  citations: {
    allocation: 'CCS Field Hockey Bylaws 2026-27 §4a (BVAL 4, PCAL 2, SCVAL 7, 3 at-large)',
    change: 'CCS Field Hockey Committee report 2025-11-20 §IV (PCAL reduced from 3 automatic berths to 2)',
  },
  sources: {
    bylaws: CCS_BYLAWS_URL,
    index: 'https://cifccs.org/sports/fh/index',
    ical: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  },
};
