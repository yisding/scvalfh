/**
 * Minimal HTTP transport for every polite non-MaxPreps-API read: the SECONDARY sources (si.com,
 * scval.com, cifccs.org, VNN) and the history, JV and mascot scripts.
 *
 * The gate, timeout, retries and backoff are one engine shared with `lib/sources/maxpreps/client.ts`
 * (lib/sources/http/polite-fetcher.ts); each client is an adapter over it. They stay two clients
 * because the primary one is JSON-and-zod-only, carries the descriptive User-Agent, and its retry
 * semantics are pinned by tests. The secondary sources need three things it does not have — a
 * per-source User-Agent (si.com gates on a browser UA), binary bodies (PDFs), and a `never throw`
 * mode so a failure becomes a SourceStatus row instead of aborting the cron (SPEC §5.3).
 *
 * Budget, same courtesy ceiling as the primary client (SPEC §5.2, §5.3):
 *   concurrency <= 3 · >= 500 ms between request starts · 15 s timeout · retry 429/5xx only.
 *
 * The source rule, for every module under lib/sources/: a source exports URL builders, response
 * schemas, pure parsers and an optional client; it never reads a Snapshot or merges into Game[].
 * Applying a source to the games and carrying it forward when a read fails belong to the ingestion
 * side (lib/pipeline/merge/, lib/official/); tests/arch/layers.test.ts rule (d) keeps lib/sources
 * from importing either.
 */

import { PoliteFetchError, PoliteFetcher } from './polite-fetcher';

/**
 * Descriptive UA for sources that do not gate on a browser (SPEC §5.3).
 *
 * ONE definition for the whole repo — `lib/sources/maxpreps/client.ts` imports this rather than keeping
 * a second literal, which is how the two drifted out of sync in the first place.
 *
 * SPEC §5.3's template is `+https://<our-site>/about; contact: <email>`, and both halves matter:
 * the `+` URL is what an operator follows to find out what the bot is, and the address is how they
 * ask it to stop (SPEC §7 requires it to stay monitored). The URL was `https://github.com/` —
 * GitHub's own front page, which identifies nothing — so it now follows `SITE_URL` when the deploy
 * environment sets a real one and names this repository otherwise. A localhost URL would be no more
 * use than the placeholder, so it is never emitted. `SCVAL_CONTACT` overrides the address for a
 * different deployment.
 */
const UA_CONTACT = process.env.SCVAL_CONTACT ?? 'helencom@ding.family';
const UA_HOMEPAGE = (() => {
  const site = process.env.SITE_URL?.replace(/\/$/, '');
  return site && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(site)
    ? `${site}/about`
    : 'https://github.com/yisding/scvalfh';
})();

export const POLITE_USER_AGENT =
  'scvalfh/1.0 (NorCal girls field hockey scoreboard; unofficial fan site; ' +
  `+${UA_HOMEPAGE}; contact: ${UA_CONTACT})`;

/**
 * si.com / SBLive 403s a non-browser User-Agent (SPEC §1.2, risk 15). This is UA-based gating we
 * comply with by identifying as a browser; everything else about the request stays polite
 * (one pass per day, redirects followed, no cookies, no concurrency above 3).
 */
export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class HttpError extends Error {
  readonly url: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(message: string, opts: { url: string; httpStatus?: number; retryable?: boolean }) {
    super(message);
    this.name = 'HttpError';
    this.url = opts.url;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
  }
}

export interface HttpResponse<T> {
  body: T;
  url: string;
  httpStatus: number;
  contentType: string | null;
  attempts: number;
}

export interface HttpClientOptions {
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  attempts?: number;
  concurrency?: number;
  spacingMs?: number;
  /** Test seam so backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  onLog?: (line: string) => void;
}

export class HttpClient {
  private readonly fetcher: PoliteFetcher;

  constructor(opts: HttpClientOptions = {}) {
    this.fetcher = new PoliteFetcher({
      ...opts,
      userAgent: opts.userAgent ?? POLITE_USER_AGENT,
      retryAfterCapMs: MAX_RETRY_AFTER_MS,
    });
  }

  /** Follows redirects: scorebooklive.com 301s to si.com and http→https on scval.com (SPEC §1.2). */
  async text(url: string, accept = 'text/html,application/xhtml+xml,*/*'): Promise<HttpResponse<string>> {
    return this.fetch(url, accept, (res) => res.text());
  }

  /** For PDFs. */
  async bytes(url: string, accept = 'application/pdf,*/*'): Promise<HttpResponse<Uint8Array>> {
    return this.fetch(url, accept, async (res) => new Uint8Array(await res.arrayBuffer()));
  }

  /** The engine's answer as an HttpResponse (`url` is the final URL after redirects), its failure as an HttpError. */
  private async fetch<T>(
    url: string,
    accept: string,
    read: (res: Response) => Promise<T>,
  ): Promise<HttpResponse<T>> {
    try {
      const res = await this.fetcher.fetch(url, accept, read);
      return {
        body: res.body,
        url: res.finalUrl,
        httpStatus: res.httpStatus,
        contentType: res.contentType,
        attempts: res.attempts,
      };
    } catch (err) {
      if (!(err instanceof PoliteFetchError)) throw err;
      throw new HttpError(err.message, { url: err.url, httpStatus: err.httpStatus, retryable: err.retryable });
    }
  }
}

/**
 * `Retry-After` in milliseconds, CAPPED. SPEC §5.3 budgets 120s for the whole run and the job is
 * killed at 20 minutes, so an upstream answering `Retry-After: 3600` must not be able to hold one
 * request for an hour and take the day's refresh down with it — past the cap we fall back to the
 * ordinary backoff and let the attempt budget end it.
 */
export const MAX_RETRY_AFTER_MS = 30_000;

