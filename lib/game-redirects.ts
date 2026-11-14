/**
 * The `redirects()` next.config.ts returns: one permanent (308) redirect per `supersededGames` key, from the retired
 * game page to the game that replaced it, plus the same for its OG image (SPEC §8.1).
 *
 * A game no MaxPreps feed listed gets its own page: an si.com fill (`/game/sblive-<n>`, D2), a San Diego bracket-sheet
 * game (`/game/cifsds-<away>-at-<home>`), a game recorded from DATA_QUALITY.addedGames or listed from a league's own
 * schedule (`/game/official-<date>-<away>-at-<home>`). Once MaxPreps lists the game, that page's game is gone and
 * lib/pipeline/steps/assemble.ts `supersededGamesOf` maps its id to the MaxPreps contest for the rest of the season.
 * Those pages used to be prerendered as stubs linking the MaxPreps game; a link anyone shared now lands on the game
 * itself instead, and a crawler moves the old URL's standing to the new one.
 *
 * Read by next.config.ts, which every toolchain evaluates in Node at build time (`next build`, and vinext, which
 * bakes the rules into its server entry, so a Worker needs no filesystem for them) and `next start` again at startup.
 * So this module reads the snapshot file itself rather than importing lib/data.ts, and imports only the
 * import-free leaves lib/game-id.ts and lib/sports/current.ts. `SCVAL_SNAPSHOT` swaps the file as it does for
 * lib/data.ts (lib/data-file.ts readOverride).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { gameIdToParam, isPrefixedContestId } from './game-id';
import { DATA_DIR } from './sports/current';

export interface GameRedirect {
  source: string;
  destination: string;
  permanent: true;
}

/**
 * A URL segment the redirect's path pattern reads literally: no path-to-regexp syntax (`:`, `(`, `*`, …). Either
 * case: a MaxPreps GUID is matched case-insensitively (lib/game-id.ts GUID_RE) and kept as the feed spells it.
 */
const PLAIN_PARAM = /^[A-Za-z0-9-]+$/;

/**
 * Two redirects per superseded id, in key order: the page, and its `opengraph-image` (a card a social site cached
 * the URL of). Only a prefixed id (lib/game-id.ts) can be superseded, so no rule can ever shadow a MaxPreps game's
 * page; a key or target that would is a thrown error rather than a broken route table.
 */
export function supersededGameRedirects(superseded: Readonly<Record<string, string>>): GameRedirect[] {
  return Object.entries(superseded)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([from, to]) => {
      const fromParam = gameIdToParam(from);
      const toParam = gameIdToParam(to);
      if (!isPrefixedContestId(from) || !PLAIN_PARAM.test(fromParam)) {
        throw new Error(`lib/game-redirects.ts: superseded key ${JSON.stringify(from)} is not an sblive:, cifsds: or official: id`);
      }
      if (!PLAIN_PARAM.test(toParam) || toParam === fromParam) {
        throw new Error(`lib/game-redirects.ts: superseded target ${JSON.stringify(to)} of ${from} is not a game id`);
      }
      const source = `/game/${fromParam}`;
      const destination = `/game/${toParam}`;
      return [
        { source, destination, permanent: true as const },
        { source: `${source}/opengraph-image`, destination: `${destination}/opengraph-image`, permanent: true as const },
      ];
    });
}

/** This build's snapshot file (`SCVAL_SNAPSHOT`, else `<DATA_DIR>/snapshot.json`), its `supersededGames` alone. */
export function readSupersededGames(): Record<string, string> {
  const file = process.env.SCVAL_SNAPSHOT || path.join(DATA_DIR, 'snapshot.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`lib/game-redirects.ts: cannot read ${file} (${(err as Error).message})`);
  }
  // A v1 snapshot has no map (lib/snapshot/snapshot-migrate.ts gives it an empty one).
  const map = (raw as { supersededGames?: unknown }).supersededGames ?? {};
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new Error(`lib/game-redirects.ts: ${file} supersededGames is not an object`);
  }
  return Object.fromEntries(Object.entries(map).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** What next.config.ts `redirects()` returns. */
export function gameRedirects(): GameRedirect[] {
  return supersededGameRedirects(readSupersededGames());
}
