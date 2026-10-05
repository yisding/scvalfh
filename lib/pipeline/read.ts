/**
 * How a pipeline step reads one upstream resource, the parts every step shares: how a failed
 * `transport.get` is classified for its SourceStatus row, and how a JSON body is held to its schema.
 * What a step then DOES with a failure (carry the previous rows, mark a division's meta, list a
 * missed CCS part) stays in the step.
 */

import type { z } from 'zod';

import { FixtureMissing, TransportError } from './contract';

/** A failed fetch, classified for its SourceStatus row (spread it over the row's base). */
export interface FetchFailure {
  status: 'skipped' | 'error';
  error: string;
  httpStatus?: number;
}

/**
 * A resource the corpus lacks is 'skipped' ('not in corpus', how an offline run skips it); anything
 * else is an 'error' with its message, and with the HTTP status when the transport had one.
 */
export function classifyFetchError(err: unknown): FetchFailure {
  if (err instanceof FixtureMissing) return { status: 'skipped', error: 'not in corpus' };
  const error = err instanceof Error ? err.message : String(err);
  if (err instanceof TransportError && err.httpStatus !== null) return { status: 'error', error, httpStatus: err.httpStatus };
  return { status: 'error', error };
}

/** `schema drift: data.0.schoolId: Invalid input; …`: the first three issues, one `path: message` each. */
function schemaDrift(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
  return `schema drift: ${issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('; ')}`;
}

/** The body parsed as JSON and held to `schema`; throws 'invalid JSON: …' or 'schema drift: …'. */
export function parseJsonBody<S extends z.ZodType>(body: string, schema: S): z.output<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch (err) {
    throw new Error(`invalid JSON: ${(err as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(schemaDrift(parsed.error.issues));
  return parsed.data;
}
