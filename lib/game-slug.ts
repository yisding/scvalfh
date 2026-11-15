/**
 * A game's URL segment (`/game/<slug>`): the date, then the two sides, away first, as the pages word a matchup.
 *
 *   /game/2026-10-06-santa-catalina-at-greenfield        a game at the home side's school
 *   /game/2026-09-12-pinewood-vs-san-francisco-waldorf   a neutral site (lib/format.ts matchupJoiner)
 *   /game/2026-09-12-pinewood-vs-san-francisco-waldorf-2 the second game of that pair on that day
 *
 * A registry team is its registry slug; a school outside the registry is its name, slugged. The slug a game HAS is
 * stored (`Game.slug`, assigned by lib/game-urls.ts with the previous snapshot beside it, so a rematch's `-2` stays
 * with the game it was given to); `baseGameSlug` is only what a game with no slug yet would be called.
 *
 * Pure and client-safe: no imports, so lib/game-id.ts (gameHref) and proxy.ts can reach it.
 */

/** The facts a slug is made of. */
export interface GameSlugFacts {
  dateKey: string;
  site: 'home' | 'away' | 'neutral';
  home: { slug: string | null; name: string };
  away: { slug: string | null; name: string };
}

/** A canonical game slug: `<YYYY-MM-DD>-<words>`, lower case, single hyphens. A legacy id param never matches it. */
export const GAME_SLUG_RE = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)+$/;

/** 'St. Mary’s (Stockton)' → 'st-marys-stockton'; a name with no letter or digit at all → 'tbd'. */
export function slugifyName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tbd';
}

const sideSlug = (side: GameSlugFacts['home']): string => side.slug ?? slugifyName(side.name);

/** `<date>-<away>-at-<home>`, `-vs-` at a neutral site: the slug before any `-2` for a same-day rematch. */
export function baseGameSlug(game: GameSlugFacts): string {
  return `${game.dateKey}-${sideSlug(game.away)}-${game.site === 'neutral' ? 'vs' : 'at'}-${sideSlug(game.home)}`;
}

/**
 * The slug of a game: the stored one, else what it would be called. Every game the site reads has a stored one
 * (lib/snapshot/snapshot-load.ts gives a file written before slugs existed its slugs; lib/results/fixture-games.ts
 * gives a schedule-only game its own), so the fallback is for a game built outside the snapshot (a test, a
 * pipeline step before assemble).
 */
export function gameSlug(game: GameSlugFacts & { slug?: string }): string {
  return game.slug ?? baseGameSlug(game);
}
