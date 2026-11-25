/**
 * The sport seam (docs/MULTI-SPORT.md): what a sport is to this site, apart from its leagues.
 *
 * Two records, because a sport's rules are shared by its programs while MaxPreps keys every fact it
 * serves by one gender's season:
 *  - `Sport`: the sport's words, its source identifiers (MaxPreps, si.com, cifsshome.org, the CIF-CCS
 *    site), its rating constants and its player-stat lines. The same for the girls' and the boys'
 *    programs of a sport.
 *  - `SportSeason`: one program's season (girls varsity field hockey, fall 2026), with the source its games are
 *    read from first and that source's ids for it (MaxPreps' season ids, or a league site's pages).
 *
 * Everything league-shaped (divisions, tiebreak chains, berths, postseason ladders, official sources,
 * data-quality lists) stays in lib/league-config/ and the team registries in lib/registry/: those are a
 * sport's facts too, but they are many per sport and keep their own files.
 *
 * Types only: no runtime import, so every client module may reach this file (tests/ui/client-boundary).
 */

/** A sport's program: the girls' or the boys'. */
export type SportGender = 'girls' | 'boys';

/** The part of the school year a season is played in, as the site's own copy names it ('Fall 2026'). */
export type SportTerm = 'Fall' | 'Winter' | 'Spring';

export interface SportRatings {
  /** Elo points per unit of expected margin (a goal in field hockey, a point in basketball). */
  readonly eloPerUnit: number;
  /** A margin counts up to this many units either way. */
  readonly marginCap: number;
  /** How hard the fit pulls a team toward its start, in games' worth. */
  readonly startWeight: number;
  /** The share of last season's strength a team starts this season with. */
  readonly carryover: number;
  /**
   * One sentence the Elo board's method note adds where `eloPerUnit` and `marginCap` were not fitted to
   * finished seasons of the sport (basketball); null where they were, or where the copy says nothing yet.
   */
  readonly provisionalNote: string | null;
  /**
   * The Elo-adjusted scoring model's priors (lib/ratings/adjusted-scoring.ts), a Poisson fit of each
   * team's scoring rate, which suits a low-scoring sport only.
   */
  readonly adjustedScoring: {
    /** The prior standard deviation of a team's attack and defense corrections, in log units. */
    readonly ridgeSigma: number;
    /** Games against an average defense added to every team's adjusted rate and schedule factor. */
    readonly shrinkGames: number;
    /** The prior standard deviation of the two Elo slopes, centred on 0. */
    readonly slopeSigma: number;
  } | null;
}

/**
 * How the sport scores, and the words for it: what a team scores (a goal, a point), whether a game may end
 * level, and the labels of the for / against / difference columns. The stored keys stay `gf`, `ga` and `gd`
 * in every sport (docs/MULTI-SPORT.md, "Goal vocabulary"); only what a reader sees changes.
 */
export interface SportScoring {
  /** Whether a game may end level. false (basketball): overtime is played until one team leads, so a record is W-L. */
  readonly allowsTies: boolean;
  /**
   * How the sport's overtime is played, which decides what a score out of overtime can be and how it is named:
   * 'sudden-victory' (field hockey: a period ends on the first goal, so the margin is one and a second period is
   * named, '2 OT'), 'two-halves' (soccer: one overtime of two full halves, any margin, never counted), or
   * 'until-decided' (basketball: full periods until one team leads, any margin, every period counted, '3 OT'),
   * or 'none' (volleyball: a match is sets, and the last set is played until one team wins it).
   */
  readonly overtime: 'sudden-victory' | 'two-halves' | 'until-decided' | 'none';
  /**
   * What breaks a level score in a game that must have a winner (a playoff game), where no section rule names
   * it: its words, in one of the two shapes lib/format.ts `shootoutPhrases` reads ('a shootout', 'penalty
   * kicks'), and the chip tag of a win by it ('SO', 'PK'). null where nothing does (basketball). lib/format.ts
   * mirrors these as SPORT_TIEBREAK_WORDS and SPORT_TIEBREAK_TAG.
   */
  readonly tiebreak: { readonly words: string; readonly tag: string } | null;
  /** What a team scores, singular and plural: 'goal' / 'goals', 'point' / 'points', 'set' / 'sets'. */
  readonly unit: string;
  readonly units: string;
  /** The three column heads: 'GF' 'GA' 'GD', 'PF' 'PA' 'PD', or 'SW' 'SL' 'SD'. */
  readonly forAbbr: string;
  readonly againstAbbr: string;
  readonly diffAbbr: string;
  /** The same three in words, lower case: 'goals for', 'goals against', 'goal differential'. */
  readonly forWords: string;
  readonly againstWords: string;
  readonly diffWords: string;
}

