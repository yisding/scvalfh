/**
 * What scripts/fetch-rosters.ts, scripts/fetch-player-stats.ts and scripts/fetch-jv.ts share:
 * which registry teams a run covers, and how a run reports its teams league by league. The flag
 * parsers for `--leagues` and `--fetched-at` (lib/cli/flags.ts) are shared with fetch-data too
 * (lib/pipeline/cli.ts parseRunArgs), so all four CLIs read those flags by one rule.
 *
 * Each script walks the whole registry. `--leagues scval,bval` narrows a run to those
 * leagues, exactly as `fetch-data --leagues` does: a team of any other league is not fetched and
 * keeps whatever the previous file held for it (or 'pending' when it held nothing valid). Failures are
 * scoped the same way — each team is its own unit, so one team, or one whole league, failing never
 * stops another league's teams from being read and written; a failed team keeps its own previous
 * rows as 'carried-forward'.
 *
 * The previous file is read row by row (readPreviousFile): a row that does not validate on its own
 * is dropped and named, never silently taken for "no previous file", and a file from another
 * season is ignored as if absent. Only a file that is not JSON at all (or holds no teams[]) stops
 * the run, before anything is written.
 *
 * Pure (no fs, no network), so tests can hold it to that. The I/O the three scripts share around
 * these rules (reading the previous file, the capture directory, the report, the write) is the
 * scoped-fetch kernel, scripts/lib/fetch-job.ts.
 */

import type { ZodType } from 'zod';

