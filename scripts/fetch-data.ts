#!/usr/bin/env tsx
/**
 * The cron entry point (SPEC §5).
 *
 *   pnpm fetch-data                      live: the 20-request MaxPreps sweep + the secondary sources
 *   pnpm fetch-data --fixtures <dir>     offline: read captured responses; all secondary steps skip
 *   pnpm fetch-data --out <path>         write somewhere else (meta goes beside it)
 *   pnpm fetch-data --dry-run            validate and report, write nothing
 *   pnpm fetch-data --fetched-at <iso>   pin the stamp (reproducible test snapshots)
 *   pnpm fetch-data --force              run even outside the Aug 1 – Nov 30 season window
 *   pnpm fetch-data --no-sblive          skip the SBLive score cross-check
 *   pnpm fetch-data --sblive-full        also pull all 15 si.com team pages (whole-season check)
 *   pnpm fetch-data --no-scval           skip the official SCVAL schedule PDFs
 *   pnpm fetch-data --no-ccs             skip the CCS calendar / bracket poll
 *   pnpm fetch-data --no-vnn             skip the VNN school .ics feeds
 *
 * Order and budget (SPEC §5.2): bootstrap and the season assertions run first and a genuine
 * MISMATCH aborts the run so a half-migrated season is never published; a partial run still
 * publishes, carrying forward the previous snapshot's rows for any team whose request failed.
 *
 * Every SECONDARY source is optional and failure-tolerant by construction: a failure becomes a
 * `SourceStatus` row and the run continues. Only the MaxPreps season assertions can abort.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  MaxPrepsClient,
  MaxPrepsEmptyStandingsError,
  MaxPrepsError,
  ScheduleResponseSchema,
  StandingsResponseSchema,
  type ScheduleRow,
  type StandingsRow,
} from '../lib/sources/maxpreps';
import { emptyCrossCheck, reconcile } from '../lib/crosscheck';
import { localDateKey } from '../lib/format';
import { normalizeGames, seasonWindowOf } from '../lib/normalize';
import {
  CcsClient,
  CCS_ICAL_URL,
  ccsPollingOpen,
  confirmKeyDates,
} from '../lib/sources/ccs';
import {
  SCVAL_SCHEDULE_PDFS,
  SCVAL_STANDINGS_INDEX,
  ScvalClient,
  applyOfficialFixtures,
  carryOfficialForward,
  diffMembership,
  hasPdftotext,
} from '../lib/sources/scval-pdf';
import {
  SbliveClient,
  dedupeSbliveGames,
  sbliveScoresUrl,
  sbliveTeamGamesUrl,
  type SbliveGame,
} from '../lib/sources/sblive';
import {
  VNN_SITE_IDS,
  VnnClient,
  applyVnnEvents,
  carryVnnForward,
  vnnIcsUrl,
} from '../lib/sources/vnn-ics';
import {
  ALL_SEASON_ID,
  BOOTSTRAP_URL,
  CCS_BRACKET_URL,
  DIVISIONS,
  LEAGUE_IDS,
  PLAYOFF_FORMAT,
  PLAYOFF_KEY_DATES,
  SEASON_YEAR,
  SPORT_SEASON_ID,
  buildSeason,
  inSeasonWindow,
} from '../lib/season';
import { FETCHABLE_TEAMS, TEAMS, resolveTeam } from '../lib/teams';
import {
  assertFullTable,
  buildCrossCheck,
  computeStandings,
  toReportedRecord,
} from '../lib/standings';
import { parseSnapshot, snapshotContentHash, stableStringify } from '../lib/snapshot-schema';
import type {
  CcsCalendarEvent,
  Division,
  Game,
  OfficialFixture,
  ReportedRecord,
  SbliveCrossCheck,
  Snapshot,
  SourceId,
  SourceStatus,
  TeamId,
} from '../lib/types';

// ---------------------------------------------------------------- args

interface Args {
  fixtures: string | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string;
  force: boolean;
  sblive: boolean;
  sbliveFull: boolean;
  scval: boolean;
  ccs: boolean;
  vnn: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    out: path.join(process.cwd(), 'data', 'snapshot.json'),
    dryRun: false,
    fetchedAt: new Date().toISOString(),
    force: false,
    sblive: true,
    sbliveFull: false,
    scval: true,
    ccs: true,
    vnn: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--fixtures') out.fixtures = path.resolve(next());
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--fetched-at') out.fetchedAt = next();
    else if (arg === '--force') out.force = true;
    else if (arg === '--no-sblive') out.sblive = false;
    else if (arg === '--sblive-full') out.sbliveFull = true;
    else if (arg === '--no-scval') out.scval = false;
    else if (arg === '--no-ccs') out.ccs = false;
    else if (arg === '--no-vnn') out.vnn = false;
    else throw new Error(`unknown flag: ${arg}`);
  }
  return out;
}

/** Trailing window re-examined for corrections and retro-entered results (SPEC §5.4). */
const BACKFILL_DAYS = 14;

