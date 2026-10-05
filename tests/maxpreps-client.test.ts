/** The MaxPreps client: schemas, the __NEXT_DATA__ trap, retries and the courtesy budget. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { RawResponse } from '../lib/pipeline/contract';
import {
  DEFAULT_USER_AGENT,
  MaxPrepsClient,
  MaxPrepsError,
  NEXT_DATA_RE,
  ScheduleResponseSchema,
  StandingsResponseSchema,
  TBA_TEAM_ID,
  parseBootstrap,
  splitTbaRows,
  type ScheduleRow,
} from '../lib/sources/maxpreps';
import { MAX_RETRY_AFTER_MS, POLITE_USER_AGENT } from '../lib/sources/http';
import { BOOTSTRAP_URL, SPORT_SEASON_ID } from '../lib/season';
import { getTeamBySlug } from '../lib/teams';
import { REPO, allScheduleRows, standingsFixture } from './helpers';

const CORPUS_SCHEDULES = path.join(REPO, 'tests', 'fixtures', 'corpus', 'all-2026-10-02', 'maxpreps', 'schedule');

function corpusFeedText(slug: string): string {
  return readFileSync(path.join(CORPUS_SCHEDULES, `${slug}.json`), 'utf8');
}

function corpusFeed(slug: string): ScheduleRow[] {
  return ScheduleResponseSchema.parse(JSON.parse(corpusFeedText(slug)) as unknown).data;
}

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
  });
});

describe('maxpreps: schemas are permissive about unknown fields, strict about ours', () => {
  it('parses the captured standings and schedule payloads', () => {
    expect(StandingsResponseSchema.parse(standingsFixture('da')).data.length).toBe(7);
    expect(StandingsResponseSchema.parse(standingsFixture('ec')).data.length).toBe(8);
    expect(allScheduleRows().length).toBe(293);
  });

  it('parses the EAL table, where Red Bluff’s 0-0-0 row has modifiedOn null (2026-10-04)', () => {
    const raw = JSON.parse(
      readFileSync(path.join(REPO, 'tests', 'fixtures', 'maxpreps', 'standings-eal-2026-10-04.json'), 'utf8'),
    ) as { data: Array<{ schoolId: string; modifiedOn: string | null }> };
    expect(raw.data.filter((r) => r.modifiedOn === null).map((r) => r.schoolId)).toEqual(['4d3da788-bbe2-4ab9-b854-d95aa9786cda']);
    const parsed = StandingsResponseSchema.parse(raw);
    expect(parsed.data).toHaveLength(7);
    const redBluff = parsed.data.find((r) => r.schoolId === '4d3da788-bbe2-4ab9-b854-d95aa9786cda')!;
    expect(redBluff.modifiedOn).toBe('');
    // Every other row keeps its timestamp as MaxPreps sent it.
    for (const r of parsed.data) {
      if (r !== redBluff) expect(r.modifiedOn, r.schoolId).toBe(raw.data.find((x) => x.schoolId === r.schoolId)!.modifiedOn);
    }
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
    await expect(c.json(c.standingsUrl('LEAGUE'), StandingsResponseSchema)).rejects.toThrow(/schema drift/);
  });
});

describe('maxpreps: TBA opponents (SPEC §7.6 step 1)', () => {
  // [feed, contestId, the named side]
  const cases = [
    ['sobrato', '64c8188b-db94-44ff-8477-d60b4e3db218', 'Ann Sobrato'],
    ['stevenson', '55207683-8dd2-41c6-aa1b-02919d6bb261', 'Stevenson'],
    ['university-sf', '64e0b2e5-abef-4db0-97e9-54c8c4bb9af0', 'University'],
  ] as const;

  it('parses a feed whose TBA row has a null teamId and name instead of rejecting it', () => {
    for (const [slug, contestId] of cases) {
      const rows = corpusFeed(slug);
      const tba = rows.find((r) => r.contest.contestId === contestId)!;
      expect(tba.contest.teams.some((t) => t.teamId === null && t.name === null)).toBe(true);
    }
  });

  it('splits off exactly the TBA row of each feed, one dropped entry per row', () => {
    for (const [slug, contestId, named] of cases) {
      const rows = corpusFeed(slug);
      const res = splitTbaRows(rows);
      expect(res.rows).toEqual(rows.filter((r) => r.contest.contestId !== contestId));
      expect(res.dropped).toHaveLength(1);
      expect(res.dropped[0]).toMatchObject({ contestId, reason: 'tba-opponent', teams: [named] });
      expect(res.dropped[0].dateKey).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(res.dropped[0].note).toContain(named);
    }
  });

  it('treats an all-zero teamId and a null name as TBA too, and passes a clean feed through', () => {
    const rows = allScheduleRows().slice(0, 4);
    expect(splitTbaRows(rows)).toEqual({ rows, dropped: [] });
    const zero = {
      ...rows[0],
      contest: {
        ...rows[0].contest,
        teams: rows[0].contest.teams.map((t, i) => (i === 1 ? { ...t, teamId: TBA_TEAM_ID } : t)),
      },
    };
    const nameless = {
      ...rows[1],
      contest: {
        ...rows[1].contest,
        teams: rows[1].contest.teams.map((t, i) => (i === 0 ? { ...t, name: null } : t)),
      },
    };
    const res = splitTbaRows([zero, nameless, rows[2]]);
    expect(res.rows).toEqual([rows[2]]);
    expect(res.dropped.map((d) => d.contestId)).toEqual([rows[0].contest.contestId, rows[1].contest.contestId]);
    expect(res.dropped.every((d) => d.reason === 'tba-opponent' && d.teams.length === 1)).toBe(true);
  });

  it('serves a feed with a TBA row through getSchedule (the own-team guard still holds)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(corpusFeedText('sobrato')));
    const c = client(fetchImpl as unknown as typeof fetch);
    const res = await c.getSchedule(getTeamBySlug('sobrato')!.id);
    expect(res.data.length).toBe(corpusFeed('sobrato').length);
  });
});

describe('maxpreps: MaxPrepsClient.raw (the LiveTransport read, SPEC §7.2-§7.3)', () => {
  it('returns the body and status untouched, through the polite User-Agent', async () => {
    const body = corpusFeedText('leigh');
    const fetchImpl = vi.fn().mockResolvedValue(response(body));
    const c = client(fetchImpl as unknown as typeof fetch);
    const url = c.scheduleUrl(getTeamBySlug('leigh')!.id);
    const res: RawResponse = await c.raw(url);
    expect(res).toEqual({ url, httpStatus: 200, body });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toBe(POLITE_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toBe(POLITE_USER_AGENT);
    expect(headers.accept).toBe('application/json');
  });

  it('asks for HTML on the bootstrap page and does not parse anything', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('<html>not next data</html>'));
    const c = client(fetchImpl as unknown as typeof fetch);
    const res = await c.raw(BOOTSTRAP_URL);
    expect(res.body).toBe('<html>not next data</html>');
    expect((fetchImpl.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }).headers.accept).toBe(
      'text/html',
    );
  });

  it('returns a body that fails our schema as-is (validation belongs to the step)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('{"data":[{"schoolId":5}]}'));
    const c = client(fetchImpl as unknown as typeof fetch);
    await expect(c.raw(c.standingsUrl('LEAGUE'))).resolves.toMatchObject({ body: '{"data":[{"schoolId":5}]}' });
  });

  it('retries a 5xx like every other read, then reports the final status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('boom', { status: 502 }))
      .mockResolvedValueOnce(response('{"data":[]}'));
    const c = client(fetchImpl as unknown as typeof fetch);
    const res = await c.raw('https://production.api.maxpreps.com/x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.httpStatus).toBe(200);
    expect(res.body).toBe('{"data":[]}');
  });

  it('never returns a 4xx silently: it throws MaxPrepsError with the status, without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('bad', { status: 400 }));
    const c = client(fetchImpl as unknown as typeof fetch);
    const err = await c.raw(c.standingsUrl('LEAGUE')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MaxPrepsError);
    expect((err as MaxPrepsError).httpStatus).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shares the gate with the typed reads: never more than three at once', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return response('{}');
    });
    const c = client(fetchImpl as unknown as typeof fetch);
    await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => c.raw(`https://example.test/raw/${i}`)),
      ...Array.from({ length: 6 }, (_, i) => c.text(`https://example.test/text/${i}`)),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('spaces request starts by the configured interval', async () => {
    const slept: number[] = [];
    const fetchImpl = vi.fn().mockImplementation(async () => response('{}'));
    const c = new MaxPrepsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      spacingMs: 500,
      concurrency: 1,
    });
    await c.raw('https://example.test/a');
    await c.raw('https://example.test/b');
    // The second start waited for (most of) the 500 ms spacing; the first did not wait.
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(0);
    expect(slept[0]).toBeLessThanOrEqual(500);
  });
});
