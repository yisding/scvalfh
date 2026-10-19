/**
 * One declarative flag parser for the argv loops of lib/pipeline/cli.ts and the scripts
 * (fetch-rosters, fetch-player-stats, fetch-jv, build-history, build-official-fixtures,
 * discover-season, fetch-prior-season, fetch-mascots). Each used to carry its own copy of the same
 * loop (an index, a `next()` that refuses a missing value, an if/else chain, an `unknown flag`
 * throw); they differed only in the quirks below, which are options here rather than copies.
 *
 * A caller lists its flags once (FlagSpec: flags and their aliases, what each flag's value is
 * parsed as, where it lands in the caller's args) and says how the loop words its failures
 * (FlagOptions). Cross-flag checks (`--capture` with `--fixtures`, `--variant` needs `--fixtures`)
 * stay with the caller, after the parse, because they are about the run and not the argv.
 *
 * The quirks the callers keep, each a deliberate choice of that CLI and not an accident to tidy:
 *   - whether '' is a value: the three fetch scripts refuse it, the others take it (allowEmptyValue)
 *   - whether a value may itself start with `--` (allowFlagValue): only fetch-mascots' `--only`
 *   - the wording of an unknown flag and of a missing value, which four CLIs spell four ways
 *     (FlagOptions.unknown / needsValue, defaulting to `unknown flag: X` / `X needs a value`; a
 *     usage text rides along in the message when the CLI prints one)
 *
 * Pure (no fs, no network): the only ambient state it reads is the process cwd, and only for a
 * 'path' value when the caller gives no `cwd`.
 */

import path from 'node:path';

import { LEAGUE_IDS, isLeagueId } from '@/lib/config/leagues';
import type { LeagueId } from '@/lib/model/ids';

/** `scval,bval` → ['scval', 'bval']; an unknown id or an empty list throws. */
export function parseLeaguesFlag(value: string, flag = '--leagues'): LeagueId[] {
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`${flag} needs at least one league id`);
  for (const id of ids) {
    if (!isLeagueId(id)) throw new Error(`${flag}: unknown league ${id} (known: ${LEAGUE_IDS.join(', ')})`);
  }
  return [...new Set(ids)] as LeagueId[];
}

/** `--fetched-at <iso>`: an ISO timestamp ('2026-10-04T00:00:00.000Z'), returned as given; anything else throws. */
export function parseFetchedAtFlag(value: string, flag = '--fetched-at'): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${flag}: not an ISO timestamp: ${value}`);
  }
  return value;
}

/** What a flag's value is read as, and the type `set` receives for it. */
export interface FlagValueKinds {
  /** The text as given. */
  string: string;
  /** A file path, resolved against `FlagOptions.cwd` (the process cwd when absent). */
  path: string;
  /** A comma list of league ids (parseLeaguesFlag). */
  leagues: LeagueId[];
  /** An ISO timestamp (parseFetchedAtFlag). */
  iso: string;
  /** A comma list, trimmed, empty entries dropped. */
  list: string[];
}

/** A flag with a value, read as `value` says; `set` stores it (`flag` is the spelling the user typed, an alias or not). */
type ValueRule<A> =
  | { value: 'string'; set(args: A, value: FlagValueKinds['string'], flag: string): void }
  | { value: 'path'; set(args: A, value: FlagValueKinds['path'], flag: string): void }
  | { value: 'leagues'; set(args: A, value: FlagValueKinds['leagues'], flag: string): void }
  | { value: 'iso'; set(args: A, value: FlagValueKinds['iso'], flag: string): void }
  | { value: 'list'; set(args: A, value: FlagValueKinds['list'], flag: string): void }
  /** `count` words after the flag, each judged as a single value is; a missing one fails with `missing(flag)`. */
  | { value: 'words'; count: number; missing(flag: string): string; set(args: A, words: string[], flag: string): void };

/** What one flag (or a set of aliases for it) does. */
export type FlagRule<A> =
  | ValueRule<A>
  /** A flag with no value. */
  | { toggle(args: A, flag: string): void };

/** The flags a CLI knows: each entry names the flag, and any aliases, that share one rule. */
export type FlagSpec<A> = ReadonlyArray<{ flags: string | readonly string[] } & FlagRule<A>>;

export interface FlagOptions<A> {
  /** The args before any flag is read (the defaults). */
  init(): A;
  /** Whether '' counts as a value (false: it is a missing value). */
  allowEmptyValue: boolean;
  /** Whether a value may start with `--` (false, the default: that is the next flag, so the value is missing). */
  allowFlagValue?: boolean;
  /** The error text for a flag the spec does not list (default `unknown flag: X`). */
  unknown?(flag: string): string;
  /** The error text for a flag whose value is missing (default `X needs a value`). */
  needsValue?(flag: string): string;
  /** Receives an argv word that does not start with `-`; without it such a word is an unknown flag. */
  positional?(args: A, word: string): void;
  /** What a 'path' value resolves against (default: the process cwd). */
  cwd?: string;
}

/**
 * Reads `argv` against `spec` into the caller's args. Values are parsed as they are met, so the
 * first bad flag, in argv order, is the error. Throws Error(opts.unknown(flag)) for a flag the
 * spec does not list and Error(opts.needsValue(flag)) for a value flag whose value is missing.
 */
export function parseFlags<A>(argv: readonly string[], spec: FlagSpec<A>, opts: FlagOptions<A>): A {
  const rules = new Map<string, FlagRule<A>>();
  for (const entry of spec) {
    for (const flag of typeof entry.flags === 'string' ? [entry.flags] : entry.flags) rules.set(flag, entry);
  }
  const args = opts.init();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const rule = rules.get(flag);
    if (!rule) {
      if (opts.positional && !flag.startsWith('-')) {
        opts.positional(args, flag);
        continue;
      }
      throw new Error(opts.unknown ? opts.unknown(flag) : `unknown flag: ${flag}`);
    }
    if ('toggle' in rule) {
      rule.toggle(args, flag);
      continue;
    }
    const count = rule.value === 'words' ? rule.count : 1;
    const words: string[] = [];
    for (let k = 0; k < count; k += 1) {
      const word = argv[i + 1 + k];
      const missing =
        word === undefined || (word === '' && !opts.allowEmptyValue) || (word.startsWith('--') && !opts.allowFlagValue);
      if (missing) throw new Error(rule.value === 'words' ? rule.missing(flag) : (opts.needsValue?.(flag) ?? `${flag} needs a value`));
      words.push(word);
    }
    i += count;
    switch (rule.value) {
      case 'words': rule.set(args, words, flag); break;
      case 'string': rule.set(args, words[0], flag); break;
      case 'path': rule.set(args, path.resolve(opts.cwd ?? process.cwd(), words[0]), flag); break;
      case 'leagues': rule.set(args, parseLeaguesFlag(words[0], flag), flag); break;
      case 'iso': rule.set(args, parseFetchedAtFlag(words[0], flag), flag); break;
      case 'list': rule.set(args, words[0].split(',').map((s) => s.trim()).filter(Boolean), flag); break;
    }
  }
  return args;
}
