/**
 * A contest played at the other school than MaxPreps lists as host (DataQualityConfig.contestHostOverrides): the
 * game with its two sides swapped, so the school that hosted is `home` everywhere the site reads a host (the game
 * page's "at", the address, the bracket, the home edge in the ratings). MaxPreps' host and the override's citation
 * are kept in `provenance.hostCorrection`, which the game page prints.
 *
 * Applied twice, to the same effect: by the pipeline's normalize step (lib/pipeline/normalize.ts), before anything
 * reads the game, and by the snapshot loader to a stored file (lib/snapshot/snapshot-migrate.ts), so a correction
 * reaches the committed data without a refetch. A game whose home is already the override's school is returned
 * as it is, so a second pass changes nothing. Pure.
 */

import { DATA_QUALITY } from '../league-config/data-quality';
import type { DataQualityConfig } from '../league-config/shape';
import type { Game } from '../types';

type Pair<T> = { home: T; away: T };

function flip<T>(p: Pair<T>): Pair<T> {
  return { home: p.away, away: p.home };
}

/** Every side-keyed fact of `game` mirrored: the sides, the side-keyed evidence, the winner. The site is a host's. */
export function swapSides(game: Game): Game {
  const p = game.provenance;
  return {
    ...game,
    home: game.away,
    away: game.home,
    site: 'home',
    contestTypes: flip(game.contestTypes),
    forfeitBy: game.forfeitBy === 'home' ? 'away' : game.forfeitBy === 'away' ? 'home' : null,
    shootout: game.shootout ? flip(game.shootout) : null,
    ...(game.result
      ? { result: { ...game.result, winner: game.result.winner === 'home' ? 'away' : game.result.winner === 'away' ? 'home' : null } }
      : {}),
    provenance: {
      ...p,
      ...(p.scoreConflict ? { scoreConflict: { ...p.scoreConflict, sblive: flip(p.scoreConflict.sblive) } } : {}),
      ...(p.backfill ? { backfill: { ...p.backfill, maxpreps: p.backfill.maxpreps ? flip(p.backfill.maxpreps) : null } } : {}),
      ...(p.cifssScore ? { cifssScore: { ...p.cifssScore, home: p.cifssScore.away, away: p.cifssScore.home } } : {}),
      ...(p.shootoutSource ? { shootoutSource: { ...p.shootoutSource, score: flip(p.shootoutSource.score) } } : {}),
      ...(p.boxScore ? { boxScore: { ...(p.boxScore.away ? { home: p.boxScore.away } : {}), ...(p.boxScore.home ? { away: p.boxScore.home } : {}) } } : {}),
      ...(p.adjudicated
        ? {
            adjudicated: {
              ...p.adjudicated,
              maxpreps: {
                home: p.adjudicated.maxpreps.away,
                away: p.adjudicated.maxpreps.home,
                homeResult: p.adjudicated.maxpreps.awayResult,
                awayResult: p.adjudicated.maxpreps.homeResult,
              },
            },
          }
        : {}),
      ...(p.resultCorrection
        ? {
            resultCorrection: {
              ...p.resultCorrection,
              maxpreps: p.resultCorrection.maxpreps
                ? { ...p.resultCorrection.maxpreps, home: p.resultCorrection.maxpreps.away, away: p.resultCorrection.maxpreps.home }
                : null,
            },
          }
        : {}),
    },
  };
}

/**
 * `game` hosted by the school its override names: the sides swapped when MaxPreps lists the other school as host,
 * with MaxPreps' host and the citation recorded. The same object when there is no override, when the named school
 * is already home, or when it is neither side (lib/leagues.ts cannot check a contest's sides; tests/host-override.test.ts
 * checks each override against the committed snapshot).
 */
export function applyHostOverride(
  game: Game,
  overrides: DataQualityConfig['contestHostOverrides'] = DATA_QUALITY.contestHostOverrides,
): Game {
  const o = overrides[game.contestId];
  if (!o || game.home.slug === o.home || game.away.slug !== o.home || !game.home.slug) return game;
  const swapped = swapSides(game);
  return {
    ...swapped,
    provenance: { ...swapped.provenance, hostCorrection: { maxprepsHome: game.home.slug, source: o.source, url: o.url } },
  };
}
