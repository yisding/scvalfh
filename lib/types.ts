/**
 * The normalized domain model.
 *
 * Source of truth: research/SPEC.md §4, amended by research/BYLAWS-ADDENDUM.md:
 *   - Standing.computed.pts is a NUMBER (3 pts win, 1 pt tie) — SCVAL By-Laws Article VI §2.
 *     SPEC §5.6's "pts: number | null / do not invent a points system" is superseded.
 *   - Standings order is the order of points, then the Article VI §3-7 tiebreakers, so every
 *     Standing carries the tie state and a human-readable explanation of how its place was set.
 *   - Article VII §2 drives `playoffStatus`.
 *
 * Everything is exported; nothing here is a class and nothing here has behaviour.
 */

// ---------- identity ----------

/** MaxPreps `schoolId` / `teamId` GUID. THE primary key across all sources (SPEC §2.1). */
export type TeamId = string;

/** MaxPreps `contestId` GUID. THE dedupe key for games (SPEC §5.5.1). */
export type ContestId = string;

export type Division = 'de-anza' | 'el-camino';

/** Our own URL slug. Decoupled from every upstream slug (DESIGN §12.9). */
export type TeamSlug =
  | 'cupertino' | 'fremont' | 'homestead' | 'los-altos' | 'saint-francis'
  | 'st-ignatius' | 'valley-christian' | 'wilcox'
  | 'los-gatos' | 'lynbrook' | 'mitty' | 'monta-vista'
  | 'palo-alto' | 'presentation' | 'santa-clara' | 'saratoga';

/** Where a value came from. Every externally-sourced record carries one (SPEC §4). */
export type SourceId =
  | 'maxpreps-api' | 'maxpreps-html' | 'sblive' | 'scval-pdf'
  | 'ccs-pdf' | 'ccs-ical' | 'vnn-ics' | 'derived';

// ---------- season ----------

export interface SeasonWindow {
  /** min dateLocal over all kept contests. */
  firstGame: string | null;
  /** max dateLocal where isLeague. */
  lastLeagueGame: string | null;
  /** max dateLocal over all kept contests. */
  lastGame: string | null;
}

export interface Season {
  /** "26-27" — MaxPreps `leagues/{id}/v1`.year (SPEC §2). */
  year: string;
  /** "Girls Varsity Field Hockey Fall 26-27" — `.sportSeasonName`. */
  label: string;
  sportSeasonId: string;
  allSeasonId: string;
  genderSport: 'girls,fieldhockey';
  teamLevel: 'Varsity' | 'JV';
  sectionId: string;
  sectionName: string;
  leagues: Record<Division, { leagueId: string; name: string }>;
  /** Computed from game dates, never hardcoded (SPEC §5.8). */
  window: SeasonWindow;
}

// ---------- team ----------

export interface TeamColors {
  /** hex, no '#' */
  primary: string;
  secondary: string;
  /** Ink that clears AA on `primary`, computed at build (DESIGN §12.4). */
  onPrimary: '#0e1116' | '#ffffff';
  /** 'placeholder' when no upstream row exists (Wilcox). */
  source: 'maxpreps-standings' | 'placeholder';
}

export interface TeamExternalIds {
  maxprepsTeamId: TeamId;
  /** Always the API's `teamCanonicalUrl`; never string-built (SPEC §2.1). */
  maxprepsTeamUrl: string | null;
  maxprepsScheduleUrl: string | null;
  /** numeric, e.g. "458850" */
  sbliveTeamId?: string;
  /** Only where the si.com slug was verified; slugs are never guessed (SPEC §2.1). */
  sbliveGamesUrl?: string;
  /** VNN / PlayOn "Mascot Media Bolt" site id (SPEC §1.5). */
  vnnSiteId?: string;
  vnnIcsUrl?: string;
}

