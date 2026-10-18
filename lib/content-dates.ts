/**
 * When a page's content last changed, for the sitemap's `lastmod` (app/sitemap.ts).
 *
 * Google uses `lastmod` only from a sitemap whose dates are consistently right, and a sitemap that
 * stamps every URL with the snapshot's `fetchedAt` is not: twice a day, all ~1,000 game, date and
 * team entries "changed", including August finals nothing has touched since. So a page that shows
 * a fixed set of games takes the latest of THOSE games' own stamps instead.
 *
 * A game's stamp is MaxPreps' `modifiedOn` for the contest (`provenance.maxprepsModifiedOn`), which
 * the API publishes without an offset. It is UTC: the newest one in every snapshot lands seconds
 * before the snapshot's own `fetchedAt` (2026-10-17T16:50:23 against 16:50:40.580Z), and read as
 * Pacific time it would be seven hours in the future. It is clamped to `fetchedAt`, so no page ever
 * claims a change after the data it was built from was read. Where the page's version of the game
 * is not MaxPreps' — a si.com score (`provenance.backfill`) or a disagreement this site prints
 * (`scoreConflict`) — or MaxPreps published no stamp, nothing says when it changed, so the stamp is
 * the snapshot's `fetchedAt`: possibly later than the truth, never earlier.
 *
 * Both of those are fallbacks now. The pipeline records `provenance.contentChangedAt` itself
 * (stampContentChanges, called from lib/pipeline/steps/assemble.ts): the run at which the game's
 * published content last differed from the previous snapshot's copy. That covers what MaxPreps'
 * stamp cannot — an official schedule revision that moves or reclassifies a game, a host conflict,
 * a si.com score — and is the stamp whenever it is set. A game unchanged since the field was
 * introduced has none, and falls back to the rules above.
 */
import { contentKey } from './stable-json';
import type { ContentRemoval, Game } from './types';