import { LEAGUES, getLeague } from '@/lib/config/leagues';
import type { LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { TEAMS, getTeamBySlug } from '@/lib/registry/teams';
import { describeIssues } from '@/lib/schema/primitives';

/** The registry teams a run covers, in registry order: all 102, or those of `leagues`. */
export function teamsInScope(leagues: readonly LeagueId[] | null): readonly Team[] {
  return leagues === null ? TEAMS : TEAMS.filter((t) => leagues.includes(t.league));
}

/** Whether a run over `leagues` (null = every league) fetches this team. */
export function inScope(team: Team, leagues: readonly LeagueId[] | null): boolean {
  return leagues === null || leagues.includes(team.league);
}

// ---------------------------------------------------------------- the previous file

/** A row of the previous file that a run does not keep, and why. */
export interface DroppedRow {
  /** The row's slug, or `teams[<i>]` when it has none. */
  slug: string;
  /**
   * The registry team the row belonged to: its slug when that is a registry slug, else the team
   * whose MaxPreps id the row carries. `null` when neither names one: that team cannot be told
   * apart from a team the file simply lacked, so the run must fail rather than report it kept
   * (runExitCode).
   */
  team: string | null;
  reason: string;
}

/** Which registry team a dropped row belonged to (DroppedRow.team). */
function registryTeamOf(t: unknown, slug: string): string | null {
  if (getTeamBySlug(slug)) return slug;
  const teamId = isRecord(t) && typeof t.teamId === 'string' ? t.teamId : null;
  return (teamId && TEAMS.find((team) => team.id === teamId)?.slug) || null;
}

/** What a run may take from the previous file. */
export interface PreviousRows<Row, Whole> {
  /** Rows that validate on their own (registry slug, id and division, status invariants), by slug. */
  rows: ReadonlyMap<string, Row>;
  /** Every row not kept, named, with why: neither carried forward nor kept for a team out of scope. */
  dropped: DroppedRow[];
  /** The file's season when it is not the run's (`(none)` when it names none): every row was ignored. */
  otherSeason: string | null;
  /** The whole file when it validates as one, is this season's and lost no row: what "no change" is measured against. */
  whole: Whole | null;
  /** File-level problems that cost no row (counts that do not match the rows), for the log. */
  problems: string[];
}

export type PreviousFile<Row, Whole> =
  | ({ readable: true } & PreviousRows<Row, Whole> & {
      /** The parsed file, when readPreviousFile was asked to keep it (`keepJson`). */
      json?: Record<string, unknown>;
    })
  /** Not JSON, or JSON with no teams[] array: nothing can be told apart from a wipe, so the run stops. */
  | { readable: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A row's schema failure as one line: the first three issues, `path: message` joined with '; ' (`(row)`
 * for an empty path). The previous-file salvage here (which the scoped-fetch kernel,
 * scripts/lib/fetch-job.ts loadPreviousFile, runs for all three scripts) and scripts/fetch-jv.ts's
 * game lists report every dropped row this way.
 */
export function describeRowIssues(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
  return describeIssues(issues, { limit: 3, empty: '(row)', separator: '; ' });
}

/** One list entry that fails its row schema, named by its position and (when the mode reads it) its id. */
export interface InvalidRow {
  index: number;
  entry: unknown;
  /** The entry's id; null in 'valid' mode, which only reads the id of a row that validated. */
  id: string | null;
  /** The first three issues (describeRowIssues). */
  reason: string;
}

export interface SalvagedRows<T> {
  /** The rows that validate and that no other entry claims, in list order, each with its id. */
  kept: Array<{ id: string; row: T }>;
  /** Every entry that fails the schema, in list order (also those whose id a duplicate claims). */
  invalid: InvalidRow[];
  /** Every id claimed by more than one entry, in first-seen order, with how many entries claim it. */
  duplicates: Array<{ id: string; n: number }>;
}

/**
 * A list held to a row schema entry by entry, so one stale entry costs that entry only. The
 * entries two rows claim are dropped in both; `duplicatesAmong` says which entries count as claiming:
 *   - 'all': every entry, valid or not, counted by `idOf(entry, index)` on the raw entry (a team row
 *     in the previous rosters / player-stats file: a broken row still holds its team's slug);
 *   - 'valid': only the entries that validated, counted by `idOf(row)` on the parsed row (a game list:
 *     an entry that failed has no trustworthy id).
 * The caller words what it logs from `invalid` and `duplicates`.
 */
export function salvageRows<T>(
  list: readonly unknown[],
  schema: ZodType<T>,
  idOf: (row: T) => string,
  opts: { duplicatesAmong: 'valid' },
): SalvagedRows<T>;
export function salvageRows<T>(
  list: readonly unknown[],
  schema: ZodType<T>,
  idOf: (entry: unknown, index: number) => string,
  opts: { duplicatesAmong: 'all' },
): SalvagedRows<T>;
export function salvageRows<T>(
  list: readonly unknown[],
  schema: ZodType<T>,
  idOf: ((row: T) => string) | ((entry: unknown, index: number) => string),
  opts: { duplicatesAmong: 'all' | 'valid' },
): SalvagedRows<T> {
  const all = opts.duplicatesAmong === 'all';
  const rows: Array<{ id: string; row: T }> = [];
  const invalid: InvalidRow[] = [];
  const times = new Map<string, number>();
  list.forEach((entry, index) => {
    const parsed = schema.safeParse(entry);
    const id = all
      ? (idOf as (entry: unknown, index: number) => string)(entry, index)
      : parsed.success
        ? (idOf as (row: T) => string)(parsed.data)
        : null;
    if (id !== null) times.set(id, (times.get(id) ?? 0) + 1);
    if (parsed.success) rows.push({ id: id as string, row: parsed.data });
    else invalid.push({ index, entry, id, reason: describeRowIssues(parsed.error.issues) });
  });
  const duplicates = [...times].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
  return { kept: rows.filter(({ id }) => times.get(id) === 1), invalid, duplicates };
}

/**
 * The previous rosters / player-stats file, salvaged row by row. Each row is held to the team
 * schema on its own, so one stale row (a team whose division or id changed in the registry, a slug
 * no longer in it, a broken status) costs that team's row only, and a counts total that does not
 * match costs none. A row two entries claim is dropped in both. A file from another season (or
 * naming none) keeps nothing: last season's roster is not this season's, so its teams read as
 * absent. Every dropped row is listed, so the caller can log each by name.
 *
 * `readable: false` only when the text is not JSON or holds no teams[] array: then nothing can be
 * salvaged and writing would wipe every team the run does not cover, so the caller writes nothing.
 */
export function readPreviousFile<Row extends { slug: string }, Whole>(
  text: string,
  opts: { season: string; row: ZodType<Row>; file: ZodType<Whole>; keepJson?: boolean },
): PreviousFile<Row, Whole> {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (err) {
    return { readable: false, reason: `not JSON (${err instanceof Error ? err.message : String(err)})` };
  }
  const teams = isRecord(json) ? json.teams : undefined;
  if (!isRecord(json) || !Array.isArray(teams)) return { readable: false, reason: 'no teams[] array' };
  const slugOf = (t: unknown, i: number) =>
    isRecord(t) && typeof t.slug === 'string' && t.slug ? t.slug : `teams[${i}]`;

  // `keepJson`: the parsed file rides along, for a caller (scripts/fetch-jv.ts) that reads more of it.
  const withJson = opts.keepJson ? { json } : {};

  if (json.season !== opts.season) {
    const season = typeof json.season === 'string' && json.season ? json.season : '(none)';
    return {
      readable: true,
      rows: new Map(),
      dropped: teams.map((t, i) => ({
        slug: slugOf(t, i),
        team: registryTeamOf(t, slugOf(t, i)),
        reason: `season ${season}, not ${opts.season}`,
      })),
      otherSeason: season,
      whole: null,
      problems: [],
      ...withJson,
    };
  }

  const salvaged = salvageRows(teams, opts.row, slugOf, { duplicatesAmong: 'all' });
  const rows = new Map<string, Row>();
  for (const { id, row } of salvaged.kept) rows.set(id, row);
  let dropped: DroppedRow[] = salvaged.invalid.map(({ entry, id, reason }) => ({
    slug: id as string,
    team: registryTeamOf(entry, id as string),
    reason,
  }));
  for (const { id, n } of salvaged.duplicates) {
    dropped = dropped.filter((d) => d.slug !== id);
    dropped.push({ slug: id, team: registryTeamOf(undefined, id), reason: `${n} rows claim this team; none is kept` });
  }

  const problems: string[] = [];
  let whole: Whole | null = null;
  if (dropped.length === 0) {
    const parsed = opts.file.safeParse(json);
    if (parsed.success) whole = parsed.data;
    else problems.push(`does not validate as a whole (${describeRowIssues(parsed.error.issues)}); its rows are kept one by one`);
  }
  return { readable: true, rows, dropped, otherSeason: null, whole, problems, ...withJson };
}

/**
 * The registry teams whose previous row was dropped (DroppedRow.team; a row that names no registry
 * team has no slug to put here): nothing of theirs is carried forward, and one outside the run is
 * 'pending' now (summarizeByLeague's `dropped`). Empty when there is no previous file.
 */
export function droppedTeamSlugs(previous: Pick<PreviousRows<unknown, unknown>, 'dropped'> | null | undefined): Set<string> {
  return new Set(previous?.dropped.flatMap((d) => (d.team ? [d.team] : [])) ?? []);
}

/** The loud log of what readPreviousFile did not keep: one line per dropped row, by name. */
export function describePrevious(previous: PreviousRows<unknown, unknown>, label: string): string[] {
  const lines: string[] = [];
  if (previous.otherSeason !== null) {
    lines.push(
      `WARN previous ${label} is season ${previous.otherSeason}: its ${previous.dropped.length} row(s) are ignored, as if absent ` +
        '(a team this run does not cover is pending, a team that fails is an error)',
    );
  } else if (previous.dropped.length) {
    lines.push(
      `WARN previous ${label}: ${previous.dropped.length} row(s) do not validate and are dropped — not carried forward, not kept:`,
    );
    for (const d of previous.dropped) {
      const who =
        d.team === null ? `${d.slug} (names no registry team; the run fails)` : d.team === d.slug ? d.slug : `${d.slug} (${d.team})`;
      lines.push(`WARN   ${who}: ${d.reason}`);
    }
  }
  for (const p of previous.problems) lines.push(`WARN previous ${label} ${p}`);
  return lines;
}

// ---------------------------------------------------------------- the report

export interface LeagueRunSummary {
  league: LeagueId;
  shortName: string;
  /** Teams of this league in the file. */
  teams: number;
  /** Teams this run did not cover (another league's run): their rows are whatever the file held. */
  outOfScope: number;
  /**
   * Teams this run did not cover whose previous row was dropped (readPreviousFile): they are
   * pending now, NOT kept as they were.
   */
  dropped: string[];
  /** Teams this run covered whose fetch failed (carried-forward or error). */
  failed: number;
  /** Status → count, over the covered teams only. */
  byStatus: Record<string, number>;
}

/**
 * One row per league: how its teams fared this run. `failed` counts only teams the run covered
 * whose status is carried-forward or error; `dropped` only teams it did not cover whose previous
 * row was dropped (`droppedSlugs`, from readPreviousFile). Both decide a script's exit code
 * (runExitCode).
 */
export function summarizeByLeague(
  teams: ReadonlyArray<{ slug: string; status: string }>,
  leagues: readonly LeagueId[] | null,
  droppedSlugs: ReadonlySet<string> = new Set(),
): LeagueRunSummary[] {
  return LEAGUES.map((l) => {
    const mine = teams.filter((t) => getTeamBySlug(t.slug)?.league === l.id);
    const covered = leagues === null || leagues.includes(l.id);
    const byStatus: Record<string, number> = {};
    if (covered) for (const t of mine) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    return {
      league: l.id,
      shortName: getLeague(l.id).shortName,
      teams: mine.length,
      outOfScope: covered ? 0 : mine.length,
      dropped: covered ? [] : mine.filter((t) => droppedSlugs.has(t.slug)).map((t) => t.slug),
      failed: (byStatus['carried-forward'] ?? 0) + (byStatus['error'] ?? 0),
      byStatus,
    };
  });
}

/**
 * 1 when a team the run covered failed, or when a team it did not cover lost its previous row (now
 * pending where the file had rows), or when a dropped row names no registry team at all (by slug
 * or MaxPreps id), so whichever team lost it cannot be shown as kept; else 0.
 */
export function runExitCode(
  byLeague: readonly LeagueRunSummary[],
  dropped: ReadonlyArray<Pick<DroppedRow, 'team'>> = [],
): 0 | 1 {
  return byLeague.some((l) => l.failed > 0 || l.dropped.length > 0) || dropped.some((d) => d.team === null) ? 1 : 0;
}

/**
 * The run's totals for its closing line: `failed` covered teams (carried-forward or error) and
 * `lost` uncovered teams now pending because their previous row was dropped.
 */
export function runTotals(byLeague: readonly LeagueRunSummary[]): { failed: number; lost: number } {
  return {
    failed: byLeague.reduce((n, l) => n + l.failed, 0),
    lost: byLeague.reduce((n, l) => n + l.dropped.length, 0),
  };
}

/**
 * `SCVAL  15 teams · 14 ok · 1 carried-forward` / `BVAL  12 teams · not in this run (kept as they
 * were)`. A team whose previous row was dropped is never counted as kept.
 */
export function formatLeagueSummary(s: LeagueRunSummary): string {
  const head = `${s.shortName.padEnd(5)} ${String(s.teams).padStart(2)} teams`;
  if (s.outOfScope > 0 && s.dropped.length > 0) {
    const kept = s.outOfScope - s.dropped.length;
    return (
      `${head} · not in this run · ${kept ? `${kept} kept as they were · ` : ''}` +
      `${s.dropped.length} pending, previous row dropped (${s.dropped.join(', ')})`
    );
  }
  if (s.outOfScope > 0) return `${head} · not in this run (kept as they were)`;
  const parts = Object.entries(s.byStatus).map(([k, n]) => `${n} ${k}`);
  return `${head} · ${parts.join(' · ') || 'none'}`;
}
