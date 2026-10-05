#!/usr/bin/env tsx
/**
 * Fetch every registry school's JV games into data/jv.json: MaxPreps' JV schedule feed for all 49
 * schools, and si.com's JV team page for the 48 that have one (lib/jv-teams.ts).
 *
 *   pnpm fetch-jv                       live: 49 MaxPreps JSON calls + up to 48 si.com pages
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
 * varsity row does (lib/normalize.ts normalizeGames). si.com pages go through the si.com client's
 * own gate (one at a time, 1 s apart, the browser User-Agent si.com requires). The file keeps what
 * each source said; lib/jv-merge.ts decides what the site shows, MaxPreps first.
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
 * (or is 'pending'). The process exits 1 when any source of a covered team failed, so a scheduler
 * notices; the file is still written.
 *
 * A previous file that is not JSON stops the run (exit 1, nothing written). One that does not
 * validate is ignored with a warning, so nothing is carried from it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { formatLeagueSummary, inScope, parseFetchedAtFlag, parseLeaguesFlag, summarizeByLeague, teamsInScope } from '../lib/fetch-scope';
import { byDateThenId, localDateKey, monthDay } from '../lib/format';
import { mergeJv } from '../lib/jv-merge';
import {
  JvFileSchema,
  countJv,
  jvContentKey,
  type JvFile,
  type JvSbliveRow,
  type JvSourceState,
  type JvTeam,
} from '../lib/jv-schema';
import { jvMaxprepsScheduleUrl, jvSbliveGamesUrl, jvSbliveTeamId } from '../lib/jv-teams';
import { seasonWindowBounds } from '../lib/leagues';
import { normalizeGames } from '../lib/normalize';
import { inSeasonWindow } from '../lib/pipeline/steps/window';
import { formatIssues } from '../lib/schema-primitives';
import { JV_SPORT_SEASON_ID, SEASON_YEAR } from '../lib/season';
import { HttpClient } from '../lib/sources/http';
import { MaxPrepsClient, ScheduleResponseSchema, splitTbaRows, type ScheduleRow } from '../lib/sources/maxpreps';
import { SBLIVE_HTTP_OPTIONS } from '../lib/sources/sblive';
import { combineJvCopies, parseJvTeamGamesPage, type JvSbliveCopy } from '../lib/sources/sblive-jv';
import { stableStringify } from '../lib/stable-json';
import { TEAMS } from '../lib/teams';
import type { Game, LeagueId, Team } from '../lib/types';
import { runCli } from './cli';

interface Args {
  fixtures: string | null;
  capture: string | null;
  leagues: LeagueId[] | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
  force: boolean;
  sblive: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    capture: null,
    leagues: null,
    out: path.join(process.cwd(), 'data', 'jv.json'),
    dryRun: false,
    fetchedAt: null,
    force: false,
    sblive: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--fixtures') out.fixtures = path.resolve(next());
    else if (arg === '--capture') out.capture = path.resolve(next());
    else if (arg === '--leagues') out.leagues = parseLeaguesFlag(next(), arg);
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--fetched-at') out.fetchedAt = parseFetchedAtFlag(next(), arg);
    else if (arg === '--force') out.force = true;
    else if (arg === '--no-sblive') out.sblive = false;
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (out.fixtures && out.capture) throw new Error('--capture records live responses; it cannot be combined with --fixtures');
  return out;
}

const NOTES = [
  'One entry per registry school, all five leagues. games are MaxPreps’ JV contests (the schedule feed read with the JV season id), built exactly as a varsity game is; sblive are si.com’s scored JV finals from each school’s JV team page.',
  'The site shows lib/jv-merge.ts over these two lists: MaxPreps first; si.com fills a score MaxPreps lacks, adds a game MaxPreps does not list, and is noted beside a MaxPreps score it disagrees with.',
  'A si.com JV side is one of ours only by its si.com JV team id (lib/jv-teams.ts), never by name.',
  'JV games are kept apart from varsity: no varsity standings, leaders, ratings or postseason read them, and no JV standings are computed yet.',
  'A source with status carried-forward kept the previous file’s rows after a failed fetch; its own fetchedAt says when those rows were read.',
];

/** The previous file, when it exists and validates; null otherwise. `unreadable` stops the run. */
function loadPrevious(file: string): { previous: JvFile | null; unreadable: string | null } {
  if (!existsSync(file)) return { previous: null, unreadable: null };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (err) {
    return { previous: null, unreadable: `not JSON (${(err as Error).message})` };
  }
  const parsed = JvFileSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`WARN previous ${path.relative(process.cwd(), file)} does not validate; nothing is carried from it:`);
    console.warn(formatIssues(parsed.error.issues));
    return { previous: null, unreadable: null };
  }
  if (parsed.data.season !== SEASON_YEAR || parsed.data.sportSeasonId !== JV_SPORT_SEASON_ID) {
    console.warn(`WARN previous file is season ${parsed.data.season}; nothing is carried from it`);
    return { previous: null, unreadable: null };
  }
  return { previous: parsed.data, unreadable: null };
}

