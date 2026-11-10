/**
 * The regions and sections (SPEC §2.2; DESIGN-socal §2.1): REGIONS, the sections' official documents, the
 * Tournament of Champions, SECTIONS, the citations every 'site' league shares and the CCS section block.
 * Each league has a file of its own beside this one (named as its lib/registry/*.ts seeds); lib/leagues.ts
 * assembles them into LEAGUES and asserts the whole config at import (SPEC §2.4).
 */

import { CCS_BRACKET_URL } from '../season';
import { IS_BASKETBALL, IS_FIELD_HOCKEY } from '../sports/current';
import type { CcsKeyDates, RegionId } from '../types';
import type { CcsConfig, OutsideTournamentConfig, RegionConfig, SectionConfig } from './shape';
import { BASKETBALL_CCS, BASKETBALL_SECTIONS } from './basketball/sections';
import { SOCCER_CCS, SOCCER_SECTIONS } from './soccer/sections';

/** NorCal first: it is the default view (DEFAULT_REGION) and the reading order with JavaScript off. */
const ALL_REGIONS = [
  { id: 'norcal', name: 'Northern California', shortName: 'NorCal' },
  { id: 'socal', name: 'Southern California', shortName: 'SoCal' },
] as const satisfies readonly RegionConfig[];

/** The regions this build covers: both for field hockey, Northern California alone for soccer and basketball (SCVAL only). */
export const REGIONS: readonly RegionConfig[] = IS_FIELD_HOCKEY ? ALL_REGIONS : ALL_REGIONS.slice(0, 1);

/** The view a first visit gets, and the one a page renders before any stored preference is read. */
export const DEFAULT_REGION: RegionId = 'norcal';

/** [V] the CCS Field Hockey Bylaws 2026-27 (also CCS.sources.bylaws below). */
const CCS_BYLAWS_URL = 'https://cifccs.org/sports/fh/field_hockey_bylaws_2026-27.pdf';
/** [V] the Northern Section Field Hockey Guidelines 2026-28 (the EAL's rules and its Super Regional). */
export const NS_GUIDELINES_URL = 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf';
/**
 * [V] the Field Hockey excerpt of the CIF-SS Blue Book 2026-27 (Article 200; Bylaw 2011.1 "No playoffs - See
 * Bylaw 3500.2"), linked from https://cifss.org/sports/field-hockey/ (fetched 2026-10-06).
 */
export const SS_BLUE_BOOK_FH_URL = 'https://cifss.org/wp-content/uploads/2026/07/Field-Hockey-2026-27-Blue-Book.pdf';
/** [V] the CIF Southern Section's field hockey page (calendar, season preview, the Blue Book excerpt). */
export const SS_FIELD_HOCKEY_URL = 'https://cifss.org/sports/field-hockey/';
/** [V] the CIF San Diego Section's field hockey page (2026 Divisions, League Alignment, Green Book links). */
export const SDS_FIELD_HOCKEY_URL = 'https://www.cifsds.org/sports/fh/index';
/** [V] the CIFSDS Green Book 2026-27 ("Revised June 16, 2026"), a Google Doc; Bylaw 2000.1 is Girls Field Hockey. */
export const SDS_GREEN_BOOK_URL = 'https://docs.google.com/document/d/1JE9fAJPGJSnCi0r398lSJZknG54O3gZ3vSc24gPOr90/edit';
/** [V] the Section's 2026 bracket sheet, "2026 CIFSDS Field Hockey Championship Bracket" (read 2026-11-03). */
export const SDS_BRACKET_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1A8tsHqwGiRLD5EBSnCFoAAK5Qg13v6wQlen3HEGspeU/edit';
/**
 * [V] the bracket sheet's tabs, by division id of data/sds-brackets-2026.json (the sheet's own `gid`s, read
 * 2026-11-06; the 2025 sheet used the same three). The pipeline reads each as CSV (sdsBracketSheetCsvUrl) for the
 * results MaxPreps lacks (lib/sources/sds-bracket-sheet.ts); a tab whose title is not its division's is not read.
 */
export const SDS_BRACKET_SHEET_TABS: Readonly<Record<string, string>> = {
  open: '53658003',
  'division-1': '1795050195',
  'division-2': '742825713',
};

