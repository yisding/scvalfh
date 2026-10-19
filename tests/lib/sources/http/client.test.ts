/**
 * lib/sources/http/client.ts — HttpClient, the polite transport of every non-MaxPreps-API read.
 *
 * Pins the CURRENT behaviour with a fake fetchImpl and a recording sleep, so a later change of the
 * engine underneath (one polite-HTTP engine shared with MaxPrepsClient) has to keep every answer:
 * which statuses retry, how long the backoff sleeps (Retry-After honoured and capped), that the
 * final attempt never sleeps, what a timeout turns into, the redirect URL, the courtesy gate
 * (default concurrency 2, hard cap 3, spacing between request starts), the headers sent and the
 * fields of HttpResponse and HttpError. Shapes ported from tests/lib/sources/maxpreps/client.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHROME_USER_AGENT,
  HttpClient,
  type HttpClientOptions,
  HttpError,
  MAX_RETRY_AFTER_MS,
  POLITE_USER_AGENT,
} from '@/lib/sources/http/client';

function response(body: string, init: { status?: number; headers?: Record<string, string>; url?: string } = {}) {
  const res = new Response(body, { status: init.status ?? 200, headers: init.headers });
  // A constructed Response has url ''; a real fetch that followed a redirect reports the final URL.
  if (init.url !== undefined) Object.defineProperty(res, 'url', { value: init.url });
  return res;
}

/** A fetch that never answers on its own: it rejects the way undici does when its signal aborts. */
const hangingFetch = vi.fn(
  (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason as Error));
    }),
);

function recorder() {
  const slept: number[] = [];
  return { slept, sleep: async (ms: number) => void slept.push(ms) };
}

function client(fetchImpl: unknown, opts: Omit<HttpClientOptions, 'fetchImpl'> = {}) {
  return new HttpClient({ sleep: async () => {}, spacingMs: 0, ...opts, fetchImpl: fetchImpl as typeof fetch });
}

function headersOf(fetchImpl: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  return (fetchImpl.mock.calls[call][1] as RequestInit & { headers: Record<string, string> }).headers;
}

// Math.random() === 0.5 makes the ±20 % jitter exactly zero, so backoff sleeps are exact numbers.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
  hangingFetch.mockClear();
});

describe('http client: which failures retry', () => {
  it('retries a 5xx up to three attempts, then throws the last HttpError', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => response('boom', { status: 503 }));
    const err = await client(fetchImpl).text('https://example.test/x').catch((e: unknown) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ name: 'HttpError', message: 'HTTP 503', url: 'https://example.test/x', httpStatus: 503, retryable: true });
  });

  it('retries a 429 and then succeeds, counting the attempts', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('slow down', { status: 429 }))
      .mockResolvedValueOnce(response('<html>ok</html>'));
    const res = await client(fetchImpl).text('https://example.test/x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.body).toBe('<html>ok</html>');
    expect(res.attempts).toBe(2);
  });

  it('retries a 500 and a 502 alike (any status >= 500)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('a', { status: 500 }))
      .mockResolvedValueOnce(response('b', { status: 502 }))
      .mockResolvedValueOnce(response('c'));
    const res = await client(fetchImpl).text('https://example.test/x');
    expect(res).toMatchObject({ body: 'c', attempts: 3, httpStatus: 200 });
  });

  it.each([400, 401, 403, 404, 410])('never retries a %i: one request, a non-retryable HttpError', async (status) => {
    const fetchImpl = vi.fn().mockImplementation(async () => response('no', { status }));
    const err = await client(fetchImpl).text('https://example.test/x').catch((e: unknown) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ message: `HTTP ${status}`, url: 'https://example.test/x', httpStatus: status, retryable: false });
  });

  it('retries a network error and reports its message, with no status', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const err = await client(fetchImpl).text('https://example.test/x').catch((e: unknown) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ message: 'ECONNRESET', url: 'https://example.test/x', retryable: true });
    expect((err as HttpError).httpStatus).toBeUndefined();
  });

  it("names a message-less network error 'network error'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(''));
    await expect(client(fetchImpl, { attempts: 1 }).text('https://example.test/x')).rejects.toThrow(/^network error$/);
  });

  it('retries a 2xx whose body fails to read, like any other failure', async () => {
    const broken = { ok: true, status: 200, url: '', headers: new Headers(), text: () => Promise.reject(new Error('body stalled')) };
    const fetchImpl = vi.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(response('fine'));
    const res = await client(fetchImpl).text('https://example.test/x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ body: 'fine', attempts: 2 });
  });

  it('honours the attempts option and never makes fewer than one', async () => {
    const five = vi.fn().mockImplementation(async () => response('boom', { status: 503 }));
    await expect(client(five, { attempts: 5 }).text('https://example.test/x')).rejects.toThrow(/HTTP 503/);
    expect(five).toHaveBeenCalledTimes(5);
    const zero = vi.fn().mockImplementation(async () => response('boom', { status: 503 }));
    await expect(client(zero, { attempts: 0 }).text('https://example.test/x')).rejects.toThrow(/HTTP 503/);
    expect(zero).toHaveBeenCalledTimes(1);
  });
});

