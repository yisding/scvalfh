/**
 * The one reader of a dataset file: the bundled JSON, or the file an `SCVAL_*` environment variable
 * names, validated against its schema. Every lib/datasets/ module that loads a data/*.json (and
 * lib/datasets/snapshot.ts, whose schema step is `loadSnapshot`) reads it through here, so the
 * override rules are written once.
 *
 * The bundled JSON stays a static import in each dataset module, never read here: Turbopack and
 * Vite/Rolldown bundle a file by its static import, and a Worker has no project filesystem
 * (lib/datasets/snapshot.ts explains). `readFileSync` runs only when the override variable is set,
 * which needs a real filesystem (next start, vinext start, vitest, tsx; never a Worker).
 *
 * Two behaviours for an override file that is not JSON, both kept as they were before this module
 * existed (the message is observable, tests and operators read it):
 *   'propagate'    the file is read inside the guard and parsed OUTSIDE it, so a SyntaxError
 *                  surfaces raw: the snapshot, the history archive and the rosters files.
 *   'cannot-read'  the file is read AND parsed inside the guard, so the same failure reads
 *                  `<owner>: cannot read <env>=<path> (<message>)`: the JV and player-stats files.
 * A file that cannot be read at all always reads that way.
 */

import { readFileSync } from 'node:fs';

import type { ZodType } from 'zod';
import { failValidation } from '@/lib/schema/primitives';

/** How an override file that is not valid JSON fails (see the header). */
export type MalformedOverride = 'propagate' | 'cannot-read';

interface DatasetFile {
  /** The bundled JSON, imported by the caller. */
  bundled: unknown;
  /** The module's path, as the `cannot read` message names it: 'lib/datasets/jv.ts'. */
  owner: string;
}

/** A file that an environment variable can swap (with what a non-JSON override does), or one that has no override. */
export type DatasetSource = DatasetFile &
  (
    | { env: string; malformedOverride: MalformedOverride }
    | { env?: undefined; malformedOverride?: undefined }
  );

/** The parsed JSON of the override file when `env` is set to a non-empty path, else `bundled`. */
export function readDatasetRaw({ env, bundled, owner, malformedOverride }: DatasetSource): unknown {
  const path = env ? process.env[env] : undefined;
  if (!path) return bundled;
  const cannotRead = (err: unknown): never => {
    throw new Error(`${owner}: cannot read ${env}=${path} (${(err as Error).message})`);
  };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return cannotRead(err);
  }
  if (malformedOverride === 'propagate') return JSON.parse(text) as unknown;
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    return cannotRead(err);
  }
}

export type DatasetOptions<T> = DatasetSource & {
  /** What `failValidation` names: 'jv', 'rosters-enrichment otherRosters'. */
  label: string;
  schema: ZodType<T>;
};

/** readDatasetRaw, then `schema.safeParse`; a failure throws `<label> failed validation:` and the first issues. */
export function readDataset<T>({ label, schema, ...source }: DatasetOptions<T>): T {
  const parsed = schema.safeParse(readDatasetRaw(source));
  if (!parsed.success) failValidation(label, parsed.error.issues);
  return parsed.data;
}
