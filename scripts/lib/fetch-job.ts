/**
 * The scoped-fetch kernel: what scripts/fetch-rosters.ts, scripts/fetch-player-stats.ts and
 * scripts/fetch-jv.ts do alike around their own source reads. lib/pipeline/fetch-scope.ts holds
 * the pure rules (which teams a run covers, the row-by-row salvage of the previous file, the
 * per-league summary, the exit code); this module is the I/O the three wrap around them: the
 * shared flags, the previous file on disk, the season-window guard, the capture directory, the
 * console report and the write. Each script keeps its own source fetch and parse, its own
 * per-team report line and its own closing line, and its own `builtBy` and NOTES literals
 * (committed data/*.json records them byte for byte).
 *
 * Every line printed here is the scripts' own wording; where they differ (`live pages` vs `live
 * responses`, JV's refusal without the fix-or-remove hint, the captures that get a final
 * newline) the caller says which.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ZodType } from 'zod';

import { type FlagSpec, parseFlags } from '@/lib/cli/flags';
import type { LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import {
  type DroppedRow,
  describePrevious,
  formatLeagueSummary,
  inScope,
  type LeagueRunSummary,
  type PreviousFile,
  type PreviousRows,
  readPreviousFile,
  runExitCode,
  runTotals,
  summarizeByLeague,
  teamsInScope,
} from '@/lib/pipeline/fetch-scope';
import { inSeasonWindow, outOfSeasonLine } from '@/lib/pipeline/season-window';
import { formatIssues } from '@/lib/schema/primitives';
import { localDateKey } from '@/lib/shared/dates';
import { stableStringify } from '@/lib/shared/stable-json';

/** A path as the scripts print it: relative to the cwd. */
const rel = (file: string) => path.relative(process.cwd(), file);

// ---------------------------------------------------------------- flags

/** The args every scoped fetch takes; a script's own Args extends these. */
export interface ScopedFetchArgs {
  fixtures: string | null;
  capture: string | null;
  leagues: LeagueId[] | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
}

/** The defaults of the shared flags: live, every league, writing data/<file> under the cwd. */
export function scopedFetchDefaults(file: string): ScopedFetchArgs {
  return {
    fixtures: null,
    capture: null,
    leagues: null,
    out: path.join(process.cwd(), 'data', file),
    dryRun: false,
    fetchedAt: null,
  };
}

/**
 * `argv` read against the shared flags (--fixtures, --capture, --leagues, --out, --dry-run,
 * --fetched-at) plus the script's `extra` ones. '' and a `--x` word are never a value (the three
 * scripts' quirk, lib/cli/flags.ts). `--capture` records what the live run reads (`records`: the
 * script's word for it), so it cannot be combined with `--fixtures`.
 */
export function parseScopedArgs<A extends ScopedFetchArgs>(
  argv: readonly string[],
  opts: { init(): A; extra?: FlagSpec<A>; records: 'live pages' | 'live responses' },
): A {
  const shared: FlagSpec<A> = [
    { flags: '--fixtures', value: 'path', set: (a, v) => { a.fixtures = v; } },
    { flags: '--capture', value: 'path', set: (a, v) => { a.capture = v; } },
    { flags: '--leagues', value: 'leagues', set: (a, v) => { a.leagues = v; } },
    { flags: '--out', value: 'path', set: (a, v) => { a.out = v; } },
    { flags: '--dry-run', toggle: (a) => { a.dryRun = true; } },
    { flags: '--fetched-at', value: 'iso', set: (a, v) => { a.fetchedAt = v; } },
  ];
  const args = parseFlags(argv, [...shared, ...(opts.extra ?? [])], { init: opts.init, allowEmptyValue: false });
  if (args.fixtures && args.capture) throw new Error(`--capture records ${opts.records}; it cannot be combined with --fixtures`);
  return args;
}

// ---------------------------------------------------------------- the previous file

/**
 * The previous file at `out`, if it exists, salvaged row by row (lib/pipeline/fetch-scope.ts
 * readPreviousFile): its valid rows of this season are what a failed or out-of-scope team keeps. A
 * file written before every team was in the registry (the 15 SCVAL teams) still counts: the teams
 * it lacks are simply pending. null when there is no file.
 *
 * The describePrevious lines (every row not kept, by name) go to stderr at once, unless
 * `deferWarnings`: scripts/fetch-jv.ts first re-reads the rows against its JV season id and logs
 * them together with its game lists' salvage. Nothing is logged for an unreadable file: the caller
 * refuses the run (refuseUnreadable).
 */
