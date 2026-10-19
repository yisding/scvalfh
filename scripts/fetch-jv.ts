#!/usr/bin/env tsx
/**
 * Fetch every registry school's JV games into data/jv.json: MaxPreps' JV schedule feed for all 102
 * schools, and si.com's JV team page for the 101 that have one (lib/registry/jv-teams.ts).
 *
 *   pnpm fetch-jv                       live: 102 MaxPreps JSON calls + up to 101 si.com pages
 *   pnpm fetch-jv --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-jv --no-sblive           MaxPreps only; si.com rows are carried from the previous file
 *   pnpm fetch-jv --fixtures <dir>      offline: read jv-sched-<slug>.json and jv-sblive-<slug>.html captures
 *   pnpm fetch-jv --capture <dir>       live, and save each response under those names in <dir>
 *   pnpm fetch-jv --out <path>          write somewhere else
 *   pnpm fetch-jv --dry-run             parse and report, write nothing (captures included)
 *   pnpm fetch-jv --fetched-at <iso>    pin the stamp (reproducible fixture builds)
 *   pnpm fetch-jv --force               run even outside the Aug 1 – Nov 30 season window
 *
 * The MaxPreps call is the varsity pipeline's own schedule-calculated read with the JV season id
 * (JV_SPORT_SEASON_ID) and the school's registry id, through the MaxPreps client's budget
 * (concurrency <= 3, 500 ms between request starts); each JV row becomes a Game exactly as a
 * varsity row does (lib/pipeline/reconcile/normalize.ts normalizeGames), except that no JV game is read as a shootout
 * win (`level: 'jv'`: the sections' shootout rules are varsity rules). si.com pages go through the si.com client's
 * own gate (one at a time, 1 s apart, the browser User-Agent si.com requires). The file keeps what
 * each source said; lib/engine/jv/merge.ts decides what the site shows, MaxPreps first.
 *
 * .github/workflows/update-data.yml runs this after `pnpm fetch-data` and `pnpm fetch-player-stats`,
 * twice a day in season, and a failure here never costs the day's snapshot. The guards are the
 * player-stats script's: outside the season window nothing is fetched or written, and a file that
 * differs from the previous one only in its `fetchedAt` stamps is not rewritten (jvContentKey).
 *
 * Failures are scoped to the team and the source. A MaxPreps feed that fails (or comes back empty
 * for a school the previous file holds JV games for) keeps that school's previous games, status
 * 'carried-forward' ('error' when there is nothing to carry); a si.com page that fails keeps the
 * previous si.com rows its page had listed. A league outside `--leagues` keeps its previous rows
 * (or is 'pending'). The process exits 1 when any source of a covered team failed, or when a team
 * the run did not cover lost its previous row (below), so a scheduler notices; the file is still
 * written.
 *
 * The previous file is salvaged row by row, as fetch-rosters and fetch-player-stats salvage theirs
 * (lib/pipeline/fetch-scope.ts readPreviousFile): each team row, each game and each si.com row is held to its
 * own schema, and one that fails costs only itself, named in the log. The whole-file schema fails
 * whenever the registry grows (it wants one row per registry team, in registry order), and before
 * this salvage a `--leagues` run over such a file carried nothing: every team outside the run went
 * to 'pending' and lost its games. A team outside the run whose own row is dropped is 'pending' and
 * its games are not carried (the run exits 1, as the other two scripts do). A file of another season
 * or JV season id keeps nothing. Only a previous file that is not JSON, or holds no teams[] array,
 * stops the run (exit 1, nothing written), since nothing in it can be told apart from a wipe.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ZodType } from 'zod';

import type { FlagSpec } from '@/lib/cli/flags';
import { INDEPENDENT_LEAGUES, LEAGUES_PROPER } from '@/lib/config/leagues';
import { JV_SPORT_SEASON_ID, SEASON_YEAR } from '@/lib/config/season';
import { mergeJv } from '@/lib/engine/jv/merge';
import {
  describePrevious,
  droppedTeamSlugs,
  inScope,
  salvageRows,
  teamsInScope,
  type PreviousRows,
} from '@/lib/pipeline/fetch-scope';
import type { Game } from '@/lib/model/game';
import type { Team } from '@/lib/model/team';
import { normalizeGames } from '@/lib/pipeline/reconcile/normalize';
import { jvMaxprepsScheduleUrl, jvSbliveGamesUrl, jvSbliveTeamId } from '@/lib/registry/jv-teams';
import { TEAMS } from '@/lib/registry/teams';
import {
  type JvFile, JvFileSchema, JvGameSchema, type JvSbliveRow, JvSbliveRowSchema, type JvSourceState,
  type JvTeam, JvTeamSchema, countJv, jvContentKey,
} from '@/lib/schema/jv';
import { localDateKey } from '@/lib/shared/dates';
import { byDateThenId } from '@/lib/shared/game';
import { HttpClient } from '@/lib/sources/http/client';
import { MaxPrepsClient } from '@/lib/sources/maxpreps/client';
import { assertFeedHasTeam, emptyFeedBlip, splitTbaRows } from '@/lib/sources/maxpreps/schedule';
import { ScheduleResponseSchema, type ScheduleRow } from '@/lib/sources/maxpreps/schemas';
import { scheduleUrl } from '@/lib/sources/maxpreps/urls';
import { combineJvCopies, parseJvTeamGamesPage, type JvSbliveCopy } from '@/lib/sources/sblive/jv';
import { SBLIVE_HTTP_OPTIONS } from '@/lib/sources/sblive/urls';
import { runCli } from './lib/cli';
import {
  type ScopedFetchArgs,
  finishWrite,
  loadPreviousFile,
  logHeader,
  openCapture,
  outOfSeason,
  parseScopedArgs,
  refuseUnreadable,
  reportLeagues,
  scopedFetchDefaults,
  validateOrFail,
} from './lib/fetch-job';

interface Args extends ScopedFetchArgs {
  force: boolean;
  sblive: boolean;
}

const FLAGS: FlagSpec<Args> = [
  { flags: '--force', toggle: (a) => { a.force = true; } },
  { flags: '--no-sblive', toggle: (a) => { a.sblive = false; } },
];

function parseArgs(argv: readonly string[]): Args {
  return parseScopedArgs(argv, {
    init: () => ({ ...scopedFetchDefaults('jv.json'), force: false, sblive: true }),
    extra: FLAGS,
    records: 'live responses',
  });
}

const NOTES = [
  `One entry per registry school, all ${LEAGUES_PROPER.length} leagues and the ${INDEPENDENT_LEAGUES.map((l) => l.name).join(', ')}. games are MaxPreps’ JV contests (the schedule feed read with the JV season id), built exactly as a varsity game is; sblive are si.com’s scored JV finals from each school’s JV team page.`,
  'The site shows lib/jv-merge.ts over these two lists: MaxPreps first; si.com fills a score MaxPreps lacks, adds a game MaxPreps does not list, and is noted beside a MaxPreps score it disagrees with.',
  'A si.com JV side is one of ours only by its si.com JV team id (lib/jv-teams.ts), never by name.',
  'JV games are kept apart from varsity: no varsity standings, leaders, ratings or postseason read them. games are stored unclassified; lib/jv-standings.ts decides at load which JV table each counts for, from its varsity counterpart.',
  'A source with status carried-forward kept the previous file’s rows after a failed fetch; its own fetchedAt says when those rows were read.',
];

/** What a run may take from the previous file: its team rows (PreviousRows), games and si.com rows. */
interface PreviousJv extends PreviousRows<JvTeam, JvFile> {
  games: Game[];
  sblive: JvSbliveRow[];
}

