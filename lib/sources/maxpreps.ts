/**
 * Typed client for the MaxPreps "ghost API" at production.api.maxpreps.com.
 *
 * Unauthenticated, CORS-open JSON; robots.txt is `User-agent: *\nAllow: /` (SPEC §1.1).
 * Courtesy budget, far below what was observed to work: concurrency <= 3, 500 ms between
 * request starts, 15 s per-request timeout, retry only 429/5xx (SPEC §5.2, §5.3).
 *
 * Every schema is PERMISSIVE about unknown fields (z.looseObject) and STRICT about the fields we
 * read, so MaxPreps schema drift fails loudly at fetch time instead of writing garbage.
 */

import { z } from 'zod';

import { MAX_RETRY_AFTER_MS, POLITE_USER_AGENT } from './http';
import type { RawResponse } from '../pipeline/contract';
import { BOOTSTRAP_URL, MAXPREPS_API, SPORT_SEASON_ID } from '../season';
import type { DroppedContest } from '../types';

// ---------------------------------------------------------------- schemas

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.looseObject({
    status: z.union([z.number(), z.string()]).optional(),
    message: z.unknown().optional(),
    data,
  });

/** GET /leagues/{leagueId}/v1 — the season-key assertion (SPEC §1.1f). */
export const LeagueMetaSchema = z.looseObject({
  leagueId: z.string(),
  name: z.string(),
  sportSeasonId: z.string(),
  sportSeasonName: z.string().nullable().optional(),
  year: z.string(),
  season: z.string().nullable().optional(),
  teamLevel: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  sectionName: z.string().nullable().optional(),
  stateCode: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
});
export type LeagueMeta = z.infer<typeof LeagueMetaSchema>;

/** GET /leagues/{leagueId}/standings/v1?sportseasonid= (SPEC §1.1a). */
export const StandingsRowSchema = z.looseObject({
  schoolId: z.string(),
  schoolName: z.string(),
  schoolNameAcronym: z.string().nullable(),
  schoolFormattedName: z.string().nullable().optional(),
  teamCanonicalUrl: z.string().nullable(),
  schoolMascotUrl: z.string().nullable().optional(),
  schoolColor1: z.string().nullable(),
  schoolColor2: z.string().nullable(),
  conferenceWins: z.number(),
  conferenceLosses: z.number(),
  conferenceTies: z.number(),
  overallWins: z.number(),
  overallLosses: z.number(),
  overallTies: z.number(),
  // League-only GF / GA. (MaxPreps calls goals "points".)
  conferencePoints: z.number(),
  conferencePointsAgainst: z.number(),
  points: z.number(),
  pointsAgainst: z.number(),
  conferenceContestsPlayed: z.number(),
  overallContestsPlayed: z.number(),
  conferenceStandingPlacement: z.number().nullable(),
  conferenceWinningPercentage: z.number(),
  winningPercentage: z.number(),
  streak: z.number(),
  streakResult: z.string().nullable(),
  homeWins: z.number(),
  homeLosses: z.number(),
  homeTies: z.number(),
  awayWins: z.number(),
  awayLosses: z.number(),
  awayTies: z.number(),
  neutralWins: z.number(),
  neutralLosses: z.number(),
  neutralTies: z.number(),
  modifiedOn: z.string(),
  sportSeasonId: z.string().nullable().optional(),
});
export type StandingsRow = z.infer<typeof StandingsRowSchema>;

export const StandingsResponseSchema = envelope(z.array(StandingsRowSchema));

/**
 * One entry of contest.teams[] (SPEC §1.1b).
 *
 * `teamId` and `name` are nullable: an opponent MaxPreps has not named yet ("TBA") arrives as
 * `teamId: null, name: null, isTeamTBA: true` (Ann Sobrato 64c8188b, Stevenson 55207683, University
 * 64e0b2e5 on 2026-10-02), and one such row must never reject a whole feed. `splitTbaRows` removes
 * those rows before anything reads a side (SPEC §7.6 step 1).
 */
