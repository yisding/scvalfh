/**
 * The normalized domain model: sections → leagues → divisions → teams, games, standings.
 * League facts (rules, chains, ladders, dates) are NOT here; they are config in lib/leagues.ts.
 * Everything is exported; nothing here is a class and nothing here has behaviour.
 */

// ---------- identity ----------

/** MaxPreps `schoolId` / `teamId` GUID. THE primary key across all sources. */
export type TeamId = string;

/**
 * MaxPreps `contestId` GUID, or `sblive:<digits>` for a game that only si.com has and that D2 rule 2
 * published (lib/backfill.ts). URL params map ':' to '-' (lib/game-id.ts).
 */
export type ContestId = string;

/**
 * The five CIF sections with a covered league: three in Northern California (CCS, NCS, NS) and two in
 * Southern California (the Southern Section's 'ss' and the San Diego Section's 'sds'). The snapshot
 * schema's `sectionId` enum is this list (lib/snapshot-schema.ts proves the two agree at compile time).
 */
export type SectionId = 'ccs' | 'ncs' | 'ns' | 'ss' | 'sds';

/**
 * The site's two halves, the NorCal/SoCal toggle (DESIGN-socal §2.1.1). A property of a SECTION
 * (SectionConfig.region in lib/leagues.ts), so a league's or a team's region is always derived from its
 * section and never stored in the snapshot. Not the clubs' CLUB_REGIONS (lib/clubs-schema.ts) and not a
 * venue's `address.region` (a state code): those are separate concepts that happen to share the word.
 */
export type RegionId = 'norcal' | 'socal';

/**
 * 'scval' | 'bval' | 'pcal' | 'mcal' | 'eal' | 'sunset' | 'city' | 'north-county' | 'metro' as DATA.
 * Validated against LEAGUES at load and at parse.
 */
export type LeagueId = string;

/**
 * One league table. Globally unique: 'de-anza' | 'el-camino' | 'mt-hamilton' | 'santa-teresa' | 'pcal' |
 * 'marin-county' | 'eal' | 'sunset' | 'city-western' | 'city-eastern' | 'avocado' | 'palomar' | 'valley' |
 * 'metro-mesa' | 'metro-south-bay'. A single-division league may reuse its league id ('pcal', 'eal',
 * 'sunset'). Usually one MaxPreps table, but not always: the San Diego Section's Valley division has no
 * MaxPreps table at all (DivisionConfig.maxprepsLeagueId null).
 */
export type DivisionId = string;

/** Our URL slug, validated against the registry. The 15 SCVAL slugs are frozen. */
export type TeamSlug = string;

/** The CCS PLAYOFF division (never a league division). Always "CCS Division 1/2" in copy. */
export type CcsDivisionName = 'Division 1' | 'Division 2';

/** The league documents an official schedule is read from; the snapshot and bundle schemas take z.enum of this list. */
export const OFFICIAL_SOURCE_IDS = ['scval-pdf', 'bval-docx', 'pcal-pdf', 'mcal-pdf'] as const;

export type OfficialSourceId = (typeof OFFICIAL_SOURCE_IDS)[number];

export type SourceId =
  | 'maxpreps-api' | 'maxpreps-html' | 'sblive' | OfficialSourceId
  | 'ccs-pdf' | 'ccs-ical' | 'vnn-ics' | 'cifss' | 'derived';

// ---------- season ----------

export interface SeasonWindow {
  /** min dateLocal over the games in scope. */
  firstGame: string | null;
  /**
   * Global window: max dateLocal where `isLeague` (the original single-league semantics, unchanged).
   * League window: max dateLocal where `countsFor` is one of the league's divisions (any status).
   */
  lastLeagueGame: string | null;
  /** max dateLocal over the games in scope. */
  lastGame: string | null;
}

export interface SeasonSection {
  id: SectionId;
  name: string;                       // 'Central Coast Section'
  maxprepsSectionId: string;
  holdsFieldHockeyChampionship: boolean;
}

export interface SeasonDivision {
  id: DivisionId;
  /** Our UI label ('De Anza', 'Mt. Hamilton', 'PCAL', 'MCAL', 'EAL'). MaxPreps' own name is NOT stored. */
  label: string;
  /**
   * MaxPreps' league GUID for this division's table, copied from config. null where MaxPreps publishes no
   * table for the division (the San Diego Section's Valley: its six teams all sit in MaxPreps' zero-GUID
   * "no league", inventory 2026-10-06), so the pipeline requests nothing for it.
   */
  maxprepsLeagueId: string | null;
}

/**
 * Every LeagueConfig['postseason']['kind'] (lib/leagues.ts), as the snapshot stores it. 'no-postseason' is
 * the Sunset (the CIF Southern Section holds no field hockey playoffs: Blue Book 2026-27 Bylaws 2011.1 and
 * 3500.2); 'section-playoffs' is the three San Diego Section leagues (the Section's own Open/I/II
 * playoffs, placed from its power rankings: Green Book 2026-27 Bylaw 2000.1).
 */
