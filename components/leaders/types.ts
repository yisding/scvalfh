/**
 * The /leaders view model (DESIGN §16, §23, §28): what components/leaders/leaders-view.ts builds and
 * app/leaders/page.tsx and LeaderBoardTable render. Types only, so every board module can share
 * them without importing the page's assembly.
 */

import type { PriorSeason } from '@/lib/prior-season-schema';
import type { MergedPlayer } from '@/lib/rosters';
import type { TeamPlayerStats } from '@/lib/player-stats-schema';
import type { Game, RegionId, Standing, Team } from '@/lib/types';
import type { RegionConfig } from '@/lib/leagues';

/**
 * Every column a board can print. LeaderBoardTable sizes its `<colgroup>` by key, so a key is a
 * closed set: a new column is added here, and the table's width maps say how wide it is.
 */
export type LeaderColumnKey =
  // school boards
  | 'record'
  | 'pct'
  | 'gd'
  | 'gp'
  | 'gf'
  | 'ga'
  | 'perGame'
  | 'adjusted'
  | 'cleanSheets'
  | 'elo'
  // player boards
  | 'gamesPlayed'
  | 'goals'
  | 'assists'
  | 'points'
  | 'factor'
  | 'adjustedPoints'
  | 'saves'
  | 'savePct'
  | 'shutouts';

export interface LeaderColumn {
  key: LeaderColumnKey;
  /** The column head: "Pts". */
  label: string;
  /** What a screen reader hears, and the notes spell out: "Points". */
  title: string;
}

/** A column as a board module declares it: the column and how a row's cell is read. */
export type LeaderColumnSpec<T> = LeaderColumn & { cell: (item: T) => LeaderCell };

export interface LeaderCell {
  /** null prints as a dash: a stat the coach did not enter for this player. */
  text: string | null;
  /** Read instead of `text` ("10 wins, 0 losses, 0 ties" for "10-0-0"). */
  sr?: string;
}

export interface LeaderTeamRef {
  slug: Team['slug'];
  name: string;
  /** ≤ 16 characters, for a phone-width cell. */
  shortName: string;
  /** "SCVAL" */
  leagueShort: string;
  /** The team page, at its player stats for a player row. */
  href: string;
}

export interface LeaderRow {
  key: string;
  /** 1-based; tied rows share it. */
  rank: number;
  tied: boolean;
  /** The player's name on a player board, the school's on a school board. */
  name: string;
  /**
   * A player's grade in words and position(s), as the team page's roster prints them ("Senior",
   * "Forward / Midfield"), only the ones the roster has; always empty on a school board.
   */
  facts: string[];
  team: LeaderTeamRef;
  /** One per column. */
  cells: LeaderCell[];
}

export interface LeaderBoard {
  /** The board's anchor: `/leaders#most-points`. */
  id: string;
  kind: 'player' | 'school';
  /** "Most points" */
  title: string;
  /** The board's link in its section's index: "Points", "Elo rating". */
  navLabel: string;
  /** Beside the heading: "From 27 teams", "At least 5 games". */
  meta: string;
  /** The table's caption, for a screen reader. */
  caption: string;
  columns: LeaderColumn[];
  /** The index of the column the board is ranked on. */
  rankedBy: number;
  rows: LeaderRow[];
  /**
   * A player board's places after `rows`, up to EXPANDED_PLACES, behind a disclosure; null when
   * there are none, and always on a school board.
   */
  extra: LeaderExtra | null;
  /** One or two sentences under the board: what it counts and what it leaves out. Always shown. */
  note: string;
  /**
   * How a derived number is worked out, behind "How it’s worked out" under the note (DESIGN §28);
   * null on a board whose note says it all.
   */
  method: string | null;
  /** Shown instead of the table when no row qualifies. */
  empty: string;
}

export interface LeaderExtra {
  /** The disclosure's summary: "Show 15 more players". */
  summary: string;
  /** The second table's caption, for a screen reader. */
  caption: string;
  /** The rows after the board's own, ranked on from them. */
  rows: LeaderRow[];
}

