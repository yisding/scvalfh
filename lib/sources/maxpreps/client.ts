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
import { describeIssues } from '@/lib/schema/primitives';
import { MAX_RETRY_AFTER_MS, POLITE_USER_AGENT } from '@/lib/sources/http/client';
import { PoliteFetchError, PoliteFetcher } from '@/lib/sources/http/polite-fetcher';
import type { RawResponse } from '@/lib/sources/http/raw-response';
import { type Bootstrap, parseBootstrap } from './bootstrap';
import { MaxPrepsError } from './error';
import { assertFeedHasTeam } from './schedule';
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
  private readonly fetcher: PoliteFetcher;

  constructor(opts: ClientOptions = {}) {
    this.fetcher = new PoliteFetcher({
      ...opts,
      // Imported, not re-declared: two literals of the same string is how the `+` contact URL came
      // to be a placeholder in both places at once. lib/sources/http/client.ts owns it and explains
      // the format; the transport underneath is the shared engine, lib/sources/http/polite-fetcher.ts
      // (see lib/sources/http/client.ts' header for why there are still two clients).
      userAgent: opts.userAgent ?? POLITE_USER_AGENT,
      retryAfterCapMs: MAX_RETRY_AFTER_MS,
      // The primary API's own courtesy values (SPEC §5.2): 3 in flight, and the first 4 KB of a
      // non-2xx body kept on the MaxPrepsError (see its `body`).
      concurrency: opts.concurrency ?? 3,
      errorBodyChars: 4096,
    });
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
    const res = await this.fetch(url, accept);
    return { url: res.meta.url, httpStatus: res.meta.httpStatus, body: res.data };
  }

  /** Raw text with retry/backoff. Used for the HTML bootstrap read. */
  async text(url: string, accept = 'text/html'): Promise<Fetched<string>> {
    return this.fetch(url, accept);
  }

  /** Raw JSON (unvalidated) with retry/backoff. */
  async json<T>(url: string, schema: z.ZodType<T>): Promise<Fetched<T>> {
    const res = await this.fetch(url, 'application/json');
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
      const issues = describeIssues(parsed.error.issues, { limit: 5, empty: '(root)', separator: '; ' });
      throw new MaxPrepsError(`schema drift: ${issues}`, {
        url,
        httpStatus: res.meta.httpStatus,
      });
    }
    return { data: parsed.data, meta: res.meta };
  }

  /**
   * One request through the shared engine (gate, timeout covering the body, retry 429/5xx,
   * backoff): its answer as a Fetched (`meta.url` is the URL REQUESTED, not the one a redirect
   * ended at), its failure as a MaxPrepsError.
   */
  private async fetch(url: string, accept: string): Promise<Fetched<string>> {
    try {
      const res = await this.fetcher.fetch(url, accept, (r) => r.text());
      return {
        data: res.body,
        meta: { url: res.requestedUrl, httpStatus: res.httpStatus, attempts: res.attempts },
      };
    } catch (err) {
      if (!(err instanceof PoliteFetchError)) throw err;
      throw new MaxPrepsError(err.message, {
        url: err.url,
        httpStatus: err.httpStatus,
        retryable: err.retryable,
        body: err.body,
      });
    }
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
    try {
      assertFeedHasTeam(res.data.data, teamId, { message: `feed for ${teamId} contains no row for that teamId` });
    } catch (err) {
      throw new MaxPrepsError((err as Error).message, { url, httpStatus: res.meta.httpStatus });
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

