/** The one error type of every MaxPreps read: transport, JSON, schema drift and page parsing. */

export class MaxPrepsError extends Error {
  readonly url: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  /**
   * The first 4 KB of a non-2xx response's body, when it could be read. Some endpoints say why in
   * it: the player stats rollup's 400 is "No data was found" for a team with no stats, and that
   * must be told apart from a 400 for a bad parameter (lib/sources/maxpreps/player-stats.ts).
   */
  readonly body?: string;

  constructor(
    message: string,
    opts: { url: string; httpStatus?: number; retryable?: boolean; body?: string },
  ) {
    super(message);
    this.name = 'MaxPrepsError';
    this.url = opts.url;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
    this.body = opts.body;
  }
}
