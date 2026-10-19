#!/usr/bin/env tsx
/**
 * Fetch every registry team's MaxPreps season player stats into data/player-stats.json (SPEC
 * §1.1k): all nine leagues and the three independents, 102 teams, joined to data/rosters.json on the career id.
 *
 *   pnpm fetch-player-stats                     live: one small JSON call per registry team (102)
 *   pnpm fetch-player-stats --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-player-stats --fixtures <dir>    offline: read stats-<slug>.json captures
 *   pnpm fetch-player-stats --capture <dir>     live, and save each response as <dir>/stats-<slug>.json
 *   pnpm fetch-player-stats --rosters <path>    join against another rosters file
 *   pnpm fetch-player-stats --snapshot <path>   read game notes from another snapshot file
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
 * (the pipeline's own guard, lib/pipeline/season-window.ts over lib/config/leagues.ts' section windows,
 * Aug 1 – Nov 30 Pacific, on the date of `--fetched-at`) it fetches and writes nothing. And when the
 * new file differs from the previous one only in its `fetchedAt` stamps, the previous file is left
 * exactly as it was (`playerStatsContentKey`), so there is nothing to commit.
 *
 * Game notes (lib/engine/note-stats.ts). For a team a game note on one of its finals in data/snapshot.json
 * credits with goals, assists or saves (teamsCreditedByNotes), the run also reads MaxPreps'
 * per-game team totals (lib/sources/maxpreps/game-stats.ts) into `gameTotals`, so a noted stat the
 * coach has also entered is not counted twice: one more small call per such team (one, Homestead,
 * on 2026-10-06). Offline it reads `game-stats-<slug>.json` beside the rollup captures; a missing
 * capture, or a failed call, leaves `gameTotals` out with a warning and never fails the team; its
 * noted stats are then not counted (lib/engine/note-stats.ts counts only what it can check). The previous
 * run's totals are not carried forward for this: they may predate what the coach has entered since.
 *
 * A partial run still publishes, and failures are scoped to the team (lib/pipeline/fetch-scope.ts): a team
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

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { FlagSpec } from '@/lib/cli/flags';
import { INDEPENDENT_LEAGUES, LEAGUES_PROPER } from '@/lib/config/leagues';
import { SEASON_YEAR } from '@/lib/config/season';
import { teamsCreditedByNotes } from '@/lib/engine/note-stats';
import type { Team } from '@/lib/model/team';
import { droppedTeamSlugs } from '@/lib/pipeline/fetch-scope';
import { TEAMS } from '@/lib/registry/teams';
import {
  type GameTotal, type PlayerStatsFile, PlayerStatsFileSchema, PlayerStatsPartialSchema, type TeamPlayerStats,
  TeamPlayerStatsSchema, countPlayerStats, playerStatsContentKey,
} from '@/lib/schema/player-stats';
import { type Rosters, RostersSchema } from '@/lib/schema/rosters';
import { loadSnapshot } from '@/lib/snapshot/load';
import { MaxPrepsClient } from '@/lib/sources/maxpreps/client';
import { fetchGameStats, gameStatsUrl, parseGameStats } from '@/lib/sources/maxpreps/game-stats';
import {
  fetchPlayerStats,
  joinToRoster,
  parsePlayerStats,
  pendingPlayerStats,
  playerStatsUrl,
  teamStatsPageUrl,
  type PlayerStatsPage,
} from '@/lib/sources/maxpreps/player-stats';

import { runCli } from './lib/cli';
import {
  type Capture,
  type ScopedFetchArgs,
  finishWrite,
  loadPreviousFile,
  logHeader,
  logTeamLines,
  openCapture,
  outOfSeason,
  parseScopedArgs,
  refuseUnreadable,
  reportLeagues,
  runScopedTeams,
  scopedFetchDefaults,
  validateOrFail,
} from './lib/fetch-job';

interface Args extends ScopedFetchArgs {
  rosters: string;
  snapshot: string;
  force: boolean;
}

const FLAGS: FlagSpec<Args> = [
  { flags: '--rosters', value: 'path', set: (a, v) => { a.rosters = v; } },
  { flags: '--snapshot', value: 'path', set: (a, v) => { a.snapshot = v; } },
  { flags: '--force', toggle: (a) => { a.force = true; } },
];

function parseArgs(argv: readonly string[]): Args {
  return parseScopedArgs(argv, {
    init: () => ({
      ...scopedFetchDefaults('player-stats.json'),
      rosters: path.join(process.cwd(), 'data', 'rosters.json'),
      snapshot: path.join(process.cwd(), 'data', 'snapshot.json'),
      force: false,
    }),
    extra: FLAGS,
    records: 'live responses',
  });
}

const NOTES = [
  `One entry per registry team, all ${LEAGUES_PROPER.length} leagues (${LEAGUES_PROPER.map((l) => l.shortName).join(', ')}) and the ${INDEPENDENT_LEAGUES.map((l) => l.name).join(', ')}, read the same way. A team with status pending has not been covered by any run yet: nothing was fetched and nothing is claimed for it.`,
  "Rows come from MaxPreps' team-season-player-stats rollup (the JSON behind each team's /stats/ page) and are joined to data/rosters.json on the career id in each row's player link.",
  'Every number is what the coach entered on MaxPreps, for all of this season\'s varsity games, league and non-league alike. Coverage is the coach\'s choice: a team MaxPreps has no stats for is status none.',
  "A stat is tracked for a team when the team's own total is above zero and at least one player holds some of it; only then are its cells read, so a tracked 0 is a real zero and an untracked stat is null for every player. A total no player holds any of is dropped with a warning; rows adding up to more than a team total are kept as published and warned about. Per-game and percentage columns are dropped: they are arithmetic on the counts.",
  "A team with status carried-forward keeps the previous file's rows after a failed fetch; its own fetchedAt says when those rows were read.",
  "gameTotals, where present, are MaxPreps' per-game team totals (team-season-game-stats rollup), read only for a team a game note on one of its finals credits with goals, assists or saves (lib/note-stats.ts), so a noted stat the coach also entered is not counted twice.",
];

/**
 * A noted team's per-game totals, or undefined with a warning when they cannot be had: its note
 * credits are then withheld (lib/engine/note-stats.ts counts only what it can check), and the team itself
 * never fails.
 */
