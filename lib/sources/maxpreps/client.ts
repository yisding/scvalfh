/**
 * Typed client for the MaxPreps "ghost API" at production.api.maxpreps.com.
 *
 * Unauthenticated, CORS-open JSON; robots.txt is `User-agent: *\nAllow: /` (SPEC §1.1).
 * Courtesy budget, far below what was observed to work: concurrency <= 3, 500 ms between
 * request starts, 15 s per-request timeout, retry only 429/5xx (SPEC §5.2, §5.3).
 */

import type { z } from 'zod';

import { BOOTSTRAP_URL, SPORT_SEASON_ID } from '@/lib/config/season';
import { MAXPREPS_API } from '@/lib/config/source-urls';
import { MAX_RETRY_AFTER_MS, POLITE_USER_AGENT } from '@/lib/sources/http/client';
import type { RawResponse } from '@/lib/sources/http/raw-response';
import { type Bootstrap, parseBootstrap } from './bootstrap';
import { MaxPrepsError } from './error';
import {
  type LeagueMeta,
  LeagueMetaSchema,
  ScheduleResponseSchema,
  type ScheduleRow,
  type TeamContext,
  TeamContextSchema,
  envelope,
} from './schemas';
import { leagueMetaUrl, scheduleUrl, standingsUrl, teamContextUrl } from './urls';

/**
 * Re-exported, not re-declared: two literals of the same string is how the `+` contact URL came to
 * be a placeholder in both places at once. `lib/sources/http/client.ts` owns it and explains the format;
 * this client still keeps its own TRANSPORT (see that file's header for why).
 */
export { POLITE_USER_AGENT as DEFAULT_USER_AGENT };

export interface ClientOptions {
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Per-request timeout. SPEC §5.3: 15 s. */
  timeoutMs?: number;
  /** Total attempts for a retryable failure. SPEC §5.3: 3. */
  attempts?: number;
  /** SPEC §5.2: <= 3. */
  concurrency?: number;
  /** SPEC §5.2: ~500 ms between request starts. */
  spacingMs?: number;
  /** Test seam so retry backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  onLog?: (line: string) => void;
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Concurrency limiter with a minimum spacing between request STARTS. */
class Gate {
  private active = 0;
  private lastStart = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly concurrency: number,
    private readonly spacingMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      const wait = this.lastStart + this.spacingMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = Date.now();
      return await fn();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export interface RequestMeta {
  url: string;
  httpStatus: number;
  attempts: number;
}

export interface Fetched<T> {
  data: T;
  meta: RequestMeta;
}

export class MaxPrepsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly gate: Gate;
  private readonly onLog: (line: string) => void;

  constructor(opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent ?? POLITE_USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.attempts = Math.max(1, opts.attempts ?? 3);
    this.sleep = opts.sleep ?? sleepReal;
    this.onLog = opts.onLog ?? (() => {});
    this.gate = new Gate(
      Math.min(3, Math.max(1, opts.concurrency ?? 3)),
      Math.max(0, opts.spacingMs ?? 500),
      this.sleep,
    );
  }

  /**
   * The raw body and HTTP status of one MaxPreps resource, through the same gate (<= 3 concurrent,
   * >= 500 ms between request starts), retries/backoff and User-Agent as every other read
   * (SPEC §7.2-§7.3: LiveTransport's MaxPreps rows). Nothing is parsed or validated here: the
   * pipeline step that owns the resource does that. A non-2xx answer still throws `MaxPrepsError`
   * (with `httpStatus`) after the retry policy, so a 4xx/5xx is never returned silently.
   */
  async raw(url: string): Promise<RawResponse> {
    const accept = url.startsWith(MAXPREPS_API) ? 'application/json' : 'text/html';
    const res = await this.gate.run(() => this.attempt(url, accept));
    return { url: res.meta.url, httpStatus: res.meta.httpStatus, body: res.data };
  }

  /** Raw text with retry/backoff. Used for the HTML bootstrap read. */
  async text(url: string, accept = 'text/html'): Promise<Fetched<string>> {
    return this.gate.run(() => this.attempt(url, accept));
  }

  /** Raw JSON (unvalidated) with retry/backoff. */
  async json<T>(url: string, schema: z.ZodType<T>): Promise<Fetched<T>> {
    const res = await this.gate.run(() => this.attempt(url, 'application/json'));
    let raw: unknown;
    try {
      raw = JSON.parse(res.data) as unknown;
    } catch (err) {
      throw new MaxPrepsError(`invalid JSON: ${(err as Error).message}`, {
        url,
        httpStatus: res.meta.httpStatus,
      });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      // Schema drift must fail loudly rather than silently writing garbage (SPEC §7.9).
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new MaxPrepsError(`schema drift: ${issues}`, {
        url,
        httpStatus: res.meta.httpStatus,
      });
    }
    return { data: parsed.data, meta: res.meta };
  }

