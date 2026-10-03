#!/usr/bin/env tsx
/**
 * Fetch every registry team's MaxPreps season player stats into data/player-stats.json (SPEC
 * §1.1k): all four leagues, 43 teams, joined to data/rosters.json on the career id.
 *
 *   pnpm fetch-player-stats                     live: one small JSON call per registry team (43)
 *   pnpm fetch-player-stats --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-player-stats --fixtures <dir>    offline: read stats-<slug>.json captures
 *   pnpm fetch-player-stats --capture <dir>     live, and save each response as <dir>/stats-<slug>.json
 *   pnpm fetch-player-stats --rosters <path>    join against another rosters file
 *   pnpm fetch-player-stats --out <path>        write somewhere else
 *   pnpm fetch-player-stats --dry-run           parse and report, write nothing (captures included)
 *   pnpm fetch-player-stats --fetched-at <iso>  pin the stamp (reproducible fixture builds)
 *   pnpm fetch-player-stats --force             run even outside the Aug 1 – Nov 30 season window
 *
 * Stats move after every game, so .github/workflows/update-data.yml runs this right after
 * `pnpm fetch-data`, twice a day in season; each call is 0.2–35 KB. The budget is the MaxPreps
 * client's own (concurrency <= 3, 500 ms between request starts, 15 s timeout, retry 429/5xx only).
 * Run `pnpm fetch-rosters` first when the rosters have changed: a stats row whose player is not on
 * the roster is still published, under the stats sheet's own short name, with a warning. A team
 * whose roster has no MaxPreps page id yet (its roster fetch failed, or is still pending) is
 * still read, on its registry id (the registry id IS MaxPreps' team GUID, and the response's own
 * teamId is checked against it); its rows are then all "not on the roster".
 *
 * Two guards keep the scheduled run from churning the repository. Outside the season window
 * (the pipeline's own guard, lib/pipeline/steps/window.ts over lib/leagues.ts' section windows,
 * Aug 1 – Nov 30 Pacific, on the date of `--fetched-at`) it fetches and writes nothing. And when the
 * new file differs from the previous one only in its `fetchedAt` stamps, the previous file is left
 * exactly as it was (`playerStatsContentKey`), so there is nothing to commit.
 *
 * A partial run still publishes, and failures are scoped to the team (lib/fetch-scope.ts): a team
 * whose call fails or does not parse keeps the previous file's rows with status 'carried-forward'
 * (or 'error' when there is nothing to carry), and never stops another team or another league from
 * being read. A team outside a `--leagues` run keeps the previous file's row untouched (or is
 * 'pending' when the file has none). The process exits 1 when a team the run covered failed, so a
 * scheduler notices; the report ends with one line per league. A team MaxPreps has no stats for is
 * status 'none' — that is the coach's choice, not a failure.
 *
 * The previous file is salvaged row by row (readPreviousFile): a row that no longer validates on
 * its own (a slug gone from the registry, a changed id, a broken status) is dropped and named in
 * the log, and that team alone has nothing to keep — pending when out of scope, which also exits 1
 * and is never reported as "kept as they were". A file from another season keeps nothing (its
 * teams read as absent). A file that is not JSON at all stops the run: exit 1, nothing written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { localDateKey, monthDay } from '../lib/format';
import {
  describePrevious,
  formatLeagueSummary,
  inScope,
  parseLeaguesFlag,
  readPreviousFile,
  runExitCode,
  stableStringify,
  summarizeByLeague,
  type PreviousFile,
} from '../lib/fetch-scope';
import { seasonWindowBounds } from '../lib/leagues';
import { inSeasonWindow } from '../lib/pipeline/steps/window';
import {
  PlayerStatsFileSchema,
  PlayerStatsPartialSchema,
  TeamPlayerStatsSchema,
  countPlayerStats,
  playerStatsContentKey,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from '../lib/player-stats-schema';
import { RostersSchema } from '../lib/rosters-schema';
import { MaxPrepsClient } from '../lib/sources/maxpreps';
import {
  fetchPlayerStats,
  joinToRoster,
  parsePlayerStats,
  pendingPlayerStats,
  playerStatsUrl,
  teamStatsPageUrl,
  type PlayerStatsPage,
} from '../lib/sources/maxpreps-player-stats';
import { SEASON_YEAR } from '../lib/season';
import { TEAMS } from '../lib/teams';
import type { LeagueId } from '../lib/types';

interface Args {
  fixtures: string | null;
  capture: string | null;
  leagues: LeagueId[] | null;
  rosters: string;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
  force: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    capture: null,
    leagues: null,
    rosters: path.join(process.cwd(), 'data', 'rosters.json'),
    out: path.join(process.cwd(), 'data', 'player-stats.json'),
    dryRun: false,
    fetchedAt: null,
    force: false,
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
    else if (arg === '--capture') out.capture = path.resolve(next());
    else if (arg === '--leagues') out.leagues = parseLeaguesFlag(next(), arg);
    else if (arg === '--rosters') out.rosters = path.resolve(next());
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--fetched-at') out.fetchedAt = next();
    else if (arg === '--force') out.force = true;
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (out.fixtures && out.capture) throw new Error('--capture records live responses; it cannot be combined with --fixtures');
  return out;
}

/**
 * The previous file, if it exists, salvaged row by row (lib/fetch-scope.ts readPreviousFile): its
 * valid rows of this season are what a failed or out-of-scope team keeps. A file written before
 * every team was in the registry (the 15 SCVAL teams) still counts: the teams it lacks are simply
 * pending.
 */