/** One bracket tab's CSV export (public, no key), from SDS_BRACKET_SHEET_URL. */
export function sdsBracketSheetCsvUrl(division: string): string {
  const gid = SDS_BRACKET_SHEET_TABS[division];
  if (!gid) throw new Error(`lib/league-config/sections.ts: no bracket sheet tab for ${division}`);
  return `${SDS_BRACKET_SHEET_URL.replace(/\/edit.*$/, '')}/export?format=csv&gid=${gid}`;
}

/** [V] the CIFSDS 2026-27 League Alignment workbook (field hockey blocks on the CITY, NORTH COUNTY and METRO tabs). */
export const SDS_ALIGNMENT_URL = 'https://docs.google.com/spreadsheets/d/1nGxmrWBpD1-Ms1idHy-n1zHwq7D06o1vfoFC7_cGgaI/edit#gid=1838785864';
/** [V] the Section's power-rankings page (it embeds the cifsdshome.org widget the Commissioner places teams from). */
export const SDS_POWER_RANKINGS_URL = 'https://www.cifsds.org/school-resources/CIFSDS_Power_Rankings';

/**
 * The Tournament of Champions (DESIGN §24.13; research of 2026-10-29). Eight Southern Section teams, five
 * Sunset (Huntington Beach, Newport Harbor, Edison, Great Oak, Temecula Valley) and three LA independents
 * (Harvard-Westlake, Bonita, Glendora): round 1 Thu Oct 22, semifinals Tue Oct 27, the final and a third-place
 * game Thu Oct 29 at Huntington Beach High School (Miller Field for the third-place game). Harvard-Westlake's
 * student paper names the organizer ("the Los Angeles Field Hockey Association (LAFHA) Tournament of Champions",
 * Aug 25, 2026) and the 2025 final (Harvard-Westlake 4-0 Newport Harbor, Oct 25, 2025); Bonita's schedule lists
 * "TOC Round 1 / Round 2 / Championship Game" and Huntington Beach's program site "TOC Playoff - Round 1 / Round
 * 2 / Championship (HBHS) / 3rd Playoff (Miller)". No organizer site, bracket or seeding is published, so the
 * site lists the games and never a seed. Every game between two Southern Section registry teams dated Oct 22-29
 * is a tournament game (the 2026-10-29 snapshot has no other such game); MaxPreps marks only Huntington Beach's
 * rows as playoffs (contestType 4), the rest as non-league (1).
 */
export const TOC: OutsideTournamentConfig = {
  id: 'toc',
  name: 'Tournament of Champions',
  shortName: 'TOC',
  organizer: 'Los Angeles Field Hockey Association',
  window: { first: '2026-10-22', last: '2026-10-29' },
  rounds: [
    { date: '2026-10-22', label: 'Round 1' },
    { date: '2026-10-27', label: 'Semifinals' },
    { date: '2026-10-29', label: 'Final and third-place game' },
  ],
  entrants: ['huntington-beach', 'newport-harbor', 'edison', 'great-oak', 'temecula-valley', 'harvard-westlake', 'bonita', 'glendora'],
  finalSite: 'Huntington Beach High School',
  note:
    'The Tournament of Champions is the postseason for the Sunset and the LA independents: eight teams, five from the Sunset and three LA independents, Oct 22–29, run by the Los Angeles Field Hockey Association, not by CIF. Round 1 Thu Oct 22, semifinals Tue Oct 27, the final Thu Oct 29 at Huntington Beach High School. Its games count in no league table. Nothing official publishes its pairings; the games below are as MaxPreps lists them.',
  sources: [
    { label: 'Harvard-Westlake Chronicle on the 2026 Tournament of Champions', href: 'https://hwchronicle.com/114175/sports/field-hockey-concentrates-as-a-group/' },
    { label: 'Huntington Beach field hockey: TOC events', href: 'https://www.hbfieldhockey.com/events' },
    { label: 'Bonita athletics: 2026 schedule', href: 'https://www.bonitaathletics.org/sport/field%20hockey/girls/' },
  ],
};

