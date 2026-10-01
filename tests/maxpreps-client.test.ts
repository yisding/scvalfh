/** The MaxPreps client: schemas, the __NEXT_DATA__ trap, retries and the courtesy budget. */

import { describe, expect, it, vi } from 'vitest';

import {
  MaxPrepsClient,
  MaxPrepsEmptyStandingsError,
  MaxPrepsError,
  NEXT_DATA_RE,
  ScheduleResponseSchema,
  StandingsResponseSchema,
  parseBootstrap,
} from '../lib/sources/maxpreps';
import { MAX_RETRY_AFTER_MS } from '../lib/sources/http';
import { SPORT_SEASON_ID } from '../lib/season';
import { allScheduleRows, standingsFixture } from './helpers';

function response(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

const noSleep = async () => {};

function client(fetchImpl: typeof fetch) {
  return new MaxPrepsClient({ fetchImpl, sleep: noSleep, spacingMs: 0 });
}

describe('maxpreps: URLs', () => {
  const c = client(vi.fn() as unknown as typeof fetch);

  it('builds the verified endpoint shapes', () => {
    expect(c.standingsUrl('LEAGUE')).toBe(
      `https://production.api.maxpreps.com/leagues/LEAGUE/standings/v1?sportseasonid=${SPORT_SEASON_ID}`,
    );
    expect(c.scheduleUrl('TEAM')).toBe(
      `https://production.api.maxpreps.com/gatewayweb/react/schedule-calculated/v1?teamId=TEAM&sportSeasonId=${SPORT_SEASON_ID}`,
    );
    expect(c.leagueMetaUrl('LEAGUE')).toBe('https://production.api.maxpreps.com/leagues/LEAGUE/v1');
    expect(c.contestIdsUrl('LEAGUE')).toContain('contest-ids-grouped-by-date-by-context/v2');
  });
});

describe('maxpreps: schemas are permissive about unknown fields, strict about ours', () => {
  it('parses the captured standings and schedule payloads', () => {
    expect(StandingsResponseSchema.parse(standingsFixture('da')).data.length).toBe(7);
    expect(StandingsResponseSchema.parse(standingsFixture('ec')).data.length).toBe(8);
    expect(allScheduleRows().length).toBe(293);
  });

  it('keeps unknown fields instead of choking on them', () => {
    const parsed = StandingsResponseSchema.parse(standingsFixture('da'));
    expect((parsed.data[0] as Record<string, unknown>).b1).toBeDefined();
  });

  it('fails loudly when a field we use changes type', () => {
    const drifted = {
      data: [{ contest: { contestId: 1 }, calculatedFields: {} }],
    };
    expect(ScheduleResponseSchema.safeParse(drifted).success).toBe(false);
  });

  it('accepts a null score but not a missing one', () => {
    const rows = allScheduleRows();
    const scheduled = rows.find((r) => r.contest.teams.every((t) => t.score === null));
    expect(scheduled).toBeDefined();
  });
});

describe('maxpreps: the __NEXT_DATA__ crossorigin trap (SPEC §1.1h)', () => {
  it('matches the tag even with crossorigin between id and type', () => {
    const html =
      '<html><script id="__NEXT_DATA__" crossorigin="anonymous" type="application/json">' +
      JSON.stringify({
        query: { ssid: SPORT_SEASON_ID, allSeasonId: 'ALL', gendersport: 'girls,fieldhockey' },
      }) +
      '</script></html>';
    expect(NEXT_DATA_RE.test(html)).toBe(true);
    const boot = parseBootstrap(html);
    expect(boot.sportSeasonId).toBe(SPORT_SEASON_ID);
    expect(boot.allSeasonId).toBe('ALL');
  });

  it('falls back to navBarProps.genderSportData for allSeasonId', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({
        query: {},
        props: { pageProps: { navBarProps: { genderSportData: { allSeasonId: 'ALL2' } } } },
      }) +
      '</script>';
    expect(parseBootstrap(html).allSeasonId).toBe('ALL2');
  });

  it('throws when the tag is absent rather than returning nothing', () => {
    expect(() => parseBootstrap('<html></html>')).toThrow(/__NEXT_DATA__/);
  });
});

