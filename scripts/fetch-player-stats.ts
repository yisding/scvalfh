#!/usr/bin/env tsx
/**
 * Fetch every SCVAL team's MaxPreps season player stats into data/player-stats.json (SPEC §1.1k),
 * joined to data/rosters.json on the career id.
 *
 *   pnpm fetch-player-stats                     live: 15 small JSON calls, one per team
 *   pnpm fetch-player-stats --fixtures <dir>    offline: read stats-<slug>.json captures
 *   pnpm fetch-player-stats --rosters <path>    join against another rosters file
 *   pnpm fetch-player-stats --out <path>        write somewhere else
 *   pnpm fetch-player-stats --dry-run           parse and report, write nothing
 *   pnpm fetch-player-stats --fetched-at <iso>  pin the stamp (reproducible fixture builds)
 *
 * Stats move after every game, so this is meant to run as often as the scores do; each call is
 * 10–35 KB. The budget is the MaxPreps client's own (concurrency <= 3, 500 ms between request
 * starts, 15 s timeout, retry 429/5xx only). Run `pnpm fetch-rosters` first when the rosters have
 * changed: a stats row whose player is not on the roster is still published, under the stats
 * sheet's own short name, with a warning.
 *
 * A partial run still publishes: a team whose call fails or does not parse keeps the previous
 * file's rows with status 'carried-forward' (or 'error' when there is nothing to carry), and the
 * process exits 1 so a scheduler notices. A team MaxPreps has no stats for is status 'none' —
 * that is the coach's choice, not a failure.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  PlayerStatsFileSchema,
  countPlayerStats,
  type PlayerStatsFile,
  type TeamPlayerStats,
} from '../lib/player-stats-schema';
import { RostersSchema } from '../lib/rosters-schema';
import { MaxPrepsClient } from '../lib/sources/maxpreps';
import {
  fetchPlayerStats,
  joinToRoster,
  parsePlayerStats,
  playerStatsUrl,
  teamStatsPageUrl,
  type PlayerStatsPage,
} from '../lib/sources/maxpreps-player-stats';
import { SEASON_YEAR } from '../lib/season';
import { TEAMS } from '../lib/teams';

interface Args {
  fixtures: string | null;
  rosters: string;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    rosters: path.join(process.cwd(), 'data', 'rosters.json'),
    out: path.join(process.cwd(), 'data', 'player-stats.json'),
    dryRun: false,
    fetchedAt: null,
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
    else if (arg === '--rosters') out.rosters = path.resolve(next());
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--fetched-at') out.fetchedAt = next();
    else throw new Error(`unknown flag: ${arg}`);
  }
  return out;
}

/** Keys sorted at every level, so re-running produces a byte-identical file. */
function stableStringify(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

/** The previous file, if it exists and still validates; its rows are what a failed team keeps. */
function loadPrevious(file: string): PlayerStatsFile | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = PlayerStatsFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const NOTES = [
  "Rows come from MaxPreps' team-season-player-stats rollup (the JSON behind each team's /stats/ page) and are joined to data/rosters.json on the career id in each row's player link.",
  'Every number is what the coach entered on MaxPreps, for all of this season\'s varsity games, league and non-league alike. Coverage is the coach\'s choice: a team MaxPreps has no stats for is status none.',
  "A stat is tracked for a team when the team's own total is above zero; only then are its cells read, so a tracked 0 is a real zero and an untracked stat is null for every player. Per-game and percentage columns are dropped: they are arithmetic on the counts.",
  "A team with status carried-forward keeps the previous file's rows after a failed fetch; its own fetchedAt says when those rows were read.",
];

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const previous = loadPrevious(args.out);
  const rosters = RostersSchema.parse(JSON.parse(readFileSync(args.rosters, 'utf8')) as unknown);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  console.log(
    args.fixtures
      ? `fetch-player-stats: offline, from ${args.fixtures}`
      : `fetch-player-stats: ${TEAMS.length} MaxPreps stats rollups`,
  );

  const teams: TeamPlayerStats[] = await Promise.all(
    TEAMS.map(async (team): Promise<TeamPlayerStats> => {
      const roster = rosters.teams.find((t) => t.slug === team.slug);
      const maxprepsTeamId = roster?.maxprepsTeamId ?? null;
      const base = {
        slug: team.slug,
        teamId: team.id,
        name: team.name,
        maxprepsTeamId,
        statsUrl: teamStatsPageUrl(team.external.maxprepsTeamUrl),
      };
      try {
        if (!maxprepsTeamId) throw new Error('no MaxPreps team id in data/rosters.json');
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
          page = await fetchPlayerStats(client, maxprepsTeamId);
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
        console.warn(`WARN ${team.slug}: ${error}`);
        const prior = previous?.teams.find((t) => t.slug === team.slug);
        if (prior && prior.players.length) {
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
  const c = file.counts;
  console.log(
    `\n${c.players} player stat lines on ${c.teamsWithStats} of ${c.teams} teams · ` +
      `${c.goalkeepers} goalkeepers · ${c.errors} team(s) failed`,
  );

  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return c.errors ? 1 : 0;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(file), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return c.errors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
