/**
 * The soccer build's sections and CCS block (lib/league-config/sections.ts picks these when
 * `SCVAL_SPORT=soccer`). One section, the CCS, in one region: the build covers SCVAL, BVAL, the WCAL and the WBAL.
 *
 * Sources (the three CCS documents read 2026-11-06 from the links on cifccs.org's soccer page):
 *  - The CCS 2026-27 Playoff Calendar ("Updated 5/28/26"; sha256 28557c36…;
 *    https://d2o2figo6ddd0g.cloudfront.net/7/5/gmi4496wp9uph8/2026-27_CCS_Playoff_Dates.pdf): soccer entry forms
 *    due Thu Feb 18 at noon and the seeding meeting at 3:00 pm; quarterfinals Sat Feb 20; Division 1 semifinals
 *    Tue Feb 23, Divisions 2-5 Wed Feb 24; Division 1 finals Fri Feb 26, Divisions 2-5 Sat Feb 27; the committee
 *    evaluation meeting Wed Mar 10 at 4:00 pm. The calendar opens the bracket at the quarterfinals.
 *  - CCS_SOCCER_REPORT, the CCS Soccer Committee report of March 11, 2026 (sha256 65852a97…): seeding Thu Feb 18
 *    and evaluation Wed Mar 10, 2027; the tournaments Feb 20-27, 2027; five girls divisions (the 2026 champions
 *    are listed for Divisions 1-5).
 *  - League Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026"; sha256 f8e7c635…;
 *    https://d2o2figo6ddd0g.cloudfront.net/x/6/oveyqe9ewyzm4m/League_Alignments_2026-27.pdf): SCVAL girls soccer is De Anza (A) and
 *    El Camino (B), the same 15 schools as lib/registry/soccer/scval.ts.
 *  - SCVAL Soccer By-Laws Article V §2: SCVAL's automatic berths (De Anza 1-3, El Camino 1).
 *
 * Still null, because none of these documents says it: the field's size and at-large count (the CCS Soccer
 * Bylaws' allocation), who hosts which round, and MaxPreps' tournament page and bracket ids.
 */

import type { CcsConfig, SectionConfig } from '../shape';

const CCS_SOCCER_INDEX = 'https://cifccs.org/sports/soccer/index';
const CCS_SOCCER_REPORT = 'https://d2o2figo6ddd0g.cloudfront.net/0/f/0o2l2sadue3ja2/SOCCER_2026_COMMITTEE_REPORT.pdf';

export const SOCCER_SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    // The CCS holds a girls soccer championship in five divisions (CCS_SOCCER_REPORT).
    holdsFieldHockeyChampionship: true,
    officialUrl: CCS_SOCCER_INDEX,
    rulesSource: { name: 'CCS Soccer Committee report, March 11, 2026', url: CCS_SOCCER_REPORT, format: 'PDF' },
    shootout: null,
    // First contest allowed Nov 23 (the SCVAL schedules); the evaluation meeting (Wed Mar 10) closes the season.
    // CIF NorCal (Mar 2-6) is not covered.
    seasonWindow: { start: '2026-11-01', end: '2027-03-10' },
    noChampionshipNote: null,
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];

export const SOCCER_CCS: CcsConfig = {
  autoQualifiers: { scval: 4, bval: 6, wcal: 2, wbal: 4, atLarge: null, total: null },
  // Five divisions (CCS_SOCCER_REPORT), each seeded on its own: CcsDivisionName names field hockey's two, so none
  // is named here, and the bracket is drawn by round until MaxPreps' feed names a division.
  ccsDivisions: [],
  keyDates: {
    entriesDue: '2027-02-18T12:00:00', seedingMeeting: '2027-02-18T15:00:00',
    quarterfinals: '2027-02-20',
    semifinals: '2027-02-23', semifinalsLast: '2027-02-24',
    finals: '2027-02-26', finalsLast: '2027-02-27',
    evaluationMeeting: '2027-03-10T16:00:00', endOfLeagueSeason: '2027-02-17',
  },
  highSeedHostsThrough: null,
  bracketUrl: null,
  tournament: null,
  pollFrom: '2027-02-10',
  citations: {
    allocation: 'SCVAL Soccer By-Laws Article V §2 (De Anza’s first three and El Camino’s first-place team) BVAL Girls Soccer By-Laws §10 (Mt. Hamilton’s top three, Santa Teresa’s top two and the West Valley champion), WCAL By-Laws Article VII §14.A (the round robin’s first two) and WBAL By-Laws §607.2 (Foothill’s first three, and the winner of a playoff between Foothill’s fourth and the Skyline winner); the CCS’s own allocation of the field is in its Soccer Bylaws, not transcribed here',
    change: 'SCVAL Soccer By-Laws Article V §4 (a team at .500 or better may apply for an at-large berth)',
  },
  laterDivisions: 'Divisions 2-5',
  roundDaysNote:
    'Division 1 plays its semifinals on Tue Feb 23 and its final on Fri Feb 26; Divisions 2-5 play theirs on Wed Feb 24 and Sat Feb 27 (the CCS 2026-27 Playoff Calendar).',
  atLargeParagraph:
    'At-large berths are the CCS committee’s call. Any SCVAL team at .500 or better in league or overall may apply, and CCS orders the applicants by its power points (SCVAL Soccer By-Laws Article V §4); a BVAL, WCAL or WBAL team applies under the CCS’s own rules.',
  sources: {
    bylaws: CCS_SOCCER_REPORT,
    index: CCS_SOCCER_INDEX,
    ical: 'https://cifccs.org/calendar/Soccer?print=ical',
  },
};