const FIELD_HOCKEY_SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS', briefLabel: 'CCS', region: 'norcal',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    holdsFieldHockeyChampionship: true,
    officialUrl: 'https://cifccs.org/sports/fh/index',
    rulesSource: { name: 'CCS Field Hockey Bylaws 2026-27', url: CCS_BYLAWS_URL, format: 'PDF' },
    shootout: null,
    seasonWindow: { start: '2026-08-01', end: '2026-11-30' },
    noChampionshipNote: null,
    outsideTournament: null,
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
    outsideTournament: null,
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
    outsideTournament: null,
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
      'The Tournament of Champions, run by the Los Angeles Field Hockey Association, is the postseason for the Sunset and the LA independents; the CIF Southern Section and CIF hold no field hockey championship (Blue Book Bylaw 2011.1 and 3500.2).',
    outsideTournament: TOC,
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
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];

/** The sections this build covers (lib/sports/current.ts): field hockey's five, or soccer's or basketball's one. */
export const SECTIONS: readonly SectionConfig[] = IS_FIELD_HOCKEY
  ? FIELD_HOCKEY_SECTIONS
  : IS_BASKETBALL
    ? BASKETBALL_SECTIONS
    : SOCCER_SECTIONS;

// ---------- Southern California (DESIGN-socal §2.1; research-cifss.md, research-cifsds.md) ----------
//
// No SoCal league publishes a schedule, standings or a points rule, so all four are 'site' leagues: the
// table is this site's 3-1-0 points, and every string in their configs says so instead of citing a league rule.

/** The three citations every 'site' league shares: no league document awards points or orders the table. */
export const SITE_POINTS_CITATIONS = {
  points: 'this site’s 3-1-0 points (the league publishes no points rule)',
  pointsShort: 'site 3-1-0',
  order: 'no league document orders the table; this site orders it by its own 3-1-0 points',
} as const;

/** The CCS section block (section data, not league data). */
const FIELD_HOCKEY_CCS: CcsConfig = {
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
  highSeedHostsThrough: 'quarterfinals',
  // CCS_BRACKET_URL is imported from lib/season.ts, which builds it from FIELD_HOCKEY_GIRLS_2026.ccsBracketPath (lib/sports/field-hockey.ts).
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
  // SPEC §10.7 item 8, verbatim.
  laterDivisions: null,
  roundDaysNote: null,
  atLargeParagraph:
    'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.',
  sources: {
    bylaws: CCS_BYLAWS_URL,
    index: 'https://cifccs.org/sports/fh/index',
    ical: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  },
};

/** The CCS block of this build's sport. */
export const CCS: CcsConfig = IS_FIELD_HOCKEY ? FIELD_HOCKEY_CCS : IS_BASKETBALL ? BASKETBALL_CCS : SOCCER_CCS;

/**
 * A CCS round's days as copy prints them: one day ('Tue Feb 23'), or first to last where divisions play it on
 * different days (soccer: 'Tue Feb 23 to Wed Feb 24'). `fmt` formats each day.
 */
export function ccsRoundDays(
  keyDates: Pick<CcsKeyDates, 'semifinals' | 'finals' | 'semifinalsLast' | 'finalsLast'>,
  round: 'semifinals' | 'finals',
  fmt: (date: string) => string,
): string {
  const first = keyDates[round];
  const last = round === 'semifinals' ? keyDates.semifinalsLast : keyDates.finalsLast;
  return last === undefined || last === first ? fmt(first) : `${fmt(first)} to ${fmt(last)}`;
}

/**
 * The first day of CCS games: the quarterfinals, or the first round where the bracket opens before them
 * (basketball: `keyDates.firstRound`). The CCS window, the bracket's games and every "CCS, <first> to <last>"
 * read it.
 */
export function ccsFirstDay(keyDates: Pick<CcsKeyDates, 'quarterfinals' | 'firstRound'>): string {
  return keyDates.firstRound ?? keyDates.quarterfinals;
}

/** The last day of CCS games: the last finals day. */
export function ccsLastDay(keyDates: Pick<CcsKeyDates, 'finals' | 'finalsLast'>): string {
  return keyDates.finalsLast ?? keyDates.finals;
}