export interface SportStats {
  /**
   * The stat model a player's line follows: 'goals' (field hockey, soccer: a field line of goals, assists and
   * shots, and a goalkeeper line), 'basketball' (one line of points, shooting, rebounds and the rest, no
   * goalkeeper group) or 'volleyball' (one line of kills, aces, blocks, digs, assists and the rest, no
   * goalkeeper group). The parser's column maps, the team and game tables and the leader boards branch on it.
   */
  readonly model: 'goals' | 'basketball' | 'volleyball';
  /**
   * What a player's main line can hold, in display order (our keys for MaxPreps' stat names): a field
   * player's line in a 'goals' sport, every player's line in basketball. Stored as `field` in every sport.
   */
  readonly fieldKeys: readonly string[];
  /** What a goalkeeper's line can hold, in display order; empty where the sport has no goalkeeper. */
  readonly goalieKeys: readonly string[];
  /**
   * The points a goal and an assist add to a player's points, where a game note is the only source
   * (lib/players/note-stats.ts). 0 and 0 where notes are not read for stats (basketball).
   */
  readonly pointsPerGoal: number;
  readonly pointsPerAssist: number;
}

export interface Sport {
  /** The sport's id: MaxPreps' and si.com's URL segment for it ('field-hockey'). */
  readonly id: string;
  /** Title case, for a name or a heading: 'Field Hockey'. */
  readonly name: string;
  /** In a sentence: 'field hockey'. Sentence case is `capitalized(noun)`. */
  readonly noun: string;
  /** The two-letter mark of the icons and the manifest short name: 'FH'. */
  readonly abbr: string;
  /** schema.org's `sport` value: 'Field hockey'. */
  readonly schemaOrgSport: string;
  readonly maxpreps: {
    /** The URL segment: maxpreps.com/ca/<slug>/. */
    readonly slug: string;
    /** The `sport` of a school's season list (getTeamContext's schoolSportSeasonsData). */
    readonly sportName: string;
  };
  readonly sblive: {
    /** The URL segment: si.com/high-school/stats/california/<slug>. */
    readonly slug: string;
    /**
     * Whether rule 4c (lib/crosscheck/backfill.ts) may replace a MaxPreps 0-0 final tie with a si.com final
     * that has a winner. Field hockey's: a 0-0 there is most often a score left unentered. Never soccer's, whose
     * 0-0 draws are real results.
     */
    readonly replacesZeroZeroTies: boolean;
  };
  readonly cifss: {
    /** The cifsshome.org widget's Sport select value (one per gender for soccer: "Soccer, Girls" = 25). */
    readonly sportId: number;
    /** The month and day (MM-DD) of the fall calendar year before which no game of the sport is played. */
    readonly seasonFrom: string;
  };
  readonly ccs: {
    /**
     * The cifccs.org sport code: cifccs.org/sports/<code>/index. null where the sport's page was never read
     * (basketball: cifccs.org answers scripts with 405), so the section link is the calendar page instead.
     */
    readonly code: string | null;
    /** The cifccs.org calendar name: cifccs.org/calendar/<calendar>?print=ical. */
    readonly calendar: string;
  };
  readonly ratings: SportRatings;
  readonly stats: SportStats;
  readonly scoring: SportScoring;
}

