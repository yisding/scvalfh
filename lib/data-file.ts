/**
 * The one routine every bundled data file goes through: the JSON the module imports (so every toolchain
 * bundles it; a Worker has no project filesystem, lib/data.ts explains), optionally swapped for another
 * file named by an environment variable, then validated by its Zod schema.
 *
 * Server-only: the override is read with node:fs, which needs a real filesystem (next start, vinext
 * start, vitest and tsx, never a Worker). Unset, nothing touches the filesystem. lib/schema-primitives.ts
 * stays fs-free; this module is where the filesystem comes in.
 */

import { readFileSync } from 'node:fs';

import type { z } from 'zod';

import { failValidation } from './schema-primitives';

/**
 * `bundled` unless `process.env[envVar]` names a file, in which case that file's parsed JSON. A file
 * that cannot be read or parsed throws `<module>: cannot read <envVar>=<path> (<reason>)`.
 */
export function readOverride(module: string, envVar: string, bundled: unknown): unknown {
  const override = process.env[envVar];
  if (!override) return bundled;
  try {
    return JSON.parse(readFileSync(override, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`${module}: cannot read ${envVar}=${override} (${(err as Error).message})`);
  }
}

/** `raw` parsed by `schema`, or a throw naming `label` and every failure (failValidation). */
export function validateData<T>(label: string, schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) failValidation(label, parsed.error.issues);
  return parsed.data;
}