function loadPrevious(file: string): PreviousFile<TeamPlayerStats, PlayerStatsFile> | null {
  if (!existsSync(file)) return null;
  return readPreviousFile(readFileSync(file, 'utf8'), {
    season: SEASON_YEAR,
    row: TeamPlayerStatsSchema,
    file: PlayerStatsPartialSchema,
  });
}

const NOTES = [
  'One entry per registry team, all four leagues (SCVAL, BVAL, PCAL, MCAL), read the same way. A team with status pending has not been covered by any run yet: nothing was fetched and nothing is claimed for it.',
  "Rows come from MaxPreps' team-season-player-stats rollup (the JSON behind each team's /stats/ page) and are joined to data/rosters.json on the career id in each row's player link.",
  'Every number is what the coach entered on MaxPreps, for all of this season\'s varsity games, league and non-league alike. Coverage is the coach\'s choice: a team MaxPreps has no stats for is status none.',
  "A stat is tracked for a team when the team's own total is above zero and at least one player holds some of it; only then are its cells read, so a tracked 0 is a real zero and an untracked stat is null for every player. A total no player holds any of is dropped with a warning; rows adding up to more than a team total are kept as published and warned about. Per-game and percentage columns are dropped: they are arithmetic on the counts.",
  "A team with status carried-forward keeps the previous file's rows after a failed fetch; its own fetchedAt says when those rows were read.",
];

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
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
  const loaded = loadPrevious(args.out);
  if (loaded && !loaded.readable) {
    console.error(
      `FAILED: the previous ${path.relative(process.cwd(), args.out)} cannot be read: ${loaded.reason}. ` +
        'Nothing written: fix or remove it, then re-run.',
    );
    return 1;
  }
  const previous = loaded;
  if (previous) {
    for (const line of describePrevious(previous, path.relative(process.cwd(), args.out))) console.warn(line);
  }
  const dropped = new Set(previous?.dropped.flatMap((d) => (d.team ? [d.team] : [])) ?? []);
  const rosters = RostersSchema.parse(JSON.parse(readFileSync(args.rosters, 'utf8')) as unknown);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  console.log(
    args.fixtures
      ? `fetch-player-stats: offline, from ${args.fixtures}`
      : `fetch-player-stats: ${TEAMS.filter((t) => inScope(t, args.leagues)).length} MaxPreps stats rollups` +
          (args.leagues ? ` (${args.leagues.join(', ')} only)` : ''),
  );
  // --dry-run writes nothing, --capture included.
  const capture = args.dryRun ? null : args.capture;
  if (capture) mkdirSync(capture, { recursive: true });

  const teams: TeamPlayerStats[] = await Promise.all(
    TEAMS.map(async (team): Promise<TeamPlayerStats> => {
      // A league outside this run is not fetched: its previous row stays as it was.
      if (!inScope(team, args.leagues)) {
        return previous?.rows.get(team.slug) ?? pendingPlayerStats(team);
      }
      const roster = rosters.teams.find((t) => t.slug === team.slug);
      // The page's own id when the roster read one; else the registry id, which is MaxPreps' team
      // GUID (the response's teamId is checked against it either way).
      const maxprepsTeamId = roster?.maxprepsTeamId ?? (team.dataCoverage === 'none' ? null : team.id);
      const base = {
        slug: team.slug,
        teamId: team.id,
        name: team.name,
        maxprepsTeamId,
        statsUrl: teamStatsPageUrl(team.external.maxprepsTeamUrl),
      };
      try {
        if (!maxprepsTeamId) throw new Error('no MaxPreps team id: none on the roster and none in the registry');
        let page: PlayerStatsPage | null;
        if (args.fixtures) {
          const raw = JSON.parse(
            readFileSync(path.join(args.fixtures, `stats-${team.slug}.json`), 'utf8'),
          ) as unknown;
          page = parsePlayerStats(raw, {
            expectedTeamId: maxprepsTeamId,
            url: playerStatsUrl(maxprepsTeamId),
          });
        } else {
          page = await fetchPlayerStats(
            client,
            maxprepsTeamId,
            // The body exactly as MaxPreps sent it, before it is decoded or validated: a drifted or
            // non-JSON answer is captured too, and replays (--fixtures) into the same failure.
            capture
              ? (body) =>
                  writeFileSync(
                    path.join(capture, `stats-${team.slug}.json`),
                    body.endsWith('\n') ? body : `${body}\n`,
                    'utf8',
                  )
              : undefined,
          );
        }
        if (!page) {
          return {
            ...base,
            status: 'none',
            lastUpdated: null,
            tracked: { field: [], goalkeeping: [] },
            totals: { field: {}, goalkeeping: {} },
            players: [],
            warnings: [],
            fetchedAt,
            error: null,
          };
        }
        const { lines, warnings } = joinToRoster(page, roster?.players ?? []);
        return {
          ...base,
          // A rollup with tables but no rows is the same as no stats at all.
          status: lines.length ? 'ok' : 'none',
          lastUpdated: page.lastUpdated,
          tracked: page.tracked,
          totals: page.totals,
          players: lines.map((l) => ({
            careerId: l.careerId,
            careerUrl: l.careerUrl,
            athleteId: l.athleteId,
            fullName: l.fullName,
            shortName: l.shortName,
            jersey: l.jersey,
            onRoster: l.onRoster,
            field: l.field,
            goalkeeping: l.goalkeeping,
          })),
          warnings: [...page.warnings, ...warnings],
          fetchedAt,
          error: null,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(
          `WARN ${team.slug}: ${error}` +
            (dropped.has(team.slug) ? ' (its previous row was dropped: nothing to carry forward)' : ''),
        );
        const prior = previous?.rows.get(team.slug);
        // Any row that was actually read (ok, none, or itself carried forward) is still true: a
        // team with no stats stays "coach entered none", not "could not be read".
        if (prior && prior.status !== 'error' && prior.status !== 'pending') {
          return { ...prior, ...base, status: 'carried-forward', error };
        }
        return {
          ...base,
          status: 'error',
          lastUpdated: null,
          tracked: { field: [], goalkeeping: [] },
          totals: { field: {}, goalkeeping: {} },
          players: [],
          warnings: [],
          fetchedAt: null,
          error,
        };
      }
    }),
  );

  const file: PlayerStatsFile = {
    season: SEASON_YEAR,
    fetchedAt,
    source: { id: 'maxpreps-api', builtBy: 'scripts/fetch-player-stats.ts', notes: NOTES },
    teams,
    counts: countPlayerStats(teams),
  };

  const validated = PlayerStatsFileSchema.safeParse(file);
  if (!validated.success) {
    console.error('FAILED: the assembled file does not validate:');
    for (const issue of validated.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return 1;
  }

  console.log('');
  for (const t of teams) {
    console.log(
      `${t.slug.padEnd(17)} ${t.status.padEnd(15)} ${String(t.players.length).padStart(2)} players · ` +
        `tracks ${t.tracked.field.join(', ') || '-'}` +
        (t.tracked.goalkeeping.length > 1 ? ` · goalies ${t.tracked.goalkeeping.join(', ')}` : '') +
        (t.lastUpdated ? ` · MaxPreps ${t.lastUpdated}` : '') +
        (t.warnings.length ? ` · ${t.warnings.join('; ')}` : '') +
        (t.error ? ` · ERROR ${t.error}` : ''),
    );
  }
  const byLeague = summarizeByLeague(teams, args.leagues, dropped);
  console.log('');
  for (const l of byLeague) console.log(formatLeagueSummary(l));
  // A covered team that failed decides the exit code, and so does an uncovered one whose previous
  // row was dropped (it is pending now); a league left out of the run is otherwise not a failure.
  const failed = byLeague.reduce((n, l) => n + l.failed, 0);
  const lost = byLeague.reduce((n, l) => n + l.dropped.length, 0);
  const exitCode = runExitCode(byLeague, previous?.dropped ?? []);
  const c = file.counts;
  console.log(
    `\n${c.players} player stat lines on ${c.teamsWithStats} of ${c.teams} teams · ` +
      `${c.goalkeepers} goalkeepers · ${failed} team(s) failed this run` +
      (lost ? ` · ${lost} team(s) outside it now pending: previous row dropped` : ''),
  );

  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return exitCode;
  }
  // Only a previous file that validates whole (and lost no row) can be left in place.
  const whole = previous?.whole;
  if (whole && playerStatsContentKey(whole) === playerStatsContentKey(validated.data)) {
    console.log(
      `\nno change since ${whole.fetchedAt}: ${path.relative(process.cwd(), args.out)} left as it was`,
    );
    return exitCode;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(file), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
