/**
 * The basketball build's sections and CCS block (lib/league-config/sections.ts picks these when
 * `SCVAL_SPORT=basketball`). One section, the CCS, in one region: the build covers SCVAL only.
 *
 * Sources (read 2026-11-10):
 *  - CCS_PLAYOFF_CALENDAR, the CCS 2026-27 Playoff Calendar ("Updated 5/28/26"): boys and girls basketball entry
 *    forms due Wed Feb 17 at 10:00 am and the seeding meeting at 12:00 noon; Divisions 1-5 first round Fri Feb 19,
 *    second round Sat Feb 20, quarterfinals Tue Feb 23, semifinals Thu Feb 25, finals Sat Feb 27; the Open
 *    Division's three games Fri Feb 19, Mon Feb 22 and Wed Feb 24 and its final Fri Feb 26; the committee
 *    evaluation meeting Thu Mar 11 at 4:00 pm.
 *  - The CCS basketball calendar feed (cifccs.org/calendar/Basketball?print=ical, ten events): the same days,
 *    with each round's site ("D1-D5 1st Round & Open Game #1 at Home Sites", "D1-D5 Semifinals at Home Sites",
 *    "Open Finals at Neutral Sites", "D1-D5 Finals at Neutral Sites").
 *  - SCVAL Basketball By-Laws Article VI §2: SCVAL's automatic berths (De Anza 1-3, El Camino 1).
 *
 * Still null, because none of these says it: the field's size and at-large count (the CCS Basketball Bylaws'
 * allocation), and MaxPreps' tournament page and bracket ids. cifccs.org's own sport pages answer scripts with
 * 405, so the CCS basketball page was not read and `sources.index` is the calendar page that was.
 */

import type { CcsConfig, SectionConfig } from '../shape';

const CCS_PLAYOFF_CALENDAR = 'https://d2o2figo6ddd0g.cloudfront.net/7/5/gmi4496wp9uph8/2026-27_CCS_Playoff_Dates.pdf';
const CCS_BASKETBALL_CALENDAR = 'https://cifccs.org/calendar/Basketball';

export const BASKETBALL_SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    // The CCS holds a boys basketball championship: an Open Division and Divisions 1-5 (CCS_PLAYOFF_CALENDAR).
    holdsFieldHockeyChampionship: true,
    officialUrl: CCS_BASKETBALL_CALENDAR,
    rulesSource: { name: 'CCS 2026-27 Playoff Calendar', url: CCS_PLAYOFF_CALENDAR, format: 'PDF' },
    shootout: null,
    // First contest allowed Nov 23, sportsmanship games Nov 19 (the SCVAL schedules); the evaluation meeting
    // (Thu Mar 11) closes the season. CIF NorCal (Mar 2-10) and the state finals (Mar 12-13) are not covered.
    seasonWindow: { start: '2026-11-01', end: '2027-03-11' },
    noChampionshipNote: null,
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];

export const BASKETBALL_CCS: CcsConfig = {
  autoQualifiers: { scval: 4, atLarge: null, total: null },
  // An Open Division and Divisions 1-5, each seeded on its own: CcsDivisionName names field hockey's two, so
  // none is named here, and the bracket is drawn by round until MaxPreps' feed names a division.
  ccsDivisions: [],
  keyDates: {
    entriesDue: '2027-02-17T10:00:00', seedingMeeting: '2027-02-17T12:00:00',
    firstRound: '2027-02-19',
    secondRound: '2027-02-20',
    quarterfinals: '2027-02-23',
    semifinals: '2027-02-25',
    finals: '2027-02-26', finalsLast: '2027-02-27',
    evaluationMeeting: '2027-03-11T16:00:00', endOfLeagueSeason: '2027-02-16',
  },
  // The calendar feed: Divisions 1-5 play through the semifinals "at Home Sites" and the finals "at Neutral Sites".
  highSeedHostsThrough: 'semifinals',
  bracketUrl: null,
  tournament: null,
  pollFrom: '2027-02-10',
  citations: {
    allocation: 'SCVAL Basketball By-Laws Article VI §2.1 (De Anza’s top three and the El Camino champion); the CCS’s own allocation of the field is in its Basketball Bylaws, not transcribed here',
    change: 'SCVAL Basketball By-Laws Article VI §2 (a team at .500 or better in league or out of league may apply for entry)',
  },
  laterDivisions: 'Divisions 1-5',
  roundDaysNote:
    'Divisions 1-5 play a first round on Fri Feb 19 and a second on Sat Feb 20, quarterfinals on Tue Feb 23, semifinals on Thu Feb 25 and finals on Sat Feb 27. The Open Division plays three games each (Fri Feb 19, Mon Feb 22, Wed Feb 24) and its final on Fri Feb 26 (the CCS 2026-27 Playoff Calendar).',
  atLargeParagraph:
    'At-large berths are the CCS committee’s call. Any SCVAL team with a league record or an out-of-league record of .500 or better may apply (SCVAL Basketball By-Laws Article VI §2).',
  sources: {
    bylaws: CCS_PLAYOFF_CALENDAR,
    index: CCS_BASKETBALL_CALENDAR,
    ical: 'https://cifccs.org/calendar/Basketball?print=ical',
  },
};
