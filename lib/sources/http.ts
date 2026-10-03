/**
 * Minimal HTTP transport shared by the SECONDARY sources (si.com, scval.com, cifccs.org, VNN).
 *
 * `lib/sources/maxpreps.ts` keeps its own copy of this logic on purpose: the primary client is
 * JSON-and-zod-only, carries the descriptive User-Agent, and its retry semantics are pinned by
 * tests. The secondary sources need three things it does not have — a per-source User-Agent
 * (si.com gates on a browser UA), binary bodies (PDFs), and a `never throw` mode so a failure
 * becomes a SourceStatus row instead of aborting the cron (SPEC §5.3).
 *
 * Budget, same courtesy ceiling as the primary client (SPEC §5.2, §5.3):
 *   concurrency <= 3 · >= 500 ms between request starts · 15 s timeout · retry 429/5xx only.
 */

/**
 * Descriptive UA for sources that do not gate on a browser (SPEC §5.3).
 *
 * ONE definition for the whole repo — `lib/sources/maxpreps.ts` re-exports this rather than keeping
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

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly gate: Gate;
  private readonly onLog: (line: string) => void;

  constructor(opts: HttpClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent ?? POLITE_USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = Math.max(1, opts.attempts ?? 3);
    this.sleep = opts.sleep ?? sleepReal;
    this.onLog = opts.onLog ?? (() => {});
    this.gate = new Gate(
      Math.min(3, Math.max(1, opts.concurrency ?? 2)),
      Math.max(0, opts.spacingMs ?? 500),
      this.sleep,
    );
  }

  /** Follows redirects: scorebooklive.com 301s to si.com and http→https on scval.com (SPEC §1.2). */
  async text(url: string, accept = 'text/html,application/xhtml+xml,*/*'): Promise<HttpResponse<string>> {
    return this.gate.run(() => this.attempt(url, accept, (res) => res.text()));
  }

  /** For PDFs. */
  async bytes(url: string, accept = 'application/pdf,*/*'): Promise<HttpResponse<Uint8Array>> {
    return this.gate.run(() =>
      this.attempt(url, accept, async (res) => new Uint8Array(await res.arrayBuffer())),
    );
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
  ): Promise<HttpResponse<T>> {
    let lastError: HttpError | null = null;
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
              url: res.url || url,
              httpStatus: res.status,
              contentType: res.headers.get('content-type'),
              attempts: attempt,
            };
          }
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new HttpError(`HTTP ${res.status}`, { url, httpStatus: res.status, retryable });
          if (!retryable) throw lastError;
          // Guarded like the network-error branch below: the last attempt throws immediately
          // instead of sleeping ~4s on its way out.
          if (!last) await this.backoff(attempt, retryAfterMs(res));
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof HttpError) {
          if (!err.retryable) throw err;
          lastError = err;
          continue;
        }
        lastError = new HttpError((err as Error).message || 'network error', { url, retryable: true });
        if (!last) await this.backoff(attempt, null);
      }
    }
    throw lastError ?? new HttpError('request failed', { url });
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

/**
 * `Retry-After` in milliseconds, CAPPED. SPEC §5.3 budgets 120s for the whole run and the job is
 * killed at 20 minutes, so an upstream answering `Retry-After: 3600` must not be able to hold one
 * request for an hour and take the day's refresh down with it — past the cap we fall back to the
 * ordinary backoff and let the attempt budget end it.
 */
export const MAX_RETRY_AFTER_MS = 30_000;

function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/** The five named HTML entities SBLive's `data-react-props` attribute can contain (SPEC §1.2). */
export function htmlUnescape(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * RFC 5545 line unfolding — a continuation line starts with a space or tab and joins the previous
 * one with no separator. Mandatory before parsing any `.ics` (SPEC §1.5).
 */
export function unfoldIcs(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (/^[ \t]/.test(raw) && out.length > 0) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

/** Split one unfolded iCalendar line into its name (with params) and value. */
export function icsLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const semi = left.indexOf(';');
  return {
    name: (semi < 0 ? left : left.slice(0, semi)).toUpperCase(),
    params: semi < 0 ? '' : left.slice(semi + 1),
    // iCalendar TEXT escaping: \, \; \n \\ .
    value: line
      .slice(colon + 1)
      .replace(/\\n/gi, '\n')
      .replace(/\\([,;\\])/g, '$1'),
  };
}
