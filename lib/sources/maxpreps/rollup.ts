/**
 * The one fetch of a MaxPreps stats ROLLUP (SPEC §1.1k): the player stats rollup
 * (lib/sources/maxpreps/player-stats.ts) and its game-by-game sibling
 * (lib/sources/maxpreps/game-stats.ts) answer the same way and are read the same way.
 *
 * A team whose coach has entered no stats answers HTTP 400 `{status: 400, message: "No data was
 * found for this request.", data: null}`. The client throws on any non-2xx, so a 400 is read from
 * the error's body (MaxPrepsError keeps its first 4 KB) and parsed like a 2xx body; any other
 * non-2xx, or a 400 with no body, still throws.
 *
 * `onRaw` sees the body as received, once, BEFORE it is decoded or validated, so a response that
 * drifted (or is not JSON at all) is still handed over — what --capture saves is exactly what
 * failed. The caller's parser does the schema check, once.
 */

import type { MaxPrepsClient } from './client';
import { MaxPrepsError } from './error';

export interface RollupBodyOptions {
  /**
   * A 400 whose body is not JSON. 'invalid-json' reports it like a 2xx body that is not JSON
   * (game stats); 'rethrow' rethrows the HTTP error, which says it best: a 400 that is not JSON
   * is not MaxPreps' "no data" envelope (player stats).
   */
  nonJson400: 'invalid-json' | 'rethrow';
  /**
   * The error for a body that is not JSON; `httpStatus` is the answer's status. Each rollup keeps
   * its own message (game stats prefixes it and names no status; player stats words it like the
   * client's own `json()`).
   */
  invalidJson: (detail: string, httpStatus: number) => MaxPrepsError;
}

/** The rollup's body, parsed as JSON but not validated. */
export async function fetchRollupBody(
  client: MaxPrepsClient,
  url: string,
  onRaw: ((body: string) => void) | undefined,
  opts: RollupBodyOptions,
): Promise<unknown> {
  let body: string;
  let httpStatus: number;
  let httpError: MaxPrepsError | null = null;
  try {
    const res = await client.text(url, 'application/json');
    body = res.data;
    httpStatus = res.meta.httpStatus;
  } catch (err) {
    if (!(err instanceof MaxPrepsError) || err.httpStatus !== 400 || !err.body) throw err;
    body = err.body;
    httpStatus = err.httpStatus;
    httpError = err;
  }
  onRaw?.(body);
  try {
    return JSON.parse(body) as unknown;
  } catch (err) {
    if (httpError && opts.nonJson400 === 'rethrow') throw httpError;
    throw opts.invalidJson((err as Error).message, httpStatus);
  }
}