export type PostseasonKind =
  | 'ccs-ladder' | 'league-tournament' | 'unbracketed-tournament' | 'no-postseason' | 'section-playoffs';

export interface SeasonLeague {
  id: LeagueId;
  sectionId: SectionId;
  name: string;                       // 'Blossom Valley Athletic League'
  shortName: string;                  // 'BVAL'
  divisions: SeasonDivision[];
  /** NEW. Copied from config (LEAGUES[].postseason.kind) and validated against it (checkAgainstConfig #6). Lets scripts read the tournament leagues from the snapshot. */
  postseasonKind: PostseasonKind;
  /**
   * Over games with at least one registry side in this league AND `postseason === null` (crossover, play-in,
   * MCAL tournament and CCS games never extend it). Drives this league's phase.
   */
  window: SeasonWindow;
}

export interface Season {
  /** "26-27" */
  year: string;
  label: string;
  sportSeasonId: string;
  allSeasonId: string;
  genderSport: 'girls,fieldhockey';
  teamLevel: 'Varsity' | 'JV';
  /** Config order: ccs, ncs, ns, ss, sds. */
  sections: SeasonSection[];
  /** Config order: scval, bval, pcal, mcal, eal, sunset, city, north-county, metro. */
  leagues: SeasonLeague[];
  /** Global window over every kept contest — the original single-league semantics, unchanged. */
  window: SeasonWindow;
}

// ---------- team ----------

export interface TeamColors {
  /** hex, no '#' */
  primary: string;
  secondary: string;
  /** Ink that clears AA on `primary`, computed at build (DESIGN §12.4). */
  onPrimary: '#0e1116' | '#ffffff';
  /** 'placeholder' when no upstream row exists. */
  source: 'maxpreps-standings' | 'placeholder';
}

export interface TeamExternalIds {
  maxprepsTeamId: TeamId;
  maxprepsTeamUrl: string | null;
  maxprepsScheduleUrl: string | null;
  /** numeric si.com TEAM id, e.g. "458850". Never guessed. */
  sbliveTeamId?: string;
  /** NEW. numeric si.com SCHOOL id from a logo URL `/uploads/production/school/{id}/`. Never guessed. */
  sbliveSchoolId?: string;
  sbliveGamesUrl?: string;
  vnnSiteId?: string;
  vnnIcsUrl?: string;
}

export interface Team {
  id: TeamId;
  slug: TeamSlug;
  /**
   * The school's one canonical full name, everywhere the site names it in full: the name people
   * use, without "High School" or "College Preparatory" ('St. Ignatius', 'Archbishop Mitty').
   * Source spellings ('ST. IGNATIUS', 'MItty', 'Presentation HS') are aliases, never shown.
   */
  name: string;
  /**
   * The one canonical short name (≤ 16 characters), for rows and tiles too narrow for `name`: the
   * name the school goes by ('Mitty', 'Sobrato', 'Convent', 'SF University'). It is `name` itself,
   * whole words of it, or one of the school's aliases (a spelling a source uses), never a made-up
   * abbreviation; enforced at load (lib/teams.ts). Display only: resolution never keys on it.
   */
  shortName: string;
  /** 2 letters, unique across the whole registry (102 teams). */
  abbr: string;
  /** MaxPreps `schoolNameAcronym`. Display only: NOT unique; indexed for resolution only when unique. */
  acronym: string;
  mascot: string;
  city: string;
  /** Globally unambiguous spellings only. League-grid codes live in LeagueConfig.officialCodes. */
  aliases: string[];
  /**
   * The section of the team's field hockey league (where its field hockey postseason is held), not
   * necessarily the school's CIF membership: Davis and Bella Vista are Sac-Joaquin Section schools in
   * the Northern Section's EAL.
   */
  section: SectionId;
  /** NEW — replaces `isScvalMember: true`. */
  league: LeagueId;
  division: DivisionId;
  /** 'none' = in the league's official alignment, absent from every data source. */
  dataCoverage: 'full' | 'partial' | 'none';
  colors: TeamColors;
  mascotUrl: string | null;
  external: TeamExternalIds;
}

// ---------- game ----------

export type GameStatus =
  /** contestState 2 */
  | 'scheduled'
  /** contestState 3 — never observed; rendered as a scheduled window (DESIGN §5.2) */
  | 'live'
  /** contestState 4 */
  | 'final'
  /** contestState 5 ScoreNotReported */
  | 'score-pending'
  /** inferred from a /reschedul/i location note — [U] (SPEC §4 notes) */
  | 'postponed';
// NOTE: contestState 1 (Deleted) rows are DROPPED, never stored as a canceled game,
// because such rows can carry real scrimmage scores (SPEC §5.5.2).