function shiftDateKey(dateKey: string, days: number): string {
  const at = new Date(`${dateKey}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- logging

const logLines: string[] = [];
function log(line: string): void {
  logLines.push(line);
  console.log(line);
}
function warn(line: string): void {
  logLines.push(`WARN ${line}`);
  console.warn(`WARN ${line}`);
}

class AbortRun extends Error {}

// ---------------------------------------------------------------- fixtures

interface Fixtures {
  schedules: Map<TeamId, ScheduleRow[]>;
  standings: Map<Division, StandingsRow[]>;
  dir: string;
}

/**
 * Fixture files are identified by their CONTENT, not their filename: a schedule fixture's owner is
 * the one team present in every row, and a standings fixture's division is the division its rows
 * resolve to. That keeps the loader working whatever the captures are called.
 *
 * An EMPTY response is the one shape content alone cannot attribute, and it is also a real
 * upstream answer that the sweep has explicit guards for (a school that has published nothing; a
 * league table that came back with no rows). So an empty capture — and only an empty one — falls
 * back to the naming convention the captures already use: `sched-<slug>.json`, `da.json`,
 * `ec.json`. Without that the offline harness could not reproduce either case at all.
 */
function loadFixtures(dir: string): Fixtures {
  const schedules = new Map<TeamId, ScheduleRow[]>();
  const standings = new Map<Division, StandingsRow[]>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const raw = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as unknown;
    const sched = ScheduleResponseSchema.safeParse(raw);
    if (sched.success && sched.data.data.length === 0) {
      const base = file.replace(/\.json$/, '');
      if (base.startsWith('sched-')) {
        const team = resolveTeam(base.slice('sched-'.length));
        if (team) schedules.set(team.id, []);
        else warn(`fixture ${file}: empty schedule capture for an unknown team`);
      } else if (base === 'da') {
        standings.set('de-anza', []);
      } else if (base === 'ec') {
        standings.set('el-camino', []);
      }
      continue;
    }
    if (sched.success && sched.data.data.length > 0) {
      const rows = sched.data.data;
      let common: string[] = rows[0].contest.teams.map((t) => t.teamId);
      for (const row of rows.slice(1)) {
        const ids = new Set<string>(row.contest.teams.map((t) => t.teamId));
        common = common.filter((id) => ids.has(id));
      }
      const owners = [...new Set(common)];
      if (owners.length !== 1) {
        warn(`fixture ${file}: could not identify one owning team (${owners.length} candidates)`);
        continue;
      }
      schedules.set(owners[0], rows);
      continue;
    }
    const table = StandingsResponseSchema.safeParse(raw);
    if (table.success && table.data.data.length > 0) {
      const counts = new Map<Division, number>();
      for (const row of table.data.data) {
        const team = resolveTeam(row.schoolId) ?? resolveTeam(row.schoolName);
        if (team) counts.set(team.division, (counts.get(team.division) ?? 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!best) {
        warn(`fixture ${file}: standings rows match no known division`);
        continue;
      }
      standings.set(best[0], table.data.data);
    }
  }
  return { schedules, standings, dir };
}

// ---------------------------------------------------------------- previous snapshot

function readPrevious(outPath: string): Snapshot | null {
  try {
    return parseSnapshot(JSON.parse(readFileSync(outPath, 'utf8')) as unknown);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- carry-forward

/**
 * Re-attach the per-game annotations a SECONDARY source adds, taken from the previous snapshot.
 *
 * SPEC §5.3: "Never blank a section because one request failed." A source that produced nothing
 * this run must not take its whole section down with it — losing these would strip the "moved
 * from the official grid" marker off every game, empty the /about cross-check, and erase the
 * venues a school calendar corroborated. A value this run DID produce always wins; carry-forward
 * only ever fills a hole.
 */
function carryGameAnnotations(
  games: readonly Game[],
  previousGames: readonly Game[],
  pick: (prev: Game, next: Game) => Partial<Game> | null,
): { games: Game[]; carried: number } {
  const prevById = new Map(previousGames.map((g) => [g.contestId, g]));
  let carried = 0;
  const out = games.map((game) => {
    const prev = prevById.get(game.contestId);
    if (!prev) return game;
    const patch = pick(prev, game);
    if (!patch) return game;
    carried += 1;
    return { ...game, ...patch };
  });
  return { games: out, carried };
}

// ---------------------------------------------------------------- run

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const fetchedAt = args.fetchedAt;
  const today = localDateKey(fetchedAt);

  // ---- 0. season-window guard. Outside Aug 1 – Nov 30 there is nothing to fetch, so the cron
  //         exits 0 having changed nothing rather than rewriting the snapshot's stamp every day.
  if (!args.force && !inSeasonWindow(today)) {
    console.log(
      `out of season: ${today} is outside Aug 1 – Nov 30 Pacific. ` +
        'Nothing fetched, nothing written. Re-run with --force to override.',
    );
    return 0;
  }

  const offline = args.fixtures !== null;
  const sources: SourceStatus[] = [];
  /**
   * Re-label the rows of a source that produced nothing this run but whose section is being
   * carried forward, so /about says "carried forward", not "current" (SPEC §5.3). A row that
   * SUCCEEDED is never touched.
   */
  const markSourcesStale = (id: SourceId, note: string) => {
    for (const [i, row] of sources.entries()) {
      if (row.id !== id || row.status === 'ok') continue;
      sources[i] = { ...row, status: 'stale', error: row.error ? `${row.error}; ${note}` : note };
    }
  };
  const previous = readPrevious(args.out);
  const client = new MaxPrepsClient({ onLog: (l) => log(`  ${l}`) });
  const fixtures = offline ? loadFixtures(args.fixtures as string) : null;

  log(`fetch-data: ${offline ? `offline (${args.fixtures})` : 'live'} · fetchedAt ${fetchedAt}`);

  // ---- 1. bootstrap + season assertions (SPEC §1.1h, §5.2.1)
  if (offline) {
    sources.push({
      id: 'maxpreps-api',
      label: 'season bootstrap',
      url: BOOTSTRAP_URL,
      status: 'skipped',
      fetchedAt,
    });
  } else {
    try {
      const boot = await client.getBootstrap();
      if (boot.data.sportSeasonId && boot.data.sportSeasonId !== SPORT_SEASON_ID) {
        throw new AbortRun(
          `sportSeasonId changed: page says ${boot.data.sportSeasonId}, we expect ${SPORT_SEASON_ID}`,
        );
      }
      if (boot.data.allSeasonId && boot.data.allSeasonId !== ALL_SEASON_ID) {
        throw new AbortRun(
          `allSeasonId changed: page says ${boot.data.allSeasonId}, we expect ${ALL_SEASON_ID}`,
        );
      }
      sources.push({
        id: 'maxpreps-html',
        label: 'season bootstrap',
        url: BOOTSTRAP_URL,
        status: 'ok',
        httpStatus: boot.meta.httpStatus,
        fetchedAt,
      });
      log(`  bootstrap ok · ssid ${boot.data.sportSeasonId ?? '(absent)'}`);
    } catch (err) {
      if (err instanceof AbortRun) throw err;
      // Not being able to READ the page is not evidence the season changed (SPEC §5.3).
      warn(`bootstrap unreadable: ${(err as Error).message}`);
      sources.push({
        id: 'maxpreps-html',
        label: 'season bootstrap',
        url: BOOTSTRAP_URL,
        status: 'error',
        fetchedAt,
        error: (err as Error).message,
      });
    }

    for (const division of DIVISIONS) {
      const url = client.leagueMetaUrl(LEAGUE_IDS[division]);
      try {
        const meta = await client.getLeagueMeta(LEAGUE_IDS[division]);
        if (meta.data.sportSeasonId !== SPORT_SEASON_ID) {
          throw new AbortRun(
            `${division}: league sportSeasonId is ${meta.data.sportSeasonId}, expected ${SPORT_SEASON_ID}`,
          );
        }
        if (meta.data.year !== SEASON_YEAR) {
          throw new AbortRun(`${division}: league year is ${meta.data.year}, expected ${SEASON_YEAR}`);
        }
        sources.push({
          id: 'maxpreps-api',
          label: `${division} league metadata`,
          url,
          status: 'ok',
          httpStatus: meta.meta.httpStatus,
          fetchedAt,
        });
      } catch (err) {
        if (err instanceof AbortRun) throw err;
        warn(`${division} league metadata unreadable: ${(err as Error).message}`);
        sources.push({
          id: 'maxpreps-api',
          label: `${division} league metadata`,
          url,
          status: 'error',
          httpStatus: err instanceof MaxPrepsError ? err.httpStatus : undefined,
          fetchedAt,
          error: (err as Error).message,
        });
      }
    }
  }

  // ---- 2. reported standings, one per division
  const reported = new Map<TeamId, ReportedRecord>();
  for (const division of DIVISIONS) {
    const url = client.standingsUrl(LEAGUE_IDS[division]);
    try {
      const rows = offline
        ? fixtures?.standings.get(division) ?? null
        : (await client.getStandings(LEAGUE_IDS[division])).data;
      if (!rows) throw new Error('no fixture for this division');
      // SPEC §5.2.1 lists "a league returns 0 rows" with the ssid/year assertions. The live client
      // raises MaxPrepsEmptyStandingsError for it; checking here as well covers the fixture path
      // and keeps the rule in one readable place.
      if (rows.length === 0) {
        throw new AbortRun(`${division}: standings returned 0 rows (SPEC §5.2.1)`);
      }
      let modifiedOn: string | undefined;
      for (const row of rows) {
        const team = resolveTeam(row.schoolId) ?? resolveTeam(row.schoolName);
        if (!team) {
          warn(`${division} standings: unknown school ${row.schoolName} (${row.schoolId})`);
          continue;
        }
        reported.set(team.id, toReportedRecord(row));
        if (!modifiedOn || row.modifiedOn > modifiedOn) modifiedOn = row.modifiedOn;
      }
      sources.push({
        id: 'maxpreps-api',
        label: `${division} reported standings`,
        url,
        status: offline ? 'skipped' : 'ok',
        fetchedAt,
        rowCount: rows.length,
        ...(modifiedOn ? { upstreamModifiedOn: modifiedOn } : {}),
      });
      log(`  standings ${division}: ${rows.length} rows`);
    } catch (err) {
      // SPEC §5.2.1 lists "a league returns 0 rows" with the ssid/year assertions: it aborts the
      // run and keeps the previous snapshot. Swallowing it into a SourceStatus would publish
      // today's computed table cross-checked against YESTERDAY's reported one.
      if (err instanceof AbortRun) throw err;
      if (err instanceof MaxPrepsEmptyStandingsError) {
        throw new AbortRun(`${division}: ${err.message} (SPEC §5.2.1)`);
      }
      warn(`${division} standings failed: ${(err as Error).message}`);
      sources.push({
        id: 'maxpreps-api',
        label: `${division} reported standings`,
        url,
        status: 'error',
        httpStatus: err instanceof MaxPrepsError ? err.httpStatus : undefined,
        fetchedAt,
        error: (err as Error).message,
      });
      // Carry the previous run's reported rows forward so the cross-check survives (SPEC §5.3).
      for (const prev of previous?.standings ?? []) {
        if (prev.division === division && prev.reported) reported.set(prev.teamId, prev.reported);
      }
    }
  }

  // ---- 3. the 15 team schedules — every game, league and non-league (SPEC §5.1)
  //
  // The requests run in parallel but their results land in per-team SLOTS, not in completion
  // order: `sources` is committed to the snapshot, and appending from inside the callbacks made a
  // git diff reorder 15 rows on every run even when nothing about the data had moved.
  const rowSlots: ScheduleRow[][] = FETCHABLE_TEAMS.map(() => []);
  const sourceSlots: SourceStatus[] = new Array<SourceStatus>(FETCHABLE_TEAMS.length);
  const failedTeams: TeamId[] = [];
  const previousGameCount = (teamId: TeamId) =>
    (previous?.games ?? []).filter((g) => g.home.teamId === teamId || g.away.teamId === teamId)
      .length;

  const tasks = FETCHABLE_TEAMS.map(async (team, index) => {
    const url = client.scheduleUrl(team.id);
    try {
      const teamRows = offline
        ? fixtures?.schedules.get(team.id) ?? null
        : (await client.getSchedule(team.id)).data;
      if (!teamRows) throw new Error('no fixture for this team');
      // A 200 with an empty array is a legitimate answer for a school that has published nothing
      // (lib/sources/maxpreps.ts) — but for a team we ALREADY
      // hold games for it is indistinguishable from an upstream blip, and taking it at face value
      // would silently delete that team's non-league games (the ones no other feed carries) and
      // change its overall record with no warning. Treat it as a failure so the carry-forward
      // below restores the rows, and say so.
      if (teamRows.length === 0 && previousGameCount(team.id) > 0) {
        throw new Error(
          `schedule feed returned 0 rows but the previous snapshot has ` +
            `${previousGameCount(team.id)} game(s) for this team`,
        );
      }
      rowSlots[index] = [...teamRows];
      sourceSlots[index] = {
        id: 'maxpreps-api',
        label: `${team.slug} schedule`,
        url,
        status: offline ? 'skipped' : 'ok',
        fetchedAt,
        rowCount: teamRows.length,
      };
    } catch (err) {
      failedTeams.push(team.id);
      warn(`${team.slug} schedule failed: ${(err as Error).message}`);
      sourceSlots[index] = {
        id: 'maxpreps-api',
        label: `${team.slug} schedule`,
        url,
        status: 'stale',
        httpStatus: err instanceof MaxPrepsError ? err.httpStatus : undefined,
        fetchedAt,
        error: (err as Error).message,
      };
    }
  });
  await Promise.all(tasks);
  const rows: ScheduleRow[] = rowSlots.flat();
  sources.push(...sourceSlots);
  failedTeams.sort();

  for (const team of TEAMS) {
    if (team.dataCoverage === 'none') {
      sources.push({
        id: 'maxpreps-api',
        label: `${team.slug} schedule`,
        url: team.external.maxprepsScheduleUrl ?? '',
        status: 'skipped',
        fetchedAt,
        error: 'in the official SCVAL grid but absent from every data source',
      });
    }
  }

  // ---- 4. normalize
  const norm = normalizeGames(rows, { fetchedAt });
  for (const w of norm.warnings) warn(w);
  let games: Game[] = norm.games;

  // Carry forward last-good data for any team whose feed failed this run.
  if (failedTeams.length && previous) {
    const have = new Set(games.map((g) => g.contestId));
    const carried = previous.games.filter(
      (g) =>
        !have.has(g.contestId) &&
        failedTeams.some((id) => g.home.teamId === id || g.away.teamId === id),
    );
    if (carried.length) {
      games = [...games, ...carried].sort((a, b) =>
        a.dateLocal === b.dateLocal
          ? a.contestId.localeCompare(b.contestId)
          : a.dateLocal.localeCompare(b.dateLocal),
      );
      log(`  carried forward ${carried.length} game(s) from the previous snapshot`);
    }
  }

  // ---- 4a. OFFICIAL SCVAL schedule grids (SPEC §1.3)
  let officialFixtures: OfficialFixture[] | undefined;
  let officialStandingsPdfUrl: string | null | undefined;
  /**
   * The divisions whose grid was actually READ this run. Each division is its own PDF and its own
   * request, and each grid holds only its own division's fixtures (verified: 56 rows each, zero
   * cross-division), so this is the unit the carry-forward below works in.
   */
  const officialDivisions = new Set<Division>();
  if (!args.scval) {
    log('  scval: skipped (--no-scval)');
  } else if (offline) {
    for (const division of DIVISIONS) {
      sources.push({
        id: 'scval-pdf',
        label: `${division} official schedule PDF`,
        url: SCVAL_SCHEDULE_PDFS[division],
        status: 'skipped',
        fetchedAt,
        error: 'offline run',
      });
    }
  } else if (!hasPdftotext()) {
    // No poppler-utils ⇒ report and move on. The PDFs are unreadable without it (SPEC §1.3).
    warn('pdftotext (poppler-utils) is not installed — the official SCVAL PDFs were skipped');
    for (const division of DIVISIONS) {
      sources.push({
        id: 'scval-pdf',
        label: `${division} official schedule PDF`,
        url: SCVAL_SCHEDULE_PDFS[division],
        status: 'skipped',
        fetchedAt,
        error: 'pdftotext (poppler-utils) is not on PATH',
      });
    }
  } else {
    const scval = new ScvalClient({ onLog: (l) => log(`  ${l}`) });
    const allFixtures: OfficialFixture[] = [];
    for (const division of DIVISIONS) {
      const url = SCVAL_SCHEDULE_PDFS[division];
      try {
        const res = await scval.getSchedule(division);
        for (const w of res.schedule.warnings) warn(`scval ${division}: ${w}`);
        // (a) membership diff — a WARNING only. Alignment stays the registry's (SPEC §3).
        for (const w of diffMembership(res.schedule).warnings) warn(`scval ${w}`);
        allFixtures.push(...res.schedule.fixtures);
        // Only a grid that yielded rows counts as read: a 200 that parses to nothing is a
        // structural change upstream, and publishing an empty division on the strength of it
        // would be the same silent blanking as a failed request.
        if (res.schedule.fixtures.length) officialDivisions.add(division);
        sources.push({
          id: 'scval-pdf',
          label: `${division} official schedule PDF`,
          url,
          status: 'ok',
          httpStatus: res.httpStatus,
          fetchedAt,
          rowCount: res.schedule.fixtures.length,
        });
        log(
          `  scval ${division}: ${res.schedule.fixtures.length} official fixtures, ` +
            `${res.schedule.officialTeamNames.length} teams, crossover ${res.schedule.crossoverDate ?? 'n/a'}`,
        );
      } catch (err) {
        warn(`scval ${division} schedule PDF failed: ${(err as Error).message}`);
        sources.push({
          id: 'scval-pdf',
          label: `${division} official schedule PDF`,
          url,
          status: 'error',
          fetchedAt,
          error: (err as Error).message,
        });
      }
    }

    if (allFixtures.length) {
      // (b) corroborate isLeague and attach game.official.
      const applied = applyOfficialFixtures(games, allFixtures);
      games = applied.games;
      for (const w of applied.warnings) warn(`scval fixture: ${w}`);
      for (const d of applied.leagueDisagreements) warn(`scval league flag: ${d}`);
      officialFixtures = applied.unmatched;
      log(
        `  scval: ${applied.matched}/${allFixtures.length} official fixtures matched a contest; ` +
          `${applied.unmatched.length} unmatched (published as officialFixtures)`,
      );
    }

    // Poll the standings index for a 2026-27 field hockey standings PDF (there is none yet).
    try {
      const idx = await scval.getStandingsIndex();
      officialStandingsPdfUrl = idx.link?.url ?? null;
      sources.push({
        id: 'scval-pdf',
        label: 'scval standings index',
        url: SCVAL_STANDINGS_INDEX,
        status: 'ok',
        httpStatus: idx.httpStatus,
        fetchedAt,
        rowCount: idx.links.length,
      });
      log(
        `  scval standings index: ${idx.links.length} field-hockey link(s); 26-27 standings ` +
          `${idx.link ? idx.link.href : 'not published yet'}`,
      );
    } catch (err) {
      warn(`scval standings index failed: ${(err as Error).message}`);
      sources.push({
        id: 'scval-pdf',
        label: 'scval standings index',
        url: SCVAL_STANDINGS_INDEX,
        status: 'error',
        fetchedAt,
        error: (err as Error).message,
      });
    }
  }

  // SPEC §5.3: one bad scval.com response (or a runner without poppler) must not empty the
  // section. /standings counts its "games remaining" from officialFixtures, and team pages list
  // them as "scheduled per SCVAL", so blanking it would silently drop real fixtures.
  //
  // PER DIVISION, not per section. There are two grids and two requests, and the failure that
  // actually happens is ONE of them: a non-empty `officialFixtures` is no evidence that De Anza
  // was read, because it can hold nothing but El Camino's rows — El Camino matched all 56 of its
  // fixtures on the live data, so its contribution here is legitimately the empty array. A
  // section-level "did we get anything at all" guard therefore published an empty De Anza section
  // (every De Anza row) with a source row still reading
  // "current", which is the exact failure SPEC §5.3 exists to prevent.
  const missingDivisions = DIVISIONS.filter((d) => !officialDivisions.has(d));
  if (missingDivisions.length && previous) {
    const restored = carryOfficialForward(missingDivisions, previous, games);
    if (restored.fixtures.length || restored.carried) {
      officialFixtures = [...(officialFixtures ?? []), ...restored.fixtures].sort((a, b) =>
        a.dateKey === b.dateKey
          ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
          : a.dateKey.localeCompare(b.dateKey),
      );
      games = restored.games;
      markSourcesStale('scval-pdf', 'carried forward from the previous snapshot');
      warn(
        `scval: ${missingDivisions.join(', ')} produced no fixtures — carried forward ` +
          `${restored.fixtures.length} official fixture(s) and ${restored.carried} game ` +
          'annotation(s) from the previous snapshot',
      );
    }
  }
  if (officialStandingsPdfUrl === undefined && previous?.officialStandingsPdfUrl !== undefined) {
    officialStandingsPdfUrl = previous.officialStandingsPdfUrl;
  }

  // ---- 4b. SBLive score cross-check (SPEC §5.7). Never overwrites MaxPreps.
  let sbliveCrossCheck: SbliveCrossCheck | undefined;
  let sbliveFailedEntirely = false;
  if (!args.sblive) {
    log('  sblive: skipped (--no-sblive)');
  } else if (offline) {
    sources.push({
      id: 'sblive',
      label: 'sblive score cross-check',
      url: sbliveScoresUrl(today),
      status: 'skipped',
      fetchedAt,
      error: 'offline run',
    });
  } else {
    const sblive = new SbliveClient({ onLog: (l) => log(`  ${l}`) });
    const rows: SbliveGame[] = [];
    let anyOk = false;

    // Default scope: the statewide scoreboard for every date in the trailing backfill window that
    // has a MaxPreps contest. One request covers every game that day, league and non-league.
    const from = shiftDateKey(today, -BACKFILL_DAYS);
    const windowDates = [...new Set(games.map((g) => g.dateKey))]
      .filter((d) => d >= from && d <= today)
      .sort();
    for (const date of windowDates) {
      const url = sbliveScoresUrl(date);
      try {
        const res = await sblive.getScores(date);
        rows.push(...res.games);
        anyOk = true;
        sources.push({
          id: 'sblive',
          label: `sblive scoreboard ${date}`,
          url,
          status: 'ok',
          httpStatus: res.httpStatus,
          fetchedAt,
          rowCount: res.games.length,
        });
      } catch (err) {
        warn(`sblive scoreboard ${date} failed: ${(err as Error).message}`);
        sources.push({
          id: 'sblive',
          label: `sblive scoreboard ${date}`,
          url,
          status: 'error',
          fetchedAt,
          error: (err as Error).message,
        });
      }
    }

    // --sblive-full additionally reads all 15 si.com team pages: a whole-season cross-check at the
    // cost of 16 more requests. Not the cron default.
    if (args.sbliveFull) {
      for (const team of TEAMS) {
        const slug = team.external.sbliveGamesUrl
          ? team.external.sbliveGamesUrl.replace(/^.*\/teams\/([^/]+)\/games$/, '$1')
          : null;
        if (!slug) continue;
        const url = sbliveTeamGamesUrl(slug);
        try {
          const res = await sblive.getTeamGames(slug);
          rows.push(...res.games);
          anyOk = true;
          sources.push({
            id: 'sblive',
            label: `sblive ${team.slug} games`,
            url,
            status: 'ok',
            httpStatus: res.httpStatus,
            fetchedAt,
            rowCount: res.games.length,
          });
        } catch (err) {
          warn(`sblive ${team.slug} games failed: ${(err as Error).message}`);
          sources.push({
            id: 'sblive',
            label: `sblive ${team.slug} games`,
            url,
            status: 'error',
            fetchedAt,
            error: (err as Error).message,
          });
        }
      }
    }

    if (anyOk) {
      const deduped = dedupeSbliveGames(rows);
      // The statewide scoreboard is STATEWIDE: most of its rows are Southern California games that
      // can never join. Dropping rows with no SCVAL side keeps `unmatched` a meaningful number.
      const relevant = deduped.filter((g) => g.sides.some((s) => s.slug !== null));
      const result = reconcile(games, relevant, { sbliveFetchedAt: fetchedAt });
      games = result.games;
      sbliveCrossCheck = result.report;
      for (const c of result.report.conflicts) warn(`score conflict ${c.dateKey} ${c.label}: ${c.note}`);
      log(
        `  sblive: ${deduped.length} rows (${relevant.length} with an SCVAL side) · ` +
          `matched ${result.report.compared} · agree ${result.report.agreements} · ` +
          `conflicts ${result.report.conflicts.length} · ` +
          `sblive-only scored ${result.report.sbliveOnlyScored.length} · unmatched ${result.unmatched}`,
      );
    } else {
      sbliveFailedEntirely = true;
    }
  }

  // SPEC §5.3 again: a run that produced no cross-check must not wipe /about's published
  // cross-check table AND every `provenance.scoreConflict` marker, which is the one place the
  // site admits two sources disagree. Carry the last good report and label it stale.
  if (sbliveCrossCheck === undefined && previous?.sbliveCrossCheck) {
    sbliveCrossCheck = previous.sbliveCrossCheck;
    const restored = carryGameAnnotations(games, previous.games, (prev, next) =>
      prev.provenance.scoreConflict && !next.provenance.scoreConflict
        ? { provenance: { ...next.provenance, scoreConflict: prev.provenance.scoreConflict } }
        : null,
    );
    games = restored.games;
    markSourcesStale('sblive', 'carried forward from the previous snapshot');
    warn(
      `sblive: no cross-check this run — carried the previous one forward (${restored.carried} ` +
        'conflict marker(s) restored)',
    );
  } else if (sbliveFailedEntirely) {
    sbliveCrossCheck = emptyCrossCheck(fetchedAt);
    warn('sblive: every request failed — the score cross-check is empty for this run');
  }

  // ---- 4c. VNN / PlayOn school calendars: venue + start-time corroboration (SPEC §1.5)
  /** The school calendars that actually answered with events this run. */
  const vnnSites = new Set<string>();
  if (!args.vnn) {
    log('  vnn: skipped (--no-vnn)');
  } else if (offline) {
    for (const site of VNN_SITE_IDS) {
      sources.push({
        id: 'vnn-ics',
        label: `${site.slug} school calendar`,
        url: vnnIcsUrl(site.siteId),
        status: 'skipped',
        fetchedAt,
        error: 'offline run',
      });
    }
  } else {
    const vnn = new VnnClient({ onLog: (l) => log(`  ${l}`) });
    const events = [];
    for (const site of VNN_SITE_IDS) {
      const url = vnnIcsUrl(site.siteId);
      try {
        const res = await vnn.getCalendar(site);
        events.push(...res.events);
        if (res.events.length) vnnSites.add(site.slug);
        sources.push({
          id: 'vnn-ics',
          label: `${site.slug} school calendar`,
          url,
          status: 'ok',
          httpStatus: res.httpStatus,
          fetchedAt,
          rowCount: res.events.length,
        });
      } catch (err) {
        warn(`vnn ${site.slug} calendar failed: ${(err as Error).message}`);
        sources.push({
          id: 'vnn-ics',
          label: `${site.slug} school calendar`,
          url,
          status: 'error',
          fetchedAt,
          error: (err as Error).message,
        });
      }
    }
    if (events.length) {
      const applied = applyVnnEvents(games, events);
      games = applied.games;
      for (const w of applied.warnings) warn(`vnn: ${w}`);
      log(
        `  vnn: ${events.length} field-hockey events · venues added ${applied.venuesAdded} · ` +
          `times confirmed ${applied.timesConfirmed} · unmatched varsity ${applied.unmatched}`,
      );
    }
  }

  // SPEC §5.3: the venues and confirmed start times already published stay published, whatever
  // the school calendars did (or did not) answer this run.
  //
  // PER SITE, like the schedule grids above. There are only two verified feeds and the failure
  // that actually happens is ONE of them, but the flag this used to test was pooled across both —
  // so whenever Los Gatos answered, a failed Palo Alto feed silently dropped that school's venue
  // names and confirmed start times off its published game pages, with the source row reading
  // `error` while the section itself was never relabelled "carried forward".
  const missingVnnSites = VNN_SITE_IDS.filter((s) => !vnnSites.has(s.slug)).map((s) => s.slug);
  if (missingVnnSites.length && previous) {
    const restored = carryVnnForward(missingVnnSites, previous.games, games);
    games = restored.games;
    if (restored.carried) {
      markSourcesStale('vnn-ics', 'carried forward from the previous snapshot');
      warn(
        `vnn: ${missingVnnSites.join(', ')} produced no calendar events — carried ` +
          `${restored.carried} venue/start-time annotation(s) forward from the previous snapshot`,
      );
    }
  }

  // ---- 4d. CCS calendar + bracket poll — season-gated from Oct 25 (SPEC §5.9)
  let ccsCalendar: CcsCalendarEvent[] | undefined;
  let keyDatesConfirmed: boolean | undefined;
  let bracketPublished = false;
  if (!args.ccs) {
    log('  ccs: skipped (--no-ccs)');
  } else if (offline || !ccsPollingOpen(today)) {
    const reason = offline ? 'offline run' : `season gate: polling opens 2026-10-25 (today ${today})`;
    for (const [label, url] of [
      ['ccs calendar', CCS_ICAL_URL],
      ['ccs bracket', CCS_BRACKET_URL],
    ] as const) {
      sources.push({
        id: label === 'ccs calendar' ? 'ccs-ical' : 'maxpreps-html',
        label,
        url,
        status: 'skipped',
        fetchedAt,
        error: reason,
      });
    }
    log(`  ccs: skipped (${reason})`);
  } else {
    const ccs = new CcsClient({ onLog: (l) => log(`  ${l}`) });
    try {
      const res = await ccs.getCalendar();
      const check = confirmKeyDates(res.events);
      ccsCalendar = res.events;
      keyDatesConfirmed = check.confirmed;
      for (const d of check.differences) warn(`ccs calendar: ${d}`);
      sources.push({
        id: 'ccs-ical',
        label: 'ccs calendar',
        url: res.url,
        status: 'ok',
        httpStatus: res.httpStatus,
        fetchedAt,
        rowCount: res.events.length,
      });
      log(`  ccs calendar: ${res.events.length} events · key dates ${check.confirmed ? 'confirmed' : 'DIFFER'}`);
    } catch (err) {
      warn(`ccs calendar failed: ${(err as Error).message}`);
      sources.push({
        id: 'ccs-ical',
        label: 'ccs calendar',
        url: CCS_ICAL_URL,
        status: 'error',
        fetchedAt,
        error: (err as Error).message,
      });
    }
    try {
      const res = await ccs.getBracketState(CCS_BRACKET_URL);
      bracketPublished = res.published;
      sources.push({
        id: 'maxpreps-html',
        label: 'ccs bracket',
        url: res.url,
        status: 'ok',
        httpStatus: res.httpStatus,
        fetchedAt,
      });
      log(`  ccs bracket: ${res.published ? 'PUBLISHED' : 'not published'} (${res.reason})`);
    } catch (err) {
      warn(`ccs bracket page failed: ${(err as Error).message}`);
      sources.push({
        id: 'maxpreps-html',
        label: 'ccs bracket',
        url: CCS_BRACKET_URL,
        status: 'error',
        fetchedAt,
        error: (err as Error).message,
      });
    }
  }

  // ---- 5. standings, per the by-laws
  const standings = computeStandings(games, { reported });
  assertFullTable(standings);

  // SPEC §5.6: assert our win-percentage formula reproduces MaxPreps' own number.
  for (const s of standings) {
    if (!s.reported || s.computed.gp === 0) continue;
    const ours = Number(s.computed.winPct.toFixed(3));
    const theirs = Number(s.reported.conferenceWinningPercentage.toFixed(3));
    if (Math.abs(ours - theirs) > 0.001) {
      log(`  pct check ${s.slug}: ours ${ours} vs MaxPreps ${theirs} (records differ, see cross-check)`);
    }
  }

  const crossCheck = buildCrossCheck(standings);
  const mismatches = standings.filter((s) => s.mismatch);
  for (const s of mismatches) log(`  mismatch ${s.slug}: ${s.mismatchDetail}`);

  // ---- 6. build the snapshot
  const snapshot: Snapshot = {
    fetchedAt,
    season: buildSeason(seasonWindowOf(games)),
    teams: [...TEAMS],
    games,
    standings,
    playoffs: {
      keyDates: PLAYOFF_KEY_DATES,
      ...(ccsCalendar ? { ccsCalendar } : {}),
      ...(keyDatesConfirmed === undefined ? {} : { keyDatesConfirmed }),
      format: {
        elimination: PLAYOFF_FORMAT.elimination,
        divisions: PLAYOFF_FORMAT.divisions.map((d) => ({
          name: d.name,
          seeds: [d.seeds[0], d.seeds[1]] as [number, number],
        })),
        autoQualifiers: { ...PLAYOFF_FORMAT.autoQualifiers },
        highSeedHostsThrough: PLAYOFF_FORMAT.highSeedHostsThrough,
      },
      bracketPublished,
      bracketUrl: CCS_BRACKET_URL,
      games: [],
    },
    sources,
    crossCheck,
    ...(sbliveCrossCheck ? { sbliveCrossCheck } : {}),
    ...(officialFixtures ? { officialFixtures } : {}),
    ...(officialStandingsPdfUrl === undefined ? {} : { officialStandingsPdfUrl }),
    counts: {
      teams: TEAMS.length,
      games: games.length,
      finals: games.filter((g) => g.status === 'final').length,
      pending: games.filter((g) => g.status === 'score-pending').length,
      leagueGames: games.filter((g) => g.isLeague).length,
      mismatches: mismatches.length,
    },
  };

  // ---- 7. validate, then write
  const validated = parseSnapshot(snapshot);

  log(
    `summary: teams ${validated.counts.teams} · games ${validated.counts.games} ` +
      `(league ${validated.counts.leagueGames}) · finals ${validated.counts.finals} · ` +
      `pending ${validated.counts.pending} · mismatches ${validated.counts.mismatches} · ` +
      `sources ok ${sources.filter((s) => s.status === 'ok').length}/${sources.length}`,
  );
  if (validated.sbliveCrossCheck) {
    const x = validated.sbliveCrossCheck;
    log(
      `cross-check: compared ${x.compared} · agreements ${x.agreements} · ` +
        `conflicts ${x.conflicts.length} · sblive-only scored ${x.sbliveOnlyScored.length}`,
    );
  }
  if (validated.officialFixtures) {
    log(`official: ${validated.officialFixtures.length} SCVAL fixture(s) with no reported contest`);
  }

  if (args.dryRun) {
    log('dry run: nothing written');
    return 0;
  }

  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(validated), 'utf8');
  const metaPath = args.out.replace(/\.json$/, '.meta.json');
  writeFileSync(
    metaPath,
    stableStringify({
      fetchedAt,
      // The snapshot's content identity with every `fetchedAt` stripped. The cron compares THIS
      // against the previous commit's meta to decide whether anything actually changed; a byte
      // diff of snapshot.json is never empty, because the run's stamp is in every game.
      contentHash: snapshotContentHash(validated),
      // The PACIFIC date, which is what a commit message should say: a 10 PM PDT run has a UTC
      // stamp on the following day.
      today,
      counts: validated.counts,
      crossCheck: validated.sbliveCrossCheck
        ? {
            compared: validated.sbliveCrossCheck.compared,
            agreements: validated.sbliveCrossCheck.agreements,
            conflicts: validated.sbliveCrossCheck.conflicts.length,
            sbliveOnlyScored: validated.sbliveCrossCheck.sbliveOnlyScored.length,
          }
        : null,
      officialFixturesUnmatched: validated.officialFixtures?.length ?? null,
      officialStandingsPdfUrl: validated.officialStandingsPdfUrl ?? null,
      window: validated.season.window,
      sources: sources.map((s) => ({
        label: s.label,
        status: s.status,
        rowCount: s.rowCount ?? null,
      })),
      warnings: logLines.filter((l) => l.startsWith('WARN ')).length,
    }),
    'utf8',
  );
  log(`wrote ${path.relative(process.cwd(), args.out)} and ${path.relative(process.cwd(), metaPath)}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof AbortRun) {
      console.error(`ABORT (previous snapshot kept): ${message}`);
    } else {
      console.error(`FAILED: ${message}`);
    }
    process.exit(1);
  });