/**
 * Where a season's games, scores and the league's own table are read first: the source the pipeline's first stage
 * builds its game list from (lib/pipeline/primary.ts). Every other source is read against what this one lists.
 *  - 'maxpreps': MaxPreps' team schedules and league tables (every high school build).
 *  - 'teamsideline': the league's own TeamSideline site, one schedule page a level (lib/sources/teamsideline.ts), for
 *    a league MaxPreps does not carry (the Valley Athletic League's middle schools).
 */
export type PrimarySourceId = 'maxpreps' | 'teamsideline';

/** What every program's season has, whatever it is read from. */
interface SportSeasonBase {
  readonly sport: Sport;
  readonly gender: SportGender;
  /** The source the season's games are read from first (PrimarySourceId). */
  readonly primary: PrimarySourceId;
  /**
   * The program as MaxPreps' `genderSport` names it ('girls,fieldhockey'); a season read elsewhere names its program
   * the same way ('girls,soccer'), so the snapshot's season record reads alike in every build.
   */
  readonly genderSport: 'girls,fieldhockey' | 'girls,soccer' | 'boys,basketball' | 'girls,volleyball';
  /** The season's years as MaxPreps and the league sites print them ('26-27'). */
  readonly year: string;
  readonly term: SportTerm;
}

/**
 * One program's season, read from MaxPreps. Every id here is read from a live MaxPreps response (SPEC §1.1h, §5.2)
 * and re-checked by scripts/discover-season.ts: the stored values are what MaxPreps serves, not derived.
 */
export interface MaxprepsSportSeason extends SportSeasonBase {
  readonly primary: 'maxpreps';
  /** Only varsity is verified end to end. */
  readonly level: 'Varsity';
  /** MaxPreps' `sportSeasonName` ('Girls Varsity Field Hockey Fall 26-27'). */
  readonly label: string;
  readonly sportSeasonId: string;
  readonly allSeasonId: string;
  /** MaxPreps' California hub for the program, under maxpreps.com: the bootstrap page (SPEC §1.1h). */
  readonly hubPath: string;
  /**
   * The ssid the hub's `__NEXT_DATA__` serves when it is not `sportSeasonId` (null when they agree). The
   * bootstrap step accepts exactly this value, so a hub that changes again still stops the run.
   */
  readonly hubSportSeasonId: string | null;
  /** The JV season of the same sport and gender (scripts/fetch-jv.ts). */
  readonly jvSportSeasonId: string;
  /**
   * The freshman season of the same sport and gender (`scripts/fetch-jv.ts --level freshman`), or null where the site
   * does not cover the freshman level (the fall sports, until their 2027 season: owner decision, 2026-11-25).
   */
  readonly freshmanSportSeasonId: string | null;
  /** MaxPreps' CCS tournament page, its path under maxpreps.com; null until MaxPreps creates it. */
  readonly ccsBracketPath: string | null;
}

/** One level's schedule page on a TeamSideline site: `${origin}/schedule/${scheduleId}/0/1/${slug}`. */
export interface TeamsidelineLevelPage {
  readonly scheduleId: string;
  readonly slug: string;
  /** The level as the page's subtitle prints it ('7th/8th Grade'); a page that prints another is not read. */
  readonly subtitle: string;
}

/**
 * One program's season, read from the league's own TeamSideline site (lib/sources/teamsideline.ts). The pages'
 * ids are read from the league site's own links; the run checks each page's heading and level against these, as
 * the MaxPreps bootstrap checks the season ids, and reads nothing from a page that does not match.
 */
export interface TeamsidelineSportSeason extends SportSeasonBase {
  readonly primary: 'teamsideline';
  /** The level the site is about, as a heading names it ('7th/8th Grade'). */
  readonly level: string;
  /** The program's heading on every page of the season ("Girls' Soccer 26-27"). */
  readonly label: string;
  /** The league site's origin, no trailing slash ('https://valleyal.org'). */
  readonly origin: string;
  /** The main level's page (the site's tables and games), and the second level's (the site's /jv pages). */
  readonly pages: { readonly main: TeamsidelineLevelPage; readonly second: TeamsidelineLevelPage };
}

export type SportSeason = MaxprepsSportSeason | TeamsidelineSportSeason;