export type Outcome = 'W' | 'L' | 'T';

/**
 * 'SO' = a level final that MaxPreps flags W/L between two teams of a SECTION whose `shootout` rule is set
 * (SectionConfig.shootout in lib/leagues.ts): the Northern Section's EAL (1 v 1s, NS Guidelines §VII.E.4)
 * and the San Diego Section (a 5-player shootout; the San Diego Field Hockey Officials Association 2026
 * Mercy & Overtime Procedures credit the winner one goal, but MaxPreps often keeps the level score and
 * marks it W and L). Keyed on the section, not the league, because the San Diego rule covers every varsity
 * game in the Section, across its three conferences. `Game.shootout` may then be null (the tally is not
 * stored). The CCS, NCS and Southern Section leagues never produce it.
 */
export type Decider = 'REG' | 'OT' | '2OT' | 'SO' | 'FORFEIT';

export interface Record3 { w: number; l: number; t: number }

/** One side of a contest. `teamId` null ⇒ a non-SCVAL opponent, name only (SPEC §4 notes). */
export interface GameSide {
  teamId: TeamId | null;
  /** Our slug when this side is a registry member. */
  slug: TeamSlug | null;
  name: string;
  city?: string;
  /** null, never coerced to 0 (SPEC §5.5.3). */
  score: number | null;
  /** MaxPreps `teams[].result`; null before the game. */
  result: Outcome | null;
}

export interface GameVenue {
  /** `contest.location` — a NOTE field, not a venue field ("Senior Night", "Too be rescheduled"). */
  text: string | null;
  /** Only from a game page's ld+json Place. Fetched lazily, never in the sweep. */
  name?: string;
  address?: { street: string; city: string; region: string; postalCode: string };
}

/**
 * Why a game is postseason. A postseason game never counts for a table. (SCVAL classifies by contest-type: a
 * crossover or play-in is never same-division, and a same-division game tagged 'ccs' is excluded — lib/classify.ts.)
 */
export interface PostseasonTag {
  /**
   * 'mcal-tournament' is the tag of any league whose postseason.kind is 'league-tournament' (MCAL today); the
   * literal is kept for snapshot stability (lib/snapshot-schema.ts PostseasonTagSchema). lib/classify.ts assigns.
   * 'section-playoffs' is the San Diego Section's playoffs (DESIGN-socal §2.1.7): any game between two
   * teams of a section whose leagues' postseason.kind is 'section-playoffs', dated on or after the
   * leagues' `postseasonFrom` (Nov 2) or carrying contestType 4, whether or not the two share a conference;
   * one label for the whole tournament, never 'league-postseason'.
   */
  kind: 'scval-crossover' | 'bval-play-in' | 'mcal-tournament' | 'league-postseason' | 'section-playoffs' | 'ccs' | 'other';
  /**
   * Set for every league-scoped kind. 'ccs', 'other' and 'section-playoffs' may be null: no shared registry
   * league (a San Diego playoff game between two conferences has none).
   */
  leagueId: LeagueId | null;
  /**
   * 'section-postseason-window' = dated on or after the section-playoffs leagues' `postseasonFrom` (the
   * section-wide counterpart of 'league-postseason-window'); a contestType-4 row stays 'contest-type-4'.
   */
  via: 'config-pairing' | 'contest-type-4' | 'league-postseason-window' | 'section-postseason-window' | 'ccs-window';
}

/** Set when a contest matched a fixture in a league's official schedule. */
export interface OfficialStamp {
  /** The official date, YYYY-MM-DD. Differs from dateKey when the game moved. */
  scheduledDate: string;
  /** The FIXTURE's division — the classifier's evidence. */
  division: DivisionId;
  source: OfficialSourceId;
  /** OfficialFixture.id */
  fixtureId: string;
  pass: 'same-date' | 'same-date-swapped' | 'rescheduled';
}

/** How a si.com value entered a published game (owner decision D2, rules 2-4). */
export interface BackfillProvenance {
  rule: 'absent-fixture' | 'score-pending' | 'contradictory-result' | 'off-schedule-date' | 'phantom-tie';
  sbliveGameId: string;
  /** What MaxPreps said, when it said anything (rules 3-4). */
  maxpreps: { home: number; away: number } | null;
  /** One sentence, safe to render verbatim. */
  note: string;
}

