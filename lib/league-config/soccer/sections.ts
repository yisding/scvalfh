/**
 * The soccer build's sections and CCS block (lib/league-config/sections.ts picks these when
 * `SCVAL_SPORT=soccer`). One section, the CCS, in one region: the build covers SCVAL only.
 *
 * What the SCVAL documents state is filled in; what only the CCS's own 2026-27 Soccer Bylaws would state is
 * null. cifccs.org refuses automated reads (HTTP 403 to every page under /sports/, 2026-11-06), so the CCS's
 * allocation, field size, rounds and hosting rule are not transcribed: each null is one of those, and copy
 * that would print it says the CCS has not been read instead.
 *  - SCVAL's automatic berths (4): SCVAL Soccer By-Laws Article V §2 (De Anza 1-3, El Camino 1).
 *  - Dates: the footers of SCVAL's two 2026-27 girls schedules (entry forms due by noon and the seeding
 *    meeting, girls 3:00, on Thu Feb 18; first CCS event Sat Feb 20; last CCS event Sat Feb 27, the finals;
 *    last SCVAL event Wed Feb 17).
 */

import type { CcsConfig, SectionConfig } from '../shape';

const CCS_SOCCER_INDEX = 'https://cifccs.org/sports/soccer/index';

export const SOCCER_SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    // The CCS holds a girls soccer championship (its soccer page lists the 2026 girls brackets).
    holdsFieldHockeyChampionship: true,
    officialUrl: CCS_SOCCER_INDEX,
    rulesSource: { name: 'CCS Soccer Bylaws 2026-27 (on the CCS soccer page)', url: CCS_SOCCER_INDEX, format: 'web page' },
    shootout: null,
    // First contest allowed Nov 23; last CCS event Feb 27 (the SCVAL schedules). CIF NorCal (Mar 2-6) is not covered.
    seasonWindow: { start: '2026-11-01', end: '2027-02-28' },
    noChampionshipNote: null,
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];

export const SOCCER_CCS: CcsConfig = {
  autoQualifiers: { scval: 4, atLarge: null, total: null },
  // The CCS seeds girls soccer into several divisions at its Feb 18 meeting; which, and how many teams each, is
  // the CCS bylaws' (unread), so no division is named before a bracket is.
  ccsDivisions: [],
  keyDates: {
    entriesDue: '2027-02-18T12:00:00', seedingMeeting: '2027-02-18T15:00:00',
    quarterfinals: null, semifinals: null, finals: '2027-02-27', firstGames: '2027-02-20',
    evaluationMeeting: null, endOfLeagueSeason: '2027-02-17',
  },
  highSeedHostsThrough: null,
  bracketUrl: null,
  tournament: null,
  pollFrom: '2027-02-10',
  citations: {
    allocation: 'SCVAL Soccer By-Laws Article V §2 (De Anza’s first three and El Camino’s first-place team); the CCS’s own allocation is in its 2026-27 Soccer Bylaws, not read here',
    change: 'SCVAL Soccer By-Laws Article V §4 (a team at .500 or better may apply for an at-large berth)',
  },
  atLargeParagraph:
    'At-large berths are the CCS committee’s call. Any SCVAL team at .500 or better in league or overall may apply, and CCS orders the applicants by its power points (SCVAL Soccer By-Laws Article V §4).',
  sources: {
    bylaws: CCS_SOCCER_INDEX,
    index: CCS_SOCCER_INDEX,
    ical: 'https://cifccs.org/calendar/Soccer?print=ical',
  },
};
