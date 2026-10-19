/**
 * How the cron entry point (scripts/fetch-data.ts) reports a run that threw. A run abort
 * (SPEC §7.5) writes nothing, so the previous snapshot stays; a plain failure is just a failure.
 *
 * A leaf on purpose: it imports only lib/pipeline/abort.ts and lib/config/invariant.ts, both
 * import-free, so the entry point can import it before the pipeline loads. If it reached the pipeline
 * contract (and through it the league config and the team registry), an invariant thrown while this
 * module itself loaded would escape the describer and be printed as a plain failure.
 */

import { ConfigInvariantError } from '@/lib/config/invariant';

import { RunAbort } from './abort';

/**
 * `abort` is true for the three §7.5 run-abort triggers that reach the entry point as a throw:
 * a RunAbort, and a violated config or registry invariant (assertLeagues / assertRegistry at import,
 * §7.5 run-abort trigger 2), reported as an abort rather than a crash because scripts/fetch-data.ts
 * loads those modules inside main(), after importing this module. The invariant is recognised by
 * class or by `name`, so it still is when a second module instance (a different loader) threw it.
 */
export function describeRunFailure(err: unknown): { abort: boolean; line: string } {
  const message = err instanceof Error ? err.message : String(err);
  const abort =
    err instanceof RunAbort ||
    err instanceof ConfigInvariantError ||
    (err instanceof Error && err.name === 'ConfigInvariantError');
  return { abort, line: abort ? `ABORT (previous snapshot kept): ${message}` : `FAILED: ${message}` };
}
