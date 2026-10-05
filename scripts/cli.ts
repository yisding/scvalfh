/**
 * The one way a scripts/*.ts CLI ends: `runCli(main)` awaits `main(argv)`, turns a thrown error
 * into a `FAILED: <message>` line on stderr and exit code 1, and exits with the code `main`
 * returned otherwise. Exit codes are the contract with the cron (update-data.yml), CI and the tests
 * that spawn these scripts, so `main` decides every other code by returning it (0 ok, 1 failed) —
 * never by calling process.exit itself, which would skip whatever the caller still had to log.
 *
 * The plain-node .mjs scripts (a11y-axe, typecheck-scope) cannot import a .ts module and keep their
 * own endings; a11y-axe's exit 2 ('not run: dependencies missing') is deliberate.
 */

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