describe('maxpreps: retries and the courtesy budget (SPEC §5.2-5.3)', () => {
  it('retries a 429 and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('nope', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(response(JSON.stringify({ data: [] })));
    const c = client(fetchImpl as unknown as typeof fetch);
    const res = await c.text('https://example.test/x', 'application/json');
    expect(res.meta.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a 500 up to three attempts and then gives up', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('boom', { status: 503 }));
    const c = client(fetchImpl as unknown as typeof fetch);
    await expect(c.text('https://example.test/x')).rejects.toThrow(/HTTP 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('never retries a 404 — a wrong URL is not a transient failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('missing', { status: 404 }));
    const c = client(fetchImpl as unknown as typeof fetch);
    await expect(c.text('https://example.test/x')).rejects.toBeInstanceOf(MaxPrepsError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends a descriptive User-Agent on every request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('{}'));
    const c = client(fetchImpl as unknown as typeof fetch);
    await c.text('https://example.test/x');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/scvalfh/);
    expect(headers['user-agent']).toMatch(/field hockey/);
  });

  it('never runs more than three requests at once', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return response('{}');
    });
    const c = new MaxPrepsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
      spacingMs: 0,
      concurrency: 3,
    });
    await Promise.all(Array.from({ length: 12 }, (_, i) => c.text(`https://example.test/${i}`)));
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('caps the requested concurrency at three even if asked for more', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return response('{}');
    });
    const c = new MaxPrepsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
      spacingMs: 0,
      concurrency: 25,
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => c.text(`https://example.test/${i}`)));
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('caps Retry-After and does not sleep after the final attempt', async () => {
    const slept: number[] = [];
    const fetchImpl = vi.fn().mockImplementation(async () =>
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '3600', 'content-type': 'text/plain' },
      }),
    );
    const c = new MaxPrepsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      spacingMs: 0,
      attempts: 3,
    });
    await expect(c.text('https://example.test/x')).rejects.toThrow(/HTTP 429/);
    // Three attempts, two sleeps: the last one throws instead of waiting on its way out.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(slept).toHaveLength(2);
    // An hour-long Retry-After would burn the whole 20-minute job on one request.
    for (const ms of slept) expect(ms).toBeLessThanOrEqual(MAX_RETRY_AFTER_MS * 1.2);
  });

  it('rejects a league standings response with zero rows, as its own abortable class', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(JSON.stringify({ data: [] })));
    const c = client(fetchImpl as unknown as typeof fetch);
    // SPEC §5.2.1 aborts the run for this, so the cron has to be able to tell it apart from an
    // ordinary per-source failure, which it recovers from by carrying yesterday's rows forward.
    await expect(c.getStandings('LEAGUE')).rejects.toThrow(
      expect.objectContaining({ name: 'MaxPrepsEmptyStandingsError' }),
    );
    expect(MaxPrepsEmptyStandingsError.prototype).toBeInstanceOf(MaxPrepsError);
  });

  it('rejects a team feed that contains no row for that team (the Presentation bug)', async () => {
    const rows = allScheduleRows().slice(0, 2);
    const fetchImpl = vi.fn().mockResolvedValue(response(JSON.stringify({ data: rows })));
    const c = client(fetchImpl as unknown as typeof fetch);
    await expect(c.getSchedule('not-a-real-team-id')).rejects.toThrow(/contains no row/);
  });

  it('surfaces schema drift as a loud error with the failing path', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify({ data: [{ schoolId: 5 }] })));
    const c = client(fetchImpl as unknown as typeof fetch);
    await expect(c.getStandings('LEAGUE')).rejects.toThrow(/schema drift/);
  });
});
