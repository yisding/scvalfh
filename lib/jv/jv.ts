/**
 * The read API for data/field-hockey/jv.json — every registry school's JV games (MaxPreps, corrected by
 * lib/jv/jv-corrections.ts and supplemented by si.com: lib/jv/jv-merge.ts, then by the school athletics
 * sites transcribed in lib/jv/jv-school-sites.ts).
 *
 * Built by `scripts/fetch-jv.ts`. Imported so the build bundles it, for the reason lib/players/rosters.ts
 * gives: a Worker has no project filesystem. Validated and merged once at module scope, so a bad
 * file fails at import time rather than half-way through a render. `SCVAL_JV` swaps in another
 * file through node:fs (Node only; never set it on a Worker).
 *
 * "Today" for the merge is the file's own fetchedAt in America/Los_Angeles, never the wall clock,
 * so a given commit builds the same pages whenever it is built.
 *
 * JV games stay apart from varsity: nothing here feeds a varsity standings table, a leader board,
 * a rating or a postseason picture. The JV tables are their own (lib/jv/jv-standings.ts): a JV game is
 * a league game when its varsity counterpart is, read from the snapshot (lib/data.ts), and the
 * games this module serves carry that classification as `countsFor`.
 */

import bundledFieldHockey from '../../data/field-hockey/jv.json';
import bundledBasketball from '../../data/basketball/jv.json';
import bundledVolleyball from '../../data/volleyball/jv.json';
import bundledSoccer from '../../data/soccer/jv.json';
import bundledValSoccer from '../../data/val-soccer/jv.json';
import { getOfficialFixtures, getSnapshot } from '../data';
import { readOverride, validateData } from '../data-file';
import { byDateThenId, localDateKey } from '../format';
import { withCrossLevelNames } from '../cross-level';
import { LEDGER_VIEW } from '../fixtures/ledger';
import { assignGameSlugs } from '../game-urls';
import { JV_CORRECTIONS, applyJvCorrections, type JvCorrectionResult } from './jv-corrections';
import { mergeJv, type JvMergeResult } from './jv-merge';
import { jvSlotsOf, mergeJvOfficial, type JvOfficialMergeResult, type JvSlot } from './jv-official';
import { mergeJvAdded, type JvAddedMergeResult } from './jv-added';
import { mergeJvSchoolSites, type JvSchoolSiteMergeResult } from './jv-school-sites';
import { JvFileSchema, type JvFile, type JvTeam } from './jv-schema';
import {
  classifyJvGames,
  computeJvStandings,
  jvVarsityTwins,
  withJvClassification,
  type JvClassification,
  type JvDivisionTable,
} from './jv-standings';
import type { ContestId, DivisionId, Game, LeagueId, TeamSlug } from '../types';

/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

function load(): JvFile {
  return validateData('jv', JvFileSchema, readOverride('lib/jv/jv.ts', 'SCVAL_JV', bundled));
}

const file = load();
const corrections: JvCorrectionResult = applyJvCorrections(file.games);
const merged: JvMergeResult = mergeJv({
  games: corrections.games,
  sblive: file.sblive,
  today: localDateKey(file.fetchedAt),
  fetchedAt: file.fetchedAt,
});
const schoolSites: JvSchoolSiteMergeResult = mergeJvSchoolSites({
  games: merged.games,
  today: localDateKey(file.fetchedAt),
  fetchedAt: file.fetchedAt,
});
const SCHOOL_SITE_DIFFERS = new Map(schoolSites.differs.map((d) => [d.contestId, d.note]));
// The league's own JV schedule, where its document has one: lists a JV game no source has yet (lib/jv/jv-official.ts).
const JV_SLOTS: readonly JvSlot[] = jvSlotsOf(getSnapshot().games, getOfficialFixtures());
const official: JvOfficialMergeResult = mergeJvOfficial({
  games: schoolSites.games,
  slots: JV_SLOTS,
  fetchedAt: file.fetchedAt,
});
// The JV game of a varsity game no feed lists, where the source gives one (lib/jv/jv-added.ts).
const reported: JvAddedMergeResult = mergeJvAdded({
  games: official.games,
  added: LEDGER_VIEW.listed,
  today: localDateKey(file.fetchedAt),
  fetchedAt: file.fetchedAt,
});
const classes: ReadonlyMap<ContestId, JvClassification> = classifyJvGames(
  reported.games,
  getSnapshot().games,
  getOfficialFixtures(),
  JV_CORRECTIONS.leagueGames,
  { claims: official.claims, divisions: new Set(JV_SLOTS.map((s) => s.division)) },
);
// A game against MaxPreps' "Non JV Opponent" names that side in words (lib/cross-level.ts), before its slug is made.
const games: Game[] = withCrossLevelNames(withJvClassification(reported.games, classes));
/** The divisions whose schedule schedules the JV round: a bundle carries a JV slot on every fixture or on none. */
const JV_SCHEDULED_DIVISIONS: ReadonlySet<DivisionId> = new Set(JV_SLOTS.map((s) => s.division));
const tables: JvDivisionTable[] = computeJvStandings(games, classes, localDateKey(file.fetchedAt), JV_SCHEDULED_DIVISIONS);
const TEAM_BY_SLUG = new Map<string, JvTeam>(file.teams.map((t) => [t.slug, t]));

