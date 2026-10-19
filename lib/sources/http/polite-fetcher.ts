/**
 * The one polite-HTTP engine: the courtesy gate, the per-request timeout, the retry policy and the
 * backoff under BOTH transports — `HttpClient` (lib/sources/http/client.ts, every secondary
 * source and the scripts) and `MaxPrepsClient` (lib/sources/maxpreps/client.ts, the primary API).
 *
 * The two clients used to carry a copy each, and copies drift (the User-Agent already had, see
 * POLITE_USER_AGENT). This engine was built from MaxPrepsClient's tested copy and diffed line by
 * line against HttpClient's. Where the two differed, the difference is an option whose DEFAULT is
 * HttpClient's old behaviour and MaxPrepsClient passes its own value:
 *   - default concurrency 2 (MaxPreps: 3); both hard-capped at 3 and floored at 1;
 *   - a non-2xx body is not read (`errorBodyChars` 0; MaxPreps keeps the first 4096 characters);
 *   - the body reader is the caller's (`read`: text or bytes; MaxPreps reads text only);
 *   - both URLs are returned: `finalUrl` (after redirects, what HttpClient reports) and
 *     `requestedUrl` (what MaxPrepsClient reports in `meta.url`).
 * Everything else was already identical and stays one policy: retry 429 and 5xx only, 15 s timeout
 * covering the body, 3 attempts, >= 500 ms between request STARTS, 1 s → 2 s → 4 s backoff with
 * ±20 % jitter or a capped Retry-After, no sleep after the final attempt (SPEC §5.2, §5.3).
 *
 * The User-Agent and the Retry-After cap have no default here: their one definition is in
 * lib/sources/http/client.ts (POLITE_USER_AGENT, MAX_RETRY_AFTER_MS), which imports this engine,
 * so each client passes them in.
 *
 * Failures are thrown as `PoliteFetchError`; each client converts it to its own public error class
 * (HttpError, MaxPrepsError) with the same message and fields.
 */

export interface PoliteFetcherOptions {
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  userAgent: string;
  /** `Retry-After` above this is clamped to it (MAX_RETRY_AFTER_MS). */
  retryAfterCapMs: number;
  /** Per-request timeout, covering the body. SPEC §5.3: 15 s. */
  timeoutMs?: number;
  /** Total attempts for a retryable failure. SPEC §5.3: 3. */
  attempts?: number;
  /** Requests in flight; clamped to 1..3 (SPEC §5.2). Default 2 (HttpClient); MaxPrepsClient passes 3. */
  concurrency?: number;
  /** SPEC §5.2: ~500 ms between request starts. */
  spacingMs?: number;
  /**
   * How much of a non-2xx body to keep on the error, in characters. 0 (the default, HttpClient)
   * never reads it; MaxPrepsClient keeps 4096 because some endpoints say why in it.
   */
  errorBodyChars?: number;
  /** Test seam so retry backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  onLog?: (line: string) => void;
}

export interface PoliteResponse<T> {
  body: T;
  /** `res.url` after redirects, or the requested URL when the response reports none. */
  finalUrl: string;
  requestedUrl: string;
  httpStatus: number;
  contentType: string | null;
  attempts: number;
}

/** A failed fetch, before the client turns it into its own error class. */
export class PoliteFetchError extends Error {
  readonly url: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  /** The first `errorBodyChars` of a non-2xx body ('' when unreadable); absent when not captured. */
  readonly body?: string;

  constructor(
    message: string,
    opts: { url: string; httpStatus?: number; retryable?: boolean; body?: string },
  ) {
    super(message);
    this.name = 'PoliteFetchError';
    this.url = opts.url;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
    this.body = opts.body;
  }
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Concurrency limiter with a minimum spacing between request STARTS. */
class Gate {
  private active = 0;
  private lastStart = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly concurrency: number,
    private readonly spacingMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      const wait = this.lastStart + this.spacingMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = Date.now();
      return await fn();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export class PoliteFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly retryAfterCapMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly errorBodyChars: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly gate: Gate;
  private readonly onLog: (line: string) => void;

