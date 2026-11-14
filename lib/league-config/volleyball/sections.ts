/**
 * The volleyball build's sections and CCS block (lib/league-config/sections.ts picks these when
 * `SCVAL_SPORT=volleyball`). One section, the CCS, in one region: the build covers SCVAL and BVAL.
 *
 * Sources (read 2026-11-14):
 *  - CCS_PLAYOFF_CALENDAR, the CCS 2026-27 Playoff Calendar ("Updated 5/28/26"): girls volleyball entry forms
 *    due Thu Oct 29 at 12:01 am and the seeding meeting that day (Open Division 11:00 am, Divisions 1-5 12:00
 *    noon); Divisions 1-5 first round and the Open quarterfinals Sat Oct 31; Divisions 1-5 quarterfinals Tue
 *    Nov 3; Open semifinals Wed Nov 4; Divisions 1-5 semifinals Thu Nov 5; finals Sat Nov 7; the committee
 *    evaluation meeting Tue Dec 1 at 4:00 pm.
 *  - The CCS girls volleyball calendar feed (cifccs.org/calendar/Girls_Volleyball?print=ical, seven events): the
 *    same days, with each round's site ("at Home Sites" through the semifinals, "CCS Finals at Neutral Sites").
 *    The feed names Oct 31 "D1-D5 Quarterfinals" and Nov 3 "Open Quarterfinals & D1-D5 1st Round", the two
 *    rounds the other way round from the Playoff Calendar; the Playoff Calendar's order is used.
 *  - MaxPreps' tournament page (VOLLEYBALL_GIRLS_2026.ccsBracketPath), read 2026-11-14: one bracket block each
 *    for the Open Division and Divisions 1-5, all six published.
 *  - SCVAL Volleyball By-Laws Article V §1-§2: SCVAL's automatic berths (De Anza 1-3, El Camino 1).
 *  - BVAL Girls Volleyball By-Laws §3.5: BVAL's (Mt. Hamilton 1-3, the Santa Teresa and Almaden Valley
 *    champions, and the winner of Santa Teresa's second-place team at the West Valley champion).
 *
 * Still null, because none of these says it: the field's size and at-large count (the CCS Volleyball Bylaws'
 * allocation). cifccs.org's own sport pages answer scripts with 403, so the CCS volleyball page was not read and
 * `sources.index` is the calendar page that was.
 */

import { CCS_BRACKET_URL } from '../../season';
import type { CcsConfig, SectionConfig } from '../shape';

const CCS_PLAYOFF_CALENDAR = 'https://d2o2figo6ddd0g.cloudfront.net/7/5/gmi4496wp9uph8/2026-27_CCS_Playoff_Dates.pdf';
const CCS_VOLLEYBALL_CALENDAR = 'https://cifccs.org/calendar/Girls_Volleyball';

export const VOLLEYBALL_SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    // The CCS holds a girls volleyball championship: an Open Division and Divisions 1-5 (CCS_PLAYOFF_CALENDAR).
    holdsFieldHockeyChampionship: true,
    officialUrl: CCS_VOLLEYBALL_CALENDAR,
    rulesSource: { name: 'CCS 2026-27 Playoff Calendar', url: CCS_PLAYOFF_CALENDAR, format: 'PDF' },
    shootout: null,
    // First contest allowed Aug 27, sportsmanship game Aug 24 (the SCVAL schedules); the evaluation meeting
    // (Tue Dec 1) closes the season. CIF NorCal (Nov 10-17) and the state finals (Nov 20-21) are inside the
    // window: their matches are listed, as postseason games of another tournament.
    seasonWindow: { start: '2026-08-01', end: '2026-12-01' },
    noChampionshipNote: null,
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];

export const VOLLEYBALL_CCS: CcsConfig = {
  autoQualifiers: { scval: 4, bval: 6, atLarge: null, total: null },
  // An Open Division and Divisions 1-5, each seeded on its own: CcsDivisionName names field hockey's two, so
  // none is named here. The brackets are read whole from MaxPreps' tournament pages instead (`playoffs.brackets`,
  // lib/pipeline/steps/secondary.ts) and drawn one per division (components/playoffs/TournamentBrackets.tsx).
  ccsDivisions: [],
  keyDates: {
    entriesDue: '2026-10-29T00:01:00', seedingMeeting: '2026-10-29T11:00:00',
    firstRound: '2026-10-31',
    quarterfinals: '2026-11-03',
    semifinals: '2026-11-04', semifinalsLast: '2026-11-05',
    finals: '2026-11-07',
    evaluationMeeting: '2026-12-01T16:00:00', endOfLeagueSeason: '2026-10-28',
  },
  // The calendar feed: every round through the semifinals "at Home Sites", the finals "at Neutral Sites".
  highSeedHostsThrough: 'semifinals',
  bracketUrl: CCS_BRACKET_URL,
  tournament: {
    id: '8333fa4c-7615-410e-a434-46c3e5c025a8',
    division1BracketId: '385934f0-4cae-4c82-afdb-d089823982f4',
    division2BracketId: '59497b99-91cd-414a-a168-5c99c0854b41',
    otherBrackets: [
      { name: 'Open Division', id: '8003910f-45b1-4293-b230-df4ad5ce5c76' },
      { name: 'Division 3', id: 'fc17c3d0-451a-4939-af22-069e9f38fa99' },
      { name: 'Division 4', id: 'd4276ff3-62fd-4fd9-933e-93b39b39a03f' },
      { name: 'Division 5', id: '8ea57d2f-38f6-4bc7-8cb0-175f7f63354e' },
    ],
  },
  pollFrom: '2026-10-25',
  citations: {
    allocation: 'SCVAL Volleyball By-Laws Article V §1-§2 (De Anza’s top three and the El Camino champion) and BVAL Girls Volleyball By-Laws §3.5 (Mt. Hamilton’s top three, the Santa Teresa and Almaden Valley champions and the play-in winner); the CCS’s own allocation of the field is in its Volleyball Bylaws, not transcribed here',
    change: 'SCVAL Volleyball By-Laws Article V §3 (a team at .500 or better in league or out of league may apply for an at-large berth)',
  },
  laterDivisions: 'Divisions 1-5',
  roundDaysNote:
    'Divisions 1-5 play a first round on Sat Oct 31, quarterfinals on Tue Nov 3 and semifinals on Thu Nov 5. The Open Division plays its quarterfinals on Sat Oct 31 and its semifinals on Wed Nov 4. Every final is on Sat Nov 7 (the CCS 2026-27 Playoff Calendar).',
  atLargeParagraph:
    'At-large berths are the CCS committee’s call. Any SCVAL team with a league record or an out-of-league record of .500 or better may apply (SCVAL Volleyball By-Laws Article V §3); once the at-large teams are chosen, BVAL teams are seeded on their league finish (BVAL Girls Volleyball By-Laws §3.5).',
  sources: {
    bylaws: CCS_PLAYOFF_CALENDAR,
    index: CCS_VOLLEYBALL_CALENDAR,
    ical: 'https://cifccs.org/calendar/Girls_Volleyball?print=ical',
  },
};
