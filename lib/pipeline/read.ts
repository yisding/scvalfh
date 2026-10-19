/**
 * How a pipeline step reads one upstream resource, the parts every step shares: the read itself
 * (`readResource`), how a failed `transport.get` is classified for its SourceStatus row, the WARN
 * line an error earns (`warnIfError`), the row's base fields (`sourceBase`) and how a JSON body is
 * held to its schema. What a step then DOES with a failure (carry the previous rows, mark a
 * division's meta, list a missed CCS part) stays in the step.
 */

import type { z } from 'zod';

import type { SourceStatus } from '@/lib/model/health';
import { describeIssues } from '@/lib/schema/primitives';
import type { RawResponse } from '@/lib/sources/http/raw-response';
import { FixtureMissing, TransportError, type RunContext, type RunLog } from './contract';
import type { ResourceKey } from './resources';

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

/**
 * One `transport.get`: the response, or the failure classified for the step's SourceStatus row. A
 * step with a failure of its own (official: a machine without pdftotext skips a grid) passes
 * `failureOf`, which sees the error first and falls back to classifyFetchError itself.
 */
export async function readResource(
  ctx: RunContext,
  key: ResourceKey,
  { failureOf = classifyFetchError }: { failureOf?: (err: unknown) => FetchFailure } = {},
): Promise<{ ok: RawResponse } | { failed: FetchFailure }> {
  try {
    return { ok: await ctx.transport.get(key) };
  } catch (err) {
    return { failed: failureOf(err) };
  }
}

/**
 * WARN `<label>: <error>` when the failure is an 'error' (a 'skipped' resource, one the corpus lacks,
 * is not worth a warning). `label` is the whole lead-in, verb included: `d1 revision check failed`,
 * `bootstrap unreadable`, `cifsshome.org Southern field hockey failed (page 2 of 4)`.
 */
export function warnIfError(ctx: RunLog, failed: FetchFailure, label: string, scope?: SourceStatus['scope']): void {
  if (failed.status === 'error') ctx.warn(`${label}: ${failed.error}`, scope);
}

/**
 * A SourceStatus row before its outcome: the fields every row of one read shares, stamped with the
 * run's `fetchedAt`. The step spreads it under `status` (and `httpStatus`, `rowCount`, `error`, ...).
 */
export function sourceBase(
  ctx: RunContext,
  { id, kind, scope, label, url }: Pick<SourceStatus, 'id' | 'scope' | 'label' | 'url'> & { kind: NonNullable<SourceStatus['kind']> },
): Omit<SourceStatus, 'status'> {
  return { id, kind, ...(scope ? { scope } : {}), label, url, fetchedAt: ctx.fetchedAt };
}

/** `schema drift: data.0.schoolId: Invalid input; …`: the first three issues, one `path: message` each. */
function schemaDrift(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
  return describeIssues(issues, { limit: 3, empty: '(root)', separator: '; ', prefix: 'schema drift: ' });
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