/** A schedule body → its rows, with MaxPreps' routing guard: a non-empty feed must contain the school. */
function parseSchedule(body: string, team: Team): ScheduleRow[] {
  const rows = ScheduleResponseSchema.parse(JSON.parse(body) as unknown).data;
  if (rows.length > 0 && !rows.some((r) => r.contest.teams.some((t) => t.teamId === team.id))) {
    throw new Error(`JV feed for ${team.id} contains no row for that teamId`);
  }
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
  if (!args.force && !inSeasonWindow(today)) {
    const { start, end } = seasonWindowBounds();
    console.log(
      `out of season: ${today} is outside ${monthDay(start)} – ${monthDay(end)} Pacific. ` +
        'Nothing fetched, nothing written. Re-run with --force to override.',
    );
    return 0;
  }
  const { previous, unreadable } = loadPrevious(args.out);
  if (unreadable) {
    console.error(`FAILED: the previous ${path.relative(process.cwd(), args.out)} cannot be read: ${unreadable}. Nothing written.`);
    return 1;
  }
  const priorTeam = new Map(previous?.teams.map((t) => [t.slug, t]) ?? []);

  const maxpreps = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });
  const sblive = new HttpClient({ ...SBLIVE_HTTP_OPTIONS, onLog: (l) => console.log(`  ${l}`) });
  const capture = args.dryRun ? null : args.capture;
  if (capture) mkdirSync(capture, { recursive: true });
  const save = (name: string, body: string) => {
    if (capture) writeFileSync(path.join(capture, name), body.endsWith('\n') ? body : `${body}\n`, 'utf8');
  };
  const read = (name: string) => readFileSync(path.join(args.fixtures as string, name), 'utf8');

  const covered = teamsInScope(args.leagues);
  console.log(
    args.fixtures
      ? `fetch-jv: offline, from ${args.fixtures}`
      : `fetch-jv: ${covered.length} MaxPreps JV feeds` +
          (args.sblive ? ` + ${covered.filter((t) => jvSbliveGamesUrl(t.slug)).length} si.com JV pages` : ', si.com skipped') +
          (args.leagues ? ` (${args.leagues.join(', ')} only)` : ''),
  );

  // ---- MaxPreps: one JV schedule feed per covered school.
  const mpRows: ScheduleRow[] = [];
  const deleted = new Set<string>();
  const mpState = new Map<string, JvSourceState>();
  await Promise.all(
    covered.map(async (team) => {
      const prior = priorTeam.get(team.slug);
      const had = previous?.games.filter((g) => involves(g, team.slug)).length ?? 0;
      try {
        const url = maxpreps.scheduleUrl(team.id, JV_SPORT_SEASON_ID);
        const body = args.fixtures ? read(`jv-sched-${team.slug}.json`) : (await maxpreps.text(url, 'application/json')).data;
        if (!args.fixtures) save(`jv-sched-${team.slug}.json`, body);
        const split = splitTbaRows(parseSchedule(body, team));
        const live = split.rows.filter((r) => r.calculatedFields.contestState !== 1);
        for (const r of split.rows) if (r.calculatedFields.contestState === 1) deleted.add(r.contest.contestId);
        // The varsity rule: an empty answer for a school we hold games for is a blip, not a wipe.
        if (live.length === 0 && had > 0) throw new Error(`JV feed returned no games but the previous file has ${had}`);
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
  const norm = normalizeGames(mpRows, { fetchedAt });
  for (const w of norm.warnings) console.warn(`WARN ${w}`);
  const fresh = new Set(norm.games.map((g) => g.contestId));
  const notRead = TEAMS.filter((t) => mpState.get(t.slug)?.status !== 'ok').map((t) => t.slug);
  const carried = (previous?.games ?? []).filter(
    (g) => !fresh.has(g.contestId) && !deleted.has(g.contestId) && notRead.some((slug) => involves(g, slug)),
  );
  const games = [...norm.games, ...carried].sort(byDateThenId);

  // ---- si.com rows: this run's pages, plus the previous rows of every page not read.
  const freshRows = combineJvCopies(copies);
  const freshIds = new Set(freshRows.map((r) => r.sbliveGameId));
  const sbNotRead = new Set(TEAMS.filter((t) => sbState.get(t.slug)?.status !== 'ok').map((t) => t.slug));
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
  const validated = JvFileSchema.safeParse(file);
  if (!validated.success) {
    console.error('FAILED: the assembled file does not validate:');
    console.error(formatIssues(validated.error.issues));
    return 1;
  }

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
  const byLeague = summarizeByLeague(teams.map((t) => ({ slug: t.slug, status: statusOf(t) })), args.leagues);
  console.log('');
  for (const l of byLeague) console.log(formatLeagueSummary(l));
  const c = file.counts;
  console.log(
    `\n${c.games} MaxPreps JV games (${c.finals} final) for ${c.teamsWithGames} of ${c.teams} schools · ` +
      `${c.sbliveRows} si.com JV finals · si.com filled ${merged.filled.length}, added ${merged.added.length}, ` +
      `differs on ${merged.differs.length} · ${carried.length} games and ${carriedRows.length} si.com rows carried forward`,
  );
  const exitCode = byLeague.some((l) => l.failed > 0) ? 1 : 0;

  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return exitCode;
  }
  if (previous && jvContentKey(previous) === jvContentKey(validated.data)) {
    console.log(`\nno change since ${previous.fetchedAt}: ${path.relative(process.cwd(), args.out)} left as it was`);
    return exitCode;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(file), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return exitCode;
}

runCli(main);