/** The teams whose stat totals are behind their finals, shown as a closed list (DESIGN §28). */
export interface LaggingStats {
  /** "3 teams’ totals lag the scores": their coaches have not entered the latest games. */
  summary: string;
  /** "Archie Williams: 5 games since Mon Sep 28", most games behind first. */
  items: string[];
}

/** One region's half of /leaders: what the page renders once for NorCal and once for SoCal. */
export interface RegionLeadersView {
  region: RegionId;
  /** 'Northern California' | 'Southern California': the region's heading. */
  name: RegionConfig['name'];
  /** 'NorCal' | 'SoCal' */
  shortName: RegionConfig['shortName'];
  /** '' | '-socal': appended to every id this region's half renders (boards, sections). */
  idSuffix: '' | '-socal';
  /** 'schools' | 'schools-socal': the Schools section's id. */
  schoolsId: string;
  /** 'players' | 'players-socal': the Players section's id. */
  playersId: string;
  /** The region's configured leagues with a table: 5 NorCal, 4 SoCal. */
  leagueCount: number;
  /** The region's independents (teams in no league): 0 NorCal, 5 SoCal. */
  independentCount: number;
  /** "NorCal’s five leagues", "SoCal’s four leagues and five independents": each section's scope. */
  scopeWords: string;
  players: LeaderBoard[];
  schools: LeaderBoard[];
  /** Under the player boards: whose stats are missing or carried forward. */
  playerNotes: string[];
  /** Under the player boards: whose totals are behind the scores; null when nobody's are. */
  lagging: LaggingStats | null;
  /** Under the school boards: what the records count and who has not played enough to qualify. */
  schoolNotes: string[];
  /** The region's teams with at least one player stat line. */
  statTeams: number;
  /** The region's teams. */
  teamCount: number;
  /** "Fri Oct 2": the last day with a final involving one of the region's teams, or null before the first one. */
  resultsThrough: string | null;
}

/** The finals that put NorCal and SoCal teams on one Elo scale (DESIGN-socal §2.3), counted at build time. */
export interface CrossRegionFinals {
  /** This season's finals the Elo fit counts between a NorCal and a SoCal team. */
  thisSeason: number;
  /** Last season's (data/prior-season.json) finals between two registry teams of different regions. */
  lastSeason: number;
  /**
   * 'The ratings are on one scale across all nine leagues; comparisons between NorCal and SoCal rest on 7
   * finals between the regions this season and 11 last season, so treat them as rough.'
   */
  sentence: string;
}

export interface LeadersView {
  /** One per region that has teams, NorCal first (REGIONS order). */
  regions: RegionLeadersView[];
  crossRegion: CrossRegionFinals;
  /** Every team (99). */
  teamCount: number;
  /** "Fri Oct 2": the last day with a final anywhere, or null before the first one. */
  resultsThrough: string | null;
}

/** A team's roster rows, as far as a leaderboard reads them. */
export interface RosterSource {
  slug: Team['slug'];
  players: readonly Pick<MergedPlayer, 'athleteId' | 'grade' | 'positions'>[];
}

/** What the page is built from. Defaults to the bundled snapshot and player stats. */
export interface LeaderSources {
  /** Every registry team. */
  teams: readonly Team[];
  /** data/player-stats.json's per-team entries. */
  stats: readonly TeamPlayerStats[];
  /** One Standing per team (lib/standings.ts). */
  standings: readonly Standing[];
  /** Every contest. */
  games: readonly Game[];
  /** Last season's results, the Elo rating's starting point; null starts every team at average. */
  prior?: PriorSeason | null;
  /**
   * The rosters a player's stat line joins to on its athleteId, for the grade and position the
   * team page shows; left out, no row has either.
   */
  rosters?: readonly RosterSource[];
  /** The goal model's Newton iterations (lib/adjusted-scoring.ts), 100 if left out: a test caps it to see the fallback. */
  goalModelIterations?: number;
}