export interface Game {
  contestId: ContestId;
  dateLocal: string;
  dateUtc: string;
  dateKey: string;
  isDateTba: boolean;
  isTimeTba: boolean;
  home: GameSide;
  away: GameSide;
  site: 'home' | 'away' | 'neutral';
  status: GameStatus;
  /** "What MaxPreps says": contestType === 0 on either row. Evidence for SCVAL only; never overwritten. */
  isLeague: boolean;
  /** Membership only: both sides are registry members of the SAME division. Necessary, not sufficient. */
  leagueDivision: DivisionId | null;
  /** NEW. Raw MaxPreps contestType per row (0 league, 1 non-league, 2 neutral/tournament, 4 postseason); null when unknown or si.com-only. */
  contestTypes: { home: number | null; away: number | null };
  /**
   * NEW. THE classification (lib/classify.ts classifyGame), for ANY status: the division whose table
   * this game belongs to. Standings count it once status === 'final'. Chips, filters and counts read it.
   */
  countsFor: DivisionId | null;
  /** NEW. Crossover, play-in, MCAL tournament, EAL Super Regional, San Diego Section playoff and CCS games. */
  postseason: PostseasonTag | null;
  otPeriods: number;
  isOt: boolean;
  isForfeit: boolean;
  forfeitBy: 'home' | 'away' | null;
  decider: Decider | null;
  /**
   * A tally, when one is stored (none today). An EAL 1 v 1 win, and a San Diego Section shootout win that
   * MaxPreps records as a level score marked W and L, have decider 'SO' and shootout null; MCAL tournament
   * shootouts are stored by MaxPreps as goals (see caveat copy).
   */
  shootout: { home: number; away: number } | null;
  venue: GameVenue;
  timeConfirmed?: boolean;
  /** WIDENED: any league's official schedule. */
  official?: OfficialStamp;
  recap: string | null;
  urls: {
    maxpreps: string | null;
    sblive?: string;
    nfhsStream: string | null;
    goFan: string | null;
  };
  provenance: {
    /** 'sblive' when D2 published a si.com score. */
    scores: SourceId;
    schedule: SourceId;
    /** Plain disagreement (D2 rule 5) or the overridden MaxPreps value (rule 4). */
    scoreConflict?: { sblive: { home: number; away: number }; note: string };
    /** NEW. Set on every game whose published score came from si.com. */
    backfill?: BackfillProvenance;
    fetchedAt: string;
    maxprepsModifiedOn?: string;
    leagueFlagConflict?: string;
    hostConflict?: string;
    /** NEW. D2 rule 4a evidence: result flags contradict the score, or the two rows disagree. */
    resultConflict?: string;
    /** NEW. Why a same-division game does NOT count (e.g. "Not on the official BVAL schedule; not counted"). */
    classificationNote?: string;
    /**
     * NEW. Set when DATA_QUALITY.contestDateOverrides (lib/leagues.ts) moved this contest off MaxPreps' date:
     * MaxPreps' own `dateLocal` and the override's source sentence, so the game page can say the date was
     * corrected, from what, and on whose word.
     */
    dateCorrection?: { maxprepsDateLocal: string; maxprepsTimeTba: boolean; source: string };
    /**
     * NEW. Set when MaxPreps records no overtime but the coach's game note says the game went to it
     * (lib/normalize.ts overtimeFromNote): the note, so the game page can say where the OT came from.
     */
    overtimeNote?: string;
  };
}

// ---------- standings ----------

/** Each member is code in lib/standings.ts. The ORDER of a chain is config (lib/leagues.ts). */
export type TiebreakStage =
  | 'points'                   // placed on points alone
  | 'head-to-head'             // SCVAL §3, BVAL §6b, PCAL §23.3 — SCVAL's original stage
  | 'division-wins'            // SCVAL §4, BVAL §6c
  | 'h2h-goals-against'        // SCVAL §5
  | 'h2h-goal-diff'            // SCVAL §6, BVAL §6d
  | 'division-goals-against'   // BVAL §6e — fewest goals allowed in ALL division games
  | 'record-vs-higher-placed'  // PCAL §23.3.3
  | 'record-vs-lower-placed'   // PCAL §23.3.1(b), §23.3.3(c)
  | 'h2h-win-pct'              // MCAL criterion 1
  | 'record-above-tie'         // MCAL criterion 2
  | 'draw-number'              // MCAL criterion 3 — lowest spring draw number wins; always resolves
  | 'ccs-points'               // PCAL — uncomputable terminal; teams stay level
  | 'coin-flip'                // SCVAL §7, BVAL §6f — uncomputable terminal; teams stay level
  | 'no-rule'                  // PCAL ties whose points bucket starts at 3rd or lower — no tiebreak; teams stay level
  | 'play-in';                 // MCAL last tournament place — a play-in decides it unless one team swept 2-0; teams stay level

