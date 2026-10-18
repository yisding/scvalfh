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
 */
import type { Game } from './types';

/** `2026-09-10T19:51:44` (MaxPreps, no offset, UTC) as an ISO instant; null when it does not parse. */
function maxprepsInstant(modifiedOn: string): number | null {
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(modifiedOn) ? modifiedOn : `${modifiedOn}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** The instant (ms) this game's published content last changed, by the rules above. */
export function gameContentStamp(game: Game): number {
  const fetched = Date.parse(game.provenance.fetchedAt);
  const modifiedOn = game.provenance.maxprepsModifiedOn;
  if (!modifiedOn || game.provenance.backfill || game.provenance.scoreConflict) return fetched;
  const modified = maxprepsInstant(modifiedOn);
  return modified === null ? fetched : Math.min(modified, fetched);
}

/** The latest content stamp of `games` as a Date, or `fallback` when there are none. */
export function latestContentDate(games: readonly Game[], fallback: string): Date {
  if (games.length === 0) return new Date(fallback);
  return new Date(Math.max(...games.map(gameContentStamp)));
}

/**
 * The games a `/game/[id]` page is built from: the game itself; both registry sides' earlier games,
 * which make the records "as of this game" and the form going in (an upcoming game's records are
 * today's, so every final before it); and every meeting of the two schools this season (the season
 * series, later legs included). A superset is harmless here — at worst a page reads as changed a
 * little more often than it did — while a missing game would make the date too early.
 */
export function gamePageInputs(game: Game, all: readonly Game[]): Game[] {
  const sides = [game.home.slug, game.away.slug].filter((s): s is string => s !== null);
  // components/game/game-view.ts seriesGames' key: the slug, else the name, trimmed and lower-cased.
  const key = (side: Game['home']) => side.slug ?? `name:${side.name.trim().toLowerCase()}`;
  const pair = [key(game.home), key(game.away)];
  return all.filter((g) => {
    if (g === game) return true;
    const slugs = [g.home.slug, g.away.slug];
    if (g.dateLocal <= game.dateLocal && slugs.some((s) => s !== null && sides.includes(s))) return true;
    const keys = [key(g.home), key(g.away)];
    return pair.every((k) => keys.includes(k));
  });
}
