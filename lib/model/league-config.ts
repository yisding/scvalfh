/**
 * The shape of the league configuration (SPEC §2.1): regions, sections, leagues, divisions, rules, ladders,
 * pairings, postseasons, phases, data quality and the CCS block. The values are lib/leagues.ts, which
 * asserts them (SPEC §2.4). Types plus one `as const` table; imports nothing but model types.
 */

import type {
  CcsDivisionName, ContestId, DivisionId, LeagueId, OfficialSourceId, RegionId, SectionId, TeamId, TeamSlug,
} from './ids';
import type { CcsAutoQualifiers, CcsKeyDates, TournamentGame } from './postseason';
import type { SeasonPhase } from './season';
import type { PlayoffStatus, TiebreakStage } from './standings';

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

/**
 * Whether a source confirms that a level final MaxPreps marks W and L was decided by the section's shootout
 * (SectionConfig.shootout.inference): 'verified' prints the shootout, 'unverified' only the credited win.
 */
export const SHOOTOUT_INFERENCES = ['verified', 'unverified'] as const;
export type ShootoutInference = (typeof SHOOTOUT_INFERENCES)[number];

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
   *
   * `inference` says whether a source shows that such a level final WAS a shootout, which decides what copy
   * may print about it. 'verified' (the Northern Section): the 2026-09-28 Chico 1, Davis 1 box score carries an
   * 'SO Win' column (docs/DATA-SOURCES.md §1.1b), so copy says 'won on {words}' and the chip carries 'SO'.
   * 'unverified' (the San Diego Section): no box score or tally confirms one, and the other sources disagree
   * with MaxPreps' level score: si.com and the Section's power rankings both record Mt. Carmel–Poway (Sep 11)
   * as 2-0, where MaxPreps has 0-0 marked W and L. The site keeps MaxPreps' score and counts the flagged win,
   * but copy says only that the team was credited with the win on a level score (lib/format.ts
   * shootoutPhrases), never that a shootout decided it, and the chip carries no decider tag.
   * `disagreement` is the sentence the game page adds to an 'unverified' section's level-score note: what
   * the other sources record instead (null for a 'verified' section; assertLeagues checks both ways).
   *
   * `coversTournaments` says whether the rule reaches a tournament row (MaxPreps contestType 2 on either side).
   * true (the Northern Section): §VII.E.4 governs a varsity game, with no exception for tournaments. false
   * (the San Diego Section): the SDFHOA procedures have a "Varsity Overtime (regular season)" and a
   * "(Playoffs)" heading and do not cover invitational tournaments, where seven games between two San Diego
   * teams (Aug 21, Aug 22, Sep 12) are recorded 0-0, T and T. lib/normalize.ts then reads no 'SO' from a
   * tournament row and raises no level-final warning for one, and copy that states the rule says "outside a
   * tournament".
   * assertLeagues: set exactly when every league of the section has `leagueOvertime` 'shootout', and every
   * shootout rule names an inference.
   */
  shootout: {
    words: string;
    citation: string;
    inference: ShootoutInference;
    disagreement: string | null;
    coversTournaments: boolean;
  } | null;
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
   * 'contest-type' or 'membership' (the Sunset's pairs meet once or twice, the LA independents' two or three
   * times) and official mode 'none'.
   */
  gamesPerTeam: number | null;
  /**
   * First and last league date. From the league's official schedule where there is one; otherwise the
   * first league game on MaxPreps' schedules (the Sunset: Aug 18; each San Diego division: its earliest
   * game between two members, in the inventory read Mon Oct 5 Pacific) and the section's last allowed league date.
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
   * between two members (SCVAL, EAL); 'official-fixtures' = a fixture in the league's own schedule
   * (BVAL, PCAL, MCAL); 'membership' = any game between two members of one division dated inside its
   * leaguePlay, whatever MaxPreps' flag says (the San Diego divisions: on MaxPreps' schedules division-mates
   * meet twice, a double round robin, except Metro Mesa's Bonita Vista and Helix, listed once, while MaxPreps
   * flags as few as 0 of Patrick Henry's 10; the LA independents, five schools in no league whose
   * games against each other are the group's table, DESIGN §24.10). Under all three, excludeContestTypes rows
   * never count; 'membership' needs official mode 'none' (asserted).
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
   * no league or Southern Section rule is published; games between Sunset teams have ended level, and a Sunset
   * league game has been decided in overtime, so each is recorded as reported): ties stand. 'shootout' (EAL, NS
   * Guidelines §VII.E.4; the San Diego leagues, SDFHOA 2026 procedures, which do not cover invitational
   * tournaments): overtime, then a shootout to a winner, so a league game does not end level, and the section's
   * SectionConfig.shootout says how (asserted both ways). D2 rule 4c (phantom tie) applies only
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
   * The words for the league where its short name would stand alone: as the thing a control goes to or
   * shows ('Jump to … ↓', 'Show … here') or as a sentence's subject ('… publishes no schedule'). Set only
   * where the short name would read as something else there; read through `standaloneName`. 'Jump to North ↓' reads as a compass direction, so the North
   * County Conference's is 'North County'; 'LA' alone names a place, so the LA independents' is 'the LA
   * independents'. Every other league's is its short name.
   */
  standaloneName?: string;
  /**
   * A group of independents, not a league (the LA independents, DESIGN §24.9, §24.10): schools in
   * no field hockey league, grouped by this site. It has a table (its members' games against each other,
   * classification 'membership') but is never counted as a league: LEAGUES_PROPER leaves it out, copy names it
   * apart ("nine leagues and five independents", never "ten leagues"), and its short name, an adjective, is
   * never a sentence's subject (standaloneName). Read through isIndependentLeague.
   */
  independents?: true;
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
   * A contest whose MaxPreps date a better source contradicts, moved to that source's date in lib/normalize.ts
   * (before the date key is taken and the games are sorted, so schedules, last-5 and streaks read the corrected
   * order). `timeTba` true: the source gives no start time, so none is invented and the game reads "time TBA".
   * `source` is one sentence naming the source, what it says, and what MaxPreps says; the game page prints it
   * (Game.provenance.dateCorrection). Keys are contest GUIDs, `dateKey` a YYYY-MM-DD (assertLeagues).
   */
  contestDateOverrides: Readonly<Record<ContestId, { dateKey: string; timeTba: true; source: string }>>;
  /**
   * Search "not covered" entries (exact-key matches only). `reason` is printed verbatim as a whole sentence
   * (components/search/TeamFinder.tsx), so each is one: never 'inactive', 'withdrew', 'dropped' or
   * 'cancelled' for a school whose only fact is that it has no games.
   */
  notCovered: readonly { name: string; keys: readonly string[]; reason: string }[];
}

/**
 * The CCS section block (SPEC §2.1). The snapshot's `playoffs.keyDates` / `playoffs.format` copies
 * (lib/model/postseason.ts CcsPlayoffs) reuse these types, so config and snapshot cannot drift.
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
