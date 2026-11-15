/**
 * Where an old game URL leads: the aliases of a snapshot's games (`Game.aliases`, lib/game-urls.ts) and the slug of
 * the game each belongs to. Two kinds of alias, two places that answer them:
 *
 *  - The old id URLs (`/game/<MaxPreps GUID>`, `/game/sblive-<n>`, `/game/cifsds-…`, `/game/official-…`:
 *    lib/game-urls.ts isLegacyGameParam) are proxy.ts's, from `legacyGameTarget`. There is one per game published
 *    before slugs, more than the 1,024 redirects a next.config may carry on Vercel
 *    (node_modules/next/dist/docs/01-app/02-guides/redirecting.md), and its matcher runs it for those shapes only.
 *  - The rest are next.config.ts `redirects()`, from `renamedGameRedirects`: a slug a game had before its date, its
 *    host or a side's name changed. Such an alias looks like any slug, so no matcher could single it out, and there
 *    are few (one per change). next.config.ts gives it the games as lib/data.ts reads them.
 *
 * For the proxy the snapshot is IMPORTED here, as lib/data.ts imports it, so the Worker and the proxy's own bundle
 * carry it without a filesystem; `SCVAL_SNAPSHOT` swaps the file where there is one. It is read as stored, with
 * only the slug upgrade a file from before slugs needs (lib/game-urls.ts addGameUrls, the same call
 * lib/snapshot/snapshot-load.ts makes first) and none of lib/data.ts's validation, which takes about a second: this
 * runs on a request. What lib/data.ts adds to the file on reading it is therefore not in the table: a schedule-only
 * game, or an added game the file predates. Both were published at `official-<date>-<away>-at-<home>`, which
 * `legacyGameTarget` sends to that segment without its prefix: the game's slug, or (for one at a neutral site, whose
 * slug says `vs`) an alias next.config.ts redirects. (A schedule-only game called `…-2`, because a stored game of
 * its day and pair had the slug first, was never at an `official-` URL: lib/results/fixture-games.ts.)
 * tests/game-aliases.test.ts holds every answer to a page lib/data.ts has.
 */

import bundledSnapshotFieldHockey from '../data/snapshot.json';
import bundledSnapshotBasketball from '../data/basketball/snapshot.json';
import bundledSnapshotVolleyball from '../data/volleyball/snapshot.json';
import bundledSnapshotSoccer from '../data/soccer/snapshot.json';
import { GAME_SLUG_RE } from './game-slug';
import { addGameUrls, gameAliasTable, isLegacyGameParam, needsGameUrls, type UrlGame } from './game-urls';

/** This build's copy, chosen on the inlined SCVAL_SPORT itself so a bundler leaves the other sports' files out (lib/data.ts). */
const bundledSnapshot: unknown = process.env.SCVAL_SPORT === 'basketball' ? bundledSnapshotBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledSnapshotVolleyball : process.env.SCVAL_SPORT === 'soccer' ? bundledSnapshotSoccer : bundledSnapshotFieldHockey;

export interface GameRedirect {
  source: string;
  destination: string;
  permanent: true;
}

/** The stored games with their URLs; none for a file that is not a v2 snapshot. */
function storedGames(): UrlGame[] {
  const override = process.env.SCVAL_SNAPSHOT;
  let raw: unknown = bundledSnapshot;
  if (override) {
    try {
      // Asked for at run time, not imported: only this branch needs a filesystem, and a Worker never takes it.
      raw = JSON.parse(process.getBuiltinModule('node:fs').readFileSync(override, 'utf8')) as unknown;
    } catch (err) {
      throw new Error(`lib/game-aliases.ts: cannot read SCVAL_SNAPSHOT=${override} (${(err as Error).message})`);
    }
  }
  const file = (needsGameUrls(raw) ? addGameUrls(raw) : raw) as { schemaVersion?: unknown; games?: unknown } | null;
  return file?.schemaVersion === 2 && Array.isArray(file.games) ? (file.games as UrlGame[]) : [];
}

let table: ReadonlyMap<string, string> | undefined;

/** Alias → slug, for every alias in the stored snapshot. Built once, on first use. */
export function storedGameAliases(): ReadonlyMap<string, string> {
  table ??= gameAliasTable(storedGames());
  return table;
}

/** The legacy param prefix of an `official:` contest id (lib/game-id.ts gameIdToParam). */
const OFFICIAL_PARAM_PREFIX = 'official-';

/**
 * The slug an old id URL segment leads to, or undefined when it never was a game here.
 *
 * A GUID is looked up as written and in lower case (MaxPreps ids are stored as the feed spells them). An
 * `official-<date>-<away>-at-<home>` the table does not have leads to that segment without its prefix (see above).
 */
export function legacyGameTarget(param: string): string | undefined {
  if (!isLegacyGameParam(param)) return undefined;
  const aliases = storedGameAliases();
  const known = aliases.get(param) ?? aliases.get(param.toLowerCase());
  if (known !== undefined) return known;
  if (!param.startsWith(OFFICIAL_PARAM_PREFIX)) return undefined;
  const slug = param.slice(OFFICIAL_PARAM_PREFIX.length);
  return GAME_SLUG_RE.test(slug) ? slug : undefined;
}

/**
 * next.config.ts `redirects()`: a 308 for each alias of `games` that is an old SLUG, and for its OG image (a card
 * a social site cached the URL of), in alias order. The legacy id params are proxy.ts's.
 */
export function renamedGameRedirects(games: readonly UrlGame[]): GameRedirect[] {
  return [...gameAliasTable(games)]
    .filter(([alias]) => !isLegacyGameParam(alias))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([alias, slug]) => [
      { source: `/game/${alias}`, destination: `/game/${slug}`, permanent: true as const },
      { source: `/game/${alias}/opengraph-image`, destination: `/game/${slug}/opengraph-image`, permanent: true as const },
    ]);
}
