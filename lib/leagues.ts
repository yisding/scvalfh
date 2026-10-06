/**
 * League configuration: every region, section, league, division, rule, tiebreak chain, citation, ladder,
 * pairing, phase, date and official source (SPEC §2; the Southern California amendment, DESIGN-socal §2.1).
 * Nothing else in the codebase names a league, a division or a by-law; teams live in lib/registry/* and
 * are assembled by lib/teams.ts.
 *
 * Pure data plus small helpers: no fs, no lib/data import, no snapshot. `assertLeagues()` runs at
 * module load and throws `lib/leagues.ts: <message>` on any violated invariant (SPEC §2.4).
 */

import type {
  CcsAutoQualifiers, CcsDivisionName, CcsKeyDates, ContestId, DivisionId, LeagueId, OfficialSourceId,
  PlayoffStatus, RegionId, SeasonPhase, SectionId, TeamId, TeamSlug, TiebreakStage, TournamentGame,
} from './types';
// The runtime imports are two leaves: lib/season.ts (dependency-free constants) and
// lib/schema-primitives.ts, for its date-key RegExp (that module imports nothing of ours, only zod).
import { DATE_PATTERN, SLUG_PATTERN } from './schema-primitives';
import { CCS_BRACKET_URL, SEASON_YEAR } from './season';

// ---------- shape (SPEC §2.1) ----------

/**
 * One half of the site's NorCal/SoCal toggle (DESIGN-socal §2.1.1, §2.4). A region is a set of sections;
 * a league's region is its section's, and nothing stores it (the snapshot derives it from config). The
 * ids are reserved route segments (RESERVED_SEGMENTS) and never a section, league or division id, so a
 * `#socal` anchor or a `data-region-scope="socal"` value can never be read as a league.
 */
export interface RegionConfig {
  id: RegionId;
  /** 'Northern California' | 'Southern California': headings and the live-region sentence. */
  name: 'Northern California' | 'Southern California';
  /** 'NorCal' | 'SoCal': the two buttons of the region switcher. */
  shortName: 'NorCal' | 'SoCal';
}

export interface SectionConfig {
  id: SectionId;
  name: string;                         // 'Central Coast Section'
  shortName: 'CCS' | 'NCS' | 'NS' | 'SS' | 'SDS';
  /**
   * The section in a parenthesis after its leagues in short copy (SITE_DESCRIPTION): 'CCS', 'NCS',
   * and 'Northern Section', 'Southern Section' and 'San Diego Section' in full, because no reader knows
   * those three by their initials.
   */
  briefLabel: string;
  /** The NorCal/SoCal half of the site this section's leagues sit in (DESIGN-socal §2.1.1). */
  region: RegionId;
  maxprepsSectionId: string;
  holdsFieldHockeyChampionship: boolean;
  officialUrl: string;
  /**
   * The document the section's field hockey rules are in, for copy that names it (/about, the footer):
   * the CCS bylaws, the Northern Section's Guidelines, the Southern Section's Blue Book Article 200, the San
   * Diego Section's Green Book Bylaw 2000.1. `format` is the link's parenthesis ('PDF', 'Google Doc', 'web
   * page'), so no reader writes "(PDF)" after a Google Doc. Replaces the `${section.name} Field Hockey
   * Guidelines` template, which named a document only the Northern Section has.
   */
  rulesSource: { name: string; url: string; format: 'PDF' | 'Google Doc' | 'web page' };
  /**
   * How the section ends a level varsity game when it is not settled in overtime, or null when no section
   * rule does (the game may end level). Set where a level final that MaxPreps marks W and L is a shootout
   * win, decider 'SO' (lib/normalize.ts): the Northern Section (one 10-minute sudden-victory period, then
   * 1 v 1s: NS Guidelines §VII.E.4) and the San Diego Section (a 10-minute 7 v 7 sudden-victory period,
   * then 1 v 1 shootouts, the winner credited one goal: SDFHOA 2026 Mercy & Overtime Procedures; MaxPreps
   * nonetheless records many such wins as a level score marked W and L, e.g. Mt. Carmel 0-0 Poway, Sep 11).
   * Keyed on the section, not the league, because the San Diego rule covers games between its three
   * conferences too. `words` is the noun phrase copy prints ('won on {words}'), `citation` the source.
   * assertLeagues: set exactly when every league of the section has `leagueOvertime` 'shootout'.
   */
  shootout: { words: string; citation: string } | null;
  /** Inclusive local dates the cron expects data in (the fetch season-window guard is their union). */
  seasonWindow: { start: string; end: string };
  /** An NCS-style reader note, shown wherever a reader would otherwise look for a section bracket; null where the section holds the postseason. */
  noChampionshipNote: string | null;
}

export interface DivisionConfig {
  id: DivisionId;
  leagueId: LeagueId;
  /** UI label. Never rendered as a "division" heading when the league has one division. */
  label: string;
  /** Extra spellings for SEARCH only ('Mount Hamilton'); never team aliases. */
  searchAliases: readonly string[];
  /**
   * MaxPreps' league GUID for this division's table. null where MaxPreps has no table for the division
   * (the San Diego Section's Valley, whose six teams all sit in MaxPreps' zero-GUID "no league"): then
   * maxprepsName and maxprepsSlug are null too, maxprepsTeamCount is 0, every member is in
   * maxprepsMissing, nothing is requested for it and the MaxPreps comparison is skipped (asserted).
   */
  maxprepsLeagueId: string | null;
  /**
   * DATA ONLY — never rendered, never written to the snapshot. PCAL's is 'Pacific Coast - Gabilan'; Metro
   * Mesa's is MaxPreps' 'Metro- South Bay' and Metro South Bay's is 'Grossmont' (MaxPreps' table names do
   * not follow the San Diego Section's alignment; each division's knownCause says so).
   */
  maxprepsName: string | null;
  /** For leagueStandingsUrl(): `${MAXPREPS_WEB}/ca/field-hockey/${SEASON_YEAR}/league/${maxprepsSlug}/?leagueid=${maxprepsLeagueId}` */
  maxprepsSlug: string | null;
  /** Registry count, asserted. */
  expectedTeams: number;
  /**
   * Official double round robin: (expectedTeams - 1) * 2. Drives "games left". null only where the league
   * has no fixed schedule (the Sunset: no league schedule is published and its teams meet 0, 1 or 2 times),
   * so no reader may print "of N", LEFT or MAX for it; assertLeagues allows null only with classification
   * 'contest-type' and official mode 'none'.
   */
  gamesPerTeam: number | null;
  /**
   * First and last league date. From the league's official schedule where there is one; otherwise the
   * first league game on MaxPreps' schedules (the Sunset: Aug 18; each San Diego division: its earliest
   * game between two members, inventory 2026-10-06) and the section's last allowed league date.
   */
  leaguePlay: { first: string; last: string };
  /**
   * The league's own schedule document. 'live-pdf' = SCVAL PDFs parsed each run; 'bundled' =
   * data/official/<file>, sha256 revision-checked; 'none' = the league publishes no schedule (EAL), so its
   * games are classified from MaxPreps' league flag and every reader narrows on `mode`.
   */
  official:
    | {
        mode: 'live-pdf' | 'bundled';
        source: OfficialSourceId;
        /** The human link ("Official schedule"). */
        scheduleUrl: string;
        bundledFile: string | null;
        /** Fetched and hashed each run (bundled mode only). */
        revisionCheckUrl: string | null;
        /** sha256 of the upstream document our bundle was transcribed from. */
        bundledSha256: string | null;
        /** The document's own revision marker, for copy ("revised 9/20/26"). */
        revisedOn: string | null;
      }
    | {
        mode: 'none';
        /** One plain paragraph saying where league games come from instead. */
        note: string;
      };
  /** Rows MaxPreps' own table should hold. */
  maxprepsTeamCount: number;
  /** Registry members MaxPreps' table omits (no alarm in the cross-check). */
  maxprepsMissing: readonly TeamSlug[];
  /**
   * MaxPreps standings rows that are known non-members, keyed by MaxPreps schoolId → why (EAL: Red Bluff's
   * 0-0-0 row). Skipped silently by the reported-table step. maxprepsTeamCount + maxprepsMissing − these
   * === expectedTeams.
   */
  maxprepsExtraRows: Readonly<Record<TeamId, string>>;
  /** 'full' = compare records, goals, place, pct (SCVAL's original comparison); 'records-only' = W-L-T and goals; 'informational' = W-L-T only, labelled. */
  reportedTrust: 'full' | 'records-only' | 'informational';
  /** Shown above the MaxPreps comparison for this table; null = none. */
  knownCause: string | null;
  /** Home-page mini table (C1 reads it; never hard-coded by division id in components). */
  home: { miniRows: number; lineAfter: number | null; lineLabel: string | null };
  /**
   * The labelled rule in the compact /standings table and on /playoffs: drawn after place `after`. null only
   * for an unbracketed-tournament league whose qualifiers >= expectedTeams (EAL: every team is in the top six).
   */
  ladderLine: { after: number; label: string } | null;
}

export interface LeagueRules {
  points: { win: number; tie: number; loss: number };
  orderBy: 'points';
  /**
   * 'table' = the league's document orders the table by points (SCVAL, BVAL, PCAL, MCAL); 'title' = it uses
   * points only to decide the champion and this site extends the same points to the table (EAL); 'site' = no
   * league document orders the table or awards points at all (the Sunset and the three San Diego leagues),
   * so this site orders it by its own 3-1-0 points and every reader says so — never "as {league} rules
   * require" (DESIGN-socal §2.1.7).
   */
  orderScope: 'table' | 'title' | 'site';
  /**
   * The word in notes: 'division' (SCVAL, BVAL and the multi-division San Diego leagues) | 'league' (PCAL,
   * MCAL, EAL, Sunset).
   */
  gamesWord: 'division' | 'league';
  /**
   * What makes a game a league game. 'contest-type' = MaxPreps' league flag (contestType 0 on either row)
   * between two members (SCVAL, EAL, Sunset); 'official-fixtures' = a fixture in the league's own schedule
   * (BVAL, PCAL, MCAL); 'membership' = any game between two members of one division dated inside its
   * leaguePlay, whatever MaxPreps' flag says (the San Diego divisions: every pair of division-mates meets
   * exactly twice on MaxPreps' schedules, a double round robin, while MaxPreps flags as few as 0 of Patrick
   * Henry's 10). Under all three, excludeContestTypes rows never count; 'membership' needs official mode
   * 'none' (asserted).
   */
  classification: 'contest-type' | 'official-fixtures' | 'membership';
  /**
   * contestTypes that never count (either row); applies to every classification. SCVAL: [] (byte-identity).
   * BVAL, PCAL, MCAL, Sunset, San Diego: [2, 4]. EAL: [2, 4, 5] (5 = MaxPreps' code for the 2025 EAL tournament).
   */
  excludeContestTypes: readonly number[];
  /** Games between two members on/after this local date are postseason (MCAL '2026-10-23', EAL '2026-10-30'). */
  postseasonFrom: string | null;
  /** Human escape hatch: contests that are league games despite postseasonFrom. */
  leagueGameOverrides: readonly ContestId[];
  /** 'legacy' = the original SCVAL matcher, byte-for-byte; 'two-phase' = §7.8. */
  matcher: 'legacy' | 'two-phase';
  tiebreaks: {
    /** Chain after 'points' for every points bucket without a byBucketStart entry. Last stage may be uncomputable. */
    default: readonly TiebreakStage[];
    /**
     * Chains keyed by the place where the ORIGINAL points bucket starts (PCAL: 1 = co-/tri-champions §23.3.1-2,
     * 2 = tie for 2nd §23.3.3). Sub-buckets created while resolving keep their original bucket's chain.
     */
    byBucketStart?: Readonly<Partial<Record<number, readonly TiebreakStage[]>>>;
  };
  multiTeam: 'partition-restart' | 'seed-one-restart';
  /** 'zero' = the original SCVAL head-to-head (a team with no H2H game scores 0); 'skip' = the stage is skipped when any tied team has not met the others. */
  h2hUnmet: 'zero' | 'skip';
  drawNumbers: Readonly<Record<TeamSlug, number>> | null;
  /**
   * How a tied league game ends. 'sudden-victory' (SCVAL Art. IV, BVAL §1a): a 7-minute golden-goal period may
   * decide it. 'none' (PCAL [U] §1.6.4 for double round robin, MCAL: no regular-season overtime; the Sunset:
   * no league or Southern Section rule is published, and its games have ended level and in overtime, so each
   * is recorded as reported): ties stand. 'shootout' (EAL, NS Guidelines §VII.E.4; the San Diego leagues,
   * SDFHOA 2026 procedures): overtime, then a shootout to a winner; a varsity game never ends level, and the
   * section's SectionConfig.shootout says how (asserted both ways). D2 rule 4c (phantom tie) applies only
   * when 'none'.
   */
  leagueOvertime: 'none' | 'sudden-victory' | 'shootout';
  /** Every string the engine prints. SCVAL's are the original BYLAW_CITATIONS, verbatim (golden-gated). */
  citations: {
    points: string;
    /** The points rule's short cite, inside the cross-check's place label ('Art. VI §2' for SCVAL, verbatim). */
    pointsShort: string;
    order: string;
    doubleRoundRobin: string;
    overtime: string;
    coChampions: string;
    stages: Readonly<Partial<Record<TiebreakStage, string>>>;
    /** MCAL only: the incomplete-schedule rule, footnoted, never applied automatically. */
    incomplete?: string;
  };
  /** Shown when ≥2 teams are level on points for 1st AFTER the league's regular phase. */
  coChampionsLabel: string;
  /** Appended after a straddling union label ('— Article VI §7 decides it with a coin flip'). '' = never needed. */
  unresolvedSuffix: string;
}

export interface LadderRung {
  divisions: '*' | readonly DivisionId[];
  /** Inclusive; 99 = "and below". */
  places: readonly [number, number];
  status: PlayoffStatus;
  /** Projection label (was PLAYOFF_STATUS_LABELS). */
  label: string;
  /** Lower-case union tail (was OUTCOME_PHRASES). */
  phrase: string;
  /** Table badge (was STATUS_BADGE). */
  badge: string;
  /** Legend sentence (was statusLabel()); '{date}' → shortDate(first pairing date of the league). */
  legend: string;
}

export interface PairingConfig {
  id: string;
  date: string;
  time: string | null;
  seats: readonly [{ division: DivisionId; place: number }, { division: DivisionId; place: number }];
  seatLabels: readonly [string, string];
  host: 0 | 1 | null;
  isPlayIn: boolean;
  label: string;
  /** Postseason tag kind given to a contest that matches this pairing. */
  tag: 'scval-crossover' | 'bval-play-in';
}

