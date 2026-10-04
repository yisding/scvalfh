/**
 * League configuration: every section, league, division, rule, tiebreak chain, citation, ladder,
 * pairing, phase, date and official source (SPEC §2). Nothing else in the codebase names a league,
 * a division or a by-law; teams live in lib/registry/* and are assembled by lib/teams.ts.
 *
 * Pure data plus small helpers: no fs, no lib/data import, no snapshot. `assertLeagues()` runs at
 * module load and throws `lib/leagues.ts: <message>` on any violated invariant (SPEC §2.4).
 */

import type {
  ContestId, DivisionId, LeagueId, OfficialSourceId, PlayoffStatus, SeasonPhase, SectionId,
  TeamId, TeamSlug, TiebreakStage, TournamentGame,
} from './types';
// The runtime imports are two leaves: lib/season.ts (dependency-free constants) and
// lib/schema-primitives.ts, for its date-key RegExp (that module imports nothing of ours, only zod).
import { DATE_PATTERN } from './schema-primitives';
import { CCS_BRACKET_URL, SEASON_YEAR } from './season';

// ---------- shape (SPEC §2.1) ----------

export interface SectionConfig {
  id: SectionId;
  name: string;                         // 'Central Coast Section'
  shortName: 'CCS' | 'NCS' | 'NS';
  maxprepsSectionId: string;
  holdsFieldHockeyChampionship: boolean;
  officialUrl: string;
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
  maxprepsLeagueId: string;
  /** DATA ONLY — never rendered, never written to the snapshot. PCAL's is 'Pacific Coast - Gabilan'. */
  maxprepsName: string;
  /** For leagueStandingsUrl(): `${MAXPREPS_WEB}/ca/field-hockey/${SEASON_YEAR}/league/${maxprepsSlug}/?leagueid=${maxprepsLeagueId}` */
  maxprepsSlug: string;
  /** Registry count, asserted. */
  expectedTeams: number;
  /** Official double round robin: (expectedTeams - 1) * 2. Drives "games left". */
  gamesPerTeam: number;
  /** First and last official league date. */
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
  /** 'full' = compare records, goals, place, pct (today's SCVAL); 'records-only' = W-L-T and goals; 'informational' = W-L-T only, labelled. */
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
   * points only to decide the champion and this site extends the same points to the table (EAL).
   */
  orderScope: 'table' | 'title';
  /** The word in notes: 'division' (SCVAL, BVAL) | 'league' (PCAL, MCAL, EAL). */
  gamesWord: 'division' | 'league';
  classification: 'contest-type' | 'official-fixtures';
  /**
   * contestTypes that never count (either row); applies to both classifications. SCVAL: [] (byte-identity).
   * BVAL, PCAL, MCAL: [2, 4]. EAL: [2, 4, 5] (5 = MaxPreps' code for the 2025 EAL tournament).
   */
  excludeContestTypes: readonly number[];
  /** Games between two members on/after this local date are postseason (MCAL '2026-10-23', EAL '2026-10-30'). */
  postseasonFrom: string | null;
  /** Human escape hatch: contests that are league games despite postseasonFrom. */
  leagueGameOverrides: readonly ContestId[];
  /** 'legacy' = today's SCVAL matcher byte-for-byte; 'two-phase' = §7.8. */
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
  /** 'zero' = today's SCVAL head-to-head (a team with no H2H game scores 0); 'skip' = the stage is skipped when any tied team has not met the others. */
  h2hUnmet: 'zero' | 'skip';
  drawNumbers: Readonly<Record<TeamSlug, number>> | null;
  /**
   * How a tied league game ends. 'sudden-victory' (SCVAL Art. IV, BVAL §1a): a 7-minute golden-goal period may
   * decide it. 'none' (PCAL [U] §1.6.4 for double round robin, MCAL: no regular-season overtime): ties stand.
   * 'shootout' (EAL, NS Guidelines §VII.E.4): a 10-minute sudden-victory period, then 1 v 1s to a winner; a
   * varsity league game never ends level. D2 rule 4c (phantom tie) applies only when 'none'.
   */
  leagueOvertime: 'none' | 'sudden-victory' | 'shootout';
  /** Every string the engine prints. SCVAL's are today's BYLAW_CITATIONS, verbatim. */
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
    };

/** Ordered phase steps. 'data' = SCVAL's legacy formula; 'league-play' = max(last division leaguePlay.last, last league game of the league). */
export interface PhaseStep { phase: SeasonPhase; through: string | 'data' | 'league-play' }