export interface Team {
  id: TeamId;
  slug: TeamSlug;
  /** Canonical display name (MaxPreps `schoolName`). */
  name: string;
  /** Desktop-table name, e.g. "St Ignatius". */
  shortName: string;
  /** Hand-assigned 2-letter monogram, asserted unique (DESIGN §12.9). */
  abbr: string;
  /** MaxPreps `schoolNameAcronym`, e.g. "LAHS". */
  acronym: string;
  mascot: string;
  city: string;
  /** Every spelling seen in any source (SPEC §2.3). */
  aliases: string[];
  /** null would mean a non-SCVAL opponent; the registry holds members only. */
  division: Division;
  /** true for all 16 schools in the official SCVAL PDFs (SPEC §3). */
  isScvalMember: true;
  /** Wilcox is 'none': in the official grid, absent from every data source. */
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
 * 'SO' can never occur in this league — By-Laws Article IV ends a game as a tie after one
 * 7-minute sudden-victory period — but it stays in the union so shootout-aware render code
 * type-checks. `Game.shootout` is therefore always null.
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

export interface Game {
  contestId: ContestId;
  /** Naive local school time, America/Los_Angeles: `contest.date`. */
  dateLocal: string;
  /** UTC twin: `calculatedFields.contestDateInGMT`, stored with a Z. */
  dateUtc: string;
  /** YYYY-MM-DD derived from dateLocal — the URL key for /scores/[date]. */
  dateKey: string;
  isDateTba: boolean;
  isTimeTba: boolean;
  home: GameSide;
  away: GameSide;
  /** 'neutral' ⇒ neither side hosted; home/away slots are then just a stable ordering. */
  site: 'home' | 'away' | 'neutral';
  status: GameStatus;
  /** From `teams[].contestType === 0` (SPEC §5.5.5). */
  isLeague: boolean;
  /** Set only when both sides are registry members of the SAME division. */
  leagueDivision: Division | null;
  otPeriods: number;
  isOt: boolean;
  isForfeit: boolean;
  forfeitBy: 'home' | 'away' | null;
  /** null unless status === 'final'. */
  decider: Decider | null;
  /** Always null in this league (see Decider). */
  shootout: { home: number; away: number } | null;
  venue: GameVenue;
  /**
   * Set when a school athletics calendar (VNN / PlayOn `.ics`) corroborates the MaxPreps start
   * time. `dateLocal` is never rewritten from a secondary source (SPEC §1.5).
   */
  timeConfirmed?: boolean;
  /**
   * Set when the contest was matched to a fixture in the official SCVAL schedule grid. A
   * `scheduledDate` that differs from `dateKey` means the game moved (SPEC §1.3).
   */
  official?: { scheduledDate: string; source: 'scval-pdf' };
  /** `calculatedFields.description`, cleaned per DESIGN §5.8. */
  recap: string | null;
  urls: {
    /** `calculatedFields.canonicalUrl`. */
    maxpreps: string | null;
    sblive?: string;
    nfhsStream: string | null;
    goFan: string | null;
  };
  provenance: {
    scores: SourceId;
    schedule: SourceId;
    scoreConflict?: { sblive: { home: number; away: number }; note: string };
    fetchedAt: string;
    maxprepsModifiedOn?: string;
    /** Set when the two team rows disagree on `contestType`. */
    leagueFlagConflict?: string;
    /**
     * Set when the official SCVAL grid names the other school as the host. Home/away itself is
     * always MaxPreps' (SPEC §5.5.4); this records that the two sources disagree.
     */
    hostConflict?: string;
  };
}

// ---------- standings ----------

/** Which By-Laws Article VI step set a team's place. */
export type TiebreakStage =
  /** §2 — points alone, no tie. */
  | 'points'
  /** §3 — better head-to-head record among the tied teams. */
  | 'head-to-head'
  /** §4 — greater number of wins in division play. */
  | 'division-wins'
  /** §5 — least goals given up between the head-to-head tied teams. */
  | 'h2h-goals-against'
  /** §6 — goal differential between the head-to-head tied teams. */
  | 'h2h-goal-diff'
  /** §7 — a coin flip we cannot compute; the teams stay tied. */
  | 'coin-flip';

/** By-Laws Article VII §2. */
export type PlayoffStatus =
  /** places 1-3: automatic qualifier */
  | 'aq'
  /** place 4: Oct 30 play-in for the SCVAL 7th AQ */
  | 'play-in'
  /** place 5: submitted to CCS for at-large consideration */
  | 'at-large'
  /** place 6+: no AQ path */
  | 'out';

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

export interface Standing {
  teamId: TeamId;
  slug: TeamSlug;
  division: Division;
  computed: ComputedRecord;
  /** Overall (league + non-league) record, for the team page. */
  overall: ComputedRecord;
  reported: ReportedRecord | null;
  /** true when computed and reported disagree. Surfaced, never hidden (DESIGN §9). */
  mismatch: boolean;
  mismatchDetail?: string;
  tiebreak: TiebreakInfo;
  playoffStatus: PlayoffStatus;
  /** false ⇒ sorted last, rank rendered '—' (DESIGN §8). */
  hasReportedResults: boolean;
}

// ---------- playoffs ----------

export interface PlayoffKeyDates {
  /** 2026-11-02T12:00 local */
  entriesDue: string;
  /** 2026-11-02T13:00 local */
  seedingMeeting: string;
  quarterfinals: string;
  semifinals: string;
  finals: string;
  evaluationMeeting: string;
  /** SCVAL crossover + 4-vs-4 play-in, from the official schedule PDFs. */
  crossover: string;
}

/**
 * Who can take one side of one crossover seed.
 *
 * Empty ⇒ the league table does not reach that seed yet (rendered TBD). One entry ⇒ settled.
 * Two or more ⇒ a level place (Article VI §7) spans the seed and the coin flip decides it, so
 * every contender is named rather than one of them being picked.
 */
export type CrossoverSeat = Array<{ teamId: TeamId; slug: TeamSlug }>;

export interface CrossoverPairing {
  /** 1 = #1 v #1 … 4 = the play-in. */
  seed: number;
  deAnza: CrossoverSeat;
  elCamino: CrossoverSeat;
  /** true for seed 4: the winner takes the SCVAL 7th AQ (Article VII §2). */
  isPlayIn: boolean;
  label: string;
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

export interface Playoffs {
  keyDates: PlayoffKeyDates;
  /** The CCS iCal feed, when the season gate opened and the read succeeded (SPEC §5.9). */
  ccsCalendar?: CcsCalendarEvent[];
  /** true when every published key date is corroborated by that feed. */
  keyDatesConfirmed?: boolean;
  format: {
    elimination: 'single';
    divisions: Array<{ name: 'Division 1' | 'Division 2'; seeds: [number, number] }>;
    autoQualifiers: { scval: 7; bval: 4; pcal: string; atLarge: number; total: 16 };
    highSeedHostsThrough: 'semifinals';
  };
  /** Flips when the MaxPreps tournament page stops saying not-published (SPEC §5.9). */
  bracketPublished: boolean;
  bracketUrl: string;
  /** Arrive via the calculatedFields bracket/tournament fields once seeded — [U]. */
  games: Game[];
}

export interface PlayoffProjection {
  asOf: string;
  berths: { auto: number; total: number };
  byDivision: Record<Division, Array<{
    teamId: TeamId;
    slug: TeamSlug;
    place: number;
    /** The best status the team can take — `statuses[0]`. */
    status: PlayoffStatus;
    /**
     * Every status still open to the team, best first. Longer than one only when a level place
     * (Article VI §7) straddles an Article VII §2 boundary.
     */
    statuses: PlayoffStatus[];
    /** Written status words — no probability model exists (DESIGN §6.1). */
    label: string;
    shared: boolean;
  }>>;
  crossover: { date: string; pairings: CrossoverPairing[] };
}

// ---------- snapshot ----------

export interface SourceStatus {
  id: SourceId;
  label: string;
  url: string;
  status: 'ok' | 'stale' | 'error' | 'skipped';
  httpStatus?: number;
  fetchedAt: string;
  upstreamModifiedOn?: string;
  error?: string;
  rowCount?: number;
}

/** One published disagreement with MaxPreps (DESIGN §9). */
export interface CrossCheckRow {
  slug: TeamSlug;
  field: string;
  ours: string;
  theirs: string;
  url: string;
}

/**
 * A fixture from the official SCVAL schedule-grid PDFs (SPEC §1.3).
 *
 * `snapshot.officialFixtures` holds the fixtures that matched NO MaxPreps contest — Wilcox's whole
 * 14-game slate lives there — so the UI can render "scheduled per SCVAL, not reported".
 */
export interface OfficialFixture {
  division: Division;
  /** The official date, YYYY-MM-DD. */
  dateKey: string;
  /** UPPERCASE grid spelling, verbatim. */
  awayName: string;
  homeName: string;
  awaySlug: TeamSlug | null;
  homeSlug: TeamSlug | null;
  source: 'scval-pdf';
}

/** One game where MaxPreps and SBLive publish different numbers (SPEC §5.7). */
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

/** A game SBLive has scored and MaxPreps has not. We do NOT backfill it (SPEC §5.7). */
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

/** The published SBLive score cross-check (SPEC §5.7, DESIGN §9). */
export interface SbliveCrossCheck {
  sbliveFetchedAt: string;
  /**
   * MaxPreps contests that MATCHED an SBLive row on (date, unordered pair) — the join, not the
   * comparison. A matched row whose SBLive side carries no numbers is counted here and in neither
   * `agreements` nor `conflicts`, so `agreements + conflicts.length` is the smaller "had a score on
   * both sides" figure and any copy that reports these numbers has to say which is which.
   */
  compared: number;
  /** Of the rows with a score on BOTH sides, how many agreed on both numbers. */
  agreements: number;
  conflicts: ScoreConflictRow[];
  sbliveOnlyScored: SbliveOnlyRow[];
}

export type SeasonPhase =
  | 'preseason'
  | 'regular'
  | 'crossover'
  | 'playoffs'
  | 'complete';

export interface Snapshot {
  /** ISO UTC, when the run started. 'today' everywhere is derived from this. */
  fetchedAt: string;
  season: Season;
  /** ALWAYS 16 — the registry, left-joined against the feed (DESIGN §12.1). */
  teams: Team[];
  /** Deduped on contestId. */
  games: Game[];
  standings: Standing[];
  playoffs: Playoffs;
  /** One row per request; a partial run is still publishable (SPEC §5.3). */
  sources: SourceStatus[];
  /** The MaxPreps STANDINGS comparison (DESIGN §9). Scores are in `sbliveCrossCheck`. */
  crossCheck: CrossCheckRow[];
  /**
   * The SBLive SCORE cross-check (SPEC §5.7). Absent when the step was skipped or failed.
   * Named separately from `crossCheck` because that field was already the standings log.
   */
  sbliveCrossCheck?: SbliveCrossCheck;
  /** Official SCVAL fixtures with no MaxPreps contest — mostly Wilcox (SPEC §1.3). */
  officialFixtures?: OfficialFixture[];
  /** Discovered by polling scval.com/standings/; null until SCVAL publishes the 26-27 file. */
  officialStandingsPdfUrl?: string | null;
  counts: {
    teams: number;
    games: number;
    finals: number;
    pending: number;
    leagueGames: number;
    mismatches: number;
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