// Every JV game's page, `/jv/game/<slug>`: the slug a varsity game of the same facts would have (lib/game-slug.ts),
// `-2` on the second game of a same-day pair, by start time then contest id (lib/game-urls.ts rule 1, with no history:
// the JV file stores no slugs, so a JV game moved to another day is at its new date's URL and the old one is gone).
const JV_SLUG_BY_ID: ReadonlyMap<ContestId, string> = assignGameSlugs(games, () => undefined);
const JV_GAME_BY_SLUG = new Map<string, Game>(games.map((g) => [JV_SLUG_BY_ID.get(g.contestId) as string, g]));
const TWINS = jvVarsityTwins(games, getSnapshot().games);

export function getJvFile(): JvFile {
  return file;
}

/** The merge's outcome, before classification: every published JV game and what si.com changed. */
export function getJvMerge(): JvMergeResult {
  return merged;
}

/** What the league's own JV schedule added, timed and matched (lib/jv/jv-official.ts), after the other merges. */
export function getJvOfficialMerge(): JvOfficialMergeResult {
  return official;
}

/** The JV games of varsity games no feed lists that this build added (lib/jv/jv-added.ts). */
export function getJvAddedMerge(): JvAddedMergeResult {
  return reported;
}

/** Every JV game the site lists, classified, oldest first. */
export function getJvGames(): Game[] {
  return [...games].sort(byDateThenId);
}

/** Every date (YYYY-MM-DD) with a JV game, ascending. */
export function getJvDates(): string[] {
  return [...new Set(games.map((g) => g.dateKey))].sort();
}

/** Whether a division's official schedule schedules its JV round (its fixtures carry JV slots). */
export function isJvScheduledDivision(division: DivisionId): boolean {
  return JV_SCHEDULED_DIVISIONS.has(division);
}

/** MaxPreps JV rows left out or re-pointed by lib/jv/jv-corrections.ts, before the merge. */
export function getJvCorrections(): JvCorrectionResult {
  return corrections;
}

/** What the school athletics sites (lib/jv/jv-school-sites.ts) filled, added and disagreed with, after the si.com merge. */
export function getJvSchoolSiteMerge(): JvSchoolSiteMergeResult {
  return schoolSites;
}

/** The sentence under a JV final a school's own page scores differently, or null. */
export function getJvSchoolSiteDiffersNote(contestId: ContestId): string | null {
  return SCHOOL_SITE_DIFFERS.get(contestId) ?? null;
}

/** One school's JV entry (its two sources' status and pages); undefined only for a non-registry slug. */
export function getJvTeam(slug: TeamSlug): JvTeam | undefined {
  return TEAM_BY_SLUG.get(slug);
}

/** A school's JV games, classified, oldest first. */
export function getJvGamesForTeam(slug: TeamSlug): Game[] {
  return games.filter((g) => g.home.slug === slug || g.away.slug === slug).sort(byDateThenId);
}

/**
 * A JV team outside the registry's games, by its MaxPreps id, classified, oldest first: York's
 * (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS), which Santa Catalina's page lists, since York plays its JV slot.
 */
export function getJvGamesForOutsideTeam(maxprepsTeamId: string): Game[] {
  return games
    .filter((g) => g.home.teamId === maxprepsTeamId || g.away.teamId === maxprepsTeamId)
    .sort(byDateThenId);
}

/** Every JV game on one date (YYYY-MM-DD), classified, by time. */
export function getJvGamesOn(dateKey: string): Game[] {
  return games.filter((g) => g.dateKey === dateKey);
}

/** How one JV game was classified (lib/jv/jv-standings.ts). */
export function getJvClassification(contestId: ContestId): JvClassification | undefined {
  return classes.get(contestId);
}

/** One division's JV table. */
export function getJvTable(division: DivisionId): JvDivisionTable | undefined {
  return tables.find((t) => t.division === division);
}

/** A league's JV tables, in division order. */
export function getJvTables(league: LeagueId): JvDivisionTable[] {
  return tables.filter((t) => t.league === league);
}

/** A JV game's URL segment (`/jv/game/<slug>`); undefined only for a contest id that is not a listed JV game. */
export function getJvGameSlug(contestId: ContestId): string | undefined {
  return JV_SLUG_BY_ID.get(contestId);
}

/** `/jv/game/<slug>`: the one way a JV game's page is linked. Undefined only for a contest that is not listed. */
export function jvGameHref(game: Pick<Game, 'contestId'>): string | undefined {
  const slug = JV_SLUG_BY_ID.get(game.contestId);
  return slug === undefined ? undefined : `/jv/game/${slug}`;
}

/** The JV game at a slug, classified; undefined for any other segment. */
export function getJvGameBySlug(slug: string): Game | undefined {
  return JV_GAME_BY_SLUG.get(slug);
}

/** Every JV game's slug, in date order: the /jv/game/[id] pages' params. */
export function getJvGameSlugs(): string[] {
  return getJvGames().map((g) => JV_SLUG_BY_ID.get(g.contestId) as string);
}

/** The varsity game a JV game is played beside (lib/jv/jv-standings.ts jvVarsityTwins), or undefined. */
export function getJvVarsityGame(contestId: ContestId): Game | undefined {
  return TWINS.varsityOf.get(contestId);
}

/** The one JV game played beside a varsity game, or undefined (none, or more than one). */
export function getJvGameForVarsity(varsityContestId: ContestId): Game | undefined {
  const id = TWINS.jvOf.get(varsityContestId);
  return id === undefined ? undefined : games.find((g) => g.contestId === id);
}

/** When the JV file was read (ISO UTC). */
export function getJvFetchedAt(): string {
  return file.fetchedAt;
}
