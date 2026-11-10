/**
 * The file harness scripts/fetch-rosters.ts, scripts/fetch-player-stats.ts and scripts/fetch-jv.ts
 * share around their per-team fetches: reading the previous file (or stopping the run when it
 * cannot be read), the registry teams whose previous row was dropped, the `--capture` directory,
 * holding the assembled file to its schema, and the dry-run / no-change / write tail. Every line
 * these helpers print is part of the scripts' contract with the cron and the spawn tests, so each
 * one prints exactly what the scripts printed before, in the same order.
 *
 * Each script keeps its own per-team table, counts line and league summary: those differ.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ZodType } from 'zod';

import { formatIssues } from '../../lib/schema-primitives';
import { stableStringify } from '../../lib/stable-json';
import { describePrevious, type PreviousRows } from './team-scope';

/**
 * The previous file at `out`, if it exists, read by `read` (readPreviousFile, or a script's own
 * salvage built on it). When it cannot be read at all, logs
 * `FAILED: the previous <out> cannot be read: <reason>. <failSuffix>` and returns `{ ok: false }`:
 * the caller writes nothing and exits 1. Otherwise logs `warnings` (describePrevious by default),
 * one console.warn per line, and returns what was read (null when there is no file).
 */
export function loadPreviousOrFail<P extends { readable: true } & PreviousRows<unknown, unknown>>(
  out: string,
  read: (text: string, label: string) => P | { readable: false; reason: string },
  failSuffix: string,
  warnings: (previous: P, label: string) => string[] = describePrevious,
): { ok: true; previous: P | null } | { ok: false } {
  if (!existsSync(out)) return { ok: true, previous: null };
  const label = path.relative(process.cwd(), out);
  const loaded = read(readFileSync(out, 'utf8'), label);
  if (loaded.readable === false) {
    console.error(`FAILED: the previous ${label} cannot be read: ${loaded.reason}. ${failSuffix}`);
    return { ok: false };
  }
  for (const line of warnings(loaded, label)) console.warn(line);
  return { ok: true, previous: loaded };
}

/** The registry teams whose previous row was dropped (DroppedRow.team): nothing of theirs is carried. */
export function droppedTeams(previous: Pick<PreviousRows<unknown, unknown>, 'dropped'> | null): Set<string> {
  return new Set(previous?.dropped.flatMap((d) => (d.team ? [d.team] : [])) ?? []);
}

/** The `--capture` directory, created; null when there is none. `--dry-run` writes nothing, --capture included. */
export function prepareCapture(args: { dryRun: boolean; capture: string | null }): string | null {
  const capture = args.dryRun ? null : args.capture;
  if (capture) mkdirSync(capture, { recursive: true });
  return capture;
}

/** Writes a captured body as received, with a final newline. */
export function saveCapture(dir: string, name: string, body: string): void {
  writeFileSync(path.join(dir, name), body.endsWith('\n') ? body : `${body}\n`, 'utf8');
}

/** The assembled file, validated; null (with the issues logged) when it does not validate. */
export function validateAssembled<T>(schema: ZodType<T>, file: unknown): T | null {
  const validated = schema.safeParse(file);
  if (!validated.success) {
    console.error('FAILED: the assembled file does not validate:');
    console.error(formatIssues(validated.error.issues));
    return null;
  }
  return validated.data;
}

/**
 * The tail of a run: on `--dry-run` nothing is written; a previous file that validates whole (and
 * lost no row) with the same content key is left in place; otherwise `file` is written to `out`.
 * Returns `exitCode` either way.
 */
export function writeIfChanged<T extends { fetchedAt: string }>(args: {
  out: string;
  dryRun: boolean;
  whole: T | null | undefined;
  contentKey: (file: T) => string;
  validated: T;
  file: unknown;
  exitCode: number;
}): number {
  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return args.exitCode;
  }
  // Only a previous file that validates whole (and lost no row) can be left in place.
  const whole = args.whole;
  if (whole && args.contentKey(whole) === args.contentKey(args.validated)) {
    console.log(`\nno change since ${whole.fetchedAt}: ${path.relative(process.cwd(), args.out)} left as it was`);
    return args.exitCode;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(args.file), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return args.exitCode;
}