export interface TournamentRoundConfig {
  id: TournamentGame['id'];
  round: TournamentGame['round'];
  date: string;
  time: string;
  optional: boolean;
  /** Written pairing rule, rendered verbatim. */
  pairing: string;
}

export type PostseasonConfig =
  | {
      kind: 'ccs-ladder';
      autoBerths: number;
      ladder: readonly LadderRung[];
      pairings: readonly PairingConfig[];
      /** The league's qualification rule sentence (rendered on /playoffs and /about). */
      citation: string;
    }
  | {
      kind: 'league-tournament';
      name: string;                       // 'MCAL tournament'
      qualifiers: number;                 // 6
      byes: readonly number[];            // [1, 2]
      ladder: readonly LadderRung[];
      rounds: readonly TournamentRoundConfig[];
      finalSite: { slug: TeamSlug; label: string };
      lastSpot: { place: number; rule: 'play-in-unless-h2h-sweep'; host: 'highest-draw-number' };
      citations: { format: string; seeding: string; semifinal: string; lastSpot: string; qualifiersConflict: string };
      titleNote: string;
      sourceUrl: string;
    }
  | {
      kind: 'unbracketed-tournament';
      name: string;                       // 'Super Regional'
      /** Places 1..qualifiers qualify by the written rule (not a projection of who will play). */
      qualifiers: number;                 // 6
      ladder: readonly LadderRung[];
      /** The event's published dates, inclusive. */
      dates: { first: string; last: string };
      citations: { qualification: string; format: string; seeding: string; eligibility: string; noFurtherPath: string };
      /** One paragraph, rendered wherever a reader would look for a bracket. */
      note: string;
      sourceUrl: string;
    }
  | {
      /**
       * The section holds no playoffs and the league no tournament (the Sunset: CIF-SS Blue Book 2026-27
       * Bylaws 2011.1 and 3500.2). One rung [1, 99] with status 'no-postseason', so every standings row
       * still has a status and a label; readers suppress the ladder band and line by this kind, not by an
       * empty ladder, and a team's postseason line is `note` (never "no results").
       */
      kind: 'no-postseason';
      ladder: readonly LadderRung[];
      /** One paragraph, rendered on /playoffs#<id> and as each team's postseason line. */
      note: string;
      citations: { noPlayoffs: string };
      /** The source link's words ('CIF-SS Blue Book 2026-27'), so no reader templates a document name. */
      sourceLabel: string;
      sourceUrl: string;
    }
  | {
      /**
       * The section's own playoffs, which no league table qualifies a team for except at one point: the San
       * Diego Section (Green Book 2026-27 Bylaw 2000.1: Open 8, Division I 12, Division II 12, placed by the
       * Commissioner from the Section's power rankings; a designated league champion, not co-champions, is
       * guaranteed at least a play-in game). No bracket and no seed projection is drawn.
       */
      kind: 'section-playoffs';
      name: string;                       // 'San Diego Section playoffs'
      /** The playoffs' published dates, inclusive (Master Calendar: Nov 2–12, finals Nov 14). */
      dates: { first: string; last: string };
      /** The one sentence a home lead, a PostseasonCard or a team page prints for the playoffs (never 'top N'). */
      qualificationLine: string;
      /** The playoff divisions and their field sizes, in bracket order. */
      divisions: readonly { name: string; teams: number }[];
      /**
       * Each member's 2026 playoff division, 'I' or 'II' (the Section's 2026 Divisions sheet, dated
       * 2025-12-23). Open Division teams are drawn from Division I at the end of the regular season, so no
       * team is 'Open' here. Keys are exactly the league's slugs: lib/teams.ts cannot be imported here, so
       * assertLeagues checks the count and the values and tests/teams.test.ts checks the keys.
       */
      playoffDivisionOf: Readonly<Record<TeamSlug, 'I' | 'II'>>;
      ladder: readonly LadderRung[];
      /** `seeding` is paraphrased: no reader may quote Bylaw 2000.1's play-in sentence (SEED_CLAIM). */
      citations: { qualification: string; seeding: string; format: string; roundDates: string };
      /** One paragraph, rendered wherever a reader would look for a bracket. */
      note: string;
      sourceLabel: string;
      sourceUrl: string;
      powerRankingsUrl: string;
    };

/** Ordered phase steps. 'data' = SCVAL's legacy formula; 'league-play' = max(last division leaguePlay.last, last league game of the league). */
export interface PhaseStep { phase: SeasonPhase; through: string | 'data' | 'league-play' }

export interface LeagueConfig {
  id: LeagueId;
  sectionId: SectionId;
  name: string;
  shortName: string;
  /**
   * Plain words for the league card: where its schools are ('Chico, Corning, Susanville, Davis and Fair
   * Oaks'). Was `region`, renamed when RegionId (NorCal/SoCal) arrived, so the word means one thing in
   * league config.
   */
  cities: string;
  /**
   * Where the league's membership and division alignment come from, as the object of "comes from …" in the
   * /teams description, which groups these into one sentence: 'its official schedule' (SCVAL, BVAL, PCAL,
   * MCAL), 'MaxPreps’ table and league flag' (EAL), 'MaxPreps’ 2024-25 and 2025-26 Sunset tables' (Sunset),
   * 'the CIF-SDS 2026-27 League Alignment' (the San Diego leagues).
   */
  alignmentSource: string;
  officialUrl: string;
  links: readonly { label: string; href: string }[];
  sblive: { leagueSlugs: readonly string[]; backfill: boolean };
  /** League-scoped grid tokens → slug (never fed to the global resolver). */
  officialCodes: Readonly<Record<string, TeamSlug>>;
  /** League-scoped grid spellings that are ambiguous statewide → slug. */
  officialNames: Readonly<Record<string, TeamSlug>>;
  /** Grid names that are not varsity teams; their fixtures are dropped silently, logged once. */
  withdrawnNames: readonly string[];
  /**
   * Where the league's membership needs a sentence of its own, rendered under the league's heading wherever
   * its schools are listed: the EAL (Davis and Bella Vista are Sac-Joaquin schools) and the Sunset (a field
   * hockey grouping, not the all-sports Sunset League). null = nothing to say.
   */
  membershipNote: string | null;
  divisions: readonly DivisionConfig[];
  rules: LeagueRules;
  postseason: PostseasonConfig;
  phases: readonly PhaseStep[];
  /** Dated league events for PhaseLead / KeyDates. CCS dates stay section-wide (CCS below). */
  keyDates: readonly { id: string; date: string; label: string }[];
  /**
   * A league page that posts approved schedule changes outside the bundled document (MCAL: Schedir.htm). Each run
   * fetches `url`, takes the text of the first `<td>` containing `cellMarker` (tags → spaces, `&nbsp;`/`&amp;`
   * decoded, whitespace collapsed, trimmed) and compares its sha256 with `sha256`. null = no such page.
   */
  officialChanges: { url: string; cellMarker: string; sha256: string } | null;
}

export interface DataQualityConfig {
  /** Drop every contest with this side. */
  ghostTeamIds: Readonly<Record<TeamId, string>>;
  /** Drop these contests. */
  excludedContestIds: Readonly<Record<ContestId, string>>;
  /** si.com team ids that never resolve and never backfill (JV / withdrawn). */
  sbliveIgnoredTeamIds: Readonly<Record<string, string>>;
  /** Documented and asserted never requested. */
  ignoredMaxprepsLeagueIds: Readonly<Record<string, string>>;
  /**
   * Search "not covered" entries (exact-key matches only). `reason` is printed verbatim as a whole sentence
   * (components/search/TeamFinder.tsx), so each is one: never 'inactive', 'withdrew', 'dropped' or
   * 'cancelled' for a school whose only fact is that it has no games.
   */
  notCovered: readonly { name: string; keys: readonly string[]; reason: string }[];
}

/**
 * The CCS section block (SPEC §2.1). The snapshot's `playoffs.keyDates` / `playoffs.format` copies
 * (lib/types.ts CcsPlayoffs) reuse these types, so config and snapshot cannot drift.
 */
export interface CcsConfig {
  autoQualifiers: CcsAutoQualifiers;
  ccsDivisions: readonly { name: CcsDivisionName; seeds: readonly [number, number] }[];
  keyDates: CcsKeyDates;
  highSeedHostsThrough: 'semifinals';
  bracketUrl: string;
  tournament: { id: string; division1BracketId: string; division2BracketId: string };
  pollFrom: string;
  citations: { allocation: string; change: string };
  sources: { bylaws: string; index: string; ical: string };
}

// ---------- values (SPEC §2.2, verbatim) ----------

const MP = 'https://www.maxpreps.com';

/** NorCal first: it is the default view (DEFAULT_REGION) and the reading order with JavaScript off. */
export const REGIONS = [
  { id: 'norcal', name: 'Northern California', shortName: 'NorCal' },
  { id: 'socal', name: 'Southern California', shortName: 'SoCal' },
] as const satisfies readonly RegionConfig[];

/** The view a first visit gets, and the one a page renders before any stored preference is read. */
export const DEFAULT_REGION: RegionId = 'norcal';

/** [V] the CCS Field Hockey Bylaws 2026-27 (also CCS.sources.bylaws below). */
const CCS_BYLAWS_URL = 'https://cifccs.org/sports/fh/field_hockey_bylaws_2026-27.pdf';
/** [V] the Northern Section Field Hockey Guidelines 2026-28 (the EAL's rules and its Super Regional). */
const NS_GUIDELINES_URL = 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf';
/**
 * [V] the Field Hockey excerpt of the CIF-SS Blue Book 2026-27 (Article 200; Bylaw 2011.1 "No playoffs - See
 * Bylaw 3500.2"), linked from https://cifss.org/sports/field-hockey/ (fetched 2026-10-06).
 */
const SS_BLUE_BOOK_FH_URL = 'https://cifss.org/wp-content/uploads/2026/07/Field-Hockey-2026-27-Blue-Book.pdf';
/** [V] the CIF Southern Section's field hockey page (calendar, season preview, the Blue Book excerpt). */
const SS_FIELD_HOCKEY_URL = 'https://cifss.org/sports/field-hockey/';
/** [V] the CIF San Diego Section's field hockey page (2026 Divisions, League Alignment, Green Book links). */
const SDS_FIELD_HOCKEY_URL = 'https://www.cifsds.org/sports/fh/index';
/** [V] the CIFSDS Green Book 2026-27 ("Revised June 16, 2026"), a Google Doc; Bylaw 2000.1 is Girls Field Hockey. */
const SDS_GREEN_BOOK_URL = 'https://docs.google.com/document/d/1JE9fAJPGJSnCi0r398lSJZknG54O3gZ3vSc24gPOr90/edit';
/** [V] the CIFSDS 2026-27 League Alignment workbook (field hockey blocks on the CITY, NORTH COUNTY and METRO tabs). */
const SDS_ALIGNMENT_URL = 'https://docs.google.com/spreadsheets/d/1nGxmrWBpD1-Ms1idHy-n1zHwq7D06o1vfoFC7_cGgaI/edit#gid=1838785864';
/** [V] the Section's power-rankings page (it embeds the cifsdshome.org widget the Commissioner places teams from). */
const SDS_POWER_RANKINGS_URL = 'https://www.cifsds.org/school-resources/CIFSDS_Power_Rankings';

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
    // Article 200 adopts the NFHS rules and says nothing on overtime; Sunset games have ended level (Bonita 1-1
    // Marina, Aug 18) and in overtime (Great Oak 2-1 Temecula Valley, Oct 2). No shootout rule.
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
    },
    // The start matches the other windows; the end is one week after the Nov 14 finals (OUR choice).
    seasonWindow: { start: '2026-08-01', end: '2026-11-21' },
    noChampionshipNote: null,
  },
] as const satisfies readonly SectionConfig[];