export interface LeagueConfig {
  id: LeagueId;
  sectionId: SectionId;
  name: string;
  shortName: string;
  /** Plain words for the league card. */
  region: string;
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
   * Where the league's schools are not all members of its section, one sentence saying so, rendered under the
   * league's heading wherever its schools are listed (EAL: Davis and Bella Vista are Sac-Joaquin schools).
   * null = every school belongs to the league's section.
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
  /** Search "not covered" entries (exact-key matches only). */
  notCovered: readonly { name: string; keys: readonly string[]; reason: string }[];
}

// ---------- values (SPEC §2.2, verbatim) ----------

const MP = 'https://www.maxpreps.com';

export const SECTIONS = [
  {
    id: 'ccs', name: 'Central Coast Section', shortName: 'CCS',
    maxprepsSectionId: 'd9a9ef9c-db12-4669-888b-40ac8462a575',
    holdsFieldHockeyChampionship: true,
    officialUrl: 'https://cifccs.org/sports/fh/index',
    seasonWindow: { start: '2026-08-01', end: '2026-11-30' },
    noChampionshipNote: null,
  },
  {
    id: 'ncs', name: 'North Coast Section', shortName: 'NCS',
    maxprepsSectionId: '89ae2e0f-e108-4054-9df3-329f0579f86d',
    holdsFieldHockeyChampionship: false,
    officialUrl: 'https://www.cifncs.org/',
    seasonWindow: { start: '2026-08-01', end: '2026-11-28' },
    noChampionshipNote:
      'The North Coast Section and CIF hold no field hockey championship. MCAL’s own six-team tournament is the postseason.',
  },
  {
    id: 'ns', name: 'Northern Section', shortName: 'NS',
    maxprepsSectionId: '6249819d-12de-4bff-b0ab-38156006b001',
    // The "NSCIF Post Season Tournament" (the EAL's Super Regional, Oct 30-31) is on the Section's "Championship
    // Playoff Calendar": https://www.cifns.org/meetings-calendars/calendars/26-27_Playoff_Schedule.pdf
    holdsFieldHockeyChampionship: true,
    officialUrl: 'https://www.cifns.org/sports/fh/index',
    // The start matches the CCS/NCS windows. The end is OUR choice, not a Section date: one week after the Super
    // Regional's last day (Oct 31), so a late result still lands.
    seasonWindow: { start: '2026-08-01', end: '2026-11-07' },
    noChampionshipNote: null,
  },
] as const satisfies readonly SectionConfig[];