  /**
   * The body is read INSIDE the timer's scope: SPEC §5.3's 15s per-request timeout has to cover
   * the whole exchange, and clearing the abort timer as soon as the headers arrived left a
   * connection that then stalled mid-body with no timeout at all.
   */
  private async attempt(url: string, accept: string): Promise<Fetched<string>> {
    let lastError: MaxPrepsError | null = null;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const last = attempt === this.attempts;
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
              data: await res.text(),
              meta: { url, httpStatus: res.status, attempts: attempt },
            };
          }
          // Retry 429 and 5xx only; never retry another 4xx — a 404 means the URL is wrong
          // and retrying it just adds load (SPEC §5.3).
          const retryable = res.status === 429 || res.status >= 500;
          // Best effort, inside the timer like a 2xx body: a body that cannot be read (or stalls
          // until the abort) leaves `body` empty rather than turning a 4xx into a retry.
          let body = '';
          try {
            body = (await res.text()).slice(0, 4096);
          } catch {
            body = '';
          }
          lastError = new MaxPrepsError(`HTTP ${res.status}`, {
            url,
            httpStatus: res.status,
            retryable,
            body,
          });
          if (!retryable) throw lastError;
          // Guarded like the network-error branch: the last attempt throws immediately rather
          // than sleeping ~4s on its way out.
          if (!last) await this.backoff(attempt, retryAfterMs(res));
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof MaxPrepsError) {
          if (!err.retryable) throw err;
          lastError = err;
          continue;
        }
        // Network error / abort: retryable.
        lastError = new MaxPrepsError((err as Error).message || 'network error', {
          url,
          retryable: true,
        });
        if (!last) await this.backoff(attempt, null);
      }
    }
    throw lastError ?? new MaxPrepsError('request failed', { url });
  }

  /** 1 s → 2 s → 4 s with ±20 % jitter, or Retry-After when the server sent one. */
  private async backoff(attempt: number, retryAfterMs: number | null): Promise<void> {
    const base = retryAfterMs ?? 1000 * 2 ** (attempt - 1);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    const ms = Math.max(0, Math.round(base + jitter));
    this.onLog(`retry in ${ms}ms (attempt ${attempt})`);
    await this.sleep(ms);
  }

  // -------------------------------------------------------------- endpoints

  // The URL builders live in ./urls (free functions); these methods delegate.

  leagueMetaUrl(leagueId: string): string {
    return leagueMetaUrl(leagueId);
  }

  standingsUrl(leagueId: string, sportSeasonId = SPORT_SEASON_ID): string {
    return standingsUrl(leagueId, sportSeasonId);
  }

  scheduleUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
    return scheduleUrl(teamId, sportSeasonId);
  }

  async getBootstrap(): Promise<Fetched<Bootstrap>> {
    const res = await this.text(BOOTSTRAP_URL);
    return { data: parseBootstrap(res.data), meta: res.meta };
  }

  async getLeagueMeta(leagueId: string): Promise<Fetched<LeagueMeta>> {
    const url = this.leagueMetaUrl(leagueId);
    const res = await this.json(url, envelope(LeagueMetaSchema));
    return { data: res.data.data, meta: res.meta };
  }

  /** `sportSeasonId` defaults to the current season; scripts/fetch-prior-season.ts passes last season's. */
  async getSchedule(teamId: string, sportSeasonId = SPORT_SEASON_ID): Promise<Fetched<ScheduleRow[]>> {
    const url = this.scheduleUrl(teamId, sportSeasonId);
    const res = await this.json(url, ScheduleResponseSchema);
    // Guard the Presentation/Los Gatos class of routing bug: a team's feed must contain that
    // team (SPEC §7.2). An empty feed is legitimate (a school that has published nothing).
    if (res.data.data.length > 0) {
      const present = res.data.data.some((row) =>
        row.contest.teams.some((t) => t.teamId === teamId),
      );
      if (!present) {
        throw new MaxPrepsError(`feed for ${teamId} contains no row for that teamId`, {
          url,
          httpStatus: res.meta.httpStatus,
        });
      }
    }
    return { data: res.data.data, meta: res.meta };
  }

  teamContextUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
    return teamContextUrl(teamId, sportSeasonId);
  }

  /** ~738 KB. Season bootstrap only — never in the daily sweep (SPEC §5.4). */
  async getTeamContext(
    teamId: string,
    sportSeasonId = SPORT_SEASON_ID,
  ): Promise<Fetched<TeamContext>> {
    const url = this.teamContextUrl(teamId, sportSeasonId);
    const res = await this.json(url, TeamContextSchema);
    return { data: res.data.data, meta: res.meta };
  }
}

/** `Retry-After` in milliseconds, capped — see MAX_RETRY_AFTER_MS in lib/sources/http/client.ts. */
function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}