/** `2026-09-10T19:51:44` (MaxPreps, no offset, UTC) as an ISO instant; null when it does not parse. */
function maxprepsInstant(modifiedOn: string): number | null {
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(modifiedOn) ? modifiedOn : `${modifiedOn}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** The instant (ms) this game's published content last changed, by the rules above. */
export function gameContentStamp(game: Game): number {
  const changed = game.provenance.contentChangedAt;
  if (changed !== undefined && !Number.isNaN(Date.parse(changed))) return Date.parse(changed);
  const fetched = Date.parse(game.provenance.fetchedAt);
  const modifiedOn = game.provenance.maxprepsModifiedOn;
  if (!modifiedOn || game.provenance.backfill || game.provenance.scoreConflict) return fetched;
  const modified = maxprepsInstant(modifiedOn);
  return modified === null ? fetched : Math.min(modified, fetched);
}

/**
 * What a reader can see of a game: every field but the stamps that move without the game changing —
 * when it was read (`fetchedAt`), MaxPreps' own edit stamp (a re-save that changes nothing a page
 * prints), and `contentChangedAt` itself.
 */
const UNSEEN = ['fetchedAt', 'maxprepsModifiedOn', 'contentChangedAt'] as const;

/**
 * `games` with `provenance.contentChangedAt` set against the previous snapshot (SPEC §7.4 step 13):
 * a game whose content (UNSEEN aside) equals the previous copy of the same contest keeps that copy's
 * stamp, or none if it had none (the field's first run: nothing says when it last changed, so
 * gameContentStamp falls back to MaxPreps' stamp); a game that differs, or that the previous
 * snapshot did not have, takes this run's `fetchedAt`. With no previous snapshot nothing is
 * stamped, since nothing can be compared.
 */
export function stampContentChanges(games: readonly Game[], previous: readonly Game[] | null, fetchedAt: string): Game[] {
  if (previous === null) return [...games];
  const before = new Map(previous.map((g) => [g.contestId, g]));
  return games.map((game) => {
    const prior = before.get(game.contestId);
    const same = prior !== undefined && contentKey(prior, UNSEEN) === contentKey(game, UNSEEN);
    const stamp = same ? prior.provenance.contentChangedAt : fetchedAt;
    // A stamp of `undefined` leaves no key in the written file (lib/stable-json.ts normalizeKeys).
    return { ...game, provenance: { ...game.provenance, contentChangedAt: stamp } };
  });
}

/**
 * The season's contest removals (Snapshot.contentRemovals), with this run's added: a contest in the
 * previous snapshot that is gone from `games` (deleted on MaxPreps, or a si.com game a MaxPreps one
 * superseded) left its date, and one whose `dateKey` changed left its old date. Nothing that stays
 * on such a date, or on its sides' pages, changes when it goes, so without these the pages that
 * showed it would keep their old `lastmod`. The previous removals carry forward; a repeat of the
 * same contest leaving the same date keeps the later stamp. Sorted, so a run with no new removal
 * writes the same bytes.
 */
export function contentRemovalsOf(
  games: readonly Game[],
  previous: { games: readonly Game[]; contentRemovals?: readonly ContentRemoval[] } | null,
  fetchedAt: string,
): ContentRemoval[] {
  if (previous === null) return [];
  const now = new Map(games.map((g) => [g.contestId, g]));
  const fresh: ContentRemoval[] = previous.games.flatMap((prior) => {
    const current = now.get(prior.contestId);
    if (current !== undefined && current.dateKey === prior.dateKey) return [];
    return [{ contestId: prior.contestId, dateKey: prior.dateKey, slugs: sideSlugs(prior), removedAt: fetchedAt }];
  });
  const byKey = new Map<string, ContentRemoval>();
  for (const r of [...(previous.contentRemovals ?? []), ...fresh]) {
    const key = `${r.contestId}@${r.dateKey}`;
    const seen = byKey.get(key);
    if (!seen || seen.removedAt < r.removedAt) byKey.set(key, r);
  }
  return [...byKey.values()].sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId),
  );
}

/** The removals a `/scores/[date]` page showed: the contests that left that date. */
export function removalsOnDay(removals: readonly ContentRemoval[], dateKey: string): ContentRemoval[] {
  return removals.filter((r) => r.dateKey === dateKey);
}

/**
 * The removals a `/game/[id]` page could have shown: a contest of either registry side, which fed
 * its records, its form or its season series. A superset, like gamePageInputs.
 */
export function removalsForGame(removals: readonly ContentRemoval[], game: Game): ContentRemoval[] {
  const sides = sideSlugs(game);
  return removals.filter((r) => r.slugs.some((s) => sides.includes(s)));
}

/**
 * The latest content stamp of `games` and `removals` as a Date, or `fallback` when there are
 * neither.
 */
export function latestContentDate(
  games: readonly Game[],
  fallback: string,
  removals: readonly ContentRemoval[] = [],
): Date {
  const stamps = [...games.map(gameContentStamp), ...removals.map((r) => Date.parse(r.removedAt))];
  if (stamps.length === 0) return new Date(fallback);
  return new Date(Math.max(...stamps));
}

/** Whether `g` has a registry side among `slugs`. */
function involvesAny(g: Game, slugs: readonly string[]): boolean {
  return [g.home.slug, g.away.slug].some((s) => s !== null && slugs.includes(s));
}

/** A game's registry sides' slugs. */
function sideSlugs(game: Game): string[] {
  return [game.home.slug, game.away.slug].filter((s): s is string => s !== null);
}

/**
 * The games a `/game/[id]` page is built from: the game itself; both registry sides' games that
 * make the records on its scoreboard and the form going in; and every meeting of the two schools
 * this season (the season series, later legs included). The records are "as of this game" — so
 * the sides' games up to its date — except on a postponed game or a regular-season non-league one,
 * whose records are TODAY'S (components/game/game-view.ts recordAsOf, "League records to date"),
 * so every game of both sides. A superset is harmless here — at worst a page reads as changed a
 * little more often than it did — while a missing game would make the date too early.
 */
export function gamePageInputs(game: Game, all: readonly Game[]): Game[] {
  const sides = sideSlugs(game);
  const recordsToDate = game.status === 'postponed' || (game.countsFor === null && game.postseason === null);
  // components/game/game-view.ts seriesGames' key: the slug, else the name, trimmed and lower-cased.
  const key = (side: Game['home']) => side.slug ?? `name:${side.name.trim().toLowerCase()}`;
  const pair = [key(game.home), key(game.away)];
  return all.filter((g) => {
    if (g === game) return true;
    if ((recordsToDate || g.dateLocal <= game.dateLocal) && involvesAny(g, sides)) return true;
    const keys = [key(g.home), key(g.away)];
    return pair.every((k) => keys.includes(k));
  });
}

/**
 * The games a `/scores/[date]` page is built from: that day's games, and for a league game with no
 * score on the board yet, every game of both its sides, because its row prints their CURRENT league
 * records (components/ui/GameRow.tsx `showRecords`, which GameList sets). A final's row prints no
 * record. The day's JV games are the caller's to add.
 */
export function scoreDayInputs(day: readonly Game[], all: readonly Game[]): Game[] {
  const sides = day.filter((g) => g.countsFor !== null && g.status !== 'final').flatMap(sideSlugs);
  if (sides.length === 0) return [...day];
  return all.filter((g) => day.includes(g) || involvesAny(g, sides));
}
