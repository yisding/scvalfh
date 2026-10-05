/** lib/pipeline/read.ts: the failure classification and the JSON-body check every step shares. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FixtureMissing, TransportError } from '../../lib/pipeline/contract';
import { classifyFetchError, parseJsonBody } from '../../lib/pipeline/read';

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