export const ContestTeamSchema = z.looseObject({
  teamId: z.string().nullable(),
  name: z.string().nullable(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  formattedName: z.string().nullable().optional(),
  mascot: z.string().nullable().optional(),
  schoolNameAcronym: z.string().nullable().optional(),
  teamCanonicalUrl: z.string().nullable().optional(),
  color1: z.string().nullable().optional(),
  color2: z.string().nullable().optional(),
  /** null before the game. NEVER coerce to 0 (SPEC §5.5.3). */
  score: z.number().nullable(),
  result: z.string().nullable(),
  /** 0 = home, 1 = away, 2 = neutral (SPEC §1.1g). */
  homeAwayType: z.number(),
  /** 0 = league / conference, 1 = non-conference (SPEC §1.1g). */
  contestType: z.number(),
  index: z.number().nullable().optional(),
  isForfeit: z.boolean(),
  isTeamTBA: z.boolean(),
  isDeleted: z.boolean(),
  dnp: z.boolean().nullable().optional(),
});
export type ContestTeam = z.infer<typeof ContestTeamSchema>;

export const ContestSchema = z.looseObject({
  contestId: z.string(),
  /** Naive local school time, America/Los_Angeles. */
  date: z.string(),
  dateCode: z.number().nullable().optional(),
  location: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  modifiedOn: z.string().nullable().optional(),
  isDeleted: z.boolean().nullable().optional(),
  hasResult: z.boolean().nullable().optional(),
  sportSeasonId: z.string().nullable().optional(),
  teams: z.array(ContestTeamSchema),
});

export const TeamCalculatedSchema = z.looseObject({
  /** null for an unnamed (TBA) side, like ContestTeamSchema.teamId. */
  teamId: z.string().nullable(),
  resultString: z.string().nullable().optional(),
  calculatedTeamContestResult: z.number().nullable().optional(),
  currentLiveScore: z.number().nullable().optional(),
});

export const CalculatedFieldsSchema = z.looseObject({
  contestId: z.string(),
  title: z.string().nullable().optional(),
  /** 1 Deleted · 2 Pregame · 3 InProgress · 4 Final · 5 ScoreNotReported (SPEC §1.1g). */
  contestState: z.number(),
  canonicalUrl: z.string().nullable(),
  description: z.string().nullable().optional(),
  /** Trust these, not dateCode (SPEC §1.1g / risk 10). */
  isDateTba: z.boolean(),
  isTimeTba: z.boolean(),
  isLiveGameInProgress: z.boolean().nullable().optional(),
  overtimePeriodsPlayed: z.number().nullable().optional(),
  overtimeShortAlias: z.string().nullable().optional(),
  currentLivePeriod: z.string().nullable().optional(),
  currentLiveTime: z.string().nullable().optional(),
  contestDateInGMT: z.string(),
  endsOn: z.string().nullable().optional(),
  contestLength: z.number().nullable().optional(),
  bracketName: z.string().nullable().optional(),
  bracketIsPublished: z.boolean().nullable().optional(),
  bracketGameIndex: z.number().nullable().optional(),
  tournamentName: z.string().nullable().optional(),
  tournamentCanonicalUrl: z.string().nullable().optional(),
  teamsCalculated: z.array(TeamCalculatedSchema),
});

/** GET /gatewayweb/react/schedule-calculated/v1?teamId=&sportSeasonId= (SPEC §1.1b). */
export const ScheduleRowSchema = z.looseObject({
  contest: ContestSchema,
  calculatedFields: CalculatedFieldsSchema,
  goFanUrl: z.string().nullable().optional(),
  nfhsStreamUrl: z.string().nullable().optional(),
});
export type ScheduleRow = z.infer<typeof ScheduleRowSchema>;

export const ScheduleResponseSchema = envelope(z.array(ScheduleRowSchema));

/** MaxPreps' placeholder GUID for an unnamed side. */
export const TBA_TEAM_ID = '00000000-0000-0000-0000-000000000000';

/** A side MaxPreps has not named: null or all-zero teamId, or a null name. */
export function isTbaSide(team: Pick<ContestTeam, 'teamId' | 'name'>): boolean {
  return team.teamId === null || team.teamId === TBA_TEAM_ID || team.name === null;
}

/**
 * SPEC §7.6 step 1: remove every row with a TBA side and record it, one `DroppedContest` per row,
 * with reason 'tba-opponent'. Pure; the order of the kept rows is the input order.
 */
export function splitTbaRows(rows: readonly ScheduleRow[]): {
  rows: ScheduleRow[];
  dropped: DroppedContest[];
} {
  const kept: ScheduleRow[] = [];
  const dropped: DroppedContest[] = [];
  for (const row of rows) {
    const teams = row.contest.teams;
    if (!teams.some(isTbaSide)) {
      kept.push(row);
      continue;
    }
    const named = teams.filter((t) => !isTbaSide(t)).map((t) => t.name as string);
    const date = row.contest.date ? row.contest.date.slice(0, 10) : null;
    dropped.push({
      contestId: row.contest.contestId,
      reason: 'tba-opponent',
      note:
        named.length > 0
          ? `MaxPreps lists ${named.join(' and ')} against an opponent it has not named yet (TBA).`
          : 'MaxPreps lists this contest without naming its teams (TBA).',
      dateKey: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      teams: named,
    });
  }
  return { rows: kept, dropped };
}

/** GET /gatewayweb/react/contest-ids-grouped-by-date-by-context/v2 (SPEC §1.1c). */
export const ContestIdsByDateSchema = envelope(
  z.looseObject({
    contestIdsByDate: z.array(
      z.looseObject({ date: z.string(), contestIds: z.array(z.string()) }),
    ),
    scoreboardCanonicalUrlToday: z.string().nullable().optional(),
    scoreboardCanonicalUrlTomorrow: z.string().nullable().optional(),
    scoreboardCanonicalUrlYesterday: z.string().nullable().optional(),
  }),
);
export type ContestIdsByDate = z.infer<typeof ContestIdsByDateSchema>['data'];

/**
 * GET /gatewayweb/react/team-context/v1?teamId=&sportSeasonId= (SPEC §1.1e).
 *
 * ⚠️ ~738 KB per team, almost all of it `schoolSportSeasonsData` (844 entries). Never in the daily
 * cron — this is the once-per-season league-resolution read that scripts/discover-season.ts uses.
 */
export const TeamContextSchema = envelope(
  z.looseObject({
    teamData: z.looseObject({
      leagueId: z.string().nullable().optional(),
      leagueName: z.string().nullable().optional(),
      leagueCanonicalUrl: z.string().nullable().optional(),
      sectionId: z.string().nullable().optional(),
      sectionName: z.string().nullable().optional(),
      sportSeasonId: z.string().nullable().optional(),
      allSeasonId: z.string().nullable().optional(),
      sportSeasonName: z.string().nullable().optional(),
      year: z.string().nullable().optional(),
      season: z.string().nullable().optional(),
      level: z.string().nullable().optional(),
      stateCode: z.string().nullable().optional(),
      schoolName: z.string().nullable().optional(),
      schoolNameAcronym: z.string().nullable().optional(),
      schoolMascot: z.string().nullable().optional(),
      schoolCity: z.string().nullable().optional(),
      schoolColor1: z.string().nullable().optional(),
      schoolColor2: z.string().nullable().optional(),
      canonicalUrl: z.string().nullable().optional(),
    }),
  }),
);
export type TeamContext = z.infer<typeof TeamContextSchema>['data'];

/**
 * The bootstrap read of https://www.maxpreps.com/ca/field-hockey/ (SPEC §1.1h).
 * `.query.ssid` is [U]; `navBarProps.genderSportData.allSeasonId` is [V] and lives under
 * navBarProps, NOT layoutProps.
 */
export const BootstrapNextDataSchema = z.looseObject({
  query: z
    .looseObject({
      ssid: z.string().optional(),
      sportSeasonId: z.string().optional(),
      allSeasonId: z.string().optional(),
      gendersport: z.string().optional(),
      teamLevel: z.string().optional(),
    })
    .optional(),
  props: z
    .looseObject({
      pageProps: z
        .looseObject({
          navBarProps: z
            .looseObject({
              genderSportData: z
                .looseObject({
                  allSeasonId: z.string().optional(),
                  genderSportId: z.string().optional(),
                  teamLevel: z.string().optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export interface Bootstrap {
  sportSeasonId: string | null;
  allSeasonId: string | null;
  genderSport: string | null;
  teamLevel: string | null;
}

/**
 * ⚠️ The tag carries `crossorigin="anonymous"` BETWEEN `id` and `type`, so a regex that assumes
 * `type=` follows `id=` immediately fails (SPEC §1.1h, verdicts 5/9/11).
 */
export const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export function extractNextData(html: string): unknown {
  const m = NEXT_DATA_RE.exec(html);
  if (!m) throw new MaxPrepsError('__NEXT_DATA__ script tag not found', { url: BOOTSTRAP_URL });
  try {
    return JSON.parse(m[1]) as unknown;
  } catch (err) {
    throw new MaxPrepsError(`__NEXT_DATA__ is not JSON: ${(err as Error).message}`, {
      url: BOOTSTRAP_URL,
    });
  }
}

export function parseBootstrap(html: string): Bootstrap {
  const parsed = BootstrapNextDataSchema.parse(extractNextData(html));
  const q = parsed.query;
  const gsd = parsed.props?.pageProps?.navBarProps?.genderSportData;
  return {
    sportSeasonId: q?.ssid ?? q?.sportSeasonId ?? null,
    allSeasonId: q?.allSeasonId ?? gsd?.allSeasonId ?? null,
    genderSport: q?.gendersport ?? gsd?.genderSportId ?? null,
    teamLevel: q?.teamLevel ?? gsd?.teamLevel ?? null,
  };
}

// ---------------------------------------------------------------- transport

export class MaxPrepsError extends Error {
  readonly url: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  /**
   * The first 4 KB of a non-2xx response's body, when it could be read. Some endpoints say why in
   * it: the player stats rollup's 400 is "No data was found" for a team with no stats, and that
   * must be told apart from a 400 for a bad parameter (lib/sources/maxpreps-player-stats.ts).
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

/**
 * A league whose standings endpoint answers 200 with ZERO rows.
 *
 * SPEC §5.2.1 lists this alongside a changed ssid or year as a season-level assertion: the run
 * aborts and the previous snapshot is kept, because carrying yesterday's reported table forward
 * and then cross-checking today's computed table against it would invent — or hide — a mismatch
 * on /standings. It is its own class so the cron can tell it apart from an ordinary per-source
 * failure, which IS recoverable.
 */
export class MaxPrepsEmptyStandingsError extends MaxPrepsError {
  constructor(message: string, opts: { url: string; httpStatus?: number }) {
    super(message, opts);
    this.name = 'MaxPrepsEmptyStandingsError';
  }
}

/**
 * Re-exported, not re-declared: two literals of the same string is how the `+` contact URL came to
 * be a placeholder in both places at once. `lib/sources/http.ts` owns it and explains the format;
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

  leagueMetaUrl(leagueId: string): string {
    return `${MAXPREPS_API}/leagues/${leagueId}/v1`;
  }

  standingsUrl(leagueId: string, sportSeasonId = SPORT_SEASON_ID): string {
    // Lowercase `sportseasonid` is the spelling the bundle uses and the one that is verified.
    return `${MAXPREPS_API}/leagues/${leagueId}/standings/v1?sportseasonid=${sportSeasonId}`;
  }

  scheduleUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
    return `${MAXPREPS_API}/gatewayweb/react/schedule-calculated/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
  }

  contestIdsUrl(leagueId: string): string {
    return (
      `${MAXPREPS_API}/gatewayweb/react/contest-ids-grouped-by-date-by-context/v2` +
      `?context=league&id=${leagueId}&genderSport=girls,fieldhockey&level=Varsity` +
      '&excludeTbaDate=true&nationalTeamCount=25'
    );
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

  async getStandings(leagueId: string): Promise<Fetched<StandingsRow[]>> {
    const url = this.standingsUrl(leagueId);
    const res = await this.json(url, StandingsResponseSchema);
    if (res.data.data.length === 0) {
      // A league returning 0 rows aborts the run (SPEC §5.2.1).
      throw new MaxPrepsEmptyStandingsError('standings returned 0 rows', {
        url,
        httpStatus: res.meta.httpStatus,
      });
    }
    return { data: res.data.data, meta: res.meta };
  }

  async getSchedule(teamId: string): Promise<Fetched<ScheduleRow[]>> {
    const url = this.scheduleUrl(teamId);
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
    return `${MAXPREPS_API}/gatewayweb/react/team-context/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
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

  async getContestIdsByDate(leagueId: string): Promise<Fetched<ContestIdsByDate>> {
    const url = this.contestIdsUrl(leagueId);
    const res = await this.json(url, ContestIdsByDateSchema);
    return { data: res.data.data, meta: res.meta };
  }
}

/** `Retry-After` in milliseconds, capped — see MAX_RETRY_AFTER_MS in lib/sources/http.ts. */
function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}