/** Union over every league's ladder. Labels are per league (config), never global. */
export type PlayoffStatus =
  | 'aq'           // automatic CCS berth by place
  | 'play-in'      // SCVAL 4th (Oct 30); BVAL Mt. Hamilton 4th and Santa Teresa 1st (Oct 31)
  | 'at-large'     // SCVAL 5th: submitted to CCS for at-large consideration
  | 'out'          // SCVAL 6th+: "No automatic path" (the original SCVAL wording)
  | 'no-aq-route'  // BVAL/PCAL off the ladder: "No automatic-berth route" — never "eliminated"
  | 'bye'          // MCAL seeds 1-2
  | 'tournament'   // MCAL seeds 3-6; EAL places 1-6 (Super Regional); San Diego 1st (a designated league
                   //   champion is guaranteed at least a play-in, Green Book 2000.1)
  | 'below-line'   // MCAL 7th+
  | 'selection'    // San Diego 2nd+: no league route; the Section places teams from its power rankings
  | 'no-postseason'; // the Sunset, every place: the CIF Southern Section holds no field hockey playoffs

export interface ComputedRecord {
  gp: number;
  w: number;
  l: number;
  t: number;
  /** (w + t/2) / gp — CIF convention, asserted against MaxPreps (SPEC §5.6). 0 when gp === 0. */
  winPct: number;
  /** 3*w + 1*t — By-Laws Article VI §2. THE ordering key. */
  pts: number;
  gf: number;
  ga: number;
  gd: number;
  streak: { count: number; result: Outcome } | null;
  /** Oldest → newest, at most 5 (DESIGN §5.5). */
  last5: Outcome[];
  homeRecord: Record3;
  awayRecord: Record3;
  neutralRecord: Record3;
  /** 1-based. Teams sharing a place after §7 share the number. */
  place: number;
}

/** MaxPreps' own row, verbatim, for the published cross-check (DESIGN §9). */
export interface ReportedRecord {
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  overallWins: number;
  overallLosses: number;
  overallTies: number;
  conferencePoints: number;
  conferencePointsAgainst: number;
  points: number;
  pointsAgainst: number;
  conferenceContestsPlayed: number;
  overallContestsPlayed: number;
  conferenceStandingPlacement: number | null;
  conferenceWinningPercentage: number;
  winningPercentage: number;
  streak: number;
  streakResult: Outcome | null;
  homeWins: number; homeLosses: number; homeTies: number;
  awayWins: number; awayLosses: number; awayTies: number;
  neutralWins: number; neutralLosses: number; neutralTies: number;
  modifiedOn: string;
}

export interface TiebreakInfo {
  /** The Article VI step that placed this team. */
  resolvedBy: TiebreakStage;
  /** One sentence, citing the by-law, safe to render verbatim. */
  note: string;
  /** Other teams that share this exact place (empty unless `shared`). */
  tiedWith: TeamId[];
  /** true ⇒ Article VI §7 coin flip; render as tied, footnote it (ADDENDUM §7). */
  shared: boolean;
}

/** SHAPE UNCHANGED — only field types widen. Derived per-row facts live in lib/data.ts StandingContext. */
export interface Standing {
  teamId: TeamId;
  slug: TeamSlug;
  division: DivisionId;
  computed: ComputedRecord;
  overall: ComputedRecord;
  reported: ReportedRecord | null;
  mismatch: boolean;
  mismatchDetail?: string;
  tiebreak: TiebreakInfo;
  playoffStatus: PlayoffStatus;
  hasReportedResults: boolean;
}

// ---------- CCS playoffs (the snapshot key stays `playoffs`) ----------

export interface CcsKeyDates {
  entriesDue: string;          // '2026-11-02T12:00:00'
  seedingMeeting: string;      // '2026-11-02T13:00:00'
  quarterfinals: string;       // '2026-11-07'
  semifinals: string;          // '2026-11-11'
  finals: string;              // '2026-11-14'
  evaluationMeeting: string;   // '2026-11-19T16:00:00'
  /** NEW: CCS end of league season. `crossover` MOVED to LEAGUES.scval (pairings + phases). */
  endOfLeagueSeason: string;   // '2026-10-31'
}

/** Numbers only. Keys = every league whose postseason.kind is 'ccs-ladder', plus atLarge and total. */
export interface CcsAutoQualifiers {
  [leagueId: string]: number;
  atLarge: number;
  total: number;
}

/** One VEVENT from `cifccs.org/calendar/Field_Hockey?print=ical` (SPEC §1.4). */
export type CcsEventKind =
  | 'entries-due'
  | 'quarterfinals'
  | 'semifinals'
  | 'finals'
  | 'evaluation'
  | 'other';

export interface CcsCalendarEvent {
  /** YYYY-MM-DD — these are all-day VEVENTs. */
  date: string;
  /** SUMMARY with the feed's "(Field Hockey) " prefix stripped. */
  summary: string;
  kind: CcsEventKind;
  uid: string | null;
  /** DESCRIPTION, which carries the clock time ("12:00 noon", "4:00 pm"). */
  detail: string | null;
}

