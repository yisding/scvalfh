/**
 * How the data, fetch and build CLIs in scripts/ end: `runCli(main)` awaits `main(argv)`, turns a
 * thrown error into a `FAILED: <message>` line on stderr and exit code 1, and exits with the code
 * `main` returned otherwise. Exit codes are the contract with the cron (update-data.yml), CI and the
 * tests that spawn these scripts, so `main` decides every other code by returning it (0 ok, 1
 * failed) — never by calling process.exit itself, which would skip whatever the caller still had
 * to log.
 *
 * Two kinds of script keep their own endings. The assert:* gates in scripts/ci/ (assert-prerender,
 * assert-budgets, assert-vinext-prerender, assert-copy) are top-level checks over the build output
 * with no `main`: they print their own `FAIL <problem>` lines and exit 1 themselves. The plain-node
 * .mjs scripts (scripts/ci/a11y-axe, scripts/dev/typecheck-scope) cannot import a .ts module;
 * a11y-axe's exit 2 ('not run: dependencies missing') is deliberate.
 *
 * The entry idiom is one bare line at the end of the script: `runCli(main)`, or
 * `runCliIfMain(import.meta.url, main)` for a script whose module tests also import (data-issues,
 * build-official-fixtures), so that importing it runs nothing. A script that words a throw its own
 * way (fetch-data's `ABORT (previous snapshot kept): …`) passes `onError`.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Main = (argv: readonly string[]) => Promise<number> | number;

export interface RunCliOptions {
  /** The arguments `main` reads (default: the process's, after the script path). */
  argv?: readonly string[];
  /** The stderr line for an error `main` threw; null (or no hook) keeps `FAILED: <message>`. The exit code is 1 either way. */
  onError?(err: unknown): string | null;
}

export async function runCli(main: Main, opts: RunCliOptions = {}): Promise<never> {
  let code: number;
  try {
    code = await main(opts.argv ?? process.argv.slice(2));
  } catch (err) {
    console.error(opts.onError?.(err) ?? `FAILED: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  }
  process.exit(code);
}

/**
 * runCli(main) only when this module is the process's entry script (`importMetaUrl` is the
 * caller's `import.meta.url`), not when a test or another module imports it.
 */
export function runCliIfMain(importMetaUrl: string, main: Main, opts: RunCliOptions = {}): void {
  const entry = process.argv[1];
  if (entry !== undefined && importMetaUrl === pathToFileURL(path.resolve(entry)).href) runCli(main, opts);
}