export function loadPreviousFile<Row extends { slug: string }, Whole>(
  out: string,
  opts: { season: string; row: ZodType<Row>; file: ZodType<Whole>; keepJson?: boolean; deferWarnings?: boolean },
): PreviousFile<Row, Whole> | null {
  if (!existsSync(out)) return null;
  const { deferWarnings, ...read } = opts;
  const previous = readPreviousFile(readFileSync(out, 'utf8'), read);
  if (previous.readable && !deferWarnings) {
    for (const line of describePrevious(previous, rel(out))) console.warn(line);
  }
  return previous;
}

/**
 * A previous file that is not JSON, or holds no teams[]: nothing in it can be told apart from a
 * wipe, so the run writes nothing and fails. Returns the exit code (1). `hint: false` drops the
 * `: fix or remove it, then re-run.` tail (fetch-jv's wording).
 */
export function refuseUnreadable(out: string, reason: string, opts: { hint?: boolean } = {}): 1 {
  const tail = opts.hint === false ? '.' : ': fix or remove it, then re-run.';
  console.error(`FAILED: the previous ${rel(out)} cannot be read: ${reason}. Nothing written${tail}`);
  return 1;
}

// ---------------------------------------------------------------- the run

/**
 * The pipeline's own season guard (lib/pipeline/season-window.ts), on the date of `fetchedAt`:
 * true, after printing why, when the run must fetch and write nothing; `force` overrides it.
 */
export function outOfSeason(fetchedAt: string, force: boolean): boolean {
  const today = localDateKey(fetchedAt);
  if (force || inSeasonWindow(today)) return false;
  console.log(outOfSeasonLine(today));
  return true;
}

/** Where a live run saves what it read (`--capture`); a no-op without one. */
export interface Capture {
  /** Saves `body` as <dir>/<name>; `ensureNewline` appends a final newline the body lacks. */
  save(name: string, body: string, opts: { ensureNewline: boolean }): void;
}

/** The capture directory, created now; --dry-run writes nothing, --capture included. */
export function openCapture(dir: string | null, dryRun: boolean): Capture {
  const capture = dryRun ? null : dir;
  if (capture) mkdirSync(capture, { recursive: true });
  return {
    save(name, body, { ensureNewline }) {
      if (!capture) return;
      writeFileSync(path.join(capture, name), ensureNewline && !body.endsWith('\n') ? `${body}\n` : body, 'utf8');
    },
  };
}

/**
 * The run's first line: `<name>: offline, from <dir>`, or `<name>: <what the live run reads>`
 * (`what`, given the teams in scope) and the leagues it is narrowed to.
 */
export function logHeader(
  name: string,
  opts: { fixtures: string | null; leagues: readonly LeagueId[] | null; what(covered: readonly Team[]): string },
): void {
  console.log(
    opts.fixtures
      ? `${name}: offline, from ${opts.fixtures}`
      : `${name}: ${opts.what(teamsInScope(opts.leagues))}` + (opts.leagues ? ` (${opts.leagues.join(', ')} only)` : ''),
  );
}

/**
 * One row per registry team, in registry order, for a script whose unit is the team (fetch-rosters,
 * fetch-player-stats). A team of a league outside the run is not fetched: its previous row stays as
 * it was (`pending(team)` when the file held none). A covered team is `fetch`ed; when that throws,
 * the failure is that team's alone: it is logged, and the team keeps its previous row as
 * `carry(prior, team, error)`, or is `errorRow(team, error)` when there is nothing to carry.
 */