describe('http client: backoff and Retry-After', () => {
  it('backs off 1 s then 2 s, logs each retry, and does not sleep after the final attempt', async () => {
    const { slept, sleep } = recorder();
    const log: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async () => response('boom', { status: 503 }));
    await expect(client(fetchImpl, { sleep, onLog: (l) => log.push(l) }).text('https://example.test/x')).rejects.toThrow(
      /HTTP 503/,
    );
    expect(slept).toEqual([1000, 2000]);
    expect(log).toEqual(['retry in 1000ms (attempt 1)', 'retry in 2000ms (attempt 2)']);
  });

  it('backs off the same way after a network error, and not after the last one', async () => {
    const { slept, sleep } = recorder();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(client(fetchImpl, { sleep }).text('https://example.test/x')).rejects.toThrow(/ECONNRESET/);
    expect(slept).toEqual([1000, 2000]);
  });

  it('jitters the backoff by at most ±20 %', async () => {
    for (const [random, expected] of [
      [0, [800, 1600]],
      [0.999999, [1200, 2400]],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const { slept, sleep } = recorder();
      const fetchImpl = vi.fn().mockImplementation(async () => response('boom', { status: 503 }));
      await expect(client(fetchImpl, { sleep }).text('https://example.test/x')).rejects.toThrow(/HTTP 503/);
      expect(slept).toEqual(expected);
    }
  });

  it('sleeps for Retry-After (in seconds) instead of the ordinary backoff', async () => {
    const { slept, sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('slow down', { status: 429, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(response('ok'));
    await client(fetchImpl, { sleep }).text('https://example.test/x');
    expect(slept).toEqual([7000]);
  });

  it('caps Retry-After at MAX_RETRY_AFTER_MS (30 s)', async () => {
    expect(MAX_RETRY_AFTER_MS).toBe(30_000);
    const { slept, sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => response('rate limited', { status: 429, headers: { 'retry-after': '3600' } }));
    await expect(client(fetchImpl, { sleep }).text('https://example.test/x')).rejects.toThrow(/HTTP 429/);
    // Three attempts, two sleeps: the last one throws instead of waiting on its way out.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([MAX_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS]);
  });

  it.each(['0', '-5', 'Wed, 21 Oct 2026 07:28:00 GMT', 'soon'])(
    'ignores an unusable Retry-After (%s) and uses the ordinary backoff',
    async (header) => {
      const { slept, sleep } = recorder();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(response('busy', { status: 503, headers: { 'retry-after': header } }))
        .mockResolvedValueOnce(response('ok'));
      await client(fetchImpl, { sleep }).text('https://example.test/x');
      expect(slept).toEqual([1000]);
    },
  );
});

describe('http client: the per-request timeout', () => {
  it('aborts a request that outlives timeoutMs, retries it, then throws a retryable HttpError', async () => {
    const { slept, sleep } = recorder();
    const err = await client(hangingFetch, { sleep, timeoutMs: 5 })
      .text('https://example.test/slow')
      .catch((e: unknown) => e);
    expect(hangingFetch).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ url: 'https://example.test/slow', retryable: true });
    expect((err as HttpError).httpStatus).toBeUndefined();
    expect((err as HttpError).message).toMatch(/abort/i);
    expect(slept).toEqual([1000, 2000]);
  });

  it('passes an abort signal and follows redirects on every request', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => response('ok'));
    await client(fetchImpl).text('https://example.test/x');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe('follow');
  });
});

describe('http client: the response', () => {
  it('reports the final URL of a followed redirect, the status, the content type and the attempts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response('<html/>', {
        url: 'https://www.si.com/high-school/stats/x',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const res = await client(fetchImpl).text('https://scorebooklive.com/x');
    expect(res).toEqual({
      body: '<html/>',
      url: 'https://www.si.com/high-school/stats/x',
      httpStatus: 200,
      contentType: 'text/html; charset=utf-8',
      attempts: 1,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://scorebooklive.com/x');
  });

  it('falls back to the requested URL when the response carries none, and to a null content type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    const res = await client(fetchImpl).text('https://example.test/x');
    expect(res.url).toBe('https://example.test/x');
    expect(res.contentType).toBeNull();
  });

  it('reads bytes() as a Uint8Array and asks for a PDF', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const res = await client(fetchImpl).bytes('https://example.test/a.pdf');
    expect(res.body).toBeInstanceOf(Uint8Array);
    expect([...res.body]).toEqual([37, 80, 68, 70]);
    expect(headersOf(fetchImpl).accept).toBe('application/pdf,*/*');
  });

  it('retries bytes() on a 5xx like text()', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200 }));
    const res = await client(fetchImpl).bytes('https://example.test/a.pdf');
    expect(res.attempts).toBe(2);
    expect([...res.body]).toEqual([1, 2]);
  });
});