  constructor(opts: PoliteFetcherOptions) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent;
    this.retryAfterCapMs = opts.retryAfterCapMs;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = Math.max(1, opts.attempts ?? 3);
    this.errorBodyChars = Math.max(0, opts.errorBodyChars ?? 0);
    this.sleep = opts.sleep ?? sleepReal;
    this.onLog = opts.onLog ?? (() => {});
    this.gate = new Gate(
      Math.min(3, Math.max(1, opts.concurrency ?? 2)),
      Math.max(0, opts.spacingMs ?? 500),
      this.sleep,
    );
  }

  /**
   * One request through the gate, with retries. A slot is held through all of one request's
   * attempts. Redirects are followed: scorebooklive.com 301s to si.com and http→https on
   * scval.com (SPEC §1.2).
   */
  fetch<T>(url: string, accept: string, read: (res: Response) => Promise<T>): Promise<PoliteResponse<T>> {
    return this.gate.run(() => this.attempt(url, accept, read));
  }

  /**
   * The body is read INSIDE the timer's scope, and inside the retry loop.
   *
   * SPEC §5.3's 15s per-request timeout has to cover the whole exchange: clearing the abort timer
   * as soon as the headers arrive left a connection that then stalled mid-body with no timeout at
   * all, bounded only by the workflow's 20-minute kill. Reading here also means a body that fails
   * is retried like any other failure, rather than throwing past the loop.
   */
  private async attempt<T>(
    url: string,
    accept: string,
    read: (res: Response) => Promise<T>,
  ): Promise<PoliteResponse<T>> {
    let lastError: PoliteFetchError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const last = attempt === this.maxAttempts;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const res = await this.fetchImpl(url, {
            headers: { 'user-agent': this.userAgent, accept },
            signal: controller.signal,
            redirect: 'follow',
          });
          if (res.ok) {
            return {
              body: await read(res),
              finalUrl: res.url || url,
              requestedUrl: url,
              httpStatus: res.status,
              contentType: res.headers.get('content-type'),
              attempts: attempt,
            };
          }
          // Retry 429 and 5xx only; never retry another 4xx — a 404 means the URL is wrong
          // and retrying it just adds load (SPEC §5.3).
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new PoliteFetchError(`HTTP ${res.status}`, {
            url,
            httpStatus: res.status,
            retryable,
            body: this.errorBodyChars > 0 ? await this.errorBody(res) : undefined,
          });
          if (!retryable) throw lastError;
          // Guarded like the network-error branch below: the last attempt throws immediately
          // instead of sleeping ~4s on its way out.
          if (!last) await this.backoff(attempt, retryAfterMs(res, this.retryAfterCapMs));
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof PoliteFetchError) {
          if (!err.retryable) throw err;
          lastError = err;
          continue;
        }
        // Network error / abort: retryable.
        lastError = new PoliteFetchError((err as Error).message || 'network error', {
          url,
          retryable: true,
        });
        if (!last) await this.backoff(attempt, null);
      }
    }
    throw lastError ?? new PoliteFetchError('request failed', { url });
  }

  /**
   * Best effort, inside the timer like a 2xx body: a body that cannot be read (or stalls until the
   * abort) leaves it empty rather than turning a 4xx into a retry.
   */
  private async errorBody(res: Response): Promise<string> {
    try {
      return (await res.text()).slice(0, this.errorBodyChars);
    } catch {
      return '';
    }
  }

  /** 1 s → 2 s → 4 s with ±20 % jitter, or Retry-After when the server sent one. */
  private async backoff(attempt: number, retryAfterMs: number | null): Promise<void> {
    const base = retryAfterMs ?? 1000 * 2 ** (attempt - 1);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    const ms = Math.max(0, Math.round(base + jitter));
    this.onLog(`retry in ${ms}ms (attempt ${attempt})`);
    await this.sleep(ms);
  }
}

/** `Retry-After` in milliseconds, capped — see MAX_RETRY_AFTER_MS in lib/sources/http/client.ts. */
function retryAfterMs(res: Response, capMs: number): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, capMs);
}