async function readGameTotals(
  args: Args,
  client: MaxPrepsClient,
  capture: Capture,
  slug: string,
  maxprepsTeamId: string,
  warnings: string[],
): Promise<GameTotal[] | undefined> {
  try {
    if (args.fixtures) {
      const file = path.join(args.fixtures, `game-stats-${slug}.json`);
      if (!existsSync(file)) {
        warnings.push(`game notes: no per-game capture ${path.basename(file)}; its noted stats are not counted until a read succeeds`);
        return undefined;
      }
      return parseGameStats(JSON.parse(readFileSync(file, 'utf8')) as unknown, {
        expectedTeamId: maxprepsTeamId,
        url: gameStatsUrl(maxprepsTeamId),
      });
    }
    return await fetchGameStats(client, maxprepsTeamId, (body) =>
      capture.save(`game-stats-${slug}.json`, body, { ensureNewline: true }));
  } catch (err) {
    warnings.push(`game notes: per-game totals not read (${err instanceof Error ? err.message : String(err)}); its noted stats are not counted until a read succeeds`);
    return undefined;
  }
}

/**
 * The registry's half of a team's row, and the MaxPreps id its stats are read on: the page's own
 * id when the roster read one; else the registry id, which is MaxPreps' team GUID (the response's
 * teamId is checked against it either way).
 */
