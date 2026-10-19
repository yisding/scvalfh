/** lib/pipeline/read.ts: the failure classification and the JSON-body check every step shares. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FixtureMissing, TransportError, type RunContext } from '@/lib/pipeline/contract';
import { classifyFetchError, parseJsonBody, readResource, sourceBase, warnIfError, type FetchFailure } from '@/lib/pipeline/read';
import type { RawResponse } from '@/lib/sources/http/raw-response';

describe('classifyFetchError', () => {
  it('a resource the corpus lacks is skipped, not in corpus', () => {
    expect(classifyFetchError(new FixtureMissing({ kind: 'ccs-ical' }))).toEqual({ status: 'skipped', error: 'not in corpus' });
  });

  it('a transport error keeps its HTTP status when it had one', () => {
    expect(classifyFetchError(new TransportError('HTTP 503', 'https://example.invalid/', 503))).toEqual({
      status: 'error',
      error: 'HTTP 503',
      httpStatus: 503,
    });
    expect(classifyFetchError(new TransportError('timeout', 'https://example.invalid/', null))).toEqual({ status: 'error', error: 'timeout' });
  });

  it('anything else is an error with its message', () => {
    expect(classifyFetchError(new Error('boom'))).toEqual({ status: 'error', error: 'boom' });
    expect(classifyFetchError('plain')).toEqual({ status: 'error', error: 'plain' });
  });
});

describe('parseJsonBody', () => {
  const Schema = z.object({ data: z.array(z.object({ id: z.string() })) });

  it('returns the parsed body', () => {
    expect(parseJsonBody('{"data":[{"id":"a"}]}', Schema)).toEqual({ data: [{ id: 'a' }] });
  });

  it('throws invalid JSON for a body that is not JSON', () => {
    expect(() => parseJsonBody('<html>maintenance</html>', Schema)).toThrow(/^invalid JSON: /);
  });

  it('throws schema drift with the first three issues, each with its path', () => {
    const body = JSON.stringify({ data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
    let message = '';
    try {
      parseJsonBody(body, Schema);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/^schema drift: data\.0\.id: [^;]+; data\.1\.id: [^;]+; data\.2\.id: [^;]+$/);
    expect(() => parseJsonBody('[]', Schema)).toThrow(/^schema drift: \(root\): /);
  });
});

/** The slice of RunContext these helpers touch: a transport that answers or throws, and a WARN recorder. */
function fakeContext(get: () => Promise<RawResponse>): { ctx: RunContext; warnings: Array<[string, unknown]> } {
  const warnings: Array<[string, unknown]> = [];
  const ctx = {
    fetchedAt: '2026-10-04T18:00:00.000Z',
    transport: { mode: 'fixture', get },
    warn: (line: string, scope?: unknown) => void warnings.push([line, scope]),
  } as unknown as RunContext;
  return { ctx, warnings };
}

describe('readResource', () => {
  const response: RawResponse = { url: 'https://example.invalid/a', httpStatus: 200, body: 'hello' } as RawResponse;

  it('returns the response under ok', async () => {
    const { ctx } = fakeContext(async () => response);
    expect(await readResource(ctx, { kind: 'ccs-ical' })).toEqual({ ok: response });
  });

  it('classifies a thrown error under failed', async () => {
    const { ctx } = fakeContext(async () => {
      throw new FixtureMissing({ kind: 'ccs-ical' });
    });
    expect(await readResource(ctx, { kind: 'ccs-ical' })).toEqual({ failed: { status: 'skipped', error: 'not in corpus' } });
    const down = fakeContext(async () => {
      throw new TransportError('HTTP 503', 'https://example.invalid/', 503);
    });
    expect(await readResource(down.ctx, { kind: 'ccs-ical' })).toEqual({ failed: { status: 'error', error: 'HTTP 503', httpStatus: 503 } });
  });

  it("lets the step's failureOf see the error first", async () => {
    const { ctx } = fakeContext(async () => {
      throw new Error('no pdftotext');
    });
    const failureOf = (err: unknown): FetchFailure =>
      err instanceof Error && err.message === 'no pdftotext' ? { status: 'skipped', error: err.message } : classifyFetchError(err);
    expect(await readResource(ctx, { kind: 'ccs-ical' }, { failureOf })).toEqual({ failed: { status: 'skipped', error: 'no pdftotext' } });
  });
});

describe('warnIfError', () => {
  it('warns `<label>: <error>` with the scope for an error', () => {
    const { ctx, warnings } = fakeContext(async () => {
      throw new Error('unused');
    });
    warnIfError(ctx, { status: 'error', error: 'HTTP 503', httpStatus: 503 }, 'd1 revision check failed', { league: 'mcal' });
    expect(warnings).toEqual([['d1 revision check failed: HTTP 503', { league: 'mcal' }]]);
  });

  it('says nothing for a resource the corpus lacks', () => {
    const { ctx, warnings } = fakeContext(async () => {
      throw new Error('unused');
    });
    warnIfError(ctx, { status: 'skipped', error: 'not in corpus' }, 'bootstrap unreadable');
    expect(warnings).toEqual([]);
  });
});

describe('sourceBase', () => {
  const { ctx } = fakeContext(async () => {
    throw new Error('unused');
  });

  it('stamps the run fetchedAt and keeps the scope when there is one', () => {
    expect(sourceBase(ctx, { id: 'maxpreps-api', kind: 'league-meta', scope: { league: 'scval' }, label: 'x', url: 'https://example.invalid/' })).toEqual({
      id: 'maxpreps-api',
      kind: 'league-meta',
      scope: { league: 'scval' },
      label: 'x',
      url: 'https://example.invalid/',
      fetchedAt: '2026-10-04T18:00:00.000Z',
    });
  });

  it('leaves a global row without a scope key and keeps the field order', () => {
    const base = sourceBase(ctx, { id: 'maxpreps-html', kind: 'bootstrap', label: 'season bootstrap', url: 'https://example.invalid/' });
    expect('scope' in base).toBe(false);
    expect(Object.keys(base)).toEqual(['id', 'kind', 'label', 'url', 'fetchedAt']);
  });
});
