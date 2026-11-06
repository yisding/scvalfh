/**
 * The sport seam (docs/MULTI-SPORT.md): what a sport is to this site, apart from its leagues.
 *
 * Two records, because a sport's rules are shared by its programs while MaxPreps keys every fact it
 * serves by one gender's season:
 *  - `Sport`: the sport's words, its source identifiers (MaxPreps, si.com, cifsshome.org, the CIF-CCS
 *    site), its rating constants and its player-stat lines. The same for the girls' and the boys'
 *    programs of a sport.
 *  - `SportSeason`: one program's season (girls varsity field hockey, fall 2026), with the ids MaxPreps
 *    reads it by.
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
  };
}

export interface SportStats {
  /** What a field player's line can hold, in display order (MaxPreps' stat names). */
  readonly fieldKeys: readonly string[];
  /** What a goalkeeper's line can hold, in display order. */
  readonly goalieKeys: readonly string[];
  /** The points a goal and an assist add to a player's points, where a game note is the only source. */
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
  };
  readonly cifss: {
    /** The cifsshome.org widget's Sport select value (one per gender for soccer: "Soccer, Girls" = 25). */
    readonly sportId: number;
    /** The month and day (MM-DD) of the fall calendar year before which no game of the sport is played. */
    readonly seasonFrom: string;
  };
  readonly ccs: {
    /** The cifccs.org sport code: cifccs.org/sports/<code>/index. */
    readonly code: string;
    /** The cifccs.org calendar name: cifccs.org/calendar/<calendar>?print=ical. */
    readonly calendar: string;
  };
  readonly ratings: SportRatings;
  readonly stats: SportStats;
}

/**
 * One program's season. Every id here is read from a live MaxPreps response (SPEC §1.1h, §5.2) and
 * re-checked by scripts/discover-season.ts: the stored values are what MaxPreps serves, not derived.
 */
export interface SportSeason {
  readonly sport: Sport;
  readonly gender: SportGender;
  /** Only varsity is verified end to end. */
  readonly level: 'Varsity';
  /** MaxPreps' `genderSport` ('girls,fieldhockey'). */
  readonly genderSport: string;
  /** MaxPreps' `year` ('26-27'). */
  readonly year: string;
  /** MaxPreps' `sportSeasonName` ('Girls Varsity Field Hockey Fall 26-27'). */
  readonly label: string;
  readonly term: SportTerm;
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
  /** MaxPreps' CCS tournament page, its path under maxpreps.com; null until MaxPreps creates it. */
  readonly ccsBracketPath: string | null;
}