function baseOf(team: Team, rosters: Rosters) {
  const roster = rosters.teams.find((t) => t.slug === team.slug);
  const maxprepsTeamId = roster?.maxprepsTeamId ?? (team.dataCoverage === 'none' ? null : team.id);
  return {
    slug: team.slug,
    teamId: team.id,
    name: team.name,
    maxprepsTeamId,
    statsUrl: teamStatsPageUrl(team.external.maxprepsTeamUrl),
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  if (outOfSeason(fetchedAt, args.force)) return 0;
  const previous = loadPreviousFile(args.out, { season: SEASON_YEAR, row: TeamPlayerStatsSchema, file: PlayerStatsPartialSchema });
  if (previous && !previous.readable) return refuseUnreadable(args.out, previous.reason);
  const dropped = droppedTeamSlugs(previous);
  const rosters = RostersSchema.parse(JSON.parse(readFileSync(args.rosters, 'utf8')) as unknown);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });
  // The teams a game note credits with stats: their per-game totals are read too.
  const noted: ReadonlySet<string> = existsSync(args.snapshot)
    ? teamsCreditedByNotes({
        games: loadSnapshot(JSON.parse(readFileSync(args.snapshot, 'utf8')) as unknown).games,
        roster: (slug) => rosters.teams.find((t) => t.slug === slug)?.players,
      })
    : new Set();
  if (noted.size) console.log(`game notes with stats: ${[...noted].join(', ')}`);

  logHeader('fetch-player-stats', { fixtures: args.fixtures, leagues: args.leagues, what: (covered) => `${covered.length} MaxPreps stats rollups` });
  const capture = openCapture(args.capture, args.dryRun);

  const teams: TeamPlayerStats[] = await runScopedTeams<TeamPlayerStats>({
    teams: TEAMS,
    leagues: args.leagues,
    previous,
    dropped,
    pending: pendingPlayerStats,
    fetch: async (team) => {
      const base = baseOf(team, rosters);
      const { maxprepsTeamId } = base;
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
          (body) => capture.save(`stats-${team.slug}.json`, body, { ensureNewline: true }),
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
      const roster = rosters.teams.find((t) => t.slug === team.slug);
      const { lines, warnings } = joinToRoster(page, roster?.players ?? []);
      const gameTotals = noted.has(team.slug) && lines.length
        ? await readGameTotals(args, client, capture, team.slug, maxprepsTeamId, warnings)
        : undefined;
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
        ...(gameTotals ? { gameTotals } : {}),
        warnings: [...page.warnings, ...warnings],
        fetchedAt,
        error: null,
      };
    },
    // The prior row's gameTotals stay with its players: both are one earlier read, so a game
    // the coach entered since is in neither, and a note's stats for it are counted once.
    carry: (prior, team, error) => ({ ...prior, ...baseOf(team, rosters), status: 'carried-forward', error }),
    errorRow: (team, error) => ({
      ...baseOf(team, rosters),
      status: 'error',
      lastUpdated: null,
      tracked: { field: [], goalkeeping: [] },
      totals: { field: {}, goalkeeping: {} },
      players: [],
      warnings: [],
      fetchedAt: null,
      error,
    }),
  });

  const file: PlayerStatsFile = {
    season: SEASON_YEAR,
    fetchedAt,
    source: { id: 'maxpreps-api', builtBy: 'scripts/fetch-player-stats.ts', notes: NOTES },
    teams,
    counts: countPlayerStats(teams),
  };

  const validated = validateOrFail(PlayerStatsFileSchema, file);
  if (!validated) return 1;

  logTeamLines(
    teams,
    (t) =>
      `${String(t.players.length).padStart(2)} players · ` +
      `tracks ${t.tracked.field.join(', ') || '-'}` +
      (t.tracked.goalkeeping.length > 1 ? ` · goalies ${t.tracked.goalkeeping.join(', ')}` : '') +
      (t.lastUpdated ? ` · MaxPreps ${t.lastUpdated}` : '') +
      (t.gameTotals ? ` · per-game totals of ${t.gameTotals.length} games, for its game notes` : ''),
  );
  const { failed, lost, exitCode } = reportLeagues(teams, args.leagues, dropped, previous?.dropped ?? []);
  const c = file.counts;
  console.log(
    `\n${c.players} player stat lines on ${c.teamsWithStats} of ${c.teams} teams · ` +
      `${c.goalkeepers} goalkeepers · ${failed} team(s) failed this run` +
      (lost ? ` · ${lost} team(s) outside it now pending: previous row dropped` : ''),
  );

  finishWrite({
    out: args.out,
    file,
    parsed: validated,
    whole: previous?.whole,
    contentKey: playerStatsContentKey,
    dryRun: args.dryRun,
  });
  return exitCode;
}

runCli(main);