export async function runScopedTeams<Row extends { slug: string; status: string }>(opts: {
  teams: readonly Team[];
  leagues: readonly LeagueId[] | null;
  previous: Pick<PreviousRows<Row, unknown>, 'rows'> | null;
  /** droppedTeamSlugs(previous): a failed team among them has nothing to carry, and the log says so. */
  dropped: ReadonlySet<string>;
  pending(team: Team): Row;
  fetch(team: Team): Promise<Row>;
  carry(prior: Row, team: Team, error: string): Row;
  errorRow(team: Team, error: string): Row;
}): Promise<Row[]> {
  return Promise.all(
    opts.teams.map(async (team): Promise<Row> => {
      if (!inScope(team, opts.leagues)) return opts.previous?.rows.get(team.slug) ?? opts.pending(team);
      try {
        return await opts.fetch(team);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(
          `WARN ${team.slug}: ${error}` +
            (opts.dropped.has(team.slug) ? ' (its previous row was dropped: nothing to carry forward)' : ''),
        );
        const prior = opts.previous?.rows.get(team.slug);
        // Any row that was actually read (ok, empty / none, or itself carried forward) is still
        // true: an empty roster stays "MaxPreps lists no players" and a team with no stats "coach
        // entered none", not "could not be read".
        if (prior && prior.status !== 'error' && prior.status !== 'pending') return opts.carry(prior, team, error);
        return opts.errorRow(team, error);
      }
    }),
  );
}

// ---------------------------------------------------------------- the report and the write

/** The assembled file held to its schema: the parsed file, or null after printing why it fails. */
export function validateOrFail<T>(schema: ZodType<T>, file: unknown): T | null {
  const validated = schema.safeParse(file);
  if (validated.success) return validated.data;
  console.error('FAILED: the assembled file does not validate:');
  console.error(formatIssues(validated.error.issues));
  return null;
}

/**
 * One line per team, after a blank line, for a script whose unit is the team (fetch-rosters,
 * fetch-player-stats): its slug and status, the script's `detail`, then the team's warnings and
 * error, if any.
 */
export function logTeamLines<Row extends { slug: string; status: string; warnings: readonly string[]; error: string | null }>(
  teams: readonly Row[],
  detail: (team: Row) => string,
): void {
  console.log('');
  for (const t of teams) {
    console.log(
      `${t.slug.padEnd(17)} ${t.status.padEnd(15)} ${detail(t)}` +
        (t.warnings.length ? ` · ${t.warnings.join('; ')}` : '') +
        (t.error ? ` · ERROR ${t.error}` : ''),
    );
  }
}

/**
 * One line per league (formatLeagueSummary), after a blank line, and what decides the exit code.
 * A covered team that failed decides it, and so does an uncovered one whose previous row was
 * dropped (it is pending now), or a dropped row that names no registry team (runExitCode); a league
 * left out of the run is otherwise not a failure.
 */
export function reportLeagues(
  rows: ReadonlyArray<{ slug: string; status: string }>,
  leagues: readonly LeagueId[] | null,
  dropped: ReadonlySet<string>,
  previousDropped: ReadonlyArray<Pick<DroppedRow, 'team'>>,
): { byLeague: LeagueRunSummary[]; failed: number; lost: number; exitCode: 0 | 1 } {
  const byLeague = summarizeByLeague(rows, leagues, dropped);
  console.log('');
  for (const l of byLeague) console.log(formatLeagueSummary(l));
  return { byLeague, ...runTotals(byLeague), exitCode: runExitCode(byLeague, previousDropped) };
}

/**
 * The run's last word: nothing under --dry-run; nothing when the new file's content key equals
 * the previous file's (it differs only in fetchedAt / error text), so a scheduled refresh has
 * nothing to commit; else `file` written to `out`. `parsed` is the file as its schema read it
 * (validateOrFail), which is what the key compares.
 */
export function finishWrite<W extends { fetchedAt: string }>(opts: {
  out: string;
  file: W;
  parsed: W;
  whole: W | null | undefined;
  contentKey(file: W): string;
  dryRun: boolean;
}): void {
  if (opts.dryRun) {
    console.log('\ndry run: nothing written');
    return;
  }
  // Only a previous file that validates whole (and lost no row) can be left in place.
  const { whole } = opts;
  if (whole && opts.contentKey(whole) === opts.contentKey(opts.parsed)) {
    console.log(`\nno change since ${whole.fetchedAt}: ${rel(opts.out)} left as it was`);
    return;
  }
  mkdirSync(path.dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, stableStringify(opts.file), 'utf8');
  console.log(`\nwrote ${rel(opts.out)}`);
}