export interface CcsPlayoffs {
  keyDates: CcsKeyDates;
  ccsCalendar?: CcsCalendarEvent[];
  keyDatesConfirmed?: boolean;
  format: {
    elimination: 'single';
    /** RENAMED from `divisions`. */
    ccsDivisions: Array<{ name: CcsDivisionName; seeds: [number, number] }>;
    autoQualifiers: CcsAutoQualifiers;
    highSeedHostsThrough: 'semifinals';
  };
  bracketPublished: boolean;
  bracketUrl: string;
  games: Game[];
}

// ---------- league postseason projections (derived in lib/data.ts, never stored) ----------

/** Who can take one seat. Empty = TBD; 2+ = a level place spans the seat (all are named). */
export type CrossoverSeat = Array<{ teamId: TeamId; slug: TeamSlug }>;

/** SCVAL crossover (×4) and BVAL play-in (×1): one generic, config-driven shape. */
export interface LeaguePairing {
  id: string;                          // 'scval-crossover-1' … 'scval-crossover-4', 'bval-play-in'
  leagueId: LeagueId;
  date: string;                        // YYYY-MM-DD
  time: string | null;                 // '11:00' (BVAL); null (SCVAL)
  seats: [CrossoverSeat, CrossoverSeat];
  seatLabels: [string, string];        // ['De Anza #4', 'El Camino #4'] | ['Santa Teresa #1', 'Mt. Hamilton #4']
  /** Index of the hosting seat; null = not stated (SCVAL crossover). BVAL: 0. */
  host: 0 | 1 | null;
  isPlayIn: boolean;
  label: string;
  /** The contest once MaxPreps has it (postseason tag + seat teams on the pairing date). */
  game: Game | null;
}

export interface LadderRow {
  teamId: TeamId;
  slug: TeamSlug;
  place: number;
  /** statuses[0] */
  status: PlayoffStatus;
  /** Every status still open, best first; >1 only when a level place straddles a rung boundary. */
  statuses: PlayoffStatus[];
  /** Written words from the league's ladder; 'No results reported' for a team without results. */
  label: string;
  shared: boolean;
}

/** Per CCS league. */
export interface PlayoffProjection {
  asOf: string;
  leagueId: LeagueId;
  /** { auto: autoQualifiers[league], total: 16 } */
  berths: { auto: number; total: number };
  byDivision: Record<DivisionId, LadderRow[]>;
  /** SCVAL: 4 crossover pairings; BVAL: the play-in; PCAL: []. */
  pairings: LeaguePairing[];
}

export type TournamentSlot =
  | { kind: 'seed'; seed: number; seat: CrossoverSeat }
  | { kind: 'winner-of'; gameId: TournamentGame['id']; label: string }
  | { kind: 'rule'; text: string };    // e.g. 'Lowest-ranked remaining seed'

export interface TournamentGame {
  id: 'play-in' | 'qf-1' | 'qf-2' | 'sf-1' | 'sf-2' | 'final';
  round: 'play-in' | 'quarterfinal' | 'semifinal' | 'final';
  date: string;
  time: string;                        // '16:00'
  home: TournamentSlot;
  away: TournamentSlot;
  /** 'Tamalpais' for the final (fixed site); null = the home seat's field. */
  site: string | null;
  /** The matched MCAL postseason contest, once it exists. */
  game: Game | null;
  /** e.g. the shootout caveat on a one-goal tournament result. */
  note: string | null;
}

export interface LeagueTournamentProjection {
  leagueId: LeagueId;
  asOf: string;
  status: 'projected' | 'seeded' | 'in-progress' | 'complete';
  /** Seeds 1..6; a seat with >1 contender = an unresolved 6th-place play-in or an undefined tie. */
  seeds: Array<{ seed: number; seat: CrossoverSeat }>;
  playInNeeded: 'no' | 'yes' | 'possible';
  playIn: TournamentGame | null;
  games: TournamentGame[];             // qf-1, qf-2, sf-1, sf-2, final (play-in is separate)
  notes: string[];
}

// ---------- fixtures ----------

export interface OfficialFixture {
  /** `${division}:${dateKey}:${awaySlug ?? awayName}@${homeSlug ?? homeName}` — stable key. */
  id: string;
  league: LeagueId;
  division: DivisionId;
  /** The official date, YYYY-MM-DD. */
  dateKey: string;
  /** League-published varsity start 'HH:MM', when the source states one. */
  time: string | null;
  /** Grid spelling, verbatim (SCVAL uppercase; BVAL docx; PCAL code name; MCAL legend name). */
  awayName: string;
  homeName: string;
  awaySlug: TeamSlug | null;
  homeSlug: TeamSlug | null;
  source: OfficialSourceId;
}

// ---------- pipeline health ----------

export type SourceKind =
  | 'bootstrap' | 'league-meta' | 'reported-standings' | 'team-schedule'
  | 'official-schedule' | 'official-revision-check' | 'standings-index'
  | 'sblive-scoreboard' | 'sblive-team-games'
  | 'ccs-calendar' | 'ccs-bracket' | 'school-calendar' | 'cifss-scores';