describe('http client: headers', () => {
  it('sends the polite descriptive User-Agent by default and an HTML accept header', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => response('ok'));
    await client(fetchImpl).text('https://example.test/x');
    const headers = headersOf(fetchImpl);
    expect(headers['user-agent']).toBe(POLITE_USER_AGENT);
    expect(headers['user-agent']).toMatch(/^scvalfh\/1\.0 \(NorCal girls field hockey scoreboard; unofficial fan site; \+https:\/\/.+; contact: .+\)$/);
    expect(headers.accept).toBe('text/html,application/xhtml+xml,*/*');
  });

  it('sends a caller-chosen User-Agent (si.com needs the Chrome one) and accept header', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => response('ok'));
    await client(fetchImpl, { userAgent: CHROME_USER_AGENT }).text('https://example.test/x', 'text/calendar');
    expect(headersOf(fetchImpl)).toEqual({ 'user-agent': CHROME_USER_AGENT, accept: 'text/calendar' });
    expect(CHROME_USER_AGENT).toMatch(/^Mozilla\/5\.0 .* Chrome\/[\d.]+ Safari\/[\d.]+$/);
  });
});

describe('http client: the courtesy gate (SPEC §5.2-5.3)', () => {
  async function peakOf(opts: Omit<HttpClientOptions, 'fetchImpl'>, requests = 12): Promise<number> {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return response('ok');
    });
    const c = client(fetchImpl, opts);
    await Promise.all(Array.from({ length: requests }, (_, i) => c.text(`https://example.test/${i}`)));
    expect(fetchImpl).toHaveBeenCalledTimes(requests);
    return peak;
  }

  it('runs at most two requests at once by default', async () => {
    expect(await peakOf({})).toBe(2);
  });

  it('caps a requested concurrency at three and floors it at one', async () => {
    expect(await peakOf({ concurrency: 25 })).toBe(3);
    expect(await peakOf({ concurrency: 3 })).toBe(3);
    expect(await peakOf({ concurrency: 0 })).toBe(1);
  });

  it('spaces request starts by 500 ms by default (the first start does not wait)', async () => {
    const { slept, sleep } = recorder();
    const fetchImpl = vi.fn().mockImplementation(async () => response('ok'));
    const c = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep, concurrency: 1 });
    await c.text('https://example.test/a');
    await c.text('https://example.test/b');
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(0);
    expect(slept[0]).toBeLessThanOrEqual(500);
  });

  it('spaces by the configured interval, and a negative one means no spacing', async () => {
    const spaced = recorder();
    const fetchImpl = vi.fn().mockImplementation(async () => response('ok'));
    const c = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: spaced.sleep, spacingMs: 1000 });
    await c.text('https://example.test/a');
    await c.text('https://example.test/b');
    expect(spaced.slept).toHaveLength(1);
    expect(spaced.slept[0]).toBeGreaterThan(500);
    expect(spaced.slept[0]).toBeLessThanOrEqual(1000);

    const unspaced = recorder();
    const d = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: unspaced.sleep, spacingMs: -10 });
    await d.text('https://example.test/a');
    await d.text('https://example.test/b');
    expect(unspaced.slept).toEqual([]);
  });

  it('holds the gate slot through the retries of one request', async () => {
    let active = 0;
    let peak = 0;
    let flakyCalls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active -= 1;
      if (url.endsWith('/flaky') && ++flakyCalls < 3) return response('boom', { status: 503 });
      return response('ok');
    });
    const c = client(fetchImpl, { concurrency: 1 });
    const [flaky, steady] = await Promise.all([c.text('https://example.test/flaky'), c.text('https://example.test/steady')]);
    expect(flaky.attempts).toBe(3);
    expect(steady.attempts).toBe(1);
    expect(peak).toBe(1);
    expect(fetchImpl.mock.calls.map(([u]) => u)).toEqual([
      'https://example.test/flaky',
      'https://example.test/flaky',
      'https://example.test/flaky',
      'https://example.test/steady',
    ]);
  });
});

describe('http client: HttpError', () => {
  it('carries url, httpStatus and retryable (false unless said)', () => {
    const plain = new HttpError('nope', { url: 'https://example.test/x' });
    expect(plain).toBeInstanceOf(Error);
    expect(plain).toMatchObject({ name: 'HttpError', message: 'nope', url: 'https://example.test/x', retryable: false });
    expect(plain.httpStatus).toBeUndefined();
    expect(new HttpError('HTTP 503', { url: 'u', httpStatus: 503, retryable: true })).toMatchObject({
      httpStatus: 503,
      retryable: true,
    });
  });
});