const SCVAL: LeagueConfig = {
  id: 'scval', sectionId: 'ccs',
  name: 'Santa Clara Valley Athletic League', shortName: 'SCVAL',
  region: 'Santa Clara County and San Francisco',
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
    // ↓ VERBATIM from today's lib/season.ts BYLAW_CITATIONS (golden-gated)
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
    // ↓ VERBATIM from today's PLAYOFF_STATUS_LABELS / OUTCOME_PHRASES / STATUS_BADGE / statusLabel()
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
      // ↓ VERBATIM from today's crossoverPairings()
      label: seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
    })),
  },
  phases: [
    { phase: 'regular', through: 'data' },        // today's formula (§5.9)
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
  region: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
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
  region: 'Monterey County and Hollister',
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
  region: 'Marin County, San Francisco and Berkeley',
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

const EAL: LeagueConfig = {
  id: 'eal', sectionId: 'ns',
  name: 'Eastern Athletic League', shortName: 'EAL',
  region: 'Chico, Corning, Susanville, Davis and Fair Oaks',
  officialUrl: 'https://www.cifns.org/sports/fh/index',
  links: [
    { label: 'CIF Northern Section field hockey', href: 'https://www.cifns.org/sports/fh/index' },
    { label: 'Northern Section Field Hockey Guidelines 2026-28 (PDF)', href: 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf' },
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
    sourceUrl: 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf',
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

export const LEAGUES: readonly LeagueConfig[] = [SCVAL, BVAL, PCAL, MCAL, EAL];

/** The CCS section block (section data, not league data). */
export const CCS = {
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
    bylaws: 'https://cifccs.org/sports/fh/field_hockey_bylaws_2026-27.pdf',
    index: 'https://cifccs.org/sports/fh/index',
    ical: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  },
} as const;

export const DATA_QUALITY: DataQualityConfig = {
  ghostTeamIds: {
    '8396a0d3-8021-458d-b592-a5cb2c4a366d': 'Del Norte (Crescent City): a MaxPreps ghost (no league, team size 0); its contest duplicates Tamalpais vs Del Norte (San Diego)',
  },
  excludedContestIds: {
    '5b9ff911-a640-4947-b9fd-8a629e775b33': 'Tamalpais vs the Del Norte (Crescent City) ghost; duplicates a05bedf5 (Tamalpais vs Del Norte, San Diego)',
    '5cf5e3df-6e72-4f44-9b8d-e69da30b85c5': 'Archie Williams at Marin Academy, Aug 18: not on the official MCAL schedule; a spurious unscored row',
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
  ],
};

/** Route segments a league id may never equal (siblings of /standings/[league], /schedule/[league], /playoffs/[league]). */
export const RESERVED_SEGMENTS = ['opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'sitemap', 'robots', 'manifest'] as const;

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

const SECTION_BY_ID = new Map<string, SectionConfig>(SECTIONS.map((s) => [s.id, s]));
const LEAGUE_BY_ID = new Map<string, LeagueConfig>(LEAGUES.map((l) => [l.id, l]));
const DIVISION_BY_ID = new Map<string, DivisionConfig>(ALL_DIVISIONS.map((d) => [d.id, d]));

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
 * the slug is the league name's " - " joiner; dropping ?leagueid= hard-404s.
 */
export function leagueStandingsUrl(id: DivisionId): string {
  const d = getDivision(id);
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

/** Every status the league's ladder can give, in ladder order, deduped. */
export function statusesOf(leagueId: LeagueId): readonly PlayoffStatus[] {
  return [...new Set(getLeague(leagueId).postseason.ladder.map((r) => r.status))];
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
  const sectionIds = SECTIONS.map((s) => s.id as string);
  const leagueIds = LEAGUES.map((l) => l.id);
  const divisionIds = ALL_DIVISIONS.map((d) => d.id);
  for (const [label, ids] of [
    ['section', sectionIds], ['league', leagueIds], ['division', divisionIds],
  ] as const) {
    const d = dupes(ids);
    if (d.length) fail(`duplicate ${label} id: ${d.join(', ')}`);
  }
  const shortDupes = dupes(SECTIONS.map((s) => s.shortName as string));
  if (shortDupes.length) fail(`duplicate section shortName: ${shortDupes.join(', ')}`);
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
    // 'shootout' is built only for contest-type classification (no official fixtures to match level games against).
    if (rules.leagueOvertime === 'shootout' && rules.classification !== 'contest-type') {
      fail(`${l.id}: leagueOvertime 'shootout' needs classification 'contest-type'`);
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
      if (d.gamesPerTeam !== (d.expectedTeams - 1) * 2) fail(`${d.id}: gamesPerTeam ${d.gamesPerTeam}`);
      if (d.leaguePlay.first > d.leaguePlay.last) fail(`${d.id}: leaguePlay first after last`);
      if (rules.postseasonFrom !== null && !(d.leaguePlay.last < rules.postseasonFrom)) {
        fail(`${d.id}: leaguePlay.last is not before postseasonFrom`);
      }
      inWindow(d.leaguePlay.first, `${d.id} leaguePlay.first`);
      inWindow(d.leaguePlay.last, `${d.id} leaguePlay.last`);
      // 10. official sources: bundled ones name their file, URL and hash; 'none' only on a contest-type league
      // (so an official-fixtures league never has a 'none' division)
      if (d.official.mode === 'bundled' && !(d.official.bundledFile && d.official.revisionCheckUrl && d.official.bundledSha256)) {
        fail(`${d.id}: a bundled official source needs bundledFile, revisionCheckUrl and bundledSha256`);
      }
      if (d.official.mode === 'none') {
        if (rules.classification !== 'contest-type') {
          fail(`${d.id}: official mode 'none' on an ${rules.classification} league (no fixtures to classify by)`);
        }
        if (!d.official.note.trim()) fail(`${d.id}: official mode 'none' needs a note`);
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
        if (!(ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams)) {
          fail(`${d.id}: ladderLine may be null only for an unbracketed tournament whose qualifiers >= expectedTeams`);
        }
      } else if (!(d.ladderLine.after < d.expectedTeams)) {
        fail(`${d.id}: ladderLine.after must be < expectedTeams`);
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
        inWindow(ps.dates.first, `${l.id} postseason dates.first`);
        inWindow(ps.dates.last, `${l.id} postseason dates.last`);
        break;
    }
  }

  // 3. the CCS field
  const aqKeys = Object.keys(CCS.autoQualifiers).sort();
  const expectedKeys = [...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort();
  if (aqKeys.join() !== expectedKeys.join()) {
    fail(`CCS.autoQualifiers keys ${aqKeys.join(', ')} != ${expectedKeys.join(', ')}`);
  }
  const aq = CCS.autoQualifiers as Readonly<Record<string, number>>;
  let sum: number = CCS.autoQualifiers.atLarge;
  for (const l of LEAGUES) {
    if (l.postseason.kind !== 'ccs-ladder') continue;
    if (l.postseason.autoBerths !== aq[l.id]) fail(`${l.id}: autoBerths ${l.postseason.autoBerths} != CCS ${aq[l.id]}`);
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