export interface SourceStatus {
  id: SourceId;
  /** NEW (always set by the v2 pipeline; absent on rows migrated from v1). */
  kind?: SourceKind;
  /** NEW. Which section/league/division/team the row is about. Absent = global. */
  scope?: { section?: SectionId; league?: LeagueId; division?: DivisionId; team?: TeamSlug };
  label: string;
  url: string;
  status: 'ok' | 'stale' | 'error' | 'skipped';
  httpStatus?: number;
  fetchedAt: string;
  /** NEW. When a stale row's data was last fresh (copied from the previous snapshot). */
  carriedFrom?: string;
  upstreamModifiedOn?: string;
  error?: string;
  rowCount?: number;
}

export type LeagueRunState = 'fresh' | 'partial' | 'frozen' | 'degraded';

export interface DivisionHealth {
  divisionId: DivisionId;
  meta: 'ok' | 'error' | 'mismatch' | 'skipped';
  reportedTable: 'ok' | 'carried' | 'missing' | 'skipped';
  reportedRows: number | null;
  /**
   * The division's LeagueRules.classification ('membership' = Sunset, the San Diego divisions and the LA
   * independents: both sides members, whatever MaxPreps' league flag says), or 'fallback-contest-type' when an
   * official-fixtures division fell back to MaxPreps' flag this run.
   */
  classification: 'contest-type' | 'official-fixtures' | 'membership' | 'fallback-contest-type';
  official: {
    source: OfficialSourceId;
    total: number;
    matched: number;
    /** Official fixtures dated before today with no counted result. */
    missingPast: number;
    carried: boolean;
    /** The upstream document's sha256 differs from our bundled copy's. */
    revisedUpstream: boolean;
  } | null;
  countedFinals: number;
  previousCountedFinals: number | null;
  backfilled: number;
  /**
   * Only on a division whose official.mode is 'none' (EAL, Sunset, the San Diego divisions): league games
   * (MaxPreps-flagged, or for 'membership' every game between two members), dated before today, with no
   * counted result. Fixture-backed divisions carry this count in `official.missingPast`.
   */
  missingLeaguePast?: number;
}

export interface LeagueHealth {
  leagueId: LeagueId;
  state: LeagueRunState;
  /** fetchedAt of the last run in which this league was 'fresh' or 'partial'. */
  lastFreshAt: string | null;
  /** Plain sentences, safe to render verbatim (league banner, /about health card). */
  reasons: string[];
  divisions: DivisionHealth[];
  teamFeeds: { total: number; ok: number; carried: number; failed: number };
}

/** A contest the pipeline removed on purpose, published so nothing disappears silently. */
export interface DroppedContest {
  contestId: ContestId;
  reason: 'ghost-team' | 'excluded-by-config' | 'tba-opponent' | 'phantom-duplicate';
  note: string;
  dateKey: string | null;
  teams: string[];
}

// ---------- cross-checks ----------

export interface CrossCheckRow {
  slug: TeamSlug;
  field: string;
  ours: string;
  theirs: string;
  url: string;
  /** NEW. The division's known reason this table differs (DivisionConfig.knownCause). */
  knownCause?: string;
}

/** Plain disagreement (D2 rule 5): MaxPreps stays. */
export interface ScoreConflictRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", using our display names. */
  label: string;
  /** What we publish. MaxPreps is never overwritten. */
  maxpreps: { home: number; away: number };
  sblive: { home: number; away: number };
  /** false ⇒ the two SBLive names could not be matched to our home/away slots. */
  aligned: boolean;
  maxprepsUrl: string | null;
  sbliveUrl: string | null;
  note: string;
}
/** A si.com-only score that D2 did NOT publish, and why. */
export interface SbliveOnlyRow {
  contestId: ContestId;
  dateKey: string;
  label: string;
  sblive: { home: number; away: number };
  aligned: boolean;
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
  status: GameStatus;
  note: string;
}

/** NEW. One si.com value D2 published or used to override MaxPreps. */
export interface BackfillRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", our display names. */
  label: string;
  rule: BackfillProvenance['rule'];
  sblive: { home: number; away: number };
  maxpreps: { home: number; away: number } | null;
  sbliveUrl: string;
  maxprepsUrl: string | null;
  note: string;
}

export interface SbliveCrossCheck {
  sbliveFetchedAt: string;
  compared: number;
  agreements: number;
  conflicts: ScoreConflictRow[];
  sbliveOnlyScored: SbliveOnlyRow[];
  /** NEW. Every si.com value D2 published (rules 2-4), with both values and the rule. */
  backfilled: BackfillRow[];
}

