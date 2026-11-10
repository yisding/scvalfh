/**
 * How the data, fetch and build CLIs in scripts/ end: `runCli(main)` awaits `main(argv)`, turns a
 * thrown error into a `FAILED: <message>` line on stderr and exit code 1, and exits with the code
 * `main` returned otherwise. Exit codes are the contract with the cron (update-data.yml), CI and the
 * tests that spawn these scripts, so `main` decides every other code by returning it (0 ok, 1
 * failed) — never by calling process.exit itself, which would skip whatever the caller still had
 * to log.
 *
 * Two kinds of script keep their own endings. The assert:* gates (assert-prerender,
 * assert-budgets, assert-vinext-prerender, assert-copy) are top-level checks over the build output
 * with no `main`: they print their own `FAIL <problem>` lines and exit 1 themselves. The plain-node
 * .mjs scripts (a11y-axe, typecheck-scope) cannot import a .ts module; a11y-axe's exit 2 ('not run:
 * dependencies missing') is deliberate.
 *
 * Every such script ends with `runCliIfMain(import.meta.url, main)` and exports `main`: it runs
 * only when the file is the process's entry point (`tsx scripts/<name>.ts`), so a test or another
 * script can import it without starting a run.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runCli(
  main: (argv: readonly string[]) => Promise<number> | number,
  argv: readonly string[] = process.argv.slice(2),
): Promise<never> {
  let code: number;
  try {
    code = await main(argv);
  } catch (err) {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  }
  process.exit(code);
}

/** `runCli(main)` when the module at `importMetaUrl` is the script node was started with; else nothing. */
export function runCliIfMain(
  importMetaUrl: string,
  main: (argv: readonly string[]) => Promise<number> | number,
): void {
  const invokedDirectly = process.argv[1] !== undefined && importMetaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
  if (invokedDirectly) void runCli(main);
}
