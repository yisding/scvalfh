/**
 * The read API for data/<sport>/freshman.json: every registry school's freshman games, read from MaxPreps alone.
 *
 * Added 2026-11-25 for girls soccer and boys basketball (owner decision): the freshman level is the third level, after
 * varsity and the JV. Built by `scripts/fetch-jv.ts --level freshman` into a file of the JV file's shape
 * (lib/jv/jv-schema.ts), held here to the freshman file's own rules (`FreshmanFileSchema`). A build with no freshman
 * season id (lib/sports/shape.ts `freshmanSportSeasonId`: the fall sports, the VAL) has no freshman file, and every
 * function here answers as for a season with no games (`hasFreshmanLevel()` is false).
 *
 * Freshman games are kept apart from varsity and the JV, as the JV is kept apart from varsity: nothing here feeds a
 * standings table, a record, a leader board, a rating or a postseason picture of either level, and the site keeps no
 * freshman tables (owner decision, 2026-11-25). A game is listed as MaxPreps files it: none of the JV file's other
 * sources (si.com, school sites, league schedules) has the freshman level, so no merge runs. A game against MaxPreps'
 * "Non Freshman Opponent" names that side in words (lib/cross-level.ts).
 *
 * Imported so the build bundles it (lib/jv/jv.ts says why). `SCVAL_FRESHMAN` swaps in another file through node:fs
 * (Node only; never set it on a Worker).
 */

import bundledBasketball from '../../data/basketball/freshman.json';
import bundledSoccer from '../../data/soccer/freshman.json';
import { withCrossLevelNames } from '../cross-level';
import { readOverride, validateData } from '../data-file';
import { byDateThenId } from '../format';
import { assignGameSlugs } from '../game-urls';
import { levelScoreNote, withholdLevelScores, type LevelScore } from '../jv/jv-level-scores';
import { JvFileSchema, type JvFile, type JvTeam } from '../jv/jv-schema';
import { FRESHMAN_SPORT_SEASON_ID } from '../season';
import { SPORT } from '../sports/current';
import type { ContestId, Game, TeamSlug } from '../types';

/** The freshman file: the JV file's shape, read from MaxPreps alone, with this build's freshman season id. */
export const FreshmanFileSchema = JvFileSchema.refine((f) => f.sblive.length === 0, 'a freshman file holds no si.com rows')
  .refine((f) => f.teams.every((t) => t.sblive.status === 'unavailable'), 'si.com is unavailable for every freshman team')
  .refine((f) => f.sportSeasonId === FRESHMAN_SPORT_SEASON_ID, "the file was not read with this build's freshman season id");

export type FreshmanFile = JvFile;

/** This build's copy, or null in a build that does not cover the freshman level. */
const bundled: unknown =
  FRESHMAN_SPORT_SEASON_ID === null
    ? null
    : process.env.SCVAL_SPORT === 'basketball'
      ? bundledBasketball
      : process.env.SCVAL_SPORT === 'soccer'
        ? bundledSoccer
        : null;

function load(): FreshmanFile | null {
  if (bundled === null) return null;
  return validateData('freshman', FreshmanFileSchema, readOverride('lib/freshman/freshman.ts', 'SCVAL_FRESHMAN', bundled));
}

/**
 * MaxPreps placeholders that stand for an opponent not set yet, never a team: a game against one is not listed (the
 * varsity pipeline drops "Tournament Opponent" the same way, lib/league-config/data-quality.ts `ghostTeamIds`). Read
 * 2026-11-25: Westmoor's three basketball freshman rows of Dec 28-30 are against "Freshman Opponent" (city "Intl").
 * "Non Freshman Opponent" is not one of them: that game was played against a side MaxPreps does not name
 * (lib/cross-level.ts).
 */
export const FRESHMAN_PLACEHOLDER_IDS: Readonly<Record<string, string>> = {
  'b51244ab-a965-47e5-addb-4f44f26c49ed': '“Freshman Opponent”: a MaxPreps placeholder for a freshman game whose opponent is not set, not a school',
  'b6e1f3f8-f345-4829-80a4-0653a9a36a1d': '“Tournament Opponent”: a MaxPreps placeholder for a tournament game whose opponent is not set, not a school',
};

const placeholderOf = (g: Game): string | undefined =>
  [g.home.teamId, g.away.teamId].map((id) => (id === null ? undefined : FRESHMAN_PLACEHOLDER_IDS[id])).find((r) => r !== undefined);