/** A game cifsshome.org and MaxPreps both score, with different numbers. MaxPreps' score stands. */
export interface CifssConflictRow {
  contestId: ContestId;
  dateKey: string;
  /** "Away at Home", our display names. */
  label: string;
  maxpreps: { home: number; away: number };
  /** Aligned to MaxPreps' home and away teams. */
  cifss: { home: number; away: number };
  maxprepsUrl: string | null;
  /** The widget listing of that Section on that date. */
  cifssUrl: string;
  note: string;
}

/**
 * A cifsshome.org score MaxPreps does not have: either MaxPreps lists the game with no score
 * (`contestId` is its contest), or MaxPreps has no contest for the pair within three days of the date
 * (`contestId` is `cifss:<row id>`). Never published as a result.
 */
export interface CifssOnlyRow {
  contestId: string;
  dateKey: string;
  label: string;
  /** Aligned to MaxPreps' home and away when MaxPreps lists the game; the widget's own otherwise. */
  cifss: { home: number; away: number };
  /** The two sides' lib/teams.ts sideJoinKey, `a~b` sorted: how a later run tells whether MaxPreps has the game yet. */
  pairKey: string;
  maxprepsUrl: string | null;
  cifssUrl: string;
  note: string;
}

/**
 * The cifsshome.org score cross-check: every scored widget row with one of our teams, season to
 * date, joined to MaxPreps on (date, unordered pair), or the pair's nearest game within three days.
 */
export interface CifssCrossCheck {
  /** The run that read the widget (season start through that run's local date). */
  cifssFetchedAt: string;
  /** Games both sources score: `agreements + conflicts.length`. */
  compared: number;
  agreements: number;
  conflicts: CifssConflictRow[];
  /** Games MaxPreps lists with no score yet. */
  cifssOnlyScored: CifssOnlyRow[];
  /** Games MaxPreps has no contest for (nor a deleted or dropped one). */
  notOnMaxPreps: CifssOnlyRow[];
}

export type SeasonPhase =
  | 'preseason'
  | 'regular'
  | 'crossover'     // SCVAL only
  | 'play-in'       // BVAL only (Oct 31)
  | 'tournament'    // MCAL (Oct 23-30), EAL (Oct 29-31), San Diego Section playoffs (Nov 2-14)
  | 'playoffs'      // CCS bracket window (CCS leagues only)
  | 'complete';

// ---------- snapshot ----------

export interface Snapshot {
  /** NEW. v1 files (no field) are upgraded in memory by lib/snapshot-migrate.ts. */
  schemaVersion: 2;
  /** ISO UTC, when the run started. 'today' everywhere is derived from this. */
  fetchedAt: string;
  season: Season;
  /** EXACTLY the registry (102), in registry order, left-joined against the feeds. */
  teams: Team[];
  /** Deduped on contestId. */
  games: Game[];
  /** One row per registry team, in LEAGUES order then division order then place. */
  standings: Standing[];
  /** The CCS section block. */
  playoffs: CcsPlayoffs;
  /** One row per request; deterministic order (§7.12). */
  sources: SourceStatus[];
  /** NEW. One row per configured league, config order. */
  leagueHealth: LeagueHealth[];
  /** NEW. Contests removed on purpose this run. */
  dropped: DroppedContest[];
  crossCheck: CrossCheckRow[];
  sbliveCrossCheck?: SbliveCrossCheck;
  /** NEW. The cifsshome.org score cross-check (never changes a published score). */
  cifssCrossCheck?: CifssCrossCheck;
  /** Official fixtures, ALL leagues, that matched no published game. */
  officialFixtures?: OfficialFixture[];
  /**
   * NEW. 'sblive:<id>' games that D2 published in an earlier run and that a MaxPreps contest has since superseded
   * (rule 10), mapped to that contest. Carried forward for the season so /game/sblive-<id> keeps resolving as a
   * stub page (canonical → the MaxPreps game). Empty object when none.
   */
  supersededGames: Record<ContestId, ContestId>;
  /** SCVAL-only (scval.com standings PDF poll). */
  officialStandingsPdfUrl?: string | null;
  counts: {
    teams: number;
    games: number;
    finals: number;
    pending: number;
    /** games with countsFor !== null, any status (was: isLeague). */
    leagueGames: number;
    mismatches: number;
    /** NEW */
    byLeague: Record<LeagueId, { teams: number; games: number; finals: number; leagueGames: number; backfilled: number }>;
  };
}

// ---------- render support (DESIGN §5.2) ----------

export type ScoreView =
  | {
      kind: 'final';
      home: number;
      away: number;
      /** Outcome relative to the HOME side. */
      outcome: Outcome;
      decider: Decider;
      shootout: { home: number; away: number } | null;
    }
  | { kind: 'scheduled'; time: string | null }
  | { kind: 'live' }
  | { kind: 'unreported' }
  | { kind: 'postponed'; newDate: string | null };