/**
 * One list of the previous file salvaged entry by entry: an entry that fails `schema` on its own, or
 * whose id two entries claim, is dropped and named in `log`; the rest are kept in file order.
 */
function salvageList<T>(
  list: unknown,
  schema: ZodType<T>,
  idOf: (row: T) => string,
  label: string,
  log: string[],
): T[] {
  if (!Array.isArray(list)) {
    log.push(`WARN previous ${label}: not a list; nothing is carried from it`);
    return [];
  }
  const salvaged = salvageRows(list, schema, idOf, { duplicatesAmong: 'valid' });
  for (const { index, reason } of salvaged.invalid) {
    log.push(`WARN previous ${label}[${index}] does not validate and is dropped: ${reason}`);
  }
  for (const { id, n } of salvaged.duplicates) log.push(`WARN previous ${label}: ${n} entries claim ${id}; none is kept`);
  return salvaged.kept.map(({ row }) => row);
}

/**
 * The previous file, salvaged (see the header): null when there is none, `unreadable` when the run
 * must stop. The log lines name every row, game and si.com row not kept.
 */
function loadPrevious(file: string): { previous: PreviousJv | null; unreadable: string | null; log: string[] } {
  const read = loadPreviousFile(file, {
    season: SEASON_YEAR,
    row: JvTeamSchema,
    file: JvFileSchema,
    keepJson: true,
    deferWarnings: true,
  });
  if (read === null) return { previous: null, unreadable: null, log: [] };
  if (!read.readable) return { previous: null, unreadable: read.reason, log: [] };
  const json = read.json as Record<string, unknown>;
  const label = path.relative(process.cwd(), file);
  // This season's year with another JV season id is another season's games, as readPreviousFile treats
  // another year: every row is ignored and named.
  const rows: PreviousRows<JvTeam, JvFile> =
    read.otherSeason === null && json.sportSeasonId !== JV_SPORT_SEASON_ID
      ? {
          rows: new Map(),
          dropped: [
            ...read.dropped,
            ...[...read.rows.keys()].map((slug) => ({
              slug,
              team: slug,
              reason: `JV season id ${String(json.sportSeasonId)}, not ${JV_SPORT_SEASON_ID}`,
            })),
          ],
          otherSeason: `${String(json.season)} (JV season id ${String(json.sportSeasonId)})`,
          whole: null,
          problems: [],
        }
      : read;
  const log = describePrevious(rows, label);
  if (rows.otherSeason !== null) return { previous: { ...rows, games: [], sblive: [] }, unreadable: null, log };
  const games = salvageList(json.games, JvGameSchema, (g) => g.contestId, `${label} games`, log);
  const sblive = salvageList(json.sblive, JvSbliveRowSchema, (r) => r.sbliveGameId, `${label} sblive`, log);
  return { previous: { ...rows, games, sblive }, unreadable: null, log };
}

