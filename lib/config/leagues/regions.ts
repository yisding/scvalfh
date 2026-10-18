/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the regions (NorCal, SoCal), the default region and the five sections.
 */

import type { RegionId } from '@/lib/model/ids';
import type { RegionConfig, SectionConfig } from '@/lib/model/league-config';

import {
  CCS_BYLAWS_URL, NS_GUIDELINES_URL, SDS_FIELD_HOCKEY_URL, SDS_GREEN_BOOK_URL, SS_BLUE_BOOK_FH_URL, SS_FIELD_HOCKEY_URL,
} from './documents';

/** NorCal first: it is the default view (DEFAULT_REGION) and the reading order with JavaScript off. */
export const REGIONS = [
  { id: 'norcal', name: 'Northern California', shortName: 'NorCal' },
  { id: 'socal', name: 'Southern California', shortName: 'SoCal' },
] as const satisfies readonly RegionConfig[];

/** The view a first visit gets, and the one a page renders before any stored preference is read. */
export const DEFAULT_REGION: RegionId = 'norcal';

export const SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    holdsFieldHockeyChampionship: true,
    officialUrl: 'https://cifccs.org/sports/fh/index',
    rulesSource: { name: 'CCS Field Hockey Bylaws 2026-27', url: CCS_BYLAWS_URL, format: 'PDF' },
    shootout: null,
    seasonWindow: { start: '2026-08-01', end: '2026-11-30' },
    noChampionshipNote: null,
  },
  {
    id: 'ncs', name: 'North Coast Section', shortName: 'NCS', briefLabel: 'NCS', region: 'norcal',
    maxprepsSectionId: '89ae2e0f-e108-4054-9df3-329f0579f86d',
    holdsFieldHockeyChampionship: false,
    officialUrl: 'https://www.cifncs.org/',
    // The NCS publishes no field hockey rules document of its own (MCAL's handbook holds the league rules), so
    // its rules source is the Section's site, the page this config already links.
    rulesSource: { name: 'CIF North Coast Section website', url: 'https://www.cifncs.org/', format: 'web page' },
    shootout: null,
    seasonWindow: { start: '2026-08-01', end: '2026-11-28' },
    noChampionshipNote:
      'The North Coast Section and CIF hold no field hockey championship. MCAL’s own six-team tournament is the postseason.',
  },
  {
    id: 'ns', name: 'Northern Section', shortName: 'NS', briefLabel: 'Northern Section', region: 'norcal',
    maxprepsSectionId: '6249819d-12de-4bff-b0ab-38156006b001',
    // The "NSCIF Post Season Tournament" (the EAL's Super Regional, Oct 30-31) is on the Section's "Championship
    // Playoff Calendar": https://www.cifns.org/meetings-calendars/calendars/26-27_Playoff_Schedule.pdf
    holdsFieldHockeyChampionship: true,
    officialUrl: 'https://www.cifns.org/sports/fh/index',
    rulesSource: { name: 'Northern Section Field Hockey Guidelines 2026-28', url: NS_GUIDELINES_URL, format: 'PDF' },
    // §VII.E.4, varsity: one 10-minute sudden-victory period, then 1 v 1s until there is a winner.
    shootout: {
      words: '1 v 1s',
      citation: 'Northern Section Field Hockey Guidelines §VII.E.4 (one 10-minute sudden-victory period, then 1 v 1s)',
      // The 2026-09-28 Chico 1, Davis 1 box score carries an 'SO Win' column (docs/DATA-SOURCES.md §1.1b).
      inference: 'verified',
      disagreement: null,
      // §VII.E.4 governs a varsity game; the Guidelines make no exception for tournaments.
      coversTournaments: true,
    },
    // The start matches the CCS/NCS windows. The end is OUR choice, not a Section date: one week after the Super
    // Regional's last day (Oct 31), so a late result still lands.
    seasonWindow: { start: '2026-08-01', end: '2026-11-07' },
    noChampionshipNote: null,
  },
  {
    // research-cifss.md §0-§1 [V]: Blue Book 2026-27 Bylaw 2011.1 "GIRL'S TEAM FIELD HOCKEY CHAMPIONSHIPS (No
    // playoffs - See Bylaw 3500.2)"; 3500.2 "No playoffs will be conducted by the CIF Southern Section Office
    // when less than 20% of the membership field teams in that sport"; the 2026-27 Sports Calendar lists CIF-SS
    // Preliminaries and Finals "N/A" and the last allowable contest Sat Oct 31; cifstate.org: no CIF regional or
    // state championship. MaxPreps sectionId from the Southern Section field hockey hub.
    id: 'ss', name: 'Southern Section', shortName: 'SS', briefLabel: 'Southern Section', region: 'socal',
    maxprepsSectionId: '8e11e7d4-d3fa-4e6f-827f-652c29439d27',
    holdsFieldHockeyChampionship: false,
    officialUrl: SS_FIELD_HOCKEY_URL,
    rulesSource: { name: 'CIF-SS Blue Book 2026-27, Article 200 (Field Hockey)', url: SS_BLUE_BOOK_FH_URL, format: 'PDF' },
    // Article 200 adopts the NFHS rules and says nothing on overtime; games between Sunset teams have ended level
    // (Bonita 1-1 Marina, Aug 18, non-league; Fountain Valley 1-1 Marina, Sep 11, a Sunset game), and a Sunset
    // league game has gone to overtime (Great Oak 2-1 Temecula Valley, Oct 2). No shootout rule.
    shootout: null,
    // The start matches the other windows. The end is OUR choice, as for the Northern Section: one week after
    // the Section's last allowable contest (Oct 31), so a late result still lands.
    seasonWindow: { start: '2026-08-01', end: '2026-11-07' },
    noChampionshipNote:
      'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaw 2011.1 and 3500.2) and CIF holds no state championship: a Sunset team’s season ends with its last game, Oct 31 at the latest.',
  },
  {
    // research-cifsds.md §0-§5 [V]: Green Book 2026-27 Bylaw 2000.1 (Open 8, Division I 12, Division II 12);
    // Master Calendar 2026-27 (last contest Oct 30, playoffs Nov 2–12, finals Nov 14); MaxPreps sectionId
    // from the San Diego Section field hockey hub.
    id: 'sds', name: 'San Diego Section', shortName: 'SDS', briefLabel: 'San Diego Section', region: 'socal',
    maxprepsSectionId: 'bab8c451-e991-413d-93ac-ee77067952a3',
    holdsFieldHockeyChampionship: true,
    officialUrl: SDS_FIELD_HOCKEY_URL,
    rulesSource: { name: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (Field Hockey)', url: SDS_GREEN_BOOK_URL, format: 'Google Doc' },
    // The Green Book leaves the procedure to the preseason minutes (an unreadable Canva bulletin); the San Diego
    // Field Hockey Officials Association's 2026 Mercy & Overtime Procedures (PDF, sdfhoa.weebly.com) are the
    // operative text: varsity regular season, a 10-minute 7 v 7 sudden-victory period, then a set of five 1 v 1
    // shootouts, then sudden-victory shootouts; "a total of one goal is awarded for the winner of the set".
    shootout: {
      words: 'a shootout',
      citation: 'San Diego Field Hockey Officials Association 2026 Mercy & Overtime Procedures (a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal)',
      // si.com and the Section's power rankings both record Mt. Carmel–Poway (Sep 11) as 2-0 where MaxPreps has
      // 0-0 marked W and L, and no box score carries a tally: the flagged win counts, the shootout is not asserted.
      inference: 'unverified',
      // [V] cifsdshome power-rankings details, school 699 (Poway): 09/11/2026 Mt. Carmel "W (2-0)"; school 713
      // (Mt. Carmel): "L (0-2)". 2-0 is not MaxPreps' 0-0 plus the one goal a shootout credits, so the
      // sentence says only that the score is decisive, not how it was reached.
      disagreement: 'si.com and the Section’s power rankings record some of these games with a decisive score (Mt. Carmel–Poway, Sep 11: 2-0).',
      // The procedures' two varsity headings are the regular season and the playoffs; invitational tournaments
      // are not covered, and seven SDS-v-SDS tournament games this season are recorded level (T and T).
      coversTournaments: false,
    },
    // The start matches the other windows; the end is one week after the Nov 14 finals (OUR choice).
    seasonWindow: { start: '2026-08-01', end: '2026-11-21' },
    noChampionshipNote: null,
  },
] as const satisfies readonly SectionConfig[];