const SCVAL: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  cities: 'Santa Clara County and San Francisco',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://scval.com/fallSports/Fall_index.html',
  links: [
    { label: 'SCVAL fall sports', href: 'https://scval.com/fallSports/Fall_index.html' },
    { label: 'SCVAL Field Hockey By-Laws 2026-27 (PDF)', href: 'https://scval.com/fallSports/1%2026-27%20SCVAL%20Field%20Hockey%20By-Laws.pdf' },
  ],
  sblive: { leagueSlugs: ['4242-santa-clara-valley-de-anza', '4243-santa-clara-valley-el-camino'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: ['Wilcox', 'WILCOX', 'Wilcox Chargers', 'Wilcox High School', 'Adrian Wilcox', 'Adrian Wilcox High School'],
  membershipNote: null,
  divisions: [
    {
      id: 'de-anza', leagueId: 'scval', label: 'De Anza', searchAliases: [],
      maxprepsLeagueId: 'ea062dfe-9fb9-45c7-9839-0801993d6ac6',
      maxprepsName: 'Santa Clara Valley - De Anza', maxprepsSlug: 'santa-clara-valley--de-anza',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-09', last: '2026-10-28' },
      official: {
        source: 'scval-pdf', mode: 'live-pdf', bundledFile: null, revisionCheckUrl: null, bundledSha256: null, revisedOn: null,
        scheduleUrl: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf',
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 3, label: 'AQ line' },
    },
    {
      id: 'el-camino', leagueId: 'scval', label: 'El Camino', searchAliases: [],
      maxprepsLeagueId: '7bdfb2a7-8dde-4a21-88c9-832f1593554d',
      maxprepsName: 'Santa Clara Valley - El Camino', maxprepsSlug: 'santa-clara-valley--el-camino',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2026-09-09', last: '2026-10-28' },
      official: {
        source: 'scval-pdf', mode: 'live-pdf', bundledFile: null, revisionCheckUrl: null, bundledSha256: null, revisedOn: null,
        scheduleUrl: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 3, label: 'AQ line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    classification: 'contest-type', excludeContestTypes: [], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'legacy',
    tiebreaks: { default: ['head-to-head', 'division-wins', 'h2h-goals-against', 'h2h-goal-diff', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'zero', drawNumbers: null, leagueOvertime: 'sudden-victory',
    // ↓ VERBATIM from the original lib/season.ts BYLAW_CITATIONS (golden-gated)
    citations: {
      points: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie)',
      pointsShort: 'Art. VI §2',
      order: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (standings are the order of points)',
      doubleRoundRobin: 'Article VI §1 (double round robin; division games only count to the division record)',
      overtime: 'Article IV (one 7-minute sudden-victory period; still tied ⇒ the game ends in a tie)',
      coChampions: 'Article VI §2 (a tie at the top means co-champions)',
      stages: {
        'head-to-head': 'Article VI §3 (better head-to-head record among the tied teams)',
        'division-wins': 'Article VI §4 (greater number of wins in division play)',
        'h2h-goals-against': 'Article VI §5 (least goals given up between the tied teams)',
        'h2h-goal-diff': 'Article VI §6 (goal differential between the tied teams)',
        'coin-flip': 'Article VI §7 (coin flip — we cannot compute it, so the teams stay tied)',
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— Article VI §7 decides it with a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 7,
    citation: 'Article VII §2 (first three in each division are automatic qualifiers; fourth place plays in for the SCVAL 7th AQ; the play-in loser and both fifth-place teams go to CCS for at-large consideration)',
    // ↓ VERBATIM from the original PLAYOFF_STATUS_LABELS / OUTCOME_PHRASES / STATUS_BADGE / statusLabel()
    ladder: [
      { divisions: '*', places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: '*', places: [4, 4], status: 'play-in', label: 'Play-in game Oct 30',
        phrase: 'the Oct 30 play-in', badge: 'Play-in', legend: '4th place — play-in {date} for the SCVAL 7th berth' },
      { divisions: '*', places: [5, 5], status: 'at-large', label: 'At-large consideration',
        phrase: 'at-large consideration', badge: 'At-large', legend: '5th place — submitted to CCS for at-large consideration' },
      { divisions: '*', places: [6, 99], status: 'out', label: 'No automatic path',
        phrase: 'no automatic path', badge: 'No AQ', legend: '6th or lower — no automatic path' },
    ],
    pairings: [1, 2, 3, 4].map((seed) => ({
      id: `scval-crossover-${seed}`, date: '2026-10-30', time: null, tag: 'scval-crossover' as const,
      seats: [{ division: 'de-anza', place: seed }, { division: 'el-camino', place: seed }] as const,
      seatLabels: [`De Anza #${seed}`, `El Camino #${seed}`] as const, host: null,
      isPlayIn: seed === 4,
      // ↓ VERBATIM from the original crossoverPairings()
      label: seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
    })),
  },
  phases: [
    { phase: 'regular', through: 'data' },        // the original formula (§5.9)
    { phase: 'crossover', through: '2026-10-30' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last SCVAL league games' },
    { id: 'crossover', date: '2026-10-30', label: 'SCVAL crossover and 4th-place play-in' },
  ],
  officialChanges: null,
};

const BVAL_BYLAWS = 'BVAL Field Hockey By-Laws (rev. 8/13/24)';

const BVAL: LeagueConfig = {
  id: 'bval', sectionId: 'ccs',
  name: 'Blossom Valley Athletic League', shortName: 'BVAL',
  cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://bval.org/field-hockey/',
  links: [
    { label: 'BVAL field hockey', href: 'https://bval.org/field-hockey/' },
    { label: 'BVAL Field Hockey By-Laws (rev. 8/13/24)', href: 'https://docs.google.com/document/d/1sI0CxQMZ0m8T6tJWt6Cd3btjTNcGwAgz/edit' },
  ],
  sblive: { leagueSlugs: ['4175-blossom-valley-mount-hamilton'], backfill: true },
  officialCodes: { WG: 'willow-glen' },
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'mt-hamilton', leagueId: 'bval', label: 'Mt. Hamilton', searchAliases: ['Mount Hamilton', 'Mt Hamilton'],
      maxprepsLeagueId: '8ec791a6-463e-4313-86de-1bd02671054a',
      maxprepsName: 'Blossom Valley - Mount Hamilton', maxprepsSlug: 'blossom-valley--mount-hamilton',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-17', last: '2026-10-30' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: 'data/official/bval-2026.json',
        scheduleUrl: 'https://docs.google.com/document/d/150BDI14JosnaB71NoTwYyLp1AFfXSVXb/edit',
        revisionCheckUrl: 'https://drive.google.com/uc?export=download&id=150BDI14JosnaB71NoTwYyLp1AFfXSVXb',
        bundledSha256: '2b0eb69347cdb0e6aa57da94213db50bd5eadeccfeed96370b5c8106ef2cb172',
        revisedOn: '9/20/26',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'AQ line' },
      ladderLine: { after: 3, label: 'AQ line' },
    },
    {
      id: 'santa-teresa', leagueId: 'bval', label: 'Santa Teresa', searchAliases: [],
      maxprepsLeagueId: '7c899b2d-07fa-4664-976c-a4f57d12eeec',
      maxprepsName: 'Blossom Valley - Santa Teresa', maxprepsSlug: 'blossom-valley--santa-teresa',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-18', last: '2026-10-30' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: 'data/official/bval-2026.json',
        scheduleUrl: 'https://docs.google.com/document/d/1CrK6oOd5_Lu91rHAfpIlMtqaxMhLxSwD/edit',
        revisionCheckUrl: 'https://drive.google.com/uc?export=download&id=1CrK6oOd5_Lu91rHAfpIlMtqaxMhLxSwD',
        bundledSha256: '5730fb6089f31d94abd2ebe7a3073114f3867eef731391c8dd113557b79d7303',
        revisedOn: '9/22/26',
      },
      maxprepsTeamCount: 5, maxprepsMissing: ['prospect'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps’ Santa Teresa table leaves out Prospect and counts four of Prospect’s official league games as non-league, so its records here differ from ours. This table is computed from BVAL’s official schedule.',
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Play-in host' },
      ladderLine: { after: 1, label: 'Play-in host' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['head-to-head', 'division-wins', 'h2h-goal-diff', 'division-goals-against', 'coin-flip'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'sudden-victory',
    citations: {
      points: `${BVAL_BYLAWS} §6a (3 points for a win, 1 for a tie)`,
      pointsShort: 'BVAL by-laws §6a',
      order: `${BVAL_BYLAWS} §6a (division placement is the order of team points)`,
      doubleRoundRobin: 'BVAL 2026-27 schedules (home-and-home double round robin; division games only)',
      overtime: `${BVAL_BYLAWS} §1a (one 7-minute 7v7 sudden-victory period; still tied ⇒ the game ends in a tie)`,
      coChampions: `${BVAL_BYLAWS} §6a (“If there is a tie, both teams shall be declared Division Champions”)`,
      stages: {
        'head-to-head': `${BVAL_BYLAWS} §6b (head-to-head; with three or more tied, a 3-1-0 mini-league among them)`,
        'division-wins': `${BVAL_BYLAWS} §6c (more division wins)`,
        'h2h-goal-diff': `${BVAL_BYLAWS} §6d (head-to-head goal differential among the tied teams)`,
        'division-goals-against': `${BVAL_BYLAWS} §6e (fewest goals allowed in division play)`,
        'coin-flip': `${BVAL_BYLAWS} §6f (coin flip — we cannot compute it, so the teams stay tied)`,
      },
    },
    coChampionsLabel: 'Division co-champions',
    unresolvedSuffix: '— BVAL By-Laws §6f decides it with a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BVAL_BYLAWS} §7a (Mt. Hamilton 1st-3rd are BVAL #1-#3; Mt. Hamilton 4th plays at the Santa Teresa champion for BVAL #4)`,
    ladder: [
      { divisions: ['mt-hamilton'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier (BVAL #1-#3)' },
      { divisions: ['mt-hamilton'], places: [4, 4], status: 'play-in', label: 'Play-in game Oct 31',
        phrase: 'the Oct 31 play-in', badge: 'Play-in',
        legend: '4th place — plays at the Santa Teresa champion {date}, 11 AM, for BVAL’s 4th berth' },
      { divisions: ['mt-hamilton'], places: [5, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '5th or lower — no automatic-berth route (at-large is the CCS committee’s call)' },
      { divisions: ['santa-teresa'], places: [1, 1], status: 'play-in', label: 'Hosts the play-in Oct 31',
        phrase: 'hosting the Oct 31 play-in', badge: 'Play-in host',
        legend: 'Champion — hosts Mt. Hamilton #4 {date}, 11 AM, for BVAL’s 4th berth' },
      { divisions: ['santa-teresa'], places: [2, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '2nd or lower — no automatic-berth route (at-large is the CCS committee’s call)' },
    ],
    pairings: [{
      id: 'bval-play-in', date: '2026-10-31', time: '11:00', tag: 'bval-play-in',
      seats: [{ division: 'santa-teresa', place: 1 }, { division: 'mt-hamilton', place: 4 }],
      seatLabels: ['Santa Teresa #1', 'Mt. Hamilton #4'], host: 0, isPlayIn: true,
      label: 'Mt. Hamilton #4 at Santa Teresa #1 — play-in for BVAL’s 4th automatic CCS berth',
    }],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'play-in', through: '2026-10-31' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-30', label: 'Last BVAL league games' },
    { id: 'play-in', date: '2026-10-31', label: 'BVAL play-in, 11 AM' },
  ],
  officialChanges: null,
};

const PCAL_RULES = 'PCAL Sports Rules — Field Hockey (Jan 2022)';
const PCAL_BYLAWS = 'PCAL By-laws (rev. May 2025)';

const PCAL: LeagueConfig = {
  id: 'pcal', sectionId: 'ccs',
  name: 'Pacific Coast Athletic League', shortName: 'PCAL',
  cities: 'Monterey County and Hollister',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://pcalathletics.org/field-hockey/',
  links: [
    { label: 'PCAL field hockey', href: 'https://pcalathletics.org/field-hockey/' },
    { label: 'PCAL Sports Rules — Field Hockey (PDF)', href: 'https://pcalathletics.org/wp-content/pdf/Sports-Rules-Field-Hockey-Jan-2022.pdf' },
    { label: 'PCAL By-laws (PDF)', href: 'https://pcalathletics.org/wp-content/pdf/PCAL-By-Laws.Final_.Rev-May-2025-2.pdf' },
  ],
  sblive: { leagueSlugs: ['4231-pacific-coast-gabilan', '4232-pacific-coast-mission'], backfill: true },
  officialCodes: {
    CAR: 'carmel', GRE: 'greenfield', HOL: 'hollister', MON: 'monterey', SAL: 'salinas',
    CAT: 'santa-catalina', SCAT: 'santa-catalina', 'CAT/YOR': 'santa-catalina', STE: 'stevenson',
  },
  officialNames: {},
  withdrawnNames: ['York', 'YORK', 'YOR', 'York Falcons', 'York School'],
  membershipNote: null,
  divisions: [
    {
      // One division. Its MaxPreps name is DATA ONLY and never rendered.
      // 'Pacific Coast - Mission' (6e1f97d4-…) is NOT configured: standings HTTP 400, no teams.
      id: 'pcal', leagueId: 'pcal', label: 'PCAL', searchAliases: ['Pacific Coast Athletic League'],
      maxprepsLeagueId: '50ac53cd-e46f-4df9-824b-5a954c583b95',
      maxprepsName: 'Pacific Coast - Gabilan', maxprepsSlug: 'pacific-coast--gabilan',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-02', last: '2026-10-29' },
      official: {
        source: 'pcal-pdf', mode: 'bundled', bundledFile: 'data/official/pcal-2026.json',
        scheduleUrl: 'https://pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf',
        revisionCheckUrl: 'https://pcalathletics.org/wp-content/pdf/PCAL-Field-Hockey.2026.FINAL_.pdf',
        bundledSha256: '6b99480a4a1b44b0eea2c352e81e93e14ca97e44cbcced0c131f188546b3d224',
        revisedOn: null,
      },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'MaxPreps is missing some of PCAL’s official league games and dates others differently, so its PCAL records differ from ours. This table is computed from PCAL’s official schedule.',
      home: { miniRows: 7, lineAfter: 2, lineLabel: 'AQ line' },
      ladderLine: { after: 2, label: 'AQ line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: {
      // §23.3 applies only "for an Automatic Qualifier berth": a tie whose points bucket starts at 3rd or lower is left level.
      default: ['no-rule'],
      byBucketStart: {
        // co-/tri-champions (§23.3.1, §23.3.2): three-way H2H, then two-way H2H (partition-restart), then vs lower-placed
        1: ['head-to-head', 'record-vs-lower-placed', 'ccs-points'],
        // tie for 2nd (§23.3.3): H2H (multi-team per §23.3.2 a-b), vs higher-placed from the champion down, vs lower-placed
        2: ['head-to-head', 'record-vs-higher-placed', 'record-vs-lower-placed', 'ccs-points'],
      },
    },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${PCAL_RULES} §1.7 (3 points for a win, 1 for a tie)`,
      pointsShort: 'PCAL Sports Rules §1.7',
      order: `${PCAL_RULES} §1.7 (standings are the order of points)`,
      doubleRoundRobin: `${PCAL_RULES} §1.4 (one division; the 2026 schedule is a double round robin)`,
      overtime: `${PCAL_RULES} §1.6.4 (overtime applies to single round robin or bracket play; a tie is 1 point either way)`,
      coChampions: `${PCAL_BYLAWS} §22.3 (two teams level at the top are co-champions; three are tri-champions)`,
      stages: {
        'head-to-head': `${PCAL_BYLAWS} §23.3 (head-to-head in league contests; three level: three-way, then two-way)`,
        'record-vs-lower-placed': `${PCAL_BYLAWS} §23.3.1(b) / §23.3.3(c) (record against each lower-placed team, in standings order)`,
        'record-vs-higher-placed': `${PCAL_BYLAWS} §23.3.3 (record against each higher-placed team, from the champion down)`,
        'ccs-points': `${PCAL_BYLAWS} §23.3 (the CCS-points step applies only to sports seeded by CCS points; then a coin flip or blind draw — we cannot compute either, so the teams stay tied)`,
        'no-rule': 'PCAL’s by-laws break ties only for the two CCS places; this tie is left as it is',
      },
    },
    coChampionsLabel: 'Co-champions (tri-champions when three are level)',
    unresolvedSuffix: '— PCAL By-laws §23.3 ends in a coin flip or blind draw by the Commissioner',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${PCAL_RULES} §1.8.1 (the top two of the final round-robin standings are automatic CCS qualifiers)`,
    ladder: [
      { divisions: '*', places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: '*', places: [3, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '3rd or lower — no automatic-berth route; may apply for at-large (PCAL By-laws §23.4)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-29', label: 'Last PCAL league games' },
    { id: 'last-allowed', date: '2026-10-31', label: 'Last allowed PCAL league date' },
  ],
  officialChanges: null,
};

const MCAL_HB = 'MCAL Field Hockey Handbook (rev. 10/19/24)';
const MCAL_TB = 'MCAL Tie-Breaking Criteria (rev. 3/26)';

const MCAL: LeagueConfig = {
  id: 'mcal', sectionId: 'ncs',
  name: 'Marin County Athletic League', shortName: 'MCAL',
  cities: 'Marin County, San Francisco and Berkeley',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://www.mcalsports.org/FieldHockey.htm',
  links: [
    { label: 'MCAL field hockey', href: 'https://www.mcalsports.org/FieldHockey.htm' },
    { label: 'MCAL field hockey handbook (PDF)', href: 'https://www.mcalsports.org/Sports_handbook/FieldHockeyHB.pdf' },
    { label: 'MCAL tie-breaking criteria (PDF)', href: 'https://www.mcalsports.org/TiebreakingCriteria.pdf' },
    { label: 'MCAL 2026 play-off sheet (PDF)', href: 'https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_26.pdf' },
  ],
  sblive: { leagueSlugs: ['4212-marin-county'], backfill: true },
  officialCodes: {
    AW: 'archie-williams', R: 'redwood', T: 'tamalpais', B: 'berkeley', LW: 'lick-wilmerding',
    U: 'university-sf', MC: 'marin-catholic', CSH: 'convent-sacred-heart', CVS: 'convent-sacred-heart', MA: 'marin-academy',
  },
  officialNames: { University: 'university-sf', UNIVERSITY: 'university-sf', 'Convent & Stuart Hall': 'convent-sacred-heart' },
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'marin-county', leagueId: 'mcal', label: 'MCAL', searchAliases: ['Marin County', 'Marin County Athletic League'],
      maxprepsLeagueId: 'c15255d5-c2ad-49f5-9afb-cf4ba289875c',
      maxprepsName: 'Marin County', maxprepsSlug: 'marin-county',
      expectedTeams: 9, gamesPerTeam: 16,
      leaguePlay: { first: '2026-08-24', last: '2026-10-22' },
      official: {
        source: 'mcal-pdf', mode: 'bundled', bundledFile: 'data/official/mcal-2026.json',
        scheduleUrl: 'https://www.mcalsports.org/Schedules/Fall/FieldHockey_26.pdf',
        revisionCheckUrl: 'https://www.mcalsports.org/Schedules/Fall/FieldHockey_26.pdf',
        bundledSha256: 'aee4894e665be7aebbe37dcb9c14db37dcc5c177dfe7adca2586459eb4370319',
        revisedOn: null,
      },
      maxprepsTeamCount: 9, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps orders the MCAL table by winning percentage; MCAL orders it by points, so MaxPreps’ places differ from ours. After Oct 22, MaxPreps also counts MCAL tournament games in its league records; ours never do.',
      home: { miniRows: 7, lineAfter: 6, lineLabel: 'Tournament line' },
      ladderLine: { after: 6, label: 'Tournament line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    classification: 'official-fixtures', excludeContestTypes: [2, 4],
    postseasonFrom: '2026-10-23', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['h2h-win-pct', 'record-above-tie', 'draw-number'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip',
    drawNumbers: {
      'archie-williams': 1, redwood: 2, tamalpais: 3, berkeley: 4, 'lick-wilmerding': 5,
      'university-sf': 6, 'marin-catholic': 7, 'convent-sacred-heart': 8, 'marin-academy': 9,
    },
    leagueOvertime: 'none',
    citations: {
      points: `${MCAL_HB} §7a (3 points for a win, 1 for a tie)`,
      pointsShort: 'MCAL Handbook §7a',
      order: `${MCAL_HB} §7a (“The MCAL placement will be the order of team points”)`,
      doubleRoundRobin: `${MCAL_HB} §8a (double round robin, 16 league games each)`,
      overtime: 'MCAL General Rules (no regular-season overtime; ties stand)',
      coChampions: `${MCAL_HB} §7a (equal points: co-MCAL Champions)`,
      stages: {
        'h2h-win-pct': `${MCAL_TB} step 1 (head-to-head winning percentage)`,
        'record-above-tie': `${MCAL_TB} step 2 (record against the teams above the tie)`,
        'draw-number': `${MCAL_TB} step 3 (spring draw numbers, lowest wins: AW 1, R 2, T 3, B 4, LW 5, U 6, MC 7, CSH 8, MA 9)`,
        'play-in': `${MCAL_TB} (final play-off spot: a play-in game on Fri Oct 23 unless one team won the head-to-head 2-0; the higher draw number hosts)`,
      },
      incomplete: 'MCAL General Rules (with an incomplete schedule, winning percentage replaces points)',
    },
    coChampionsLabel: 'MCAL co-champions',
    unresolvedSuffix: '— a play-in on Fri Oct 23 decides it (MCAL Tie-Breaking Criteria)',
  },
  postseason: {
    kind: 'league-tournament', name: 'MCAL tournament', qualifiers: 6, byes: [1, 2],
    ladder: [
      { divisions: '*', places: [1, 2], status: 'bye', label: 'Semifinal bye',
        phrase: 'a semifinal bye', badge: 'Bye', legend: 'Places 1-2 — bye to the semifinals, Wed Oct 28' },
      { divisions: '*', places: [3, 6], status: 'tournament', label: 'MCAL tournament',
        phrase: 'an MCAL tournament place', badge: 'Top 6', legend: 'Places 3-6 — quarterfinal Mon Oct 26 (3 hosts 6, 4 hosts 5)' },
      { divisions: '*', places: [7, 99], status: 'below-line', label: 'Below the tournament line',
        phrase: 'below the tournament line', badge: 'Below line', legend: '7th or lower — outside the six-team MCAL tournament' },
    ],
    rounds: [
      { id: 'play-in', round: 'play-in', date: '2026-10-23', time: '16:00', optional: true,
        pairing: 'Only if two teams are level for 6th and neither won both meetings; the higher draw number hosts' },
      { id: 'qf-1', round: 'quarterfinal', date: '2026-10-26', time: '16:00', optional: false, pairing: '5 at 4' },
      { id: 'qf-2', round: 'quarterfinal', date: '2026-10-26', time: '16:00', optional: false, pairing: '6 at 3' },
      { id: 'sf-1', round: 'semifinal', date: '2026-10-28', time: '16:00', optional: false, pairing: 'Lowest-ranked remaining seed at 1' },
      { id: 'sf-2', round: 'semifinal', date: '2026-10-28', time: '16:00', optional: false, pairing: 'Highest-ranked remaining seed of 3-6 at 2' },
      { id: 'final', round: 'final', date: '2026-10-30', time: '16:00', optional: false, pairing: 'Semifinal winners, at Tamalpais' },
    ],
    finalSite: { slug: 'tamalpais', label: 'Tamalpais' },
    lastSpot: { place: 6, rule: 'play-in-unless-h2h-sweep', host: 'highest-draw-number' },
    citations: {
      format: 'MCAL 2026 Field Hockey Play-off sheet (six schools; seeds 1 and 2 have byes)',
      seeding: `${MCAL_HB} §7a and §8b (seeded by point total)`,
      semifinal: 'MCAL 2026 Play-off sheet (lowest-ranked remaining seed at #1, highest-ranked remaining of 3-6 at #2; confirmed by the 2025 bracket)',
      lastSpot: `${MCAL_TB} (6th place: a play-in unless one team won the head-to-head 2-0; the higher draw number hosts. A three-way tie for 5th: draw numbers place the 5th seed and the other two play in, hosted by the winner of their earlier meeting)`,
      qualifiersConflict: `${MCAL_HB} §8b says the top four qualify; the 2026 play-off sheet (and the 2025 tournament) use six. This site follows the 2026 sheet.`,
    },
    titleNote: 'The regular-season points leader is MCAL Champion. If a different team wins the tournament, it also receives a pennant.',
    sourceUrl: 'https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_26.pdf',
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-10-30' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-22', label: 'Last MCAL league games' },
    { id: 'play-in', date: '2026-10-23', label: 'MCAL play-in (only if needed)' },
    { id: 'quarterfinals', date: '2026-10-26', label: 'MCAL quarterfinals' },
    { id: 'semifinals', date: '2026-10-28', label: 'MCAL semifinals' },
    { id: 'final', date: '2026-10-30', label: 'MCAL final at Tamalpais' },
  ],
  // Approved changes are posted here, not in the schedule PDF (DOSSIER-NCS). Hash of the 2026-10-02 cell text:
  // "Girls Field Hockey: Oct 12: Marin Catholic vs Lick Wilmerding moved to Oct 15 (Varsity at 4:30pm and JV at 5:15pm) Sept 24: Lick Wilmerding vs Berkeley moved to Sept. 29. (Varsity at 4:30pm and JV at 5:30pm at City College of San Francisco)"
  officialChanges: {
    url: 'https://www.mcalsports.org/Schedir.htm',
    cellMarker: 'Girls Field Hockey:',
    sha256: 'b1e5c523b251021522a77ed459d5d7035fe0c9100cb2b727f1ea63c467566b76',
  },
};

const NS_FH = 'CIF Northern Section Field Hockey Guidelines 2026-28';
// NS_GUIDELINES_URL (above) is the same document's PDF.

const EAL: LeagueConfig = {
  id: 'eal', sectionId: 'ns',
  name: 'Eastern Athletic League', shortName: 'EAL',
  cities: 'Chico, Corning, Susanville, Davis and Fair Oaks',
  alignmentSource: 'MaxPreps’ table and league flag',
  officialUrl: 'https://www.cifns.org/sports/fh/index',
  links: [
    { label: 'CIF Northern Section field hockey', href: 'https://www.cifns.org/sports/fh/index' },
    { label: 'Northern Section Field Hockey Guidelines 2026-28 (PDF)', href: NS_GUIDELINES_URL },
  ],
  sblive: { leagueSlugs: ['4190-eastern-athletic'], backfill: true },
  officialCodes: {},
  officialNames: {},
  // Red Bluff is still a 0-0-0 row in MaxPreps' table but is not fielding a varsity team in 2026 (Wilcox/York precedent).
  withdrawnNames: ['Red Bluff', 'RED BLUFF', 'Red Bluff High School', 'Red Bluff Spartans', 'Red Bluff Union High School'],
  membershipNote: 'Chico, Corning, Lassen and Pleasant Valley are Northern Section schools; Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL.',
  divisions: [
    {
      // One division (Guidelines §I: "All participating schools are considered to be in the same division").
      id: 'eal', leagueId: 'eal', label: 'EAL', searchAliases: ['Eastern Athletic', 'Eastern Athletic League'],
      maxprepsLeagueId: '60959b47-b0cf-4d7d-b054-d8ea140870ef',
      maxprepsName: 'Eastern Athletic', maxprepsSlug: 'eastern-athletic',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-08-24', last: '2026-10-28' },
      // No league or Section schedule exists. The umpires' grid is NOT official and is never linked or bundled.
      official: {
        mode: 'none',
        note: 'The EAL publishes no schedule or standings document of its own. Its league games are the games MaxPreps marks as league games; on 2026-10-04 all 30 of them matched, by date and home side, the 2026 league grid posted on the EAL/SRL umpires’ site (fieldhockeyumpires.org).',
      },
      // MaxPreps lists 7 rows: the six members plus Red Bluff (7 + 0 − 1 = 6).
      maxprepsTeamCount: 7, maxprepsMissing: [],
      maxprepsExtraRows: {
        '4d3da788-bbe2-4ab9-b854-d95aa9786cda': 'Red Bluff: a 0-0-0 row with no games; not fielding a varsity team in 2026',
      },
      reportedTrust: 'records-only',
      knownCause: 'MaxPreps orders the EAL table by winning percentage; the EAL decides its title on points (Northern Section Field Hockey Guidelines §VII.C.2) and publishes no standings, so MaxPreps’ places can differ from ours. MaxPreps also lists Red Bluff, which is not fielding a varsity team in 2026.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      // Every team is inside the Super Regional's top six, so there is no line to draw.
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'title', gamesWord: 'league',
    // No official document: MaxPreps' league flag, as for SCVAL. 5 = the 2025 EAL tournament's contestType.
    classification: 'contest-type', excludeContestTypes: [2, 4, 5],
    postseasonFrom: '2026-10-30', leagueGameOverrides: [],
    matcher: 'two-phase',
    // The Guidelines use points only for the title and break no tie in the league table; a tie for
    // first means co-champions (§VII.C).
    tiebreaks: { default: ['no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'shootout',
    citations: {
      points: `${NS_FH} §VII.C.2 (to decide the league championship: 3 points for a win, 1 for a tie, 0 for a loss)`,
      pointsShort: 'NS Guidelines §VII.C.2',
      order: `${NS_FH} §VII.C.2 (points decide the league championship; the Guidelines give no rule for ordering the league table — the §III.E.1 Super Regional seeding criteria are not applied here — so this site orders the whole table by the same points)`,
      doubleRoundRobin: `${NS_FH} §III.A.1 (double round robin; in 2026 six teams play ten league games each)`,
      overtime: `${NS_FH} §VII.E.4 (varsity: a 10-minute sudden-victory period, then 1 v 1s until there is a winner, so a league game never ends level)`,
      coChampions: `${NS_FH} §VII.C (“In the case of a tie, duplicate awards will be given”)`,
      stages: {
        'no-rule': 'The Northern Section’s Field Hockey Guidelines break no tie in the league table: a tie for first means co-champions (§VII.C), and the Super Regional seeding criteria (§III.E.1) are the coaches’ to apply, so this tie is left as it is',
      },
    },
    coChampionsLabel: 'EAL co-champions',
    unresolvedSuffix: '',
  },
  postseason: {
    kind: 'unbracketed-tournament', name: 'Super Regional', qualifiers: 6,
    dates: { first: '2026-10-30', last: '2026-10-31' },
    ladder: [
      { divisions: '*', places: [1, 6], status: 'tournament', label: 'Super Regional place',
        phrase: 'a Super Regional place', badge: 'Top 6', legend: 'Places 1-6 — the Super Regional, Oct 30-31 (the top six qualify)' },
      { divisions: '*', places: [7, 99], status: 'below-line', label: 'Outside the top six',
        phrase: 'outside the top six', badge: 'Below line', legend: '7th or lower — outside the Super Regional’s top six' },
    ],
    citations: {
      qualification: `${NS_FH} §III.E.1 and §IV (the top six EAL/SRL schools compete; varsity only)`,
      format: `${NS_FH} §IV (“The format will be determined at the preseason tournament meeting”; none is published)`,
      seeding: `${NS_FH} §III.E.1 (“Seeding will be based on League record, Head-to-Head Goal differential (Capped at six (6) per game, Goal against, Coin flip.”) — quoted as written; this site does not apply it`,
      eligibility: `${NS_FH} §VII.J (a school without all its scores reported by noon the day after the last contest of the season is not eligible for the playoffs)`,
      noFurtherPath: `${NS_FH} §V and §VI (NorCal and State qualification: “Not Applicable”)`,
    },
    note: 'The Northern Section’s field hockey postseason is the Super Regional, Oct 30–31: the top six schools qualify. The coaches set its format and seeding, its site is to be announced, and no bracket is published yet. There is no NorCal or State path.',
    sourceUrl: NS_GUIDELINES_URL,
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-10-31' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last EAL league games' },
    { id: 'super-regional', date: '2026-10-30', label: 'Super Regional, Oct 30–31 (site to be announced)' },
  ],
  officialChanges: null,
};

// ---------- Southern California (DESIGN-socal §2.1; research-cifss.md, research-cifsds.md) ----------
//
// No SoCal league publishes a schedule, standings or a points rule, so all four are 'site' leagues: the
// table is this site's 3-1-0 points, and every string below says so instead of citing a league rule.

/** The three citations every 'site' league shares: no league document awards points or orders the table. */
const SITE_POINTS_CITATIONS = {
  points: 'this site’s 3-1-0 points (the league publishes no points rule)',
  pointsShort: 'site 3-1-0',
  order: 'no league document orders the table; this site orders it by its own 3-1-0 points',
} as const;

const SUNSET: LeagueConfig = {
  // A field-hockey-only grouping, NOT the all-sports Sunset League (Orange County: Huntington Beach, Edison,
  // Fountain Valley, Marina, Los Alamitos, Newport Harbor, Corona del Mar [U]): hence the name, which the copy
  // rules keep apart from "Sunset League" (DESIGN-socal §2.4). Membership [V]: the ten schools of MaxPreps'
  // 2024-25 (c538c7d2-…) and 2025-26 (1ab67ce6-…) Sunset tables; no Sunset site, bylaws, schedule or standings
  // document was found [U: not found] (research-cifss.md §2).
  id: 'sunset', sectionId: 'ss',
  name: 'Sunset Field Hockey League', shortName: 'Sunset',
  cities: 'Huntington Beach, Newport Beach, Fountain Valley, Temecula, La Verne and West Hills',
  alignmentSource: 'MaxPreps’ 2024-25 and 2025-26 Sunset tables',
  officialUrl: SS_FIELD_HOCKEY_URL,
  links: [
    { label: 'CIF Southern Section field hockey', href: SS_FIELD_HOCKEY_URL },
    { label: 'CIF-SS Blue Book 2026-27, Field Hockey (PDF)', href: SS_BLUE_BOOK_FH_URL },
  ],
  // si.com's Sunset table (also on scores.cifss.org) holds eight of the ten plus two 0-0 rows (Westlake, Los
  // Alamitos); its Chaparral and Temecula Valley sit in 4245-southwestern, harvested by name only via TEAMS.
  sblive: { leagueSlugs: ['4249-sunset'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote:
    'The Sunset here is a field hockey grouping of ten Southern Section schools in Orange, Los Angeles and Riverside counties, not the all-sports Sunset League.',
  divisions: [
    {
      id: 'sunset', leagueId: 'sunset', label: 'Sunset', searchAliases: ['Sunset'],
      // MaxPreps' 2026-27 Sunset table: five rows (Great Oak, Temecula Valley, Bonita, Chaminade, Chaparral), ordered
      // by conference winning percentage; the five Orange County schools carry the zero-GUID league this season.
      maxprepsLeagueId: 'aa46adc4-c188-4e3b-b5fd-857064176297',
      maxprepsName: 'Sunset', maxprepsSlug: 'sunset',
      // No fixed schedule: the 45 pairs meet {2: 9, 1: 30, 0: 6} times (inventory 2026-10-06), so no "of N".
      expectedTeams: 10, gamesPerTeam: null,
      // First: Bonita–Marina and Chaminade–Fountain Valley, Aug 18 (the first games between two of the ten).
      // Last: the Section's last allowable contest, Sat Oct 31 (Blue Book Bylaw 2006; 2026-27 Sports Calendar).
      leaguePlay: { first: '2026-08-18', last: '2026-10-31' },
      official: {
        mode: 'none',
        note: 'No Sunset document exists that we could find: no league site, bylaws, schedule or standings. The ten teams here are the ten in MaxPreps’ Sunset table in 2024-25 and 2025-26. For 2026-27, MaxPreps’ table lists five of them and assigns the five Orange County schools to no league; si.com’s table (also shown on the Southern Section’s scores site) lists eight, putting Chaparral and Temecula Valley in a separate table. A Sunset game here is a game between two of the ten that MaxPreps marks as a league game, so teams play different numbers.',
      },
      // 5 rows + the 5 Orange County schools MaxPreps assigns to no league − 0 = 10.
      maxprepsTeamCount: 5,
      maxprepsMissing: ['edison', 'fountain-valley', 'huntington-beach', 'marina', 'newport-harbor'],
      maxprepsExtraRows: {},
      reportedTrust: 'informational',
      knownCause: 'MaxPreps’ Sunset table lists five of the ten teams and orders them by winning percentage. This site orders all ten by 3-1-0 points. si.com marks more games as league games than MaxPreps does, so its Sunset records differ from ours.',
      home: { miniRows: 10, lineAfter: null, lineLabel: null },
      // No postseason, so no line to draw.
      ladderLine: null,
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'league',
    // MaxPreps' league flag between two of the ten, as for the EAL; tournament (2) and postseason (4) rows never count.
    classification: 'contest-type', excludeContestTypes: [2, 4],
    postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    // 'none' keeps D2 rule 4c (a phantom si.com 0-0 tie) and records a level game as a tie: no rule says otherwise.
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      ...SITE_POINTS_CITATIONS,
      doubleRoundRobin: 'no league schedule is published and there is no round robin: a Sunset game is a game between two of the ten that MaxPreps marks as a league game',
      overtime: 'No league or Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules). Sunset games have ended level and have been decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2), so this site records each game as it is reported.',
      coChampions: 'no published rule names a champion; teams level on points at the top are shown level',
      stages: {
        'no-rule': 'No Sunset document exists that we could find, so no rule breaks this tie and it is left as it is',
      },
    },
    coChampionsLabel: 'Sunset co-leaders',
    unresolvedSuffix: '',
  },
  postseason: {
    kind: 'no-postseason',
    ladder: [
      { divisions: '*', places: [1, 99], status: 'no-postseason', label: 'No section playoffs',
        phrase: 'no postseason', badge: 'No playoffs',
        legend: 'The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)' },
    ],
    note: 'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaws 2011.1 and 3500.2), and CIF holds no regional or state championship, so a Sunset team’s season ends with its last game, Oct 31 at the latest.',
    citations: {
      noPlayoffs: 'CIF-SS Blue Book 2026-27, Bylaw 2011.1 (“No playoffs - See Bylaw 3500.2”) and Bylaw 3500.2 (“No playoffs will be conducted by the CIF Southern Section Office when less than 20% of the membership field teams in that sport”)',
    },
    sourceLabel: 'CIF-SS Blue Book 2026-27',
    sourceUrl: SS_BLUE_BOOK_FH_URL,
  },
  phases: [{ phase: 'regular', through: 'league-play' }],
  keyDates: [{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }],
  officialChanges: null,
};

/** Every San Diego division's official note (DESIGN-socal §2.1.6, verbatim). */
const SDS_OFFICIAL_NOTE =
  'No San Diego Section league publishes a schedule or standings. Members come from the Section’s 2026-27 League Alignment; every pair of members meets twice, and this site counts both games as league games whether or not MaxPreps marks them as league games.';

const SDS_LINKS: LeagueConfig['links'] = [
  { label: 'CIF San Diego Section field hockey', href: SDS_FIELD_HOCKEY_URL },
  { label: 'CIF-SDS 2026-27 League Alignment (Google Sheet)', href: SDS_ALIGNMENT_URL },
  { label: 'CIF-SDS Green Book 2026-27 (Google Doc)', href: SDS_GREEN_BOOK_URL },
];

/** The one official mode every San Diego division has (a fresh object each call, so tests can mutate one). */
function sdsOfficial(): DivisionConfig['official'] {
  return { mode: 'none', note: SDS_OFFICIAL_NOTE };
}

/**
 * A San Diego league's rules (City, North County, Metro: one Section rule for all three). 'membership': every
 * pair of division-mates meets exactly twice on MaxPreps' schedules (contestType 2 and 4 left out), a double
 * round robin, while MaxPreps flags as few as 0 of Patrick Henry's 10 as league games (inventory 2026-10-06).
 */
function sdsRules(shortName: string): LeagueRules {
  return {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'division',
    classification: 'membership', excludeContestTypes: [2, 4],
    // The playoffs open with the play-ins on Mon Nov 2 (SDFHOA calendar); the Master Calendar's last contest is Oct 30.
    postseasonFrom: '2026-11-02', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'shootout',
    citations: {
      ...SITE_POINTS_CITATIONS,
      doubleRoundRobin: 'every pair of members meets twice (MaxPreps schedules and the CIF-SDS 2026-27 League Alignment); the league publishes no schedule',
      overtime: 'San Diego Field Hockey Officials Association 2026 procedures: a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal, so a varsity game never ends level. MaxPreps often records such a win as a level score marked W and L, and this site counts it as a win.',
      // Paraphrased: the Green Book's own words name the champion an "automatic qualifier", a phrase no
      // non-CCS page may print (scripts/assert-copy.ts forbidCcs).
      coChampions: 'the league designates its champion (CIF-SDS Green Book: with a tie for first place, the league designates which team goes forward); this table shows teams level on points as level',
      stages: {
        'no-rule': 'The CIF-SDS Green Book (Bylaw 2000.1, special rule 3) leaves the tiebreak procedure to the Section’s preseason minutes, which we could not read, so this tie is left as it is',
      },
    },
    coChampionsLabel: `${shortName} co-leaders`,
    unresolvedSuffix: '',
  };
}

/**
 * The San Diego Section playoffs, as one league's postseason (a fresh object per league). Green Book 2026-27
 * Bylaw 2000.1 [V]; Master Calendar 2026-27 [V]; per-round dates and the finals site [V] only on the San Diego
 * Field Hockey Officials Association's calendar (sdfhoa.weebly.com), which `citations.roundDates` says.
 */
function sdsPostseason(playoffDivisionOf: Readonly<Record<TeamSlug, 'I' | 'II'>>): PostseasonConfig {
  return {
    kind: 'section-playoffs',
    name: 'San Diego Section playoffs',
    dates: { first: '2026-11-02', last: '2026-11-14' },
    qualificationLine: 'San Diego Section playoffs, Nov 2–14 (finals Nov 14 at La Jolla HS): Open 8, Division I 12, Division II 12, placed by the Section from its power rankings; a designated league champion gets at least a play-in.',
    divisions: [{ name: 'Open', teams: 8 }, { name: 'Division I', teams: 12 }, { name: 'Division II', teams: 12 }],
    playoffDivisionOf,
    ladder: [
      { divisions: '*', places: [1, 1], status: 'tournament', label: 'League champion: at least a play-in',
        phrase: 'at least a play-in as league champion', badge: '1st',
        legend: '1st — the league’s designated champion (not co-champions) is guaranteed at least a play-in game (Green Book 2000.1). The league names its champion; this table does not.' },
      { divisions: '*', places: [2, 99], status: 'selection', label: 'No league route',
        phrase: 'no league route into the playoffs', badge: 'Selection only',
        legend: '2nd or lower — no league route; the Section places Division I teams in the Open or Division I bracket and picks 12 Division II teams, from its power rankings (Green Book 2000.1)' },
    ],
    citations: {
      qualification: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (“There will be 3 competitive divisions with 8 teams in the Open Division and 12 teams in Divisions I and II qualifying for the playoffs. Designated league champions (not co-champions or tri-champions) will be guaranteed entry into a play-in game in the CIFSDS playoffs.”)',
      // Paraphrased on purpose: the bylaw's play-in sentence names a seed position, which SEED_CLAIM bans.
      seeding: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (the Commissioner places teams from the Section’s approved power rankings, with input from the coaches’ advisory committee, and there is no appeal; a designated league champion left out of its division’s bracket hosts a play-in game) and the Green Book’s division-placement bylaw (the eight Open Division teams are drawn from Division I at the end of the regular season)',
      format: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (Open 8, Division I 12, Division II 12) and the CIF-SDS 2026-27 Master Calendar (playoffs Nov 2–12, finals Nov 14)',
      roundDates: 'Round dates and the finals site (La Jolla HS) are from the San Diego Field Hockey Officials Association’s calendar; the Section’s own bulletin is not reachable.',
    },
    note: 'The San Diego Section’s field hockey playoffs run Nov 2–14, with the finals on Nov 14 at La Jolla HS: Open 8, Division I 12, Division II 12. The Section places teams from its power rankings at its Oct 31 seeding meeting; until it publishes its brackets, this site draws none and projects no places. A designated league champion is guaranteed at least a play-in game; the league names its champion, not this table.',
    sourceLabel: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1',
    sourceUrl: SDS_GREEN_BOOK_URL,
    powerRankingsUrl: SDS_POWER_RANKINGS_URL,
  };
}

/** The San Diego leagues' phases: the Section playoffs end with the Nov 14 finals. */
function sdsPhases(): readonly PhaseStep[] {
  return [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-11-14' },
  ];
}

/**
 * The San Diego leagues' dated events. Oct 30 is the Master Calendar's last contest (the SDFHOA calendar ends
 * the regular season Oct 29; the Section's date wins, docs/LEAGUE-RULES.md records the conflict). The seeding
 * meeting is the advisory calendar's (Oct 31, 10 AM, Zoom); the play-ins and the finals site are SDFHOA's.
 */
function sdsKeyDates(): LeagueConfig['keyDates'] {
  return [
    { id: 'league-play-ends', date: '2026-10-30', label: 'Last day of the San Diego Section regular season' },
    { id: 'seeding-meeting', date: '2026-10-31', label: 'Section seeding meeting' },
    { id: 'play-in', date: '2026-11-02', label: 'Section play-in games (only if needed)' },
    { id: 'finals', date: '2026-11-14', label: 'Section finals at La Jolla HS' },
  ];
}

/** San Diego leaguePlay.last: the Master Calendar's last contest, Oct 30, for every division. */
const SDS_LEAGUE_PLAY_LAST = '2026-10-30';

// Each division's leaguePlay.first is its earliest game between two members, neither row contestType 2 or 4,
// not deleted, on MaxPreps' 2026-27 schedules (inventory/schedules, harvested 2026-10-06 ~00:05 UTC).

const CITY: LeagueConfig = {
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
      knownCause: 'MaxPreps’ table leaves out Patrick Henry and lists Madison, which has no varsity game; MaxPreps marks none of Patrick Henry’s league games as league games.',
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

const NORTH_COUNTY: LeagueConfig = {
  // The North County Conference's three field hockey leagues, "NC AVOCADO", "NC PALOMAR" and "NC VALLEY" on the
  // NORTH COUNTY tab ("UPDATED 9/20/26") [V]. Rancho Buena Vista is listed under both Palomar and Valley; its
  // league games are Palomar's and MaxPreps' Palomar table lists it, so it is Palomar's here.
  id: 'north-county', sectionId: 'sds',
  name: 'North County Conference', shortName: 'North County',
  cities: 'Carlsbad, Encinitas, Escondido, Fallbrook, Oceanside, Poway, San Marcos, Valley Center, Vista and north San Diego',
  alignmentSource: 'the CIF-SDS 2026-27 League Alignment',
  officialUrl: SDS_FIELD_HOCKEY_URL,
  links: SDS_LINKS,
  // si.com's buckets are stale (the Valley six are spread across avocado-east, avocado-west and palomar):
  // harvested for team pages only, never membership.
  sblive: { leagueSlugs: ['4170-avocado-east', '4171-avocado-west', '4234-palomar'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'avocado', leagueId: 'north-county', label: 'Avocado', searchAliases: [],
      maxprepsLeagueId: '75ed156b-09c9-4a0c-ac58-11a371443815',
      maxprepsName: 'Avocado', maxprepsSlug: 'avocado',
      expectedTeams: 6, gamesPerTeam: 10,
      // Rancho Bernardo v La Costa Canyon, Sep 28.
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      // 4 rows + Mt. Carmel and Rancho Bernardo (zero-GUID league on MaxPreps) = 6.
      maxprepsTeamCount: 4, maxprepsMissing: ['mt-carmel', 'rancho-bernardo'], maxprepsExtraRows: {},
      reportedTrust: 'informational',
      knownCause: 'MaxPreps’ Avocado table leaves out Mt. Carmel and Rancho Bernardo, and MaxPreps marks only some games between Avocado teams as league games, so its records differ from ours.',
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      id: 'palomar', leagueId: 'north-county', label: 'Palomar', searchAliases: [],
      maxprepsLeagueId: 'e4a7e9c3-986b-446f-8547-8348be95e282',
      maxprepsName: 'Palomar', maxprepsSlug: 'palomar',
      expectedTeams: 7, gamesPerTeam: 12,
      // Del Norte v Rancho Buena Vista, Sep 9.
      leaguePlay: { first: '2026-09-09', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'The alignment sheet also lists Rancho Buena Vista under Valley; its league games are against Palomar teams.',
      home: { miniRows: 7, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      // MaxPreps has no Valley table: all six teams carry its zero-GUID league. Nothing is requested for it and
      // the MaxPreps comparison is skipped ("MaxPreps publishes no table for this division"), so no knownCause.
      id: 'valley', leagueId: 'north-county', label: 'Valley', searchAliases: [],
      maxprepsLeagueId: null, maxprepsName: null, maxprepsSlug: null,
      expectedTeams: 6, gamesPerTeam: 10,
      // Escondido v Sage Creek, Sep 28 (both rows contestType 1: MaxPreps flags few Valley games).
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 0,
      maxprepsMissing: ['escondido', 'mission-hills', 'sage-creek', 'san-pasqual', 'vista', 'westview'],
      maxprepsExtraRows: {}, reportedTrust: 'informational', knownCause: null,
      home: { miniRows: 6, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  rules: sdsRules('North County'),
  postseason: sdsPostseason({
    'canyon-crest-academy': 'I', 'la-costa-canyon': 'I', 'mt-carmel': 'I', 'rancho-bernardo': 'I', 'san-marcos': 'I', 'torrey-pines': 'I',
    'del-norte': 'I', fallbrook: 'I', 'mission-vista': 'II', poway: 'I', 'rancho-buena-vista': 'II', 'san-dieguito-academy': 'I', 'valley-center': 'II',
    escondido: 'II', 'mission-hills': 'II', 'sage-creek': 'II', 'san-pasqual': 'II', vista: 'II', westview: 'II',
  }),
  phases: sdsPhases(),
  keyDates: sdsKeyDates(),
  officialChanges: null,
};

const METRO: LeagueConfig = {
  // The Metro Conference's two field hockey leagues, "MESA" and "SOUTH BAY" on the METRO tab [V] (the GROSSMONT
  // tab notes that El Capitan, Helix and Granite Hills play field hockey in the Metro Conference).
  id: 'metro', sectionId: 'sds',
  name: 'Metro Conference', shortName: 'Metro',
  cities: 'Chula Vista, La Mesa, Lakeside, El Cajon and San Diego',
  alignmentSource: 'the CIF-SDS 2026-27 League Alignment',
  officialUrl: SDS_FIELD_HOCKEY_URL,
  links: SDS_LINKS,
  sblive: { leagueSlugs: ['4214-metro-mesa', '4199-grossmont'], backfill: true },
  officialCodes: {},
  officialNames: {},
  // Santana is the 0-0-0 row of MaxPreps' "Grossmont" table (1125d6e8-…): no 2026 varsity game on MaxPreps or in
  // the Section's power rankings. Spellings from MaxPreps and si.com.
  withdrawnNames: ['Santana', 'SANTANA', 'Santana High School', 'Santana Sultans'],
  membershipNote: null,
  divisions: [
    {
      id: 'metro-mesa', leagueId: 'metro', label: 'Metro Mesa', searchAliases: [],
      // MaxPreps' "Metro- South Bay" table holds exactly the five Metro Mesa teams.
      maxprepsLeagueId: '6dfe5a12-b82f-45d7-b103-71a5c13c0093',
      maxprepsName: 'Metro- South Bay', maxprepsSlug: 'metro-south-bay',
      expectedTeams: 5, gamesPerTeam: 8,
      // Olympian v Otay Ranch, Sep 28.
      leaguePlay: { first: '2026-09-28', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      maxprepsTeamCount: 5, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'informational',
      knownCause: 'MaxPreps files these five teams under ‘Metro- South Bay’.',
      home: { miniRows: 5, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
    {
      id: 'metro-south-bay', leagueId: 'metro', label: 'Metro South Bay', searchAliases: [],
      // MaxPreps' "Grossmont" table: El Capitan, Granite Hills and Santana.
      maxprepsLeagueId: 'ca8e2856-b13d-4aa7-8c15-37cb50a55c60',
      maxprepsName: 'Grossmont', maxprepsSlug: 'grossmont',
      expectedTeams: 4, gamesPerTeam: 6,
      // Hilltop v Southwest, Oct 7.
      leaguePlay: { first: '2026-10-07', last: SDS_LEAGUE_PLAY_LAST },
      official: sdsOfficial(),
      // 3 rows + Hilltop and Southwest − Santana = 4.
      maxprepsTeamCount: 3, maxprepsMissing: ['hilltop', 'southwest'],
      maxprepsExtraRows: {
        '1125d6e8-e661-4190-a41d-5722364dee38': 'Santana: a 0-0-0 row; Santana has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings',
      },
      reportedTrust: 'informational',
      knownCause: 'MaxPreps files El Capitan and Granite Hills under ‘Grossmont’ with Santana, which has no varsity game, and lists no league for Hilltop or Southwest.',
      home: { miniRows: 4, lineAfter: null, lineLabel: null },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  rules: sdsRules('Metro'),
  postseason: sdsPostseason({
    'bonita-vista': 'II', eastlake: 'I', helix: 'II', olympian: 'II', 'otay-ranch': 'II',
    'el-capitan': 'II', 'granite-hills': 'II', hilltop: 'II', southwest: 'II',
  }),
  phases: sdsPhases(),
  keyDates: sdsKeyDates(),
  officialChanges: null,
};

/** Config order: NorCal (CCS, NCS, NS) first, then SoCal (the Sunset, then the San Diego leagues). */
export const LEAGUES: readonly LeagueConfig[] = [SCVAL, BVAL, PCAL, MCAL, EAL, SUNSET, CITY, NORTH_COUNTY, METRO];

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
  // CCS_BRACKET_URL is imported from lib/season.ts, which keeps it as a literal (season stays a dependency-free leaf).
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

/** The captures behind the ghost and si.com entries are named in docs/DATA-SOURCES.md §5.5 (fixture provenance). */
export const DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    '8396a0d3-8021-458d-b592-a5cb2c4a366d': 'Del Norte (Crescent City): a MaxPreps ghost (no league, team size 0); its contest duplicates Tamalpais vs Del Norte (San Diego)',
  },
  excludedContestIds: {
    '5b9ff911-a640-4947-b9fd-8a629e775b33': 'Tamalpais vs the Del Norte (Crescent City) ghost; duplicates a05bedf5 (Tamalpais vs Del Norte, San Diego)',
    '5cf5e3df-6e72-4f44-9b8d-e69da30b85c5': 'Archie Williams at Marin Academy, Aug 18: not on the official MCAL schedule; a spurious unscored row',
    // Two duplicate Palomar rows (inventory 2026-10-06): each sits on a date with no time, and the pair already has
    // its two meetings, so counting either would add a third game and a false "league result missing" row.
    'c7dbdbcc-5f41-4192-b8b2-eb79cca2523a': 'Poway vs Fallbrook, Oct 9 with no time: a second MaxPreps row for their Palomar game on Oct 13 (0b3cfb7d); the pair meets twice, and both meetings are on the schedule',
    '9c027452-e21e-4e47-9eac-d2e800bfb42c': 'Mission Vista vs Fallbrook, Oct 30 with no time: a second MaxPreps row for their Palomar game on Oct 29 (5067646d); the pair meets twice, and both meetings are on the schedule',
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
    // Southern Section schools with games but no league: each is the only field hockey team in its all-sports
    // MaxPreps league (League B, Marmonte, Palomares) and has no league-flagged game (research-cifss.md §2a).
    // Mascots from their si.com team slugs.
    {
      name: 'Harvard-Westlake', keys: ['Harvard Westlake', 'Harvard-Westlake School', 'Harvard-Westlake Wolverines'],
      reason: 'Harvard-Westlake is the only field hockey team in its league, so it plays no league games and has no table here; its games against teams covered here show it as an opponent.',
    },
    {
      name: 'Thousand Oaks', keys: ['Thousand Oaks High School', 'Thousand Oaks Lancers'],
      reason: 'Thousand Oaks is the only field hockey team in its league, so it plays no league games and has no table here; its games against teams covered here show it as an opponent.',
    },
    {
      name: 'Glendora', keys: ['Glendora High School', 'Glendora Tartans'],
      reason: 'Glendora is the only field hockey team in its league, so it plays no league games and has no table here; its games against teams covered here show it as an opponent.',
    },
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
    // MaxPreps' one-team "Suburban" league; not on the Southern Section's 2026-27 list of participating schools
    // (the Season Preview, June 2026).
    { name: 'Mayfair', keys: ['Mayfair High School'], reason: 'Mayfair has no 2026 varsity game on MaxPreps and is not on the Southern Section’s list of participating schools.' },
  ],
};

/**
 * Route segments a league id may never equal (siblings of /standings/[league], /schedule/[league],
 * /playoffs/[league]), plus the two region ids: 'norcal' and 'socal' are page anchors and `data-region-scope`
 * values (DESIGN-socal §2.4), so no section, league or division may take one (asserted).
 */
export const RESERVED_SEGMENTS = [
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'sitemap', 'robots', 'manifest', 'norcal', 'socal',
] as const;

// ---------- helpers (the Stage-A API, SPEC §2.3) ----------

export const LEAGUE_IDS: readonly LeagueId[] = LEAGUES.map((l) => l.id);

/** Every division, config order (LEAGUES order, then each league's division order). */
export const ALL_DIVISIONS: readonly DivisionConfig[] = LEAGUES.flatMap((l) => l.divisions);

/** Leagues whose postseason is the CCS ladder. */
export const CCS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'ccs-ladder',
).map((l) => l.id);

/** Leagues that run their own tournament (['mcal']). */
export const TOURNAMENT_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'league-tournament',
).map((l) => l.id);

/** Leagues whose postseason is a tournament with no published bracket (['eal']). */
export const UNBRACKETED_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'unbracketed-tournament',
).map((l) => l.id);

/** Leagues with no postseason at all (['sunset']): /playoffs gives each a card of its own. */
export const NO_POSTSEASON_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'no-postseason',
).map((l) => l.id);

/** Leagues whose postseason is their section's own playoffs (['city', 'north-county', 'metro']). */
export const SECTION_PLAYOFFS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'section-playoffs',
).map((l) => l.id);

const REGION_BY_ID = new Map<string, RegionConfig>(REGIONS.map((r) => [r.id, r]));
const SECTION_BY_ID = new Map<string, SectionConfig>(SECTIONS.map((s) => [s.id, s]));
const LEAGUE_BY_ID = new Map<string, LeagueConfig>(LEAGUES.map((l) => [l.id, l]));
const DIVISION_BY_ID = new Map<string, DivisionConfig>(ALL_DIVISIONS.map((d) => [d.id, d]));

/** Throws on an unknown id. */
export function getRegion(id: RegionId): RegionConfig {
  const r = REGION_BY_ID.get(id);
  if (!r) throw new Error(`lib/leagues.ts: unknown region "${id}"`);
  return r;
}

/** A league's region: its section's (never stored). Throws on an unknown league. */
export function regionOf(leagueId: LeagueId): RegionId {
  return sectionOf(leagueId).region;
}

/** The region's sections, config order. */
export function sectionsInRegion(region: RegionId): readonly SectionConfig[] {
  return SECTIONS.filter((s) => s.region === region);
}

/** The region's leagues, config order (LEAGUES lists NorCal first, so each region is one contiguous run). */
export function leaguesInRegion(region: RegionId): readonly LeagueConfig[] {
  return LEAGUES.filter((l) => regionOf(l.id) === region);
}

/** Throws on an unknown id. */
export function getSection(id: SectionId): SectionConfig {
  const s = SECTION_BY_ID.get(id);
  if (!s) throw new Error(`lib/leagues.ts: unknown section "${id}"`);
  return s;
}

export function sectionOf(leagueId: LeagueId): SectionConfig {
  return getSection(getLeague(leagueId).sectionId);
}

/** Throws on an unknown id (a build-time bug). */
export function getLeague(id: LeagueId): LeagueConfig {
  const l = LEAGUE_BY_ID.get(id);
  if (!l) throw new Error(`lib/leagues.ts: unknown league "${id}"`);
  return l;
}

export function findLeague(id: string): LeagueConfig | undefined {
  return LEAGUE_BY_ID.get(id);
}

export function isLeagueId(id: string): boolean {
  return LEAGUE_BY_ID.has(id);
}

/** Throws on an unknown id. */
export function getDivision(id: DivisionId): DivisionConfig {
  const d = DIVISION_BY_ID.get(id);
  if (!d) throw new Error(`lib/leagues.ts: unknown division "${id}"`);
  return d;
}

export function findDivision(id: string): DivisionConfig | undefined {
  return DIVISION_BY_ID.get(id);
}

export function leagueOfDivision(id: DivisionId): LeagueConfig {
  return getLeague(getDivision(id).leagueId);
}

export function divisionsOf(leagueId: LeagueId): readonly DivisionConfig[] {
  return getLeague(leagueId).divisions;
}

export function isSingleDivision(leagueId: LeagueId): boolean {
  return getLeague(leagueId).divisions.length === 1;
}

/** 'De Anza' | 'Mt. Hamilton' | 'PCAL' | 'MCAL' | 'EAL' */
export function divisionLabel(id: DivisionId): string {
  return getDivision(id).label;
}

/** THE single gate for division labels: null for a single-division league. */
export function divisionHeading(id: DivisionId): string | null {
  const d = getDivision(id);
  return isSingleDivision(d.leagueId) ? null : d.label;
}

/** 'BVAL · Mt. Hamilton' | 'MCAL' | 'SCVAL · De Anza' */
export function divisionDisplay(id: DivisionId): string {
  const league = leagueOfDivision(id);
  const heading = divisionHeading(id);
  return heading === null ? league.shortName : `${league.shortName} · ${heading}`;
}

/**
 * MaxPreps league standings page — the deep link on every standings table. The double hyphen in
 * the slug is the league name's " - " joiner; dropping ?leagueid= hard-404s. null for a division
 * MaxPreps has no table for (the San Diego Section's Valley): never '/league/null/'.
 */
export function leagueStandingsUrl(id: DivisionId): string | null {
  const d = getDivision(id);
  if (d.maxprepsLeagueId === null || d.maxprepsSlug === null) return null;
  return `${MP}/ca/field-hockey/${SEASON_YEAR}/league/${d.maxprepsSlug}/?leagueid=${d.maxprepsLeagueId}`;
}

/** The rungs of the division's league ladder that apply to this division, in ladder order. */
export function ladderFor(id: DivisionId): readonly LadderRung[] {
  const d = getDivision(id);
  return getLeague(d.leagueId).postseason.ladder.filter(
    (r) => r.divisions === '*' || r.divisions.includes(d.id),
  );
}

/** The rung covering `place` (1-based; anything past 99 reads as 99). Throws when none does. */
export function ladderRung(id: DivisionId, place: number): LadderRung {
  const p = Math.min(Math.max(place, 1), 99);
  const rung = ladderFor(id).find((r) => r.places[0] <= p && p <= r.places[1]);
  if (!rung) throw new Error(`lib/leagues.ts: no ladder rung for ${id} place ${place}`);
  return rung;
}

/** The chain for a points bucket that starts at `bucketStartPlace` (byBucketStart entry, else default). */
export function tiebreakChainFor(id: DivisionId, bucketStartPlace: number): readonly TiebreakStage[] {
  const { tiebreaks } = leagueOfDivision(id).rules;
  return tiebreaks.byBucketStart?.[bucketStartPlace] ?? tiebreaks.default;
}

/**
 * A team's draw number (MCAL's spring draw: lower wins a `draw-number` stage). Takes a slug, so this
 * module never reads the registry; lib/teams.ts fails at import unless a league's `drawNumbers` keys are
 * exactly its slugs, so a miss here is a caller's bug and throws instead of falling back.
 */
export function drawNumberOf(rules: LeagueRules, slug: TeamSlug): number {
  const n = rules.drawNumbers?.[slug];
  if (n === undefined) throw new Error(`lib/leagues.ts: no draw number for ${slug}`);
  return n;
}

/** Every status the league's ladder can give, in ladder order, deduped. */
export function statusesOf(leagueId: LeagueId): readonly PlayoffStatus[] {
  return [...new Set(getLeague(leagueId).postseason.ladder.map((r) => r.status))];
}

/**
 * The first official league date of the league (min over its divisions): the date the home
 * PhaseLead and the /standings preseason notice both say league play starts.
 */
export function leaguePlayStarts(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.first)
    .reduce((a, b) => (b < a ? b : a));
}

/** The last official league date of the league (max over its divisions). */
export function leaguePlayEnds(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.last)
    .reduce((a, b) => (b > a ? b : a));
}

/** Union of every section's season window (the fetch season-window guard). */
export function seasonWindowBounds(): { start: string; end: string } {
  let start = SECTIONS[0].seasonWindow.start as string;
  let end = SECTIONS[0].seasonWindow.end as string;
  for (const s of SECTIONS) {
    if (s.seasonWindow.start < start) start = s.seasonWindow.start;
    if (s.seasonWindow.end > end) end = s.seasonWindow.end;
  }
  return { start, end };
}

// ---------- assertLeagues (SPEC §2.4) ----------

const UNCOMPUTABLE: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>(['coin-flip', 'ccs-points', 'no-rule']);
const CCS_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'aq', 'play-in', 'at-large', 'out', 'no-aq-route',
]);
const TOURNAMENT_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'bye', 'tournament', 'below-line',
]);
const UNBRACKETED_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'below-line']);
const NO_POSTSEASON_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['no-postseason']);
const SECTION_PLAYOFFS_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'selection']);
const PLACE_VS_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'record-vs-higher-placed', 'record-vs-lower-placed',
]);
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The ladder statuses a postseason kind may use. */
function allowedStatuses(kind: PostseasonConfig['kind']): ReadonlySet<PlayoffStatus> {
  switch (kind) {
    case 'ccs-ladder': return CCS_LADDER_STATUSES;
    case 'league-tournament': return TOURNAMENT_LADDER_STATUSES;
    case 'unbracketed-tournament': return UNBRACKETED_STATUSES;
    case 'no-postseason': return NO_POSTSEASON_STATUSES;
    case 'section-playoffs': return SECTION_PLAYOFFS_STATUSES;
  }
}

/** Every chain of a league with where it comes from: `null` = default, a number = byBucketStart key. */
function chainsOf(league: LeagueConfig): Array<{ start: number | null; chain: readonly TiebreakStage[] }> {
  const out: Array<{ start: number | null; chain: readonly TiebreakStage[] }> = [
    { start: null, chain: league.rules.tiebreaks.default },
  ];
  for (const [key, chain] of Object.entries(league.rules.tiebreaks.byBucketStart ?? {})) {
    if (chain) out.push({ start: Number(key), chain });
  }
  return out;
}

/** Runs at import. Throws `lib/leagues.ts: <message>` on the first violated invariant. */
export function assertLeagues(): void {
  const fail = (m: string): never => {
    throw new Error(`lib/leagues.ts: ${m}`);
  };
  const dupes = (values: readonly string[]): string[] => [
    ...new Set(values.filter((v, i) => values.indexOf(v) !== i)),
  ];

  // 1. ids
  const regionIds = REGIONS.map((r) => r.id as string);
  const sectionIds = SECTIONS.map((s) => s.id as string);
  const leagueIds = LEAGUES.map((l) => l.id);
  const divisionIds = ALL_DIVISIONS.map((d) => d.id);
  for (const [label, ids] of [
    ['region', regionIds], ['section', sectionIds], ['league', leagueIds], ['division', divisionIds],
  ] as const) {
    const d = dupes(ids);
    if (d.length) fail(`duplicate ${label} id: ${d.join(', ')}`);
  }
  // A region id is a page anchor and a data-region-scope value: reserved, and never a section, league or division.
  for (const id of regionIds) {
    if (!(RESERVED_SEGMENTS as readonly string[]).includes(id)) fail(`region ${id} is not a reserved segment`);
  }
  for (const id of [...sectionIds, ...leagueIds, ...divisionIds]) {
    if (regionIds.includes(id)) fail(`${id}: a section, league or division id may not be a region id`);
  }
  const shortDupes = dupes(SECTIONS.map((s) => s.shortName as string));
  if (shortDupes.length) fail(`duplicate section shortName: ${shortDupes.join(', ')}`);
  // 1b. sections: a known region each, every region used, a rules source, a well-formed shootout rule
  for (const s of SECTIONS as readonly SectionConfig[]) {
    if (!regionIds.includes(s.region)) fail(`${s.id}: unknown region ${s.region}`);
    if (!s.rulesSource.name.trim()) fail(`${s.id}: rulesSource needs a name`);
    if (!s.rulesSource.url.startsWith('https://')) fail(`${s.id}: rulesSource.url must start with https://`);
    if (s.shootout !== null && !(s.shootout.words.trim() && s.shootout.citation.trim())) {
      fail(`${s.id}: shootout needs words and a citation (use null for none)`);
    }
    // The level-W/L → 'SO' rule is the section's: every league in it must decide level games the same way,
    // and a league that does must sit in a section that says how (lib/normalize.ts keys on the section).
    for (const l of LEAGUES) {
      if (l.sectionId !== s.id) continue;
      if ((s.shootout !== null) !== (l.rules.leagueOvertime === 'shootout')) {
        fail(`${l.id}: leagueOvertime 'shootout' exactly when its section ${s.id} has a shootout rule`);
      }
    }
  }
  for (const id of regionIds) {
    if (!SECTIONS.some((s) => s.region === id)) fail(`region ${id} has no section`);
  }
  for (const l of LEAGUES) {
    if (!sectionIds.includes(l.sectionId)) fail(`${l.id}: unknown section ${l.sectionId}`);
    if ((RESERVED_SEGMENTS as readonly string[]).includes(l.id)) fail(`${l.id}: league id is a reserved route segment`);
    if (l.divisions.length === 0) fail(`${l.id}: no divisions`);
    for (const d of l.divisions) {
      if (d.leagueId !== l.id) fail(`${d.id}: leagueId ${d.leagueId} but listed under ${l.id}`);
    }
    if (divisionIds.includes(l.id) && !(l.divisions.length === 1 && l.divisions[0].id === l.id)) {
      fail(`${l.id}: a league id may equal only its own single division's id`);
    }
    if (l.membershipNote !== null && !l.membershipNote.trim()) fail(`${l.id}: membershipNote is empty (use null)`);
  }

  for (const l of LEAGUES) {
    const ps = l.postseason;
    const ownDivisions = l.divisions.map((d) => d.id);

    // 2. ladders cover 1..99 exactly once per division; statuses fit the postseason kind
    const allowed = allowedStatuses(ps.kind);
    for (const rung of ps.ladder) {
      if (!allowed.has(rung.status)) fail(`${l.id}: ladder status ${rung.status} not allowed for ${ps.kind}`);
      if (rung.divisions !== '*') {
        for (const id of rung.divisions) {
          if (!ownDivisions.includes(id)) fail(`${l.id}: ladder names division ${id} of another league`);
        }
      }
      const [a, b] = rung.places;
      if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 99)) {
        fail(`${l.id}: bad ladder places [${a}, ${b}]`);
      }
      for (const key of ['label', 'phrase', 'badge', 'legend'] as const) {
        if (!rung[key]) fail(`${l.id}: ladder rung ${rung.status} has an empty ${key}`);
      }
    }
    // 2b. an unbracketed tournament: places 1..qualifiers are 'tournament', the rest 'below-line', no rung straddles
    if (ps.kind === 'unbracketed-tournament') {
      if (!(Number.isInteger(ps.qualifiers) && ps.qualifiers >= 1)) fail(`${l.id}: qualifiers ${ps.qualifiers} is not a positive integer`);
      for (const rung of ps.ladder) {
        const inside = rung.places[1] <= ps.qualifiers;
        if (inside !== (rung.status === 'tournament')) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] is ${rung.status}, but places 1-${ps.qualifiers} (and only they) are 'tournament'`);
        }
        if (rung.status === 'below-line' && !(rung.places[0] > ps.qualifiers)) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] straddles the ${ps.qualifiers} qualifiers`);
        }
      }
      if (!ps.name.trim()) fail(`${l.id}: an unbracketed tournament needs a name`);
      if (!ps.note.trim()) fail(`${l.id}: an unbracketed tournament needs a note`);
      for (const [key, text] of Object.entries(ps.citations)) {
        if (!text.trim()) fail(`${l.id}: empty postseason citation ${key}`);
      }
      if (!ps.sourceUrl.startsWith('https://')) fail(`${l.id}: postseason sourceUrl must start with https://`);
      if (ps.dates.first > ps.dates.last) fail(`${l.id}: postseason dates.first after dates.last`);
      for (const d of l.divisions) {
        if (!(ps.dates.first > d.leaguePlay.last)) fail(`${d.id}: postseason dates.first is not after leaguePlay.last`);
      }
      if (l.rules.postseasonFrom === null || !(l.rules.postseasonFrom <= ps.dates.first)) {
        fail(`${l.id}: an unbracketed tournament needs postseasonFrom on or before dates.first`);
      }
    }
    // 2c. no postseason: one sentence and its source; no postseason games, so no postseasonFrom and no line
    if (ps.kind === 'no-postseason') {
      if (!ps.note.trim()) fail(`${l.id}: a no-postseason league needs a note`);
      if (!ps.citations.noPlayoffs.trim()) fail(`${l.id}: empty postseason citation noPlayoffs`);
      if (!ps.sourceLabel.trim()) fail(`${l.id}: a no-postseason league needs a sourceLabel`);
      if (!ps.sourceUrl.startsWith('https://')) fail(`${l.id}: postseason sourceUrl must start with https://`);
      if (l.rules.postseasonFrom !== null) fail(`${l.id}: a no-postseason league has no postseasonFrom`);
      for (const d of l.divisions) {
        if (d.ladderLine !== null || d.home.lineAfter !== null) fail(`${d.id}: a no-postseason league draws no ladder or home line`);
      }
    }
    // 2d. section playoffs: only 1st has a league route ('tournament', the designated champion's play-in), every
    // other place is 'selection'; the field, the dates after league play, each member's playoff division
    if (ps.kind === 'section-playoffs') {
      for (const rung of ps.ladder) {
        const champion = rung.places[0] === 1 && rung.places[1] === 1;
        if ((rung.status === 'tournament') !== champion) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] is ${rung.status}, but only place 1 (and only it) is 'tournament'`);
        }
      }
      for (const [key, text] of [
        ['name', ps.name], ['note', ps.note], ['qualificationLine', ps.qualificationLine], ['sourceLabel', ps.sourceLabel],
      ] as const) {
        if (!text.trim()) fail(`${l.id}: section playoffs need a ${key}`);
      }
      for (const [key, text] of Object.entries(ps.citations)) {
        if (!text.trim()) fail(`${l.id}: empty postseason citation ${key}`);
      }
      for (const url of [ps.sourceUrl, ps.powerRankingsUrl]) {
        if (!url.startsWith('https://')) fail(`${l.id}: postseason sourceUrl and powerRankingsUrl must start with https://`);
      }
      if (ps.divisions.length === 0) fail(`${l.id}: section playoffs need their divisions`);
      for (const d of ps.divisions) {
        if (!d.name.trim() || !(Number.isInteger(d.teams) && d.teams >= 1)) fail(`${l.id}: bad playoff division ${d.name}`);
      }
      if (ps.dates.first > ps.dates.last) fail(`${l.id}: postseason dates.first after dates.last`);
      for (const d of l.divisions) {
        if (!(ps.dates.first > d.leaguePlay.last)) fail(`${d.id}: postseason dates.first is not after leaguePlay.last`);
      }
      if (l.rules.postseasonFrom === null || !(l.rules.postseasonFrom <= ps.dates.first)) {
        fail(`${l.id}: section playoffs need postseasonFrom on or before dates.first`);
      }
      // Shape only: lib/teams.ts asserts the keys are exactly the league's slugs (this module never reads the registry).
      const entries = Object.entries(ps.playoffDivisionOf);
      const total = l.divisions.reduce((n, d) => n + d.expectedTeams, 0);
      if (entries.length !== total) fail(`${l.id}: ${entries.length} playoff divisions for ${total} teams`);
      for (const [slug, div] of entries) {
        if (!SLUG_PATTERN.test(slug)) fail(`${l.id}: playoffDivisionOf key ${slug} is not a slug`);
        if (div !== 'I' && div !== 'II') fail(`${l.id}: playoffDivisionOf ${slug} is ${String(div)}, not I or II`);
      }
    }

    for (const div of ownDivisions) {
      const covered = new Array<number>(100).fill(0);
      for (const rung of ps.ladder) {
        if (rung.divisions !== '*' && !rung.divisions.includes(div)) continue;
        for (let p = rung.places[0]; p <= rung.places[1]; p++) covered[p] += 1;
      }
      for (let p = 1; p <= 99; p++) {
        if (covered[p] !== 1) fail(`${div}: ladder covers place ${p} ${covered[p]} times`);
      }
    }

    // 4. chains
    const rules = l.rules;
    const chains = chainsOf(l);
    const usedStages = new Set<TiebreakStage>();
    for (const { start, chain } of chains) {
      const where = start === null ? `${l.id} default chain` : `${l.id} chain for bucket start ${start}`;
      if (chain.length === 0) fail(`${where} is empty`);
      if (chain.includes('points')) fail(`${where} contains 'points'`);
      if (chain.includes('play-in')) fail(`${where} contains 'play-in'`);
      if (dupes(chain).length) fail(`${where} repeats a stage`);
      const uncomputable = chain.filter((s) => UNCOMPUTABLE.has(s));
      if (uncomputable.length > 1) fail(`${where} has more than one uncomputable stage`);
      if (uncomputable.length === 1 && chain[chain.length - 1] !== uncomputable[0]) {
        fail(`${where}: the uncomputable stage ${uncomputable[0]} is not last`);
      }
      if (chain.includes('draw-number') && chain[chain.length - 1] !== 'draw-number') {
        fail(`${where}: draw-number is not last`);
      }
      if (uncomputable.length === 1 && chain.includes('draw-number')) {
        fail(`${where}: draw-number and an uncomputable stage cannot both end it`);
      }
      // 11. place-relative stages only for buckets starting at 1st or 2nd
      for (const s of chain) {
        if (PLACE_VS_STAGES.has(s) && start !== 1 && start !== 2) {
          fail(`${where}: ${s} is allowed only in byBucketStart chains for 1 and 2`);
        }
      }
      for (const s of chain) usedStages.add(s);
    }
    for (const key of Object.keys(rules.tiebreaks.byBucketStart ?? {})) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1) fail(`${l.id}: byBucketStart key ${key} is not a place`);
    }
    for (const s of usedStages) {
      if (!rules.citations.stages[s]) fail(`${l.id}: stage ${s} has no citation`);
    }
    for (const key of ['points', 'pointsShort', 'order', 'doubleRoundRobin', 'overtime', 'coChampions'] as const) {
      if (!rules.citations[key]) fail(`${l.id}: empty citation ${key}`);
    }
    if (!rules.coChampionsLabel) fail(`${l.id}: empty coChampionsLabel`);
    if (ps.kind === 'league-tournament') {
      if (!rules.citations.stages['play-in']) fail(`${l.id}: a league tournament needs a 'play-in' citation`);
      if (!rules.unresolvedSuffix) fail(`${l.id}: a league tournament needs an unresolvedSuffix`);
    }
    if (rules.excludeContestTypes.includes(0)) fail(`${l.id}: excludeContestTypes may not contain 0 (the league flag)`);
    // 'shootout' is built only where no official fixtures decide what counts (none to match level games against):
    // MaxPreps' league flag (EAL) or division membership (the San Diego leagues).
    if (rules.leagueOvertime === 'shootout' && rules.classification === 'official-fixtures') {
      fail(`${l.id}: leagueOvertime 'shootout' needs classification 'contest-type' or 'membership'`);
    }

    // 5. draw numbers
    const usesDraw = usedStages.has('draw-number');
    if (usesDraw !== (rules.drawNumbers !== null)) {
      fail(`${l.id}: drawNumbers must be set exactly when a chain uses draw-number`);
    }
    if (rules.drawNumbers) {
      const values = Object.values(rules.drawNumbers);
      if (new Set(values).size !== values.length) fail(`${l.id}: draw numbers are not distinct`);
      const total = l.divisions.reduce((n, d) => n + d.expectedTeams, 0);
      if (values.length !== total) fail(`${l.id}: ${values.length} draw numbers for ${total} teams`);
    }

    // 6. pairings
    if (ps.kind === 'ccs-ladder') {
      for (const p of ps.pairings) {
        for (const seat of p.seats) {
          if (!ownDivisions.includes(seat.division)) fail(`${p.id}: seat division ${seat.division} is not in ${l.id}`);
          if (!Number.isInteger(seat.place) || seat.place < 1) fail(`${p.id}: seat place ${seat.place}`);
        }
      }
    }

    // 9. counts and dates
    const section = SECTION_BY_ID.get(l.sectionId);
    const inWindow = (date: string, what: string): void => {
      const day = date.slice(0, 10);
      if (!DATE_PATTERN.test(day)) fail(`${what}: "${date}" is not a date`);
      if (section && (day < section.seasonWindow.start || day > section.seasonWindow.end)) {
        fail(`${what}: ${day} is outside the ${section.id} season window`);
      }
    };
    for (const d of l.divisions) {
      // A double round robin, or (null) no fixed schedule at all: only where MaxPreps' flag alone says what counts.
      if (d.gamesPerTeam === null) {
        if (!(rules.classification === 'contest-type' && d.official.mode === 'none')) {
          fail(`${d.id}: gamesPerTeam null needs classification 'contest-type' and official mode 'none'`);
        }
      } else if (d.gamesPerTeam !== (d.expectedTeams - 1) * 2) fail(`${d.id}: gamesPerTeam ${d.gamesPerTeam}`);
      if (d.leaguePlay.first > d.leaguePlay.last) fail(`${d.id}: leaguePlay first after last`);
      if (rules.postseasonFrom !== null && !(d.leaguePlay.last < rules.postseasonFrom)) {
        fail(`${d.id}: leaguePlay.last is not before postseasonFrom`);
      }
      inWindow(d.leaguePlay.first, `${d.id} leaguePlay.first`);
      inWindow(d.leaguePlay.last, `${d.id} leaguePlay.last`);
      // 10. official sources: bundled ones name their file, URL and hash; 'none' only on a contest-type or a
      // membership league (so an official-fixtures league never has a 'none' division), and a membership league
      // only with 'none' (a league with fixtures classifies by them)
      if (d.official.mode === 'bundled' && !(d.official.bundledFile && d.official.revisionCheckUrl && d.official.bundledSha256)) {
        fail(`${d.id}: a bundled official source needs bundledFile, revisionCheckUrl and bundledSha256`);
      }
      if (d.official.mode === 'none') {
        if (rules.classification === 'official-fixtures') {
          fail(`${d.id}: official mode 'none' on an ${rules.classification} league (no fixtures to classify by)`);
        }
        if (!d.official.note.trim()) fail(`${d.id}: official mode 'none' needs a note`);
      } else if (rules.classification === 'membership') {
        fail(`${d.id}: classification 'membership' needs official mode 'none'`);
      }
      // 12. home mini table and ladder line
      if (d.home.miniRows > d.expectedTeams) fail(`${d.id}: home.miniRows > expectedTeams`);
      if (d.home.lineAfter !== null && !(d.home.lineAfter < d.home.miniRows)) {
        fail(`${d.id}: home.lineAfter must be < home.miniRows`);
      }
      if ((d.home.lineAfter === null) !== (d.home.lineLabel === null)) {
        fail(`${d.id}: home.lineAfter and home.lineLabel must both be set or both be null`);
      }
      if (d.ladderLine === null) {
        if (!((ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams) || ps.kind === 'no-postseason')) {
          fail(`${d.id}: ladderLine may be null only for an unbracketed tournament whose qualifiers >= expectedTeams, or a league with no postseason`);
        }
      } else if (!(d.ladderLine.after < d.expectedTeams)) {
        fail(`${d.id}: ladderLine.after must be < expectedTeams`);
      }
      // MaxPreps' table, or (maxprepsLeagueId null) the absence of one: then nothing names it, it has no rows,
      // and every member is one it omits (the equation below).
      if (d.maxprepsLeagueId === null) {
        if (d.maxprepsName !== null || d.maxprepsSlug !== null) fail(`${d.id}: maxprepsLeagueId null needs maxprepsName and maxprepsSlug null`);
        if (d.maxprepsTeamCount !== 0) fail(`${d.id}: maxprepsLeagueId null needs maxprepsTeamCount 0`);
      } else {
        if (!GUID_RE.test(d.maxprepsLeagueId)) fail(`${d.id}: maxprepsLeagueId ${d.maxprepsLeagueId} is not a GUID`);
        if (!d.maxprepsName || !d.maxprepsSlug) fail(`${d.id}: a MaxPreps table needs maxprepsName and maxprepsSlug`);
      }
      // MaxPreps' table: its rows, plus the members it omits, less its known non-member rows, are the registry.
      for (const [id, reason] of Object.entries(d.maxprepsExtraRows)) {
        if (!GUID_RE.test(id)) fail(`${d.id}: maxprepsExtraRows key ${id} is not a GUID`);
        if (!reason.trim()) fail(`${d.id}: maxprepsExtraRows ${id} has no reason`);
      }
      const extra = Object.keys(d.maxprepsExtraRows).length;
      if (d.maxprepsTeamCount + d.maxprepsMissing.length - extra !== d.expectedTeams) {
        fail(`${d.id}: maxprepsTeamCount + maxprepsMissing − maxprepsExtraRows must equal expectedTeams`);
      }
    }
    if (rules.postseasonFrom !== null) inWindow(rules.postseasonFrom, `${l.id} postseasonFrom`);
    for (const k of l.keyDates) inWindow(k.date, `${l.id} keyDate ${k.id}`);
    for (const step of l.phases) {
      if (step.through !== 'data' && step.through !== 'league-play') inWindow(step.through, `${l.id} phase ${step.phase}`);
    }
    switch (ps.kind) {
      case 'ccs-ladder':
        for (const p of ps.pairings) inWindow(p.date, `${p.id} date`);
        break;
      case 'league-tournament':
        for (const r of ps.rounds) inWindow(r.date, `${l.id} round ${r.id}`);
        break;
      case 'unbracketed-tournament':
      case 'section-playoffs':
        inWindow(ps.dates.first, `${l.id} postseason dates.first`);
        inWindow(ps.dates.last, `${l.id} postseason dates.last`);
        break;
      case 'no-postseason':
        break;
    }
  }

  // 3. the CCS field
  const aqKeys = Object.keys(CCS.autoQualifiers).sort();
  const expectedKeys = [...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort();
  if (aqKeys.join() !== expectedKeys.join()) {
    fail(`CCS.autoQualifiers keys ${aqKeys.join(', ')} != ${expectedKeys.join(', ')}`);
  }
  let sum = CCS.autoQualifiers.atLarge;
  for (const l of LEAGUES) {
    if (l.postseason.kind !== 'ccs-ladder') continue;
    if (l.postseason.autoBerths !== CCS.autoQualifiers[l.id]) {
      fail(`${l.id}: autoBerths ${l.postseason.autoBerths} != CCS ${CCS.autoQualifiers[l.id]}`);
    }
    if (l.sectionId !== 'ccs') fail(`${l.id}: a CCS ladder league outside the CCS`);
    sum += l.postseason.autoBerths;
  }
  if (sum !== CCS.autoQualifiers.total) fail(`CCS field sums to ${sum}, not ${CCS.autoQualifiers.total}`);
  const ccs = SECTION_BY_ID.get('ccs');
  if (ccs) {
    for (const [k, v] of Object.entries(CCS.keyDates)) {
      const day = v.slice(0, 10);
      if (day < ccs.seasonWindow.start || day > ccs.seasonWindow.end) fail(`CCS.keyDates.${k} outside the CCS season window`);
    }
  }

  // 8. ignored MaxPreps leagues are never configured
  for (const id of Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)) {
    if (ALL_DIVISIONS.some((d) => d.maxprepsLeagueId === id)) fail(`ignored MaxPreps league ${id} is configured`);
  }
}

assertLeagues();