/** A schedule body → its rows, with MaxPreps' routing guard: a non-empty feed must contain the school. */
function parseSchedule(body: string, team: Team): ScheduleRow[] {
  const rows = ScheduleResponseSchema.parse(JSON.parse(body) as unknown).data;
  assertFeedHasTeam(rows, team.id, { message: `JV feed for ${team.id} contains no row for that teamId` });
  return rows;
}

const ok = (rowCount: number, fetchedAt: string): JvSourceState => ({ status: 'ok', rowCount, fetchedAt, error: null });

function failed(prior: JvSourceState | undefined, error: string, canCarry: boolean): JvSourceState {
  if (canCarry && prior && (prior.status === 'ok' || prior.status === 'carried-forward')) {
    return { status: 'carried-forward', rowCount: prior.rowCount, fetchedAt: prior.fetchedAt, error };
  }
  return { status: 'error', rowCount: null, fetchedAt: null, error };
}

const PENDING: JvSourceState = { status: 'pending', rowCount: null, fetchedAt: null, error: null };
const UNAVAILABLE: JvSourceState = { status: 'unavailable', rowCount: null, fetchedAt: null, error: null };

const involves = (g: Pick<Game, 'home' | 'away'>, slug: string) => g.home.slug === slug || g.away.slug === slug;

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const today = localDateKey(fetchedAt);
  if (outOfSeason(fetchedAt, args.force)) return 0;
  const { previous, unreadable, log } = loadPrevious(args.out);
  if (unreadable) return refuseUnreadable(args.out, unreadable, { hint: false });
  for (const line of log) console.warn(line);
  const priorTeam: ReadonlyMap<string, JvTeam> = previous?.rows ?? new Map();
  // Registry teams whose previous row was dropped: nothing of theirs is carried, and one outside the
  // run is 'pending' and fails the run (summarizeByLeague / runExitCode).
  const dropped = droppedTeamSlugs(previous);

  const maxpreps = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });
  const sblive = new HttpClient({ ...SBLIVE_HTTP_OPTIONS, onLog: (l) => console.log(`  ${l}`) });
  const capture = openCapture(args.capture, args.dryRun);
  const save = (name: string, body: string) => capture.save(name, body, { ensureNewline: true });
  const read = (name: string) => readFileSync(path.join(args.fixtures as string, name), 'utf8');

  const covered = teamsInScope(args.leagues);
  logHeader('fetch-jv', {
    fixtures: args.fixtures,
    leagues: args.leagues,
    what: () =>
      `${covered.length} MaxPreps JV feeds` +
      (args.sblive ? ` + ${covered.filter((t) => jvSbliveGamesUrl(t.slug)).length} si.com JV pages` : ', si.com skipped'),
  });

  // ---- MaxPreps: one JV schedule feed per covered school.
  const mpRows: ScheduleRow[] = [];
  const deleted = new Set<string>();
  const mpState = new Map<string, JvSourceState>();
  await Promise.all(
    covered.map(async (team) => {
      const prior = priorTeam.get(team.slug);
      const had = previous?.games.filter((g) => involves(g, team.slug)).length ?? 0;
      try {
        const url = scheduleUrl(team.id, JV_SPORT_SEASON_ID);
        const body = args.fixtures ? read(`jv-sched-${team.slug}.json`) : (await maxpreps.text(url, 'application/json')).data;
        if (!args.fixtures) save(`jv-sched-${team.slug}.json`, body);
        const split = splitTbaRows(parseSchedule(body, team));
        const live = split.rows.filter((r) => r.calculatedFields.contestState !== 1);
        for (const r of split.rows) if (r.calculatedFields.contestState === 1) deleted.add(r.contest.contestId);
        // The varsity rule: an empty answer for a school we hold games for is a blip, not a wipe.
        emptyFeedBlip(live, had > 0, `JV feed returned no games but the previous file has ${had}`);
        mpRows.push(...split.rows);
        mpState.set(team.slug, ok(live.length, fetchedAt));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(`WARN ${team.slug} MaxPreps JV: ${error}`);
        mpState.set(team.slug, failed(prior?.maxpreps, error, had > 0));
      }
    }),
  );

  // ---- si.com: one JV team page per covered school that has one.
  const copies: JvSbliveCopy[] = [];
  const sbState = new Map<string, JvSourceState>();
  for (const team of covered) {
    const url = jvSbliveGamesUrl(team.slug);
    const id = jvSbliveTeamId(team.slug);
    const prior = priorTeam.get(team.slug);
    if (!url || !id) {
      sbState.set(team.slug, UNAVAILABLE);
      continue;
    }
    const hadRows = previous?.sblive.some((r) => r.pages.includes(team.slug)) ?? false;
    if (!args.sblive) {
      sbState.set(team.slug, failed(prior?.sblive, 'si.com not read this run (--no-sblive)', hadRows || prior?.sblive.status === 'ok'));
      continue;
    }
    try {
      const html = args.fixtures ? read(`jv-sblive-${team.slug}.html`) : (await sblive.text(url)).body;
      if (!args.fixtures) save(`jv-sblive-${team.slug}.html`, html);
      const rows = parseJvTeamGamesPage(html, { url, expectedTeamId: id, page: team.slug });
      copies.push(...rows);
      sbState.set(team.slug, ok(rows.length, fetchedAt));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`WARN ${team.slug} si.com JV: ${error}`);
      sbState.set(team.slug, failed(prior?.sblive, error, true));
    }
  }

  // ---- games: this run's feeds, plus the previous games of every school whose feed was not read.
  // level 'jv': the sections' shootout rules are varsity rules (lib/pipeline/reconcile/normalize.ts NormalizeOptions), so
  // a level JV final stays a tie whatever MaxPreps flags, and is never read as a shootout win.
  const norm = normalizeGames(mpRows, { fetchedAt, level: 'jv' });
  for (const w of norm.warnings) console.warn(`WARN ${w}`);
  const fresh = new Set(norm.games.map((g) => g.contestId));
  const notRead = TEAMS.filter((t) => mpState.get(t.slug)?.status !== 'ok' && !dropped.has(t.slug)).map((t) => t.slug);
  const carried = (previous?.games ?? []).filter(
    (g) => !fresh.has(g.contestId) && !deleted.has(g.contestId) && notRead.some((slug) => involves(g, slug)),
  );
  const games = [...norm.games, ...carried].sort(byDateThenId);

  // ---- si.com rows: this run's pages, plus the previous rows of every page not read.
  const freshRows = combineJvCopies(copies);
  const freshIds = new Set(freshRows.map((r) => r.sbliveGameId));
  const sbNotRead = new Set(
    TEAMS.filter((t) => sbState.get(t.slug)?.status !== 'ok' && !dropped.has(t.slug)).map((t) => t.slug),
  );
  const carriedRows: JvSbliveRow[] = (previous?.sblive ?? []).filter(
    (r) => !freshIds.has(r.sbliveGameId) && r.pages.some((p) => sbNotRead.has(p)),
  );
  const sbliveRows = [...freshRows, ...carriedRows].sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.sbliveGameId.localeCompare(b.sbliveGameId),
  );

  const teams: JvTeam[] = TEAMS.map((team) => {
    const prior = priorTeam.get(team.slug);
    const sbliveUrl = jvSbliveGamesUrl(team.slug);
    if (!inScope(team, args.leagues)) {
      return (
        prior ?? {
          slug: team.slug,
          teamId: team.id,
          name: team.name,
          maxprepsScheduleUrl: jvMaxprepsScheduleUrl(team),
          sbliveUrl,
          maxpreps: PENDING,
          sblive: sbliveUrl ? PENDING : UNAVAILABLE,
        }
      );
    }
    return {
      slug: team.slug,
      teamId: team.id,
      name: team.name,
      maxprepsScheduleUrl: jvMaxprepsScheduleUrl(team),
      sbliveUrl,
      maxpreps: mpState.get(team.slug) ?? PENDING,
      sblive: sbState.get(team.slug) ?? (sbliveUrl ? PENDING : UNAVAILABLE),
    };
  });

  const file: JvFile = {
    season: SEASON_YEAR,
    fetchedAt,
    sportSeasonId: JV_SPORT_SEASON_ID,
    source: { builtBy: 'scripts/fetch-jv.ts', notes: NOTES },
    teams,
    games,
    sblive: sbliveRows,
    counts: countJv(teams, games, sbliveRows),
  };
  const validated = validateOrFail(JvFileSchema, file);
  if (!validated) return 1;

  const merged = mergeJv({ games, sblive: sbliveRows, today, fetchedAt });
  console.log('');
  for (const t of teams) {
    const mine = merged.games.filter((g) => involves(g, t.slug));
    console.log(
      `${t.slug.padEnd(21)} MaxPreps ${t.maxpreps.status.padEnd(15)} si.com ${t.sblive.status.padEnd(15)} ` +
        `${String(mine.length).padStart(2)} games · ${mine.filter((g) => g.status === 'final').length} final` +
        (t.maxpreps.error ? ` · MaxPreps: ${t.maxpreps.error}` : '') +
        (t.sblive.error ? ` · si.com: ${t.sblive.error}` : ''),
    );
  }
  // One line per league; a team counts as failed when either source failed.
  const statusOf = (t: JvTeam) =>
    [t.maxpreps.status, t.sblive.status].find((s) => s === 'error' || s === 'carried-forward') ?? t.maxpreps.status;
  const { exitCode } = reportLeagues(
    teams.map((t) => ({ slug: t.slug, status: statusOf(t) })),
    args.leagues,
    dropped,
    previous?.dropped ?? [],
  );
  const c = file.counts;
  console.log(
    `\n${c.games} MaxPreps JV games (${c.finals} final) for ${c.teamsWithGames} of ${c.teams} schools · ` +
      `${c.sbliveRows} si.com JV finals · si.com filled ${merged.filled.length}, added ${merged.added.length}, ` +
      `differs on ${merged.differs.length} · ${carried.length} games and ${carriedRows.length} si.com rows carried forward`,
  );

  finishWrite({ out: args.out, file, parsed: validated, whole: previous?.whole, contentKey: jvContentKey, dryRun: args.dryRun });
  return exitCode;
}

runCli(main);