const file = load();
/** The file's games against an unset opponent, left out, with why. */
const dropped: Array<{ game: Game; reason: string }> = (file?.games ?? []).flatMap((g) => {
  const reason = placeholderOf(g);
  return reason === undefined ? [] : [{ game: g, reason }];
});
// A level final in a sport that cannot end level (basketball) is no result: its score is withheld, as on the JV
// pages (lib/jv/jv-level-scores.ts). MaxPreps is the freshman level's only source, so nothing fills it.
const level = withholdLevelScores((file?.games ?? []).filter((g) => placeholderOf(g) === undefined), SPORT.scoring.allowsTies);
const games: Game[] = withCrossLevelNames(level.games).sort(byDateThenId);
const TEAM_BY_SLUG = new Map<string, JvTeam>((file?.teams ?? []).map((t) => [t.slug, t]));

// Every freshman game's page, `/freshman/game/<slug>`, by the JV pages' rule (lib/jv/jv.ts): the varsity slug rule
// with no history, so a game moved to another day is at its new date's URL.
const SLUG_BY_ID: ReadonlyMap<ContestId, string> = assignGameSlugs(games, () => undefined);
const GAME_BY_SLUG = new Map<string, Game>(games.map((g) => [SLUG_BY_ID.get(g.contestId) as string, g]));

/** Whether this build covers the freshman level at all (girls soccer and boys basketball). */
/** The sentence beside a freshman game whose MaxPreps final was level in a sport with no ties (lib/jv/jv-level-scores.ts), or null. */
export function getFreshmanLevelScoreNote(game: Game): string | null {
  const entry: LevelScore | undefined = level.withheld.get(game.contestId);
  return entry ? levelScoreNote(game, entry, SPORT.noun) : null;
}

export function hasFreshmanLevel(): boolean {
  return file !== null;
}

/** The validated freshman file, or null in a build without the level. */
export function getFreshmanFile(): FreshmanFile | null {
  return file;
}

/** The file's rows not listed because their opponent is a placeholder for one not set yet (FRESHMAN_PLACEHOLDER_IDS). */
export function getFreshmanDropped(): ReadonlyArray<{ game: Game; reason: string }> {
  return dropped;
}

/** Every freshman game the site lists, oldest first. */
export function getFreshmanGames(): Game[] {
  return [...games];
}

/** Every date (YYYY-MM-DD) with a freshman game, ascending. */
export function getFreshmanDates(): string[] {
  return [...new Set(games.map((g) => g.dateKey))].sort();
}

/** One school's freshman entry (its MaxPreps status and page); undefined in a build without the level. */
export function getFreshmanTeam(slug: TeamSlug): JvTeam | undefined {
  return TEAM_BY_SLUG.get(slug);
}

/** A school's freshman games, oldest first. */
export function getFreshmanGamesForTeam(slug: TeamSlug): Game[] {
  return games.filter((g) => g.home.slug === slug || g.away.slug === slug);
}

/** Every freshman game on one date (YYYY-MM-DD), by time. */
export function getFreshmanGamesOn(dateKey: string): Game[] {
  return games.filter((g) => g.dateKey === dateKey);
}

/** A freshman game's URL segment (`/freshman/game/<slug>`); undefined only for a contest that is not a listed game. */
export function getFreshmanGameSlug(contestId: ContestId): string | undefined {
  return SLUG_BY_ID.get(contestId);
}

/** `/freshman/game/<slug>`: the one way a freshman game's page is linked. Undefined only for a game not listed. */
export function freshmanGameHref(game: Pick<Game, 'contestId'>): string | undefined {
  const slug = SLUG_BY_ID.get(game.contestId);
  return slug === undefined ? undefined : `/freshman/game/${slug}`;
}

/** The freshman game at a slug; undefined for any other segment. */
export function getFreshmanGameBySlug(slug: string): Game | undefined {
  return GAME_BY_SLUG.get(slug);
}

/** Every freshman game's slug, in date order: the /freshman/game/[id] pages' params. */
export function getFreshmanGameSlugs(): string[] {
  return games.map((g) => SLUG_BY_ID.get(g.contestId) as string);
}

/** When the freshman file was read (ISO UTC); null in a build without the level. */
export function getFreshmanFetchedAt(): string | null {
  return file?.fetchedAt ?? null;
}
