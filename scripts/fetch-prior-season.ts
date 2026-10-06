#!/usr/bin/env tsx
/**
 * Read last season's results into data/prior-season.json (DESIGN §20.1): every final between two
 * registry teams, from each team's MaxPreps schedule for that season. The Elo rating starts each
 * team from the rating these games give it (lib/ratings.ts); nothing else reads them.
 *
 *   pnpm fetch-prior-season                    the season before lib/season.ts' (26-27 → 25-26)
 *   pnpm fetch-prior-season --year 24-25       another MaxPreps season year
 *   pnpm fetch-prior-season --ssid <id>        skip the season-id lookup (with --year)
 *   pnpm fetch-prior-season --out <path>       write somewhere else
 *   pnpm fetch-prior-season --dry-run          fetch and report, write nothing
 *
 * Run once a season, at the next-season bootstrap (README): last season is over, so the file never
 * changes in between and the twice-daily cron never runs this. Cost: one team-context read (about
 * 0.5-0.7 MB, to find the season's id) and 99 schedule reads (about 150 KB each), through the
 * MaxPreps client's own budget (at most 3 at a time, 500 ms between starts, retries on 429/5xx).
 *
 * The season id: MaxPreps' URL year segment is cosmetic (DATA-SOURCES §1.1h), but the ghost API's
 * schedule read honours a `sportSeasonId`, and each team's `team-context/v1` lists every season
 * it has played under `schoolSportSeasonsData` (Girls · Field Hockey · Varsity · <year>), which is
 * where the id comes from.
 *
 * All or nothing: a team's feed that fails, does not parse or contains no row for that team, a live
 * row dated outside the season (MaxPreps serving another season; a deleted one is listed and
 * counted as deleted, see main), or a contest whose two feeds
 * disagree stops the run with exit 1 and writes nothing, because a partial season would skew every
 * starting rating. Node's built-in fetch ignores HTTPS_PROXY; behind a proxy run it with
 * NODE_USE_ENV_PROXY=1 (Node 22.21+).
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import {
  previousMaxprepsYear,
  priorGamesFromFeeds,
  PriorSeasonSchema,
  seasonLabel,
  seasonWindow,
  type PriorSeason,
} from '../lib/prior-season-schema';
import { SEASON_YEAR, SPORT_SEASON_ID } from '../lib/season';
import { MaxPrepsClient, type ScheduleRow } from '../lib/sources/maxpreps';
import { TEAMS } from '../lib/teams';
import type { TeamSlug } from '../lib/types';
import { runCli } from './cli';

const USAGE =
  'Usage: pnpm fetch-prior-season [--year <yy-yy>] [--ssid <sportSeasonId>] [--out <path>] [--dry-run]';

interface Args {
  year: string;
  ssid: string | null;
  out: string;
  dryRun: boolean;
  help: boolean;
}

/** The command line (see USAGE); the season defaults to the one before lib/season.ts'. */
function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    year: previousMaxprepsYear(SEASON_YEAR),
    ssid: null,
    out: path.resolve(import.meta.dirname, '..', 'data', 'prior-season.json'),
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value\n${USAGE}`);
      return v;
    };
    if (flag === '--year') args.year = value();
    else if (flag === '--ssid') args.ssid = value();
    else if (flag === '--out') args.out = path.resolve(value());
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--help') args.help = true;
    else throw new Error(`unknown flag ${flag}\n${USAGE}`);
  }
  if (!args.help && !/^\d{2}-\d{2}$/.test(args.year)) throw new Error(`--year must look like 25-26\n${USAGE}`);
  return args;
}

const SportSeasonsSchema = z.array(
  z.looseObject({
    sportSeasonId: z.string(),
    sport: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    year: z.string().nullable().optional(),
  }),
);

/** Girls varsity field hockey's sportSeasonId for `year`, from one team's season list. */
async function findSeasonId(client: MaxPrepsClient, year: string): Promise<string> {
  const probe = TEAMS[0];
  const res = await client.getTeamContext(probe.id, SPORT_SEASON_ID);
  const seasons = SportSeasonsSchema.parse((res.data as Record<string, unknown>).schoolSportSeasonsData);
  const match = seasons.filter(
    (s) => s.sport === 'Field Hockey' && s.gender === 'Girls' && s.level === 'Varsity' && s.year === year,
  );
  if (match.length !== 1) {
    throw new Error(`${probe.name}'s season list has ${match.length} girls varsity field hockey seasons for ${year}`);
  }
  return match[0].sportSeasonId;
}

/** The file, one game per line so a refetch diffs by game. */
function render(file: PriorSeason): string {
  const { games, ...head } = file;
  const top = JSON.stringify({ ...head, games: [] }, null, 2);
  const lines = games.map((g) => `    ${JSON.stringify(g)}`);
  return `${top.slice(0, top.lastIndexOf('[]'))}[\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** Fetch every registry team's feed for the season, normalize, validate, write (all or nothing). */
async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const season = seasonLabel(args.year);
  const client = new MaxPrepsClient({ onLog: (line) => console.log(line) });

  const ssid = args.ssid ?? (await findSeasonId(client, args.year));
  console.log(`fetch-prior-season: ${season} (MaxPreps ${args.year}), sportSeasonId ${ssid}`);

  const feeds = new Map<TeamSlug, readonly ScheduleRow[]>();
  const failures: string[] = [];
  await Promise.all(
    TEAMS.map(async (team) => {
      try {
        const res = await client.getSchedule(team.id, ssid);
        feeds.set(team.slug, res.data);
      } catch (err) {
        failures.push(`${team.slug}: ${(err as Error).message}`);
      }
    }),
  );
  if (failures.length > 0) {
    console.error(`fetch-prior-season: ${failures.length} feed(s) failed, nothing written:\n  ${failures.join('\n  ')}`);
    return 1;
  }

  // A row dated outside the season means MaxPreps served another season, unless MaxPreps marks the
  // row deleted: Sage Creek's 25-26 feed carries a deleted 2026-09-17 row against La Habra (a
  // 2026-27 contest filed under last season and then deleted). A deleted row is never a game (the
  // normalization counts it under excluded.deleted), so it cannot skew a rating; it is listed here,
  // never silently, and only a live row outside the window stops the run.
  const { from, to } = seasonWindow(season);
  const isOutside = (r: ScheduleRow) => r.contest.date.slice(0, 10) < from || r.contest.date.slice(0, 10) > to;
  const isDeleted = (r: ScheduleRow) =>
    r.calculatedFields.contestState === 1 || r.contest.isDeleted || r.contest.teams.some((t) => t.isDeleted);
  const deletedOutside = [...feeds].flatMap(([slug, rows]) =>
    rows.filter((r) => isOutside(r) && isDeleted(r)).map((r) => `${slug}: ${r.contest.date.slice(0, 10)} (contest ${r.contest.contestId})`),
  );
  if (deletedOutside.length > 0) {
    console.log(
      `fetch-prior-season: ${deletedOutside.length} deleted row(s) dated outside ${season}, counted as deleted:\n  ${deletedOutside.join('\n  ')}`,
    );
  }
  const outside = [...feeds].flatMap(([slug, rows]) =>
    rows.filter((r) => isOutside(r) && !isDeleted(r)).map((r) => `${slug}: ${r.contest.date.slice(0, 10)}`),
  );
  if (outside.length > 0) {
    console.error(`fetch-prior-season: rows outside ${season} (another season served?), nothing written:\n  ${outside.slice(0, 10).join('\n  ')}`);
    return 1;
  }

  const { games, excluded, conflicts } = priorGamesFromFeeds(feeds);
  if (conflicts.length > 0) {
    console.error(`fetch-prior-season: nothing written:\n  ${conflicts.join('\n  ')}`);
    return 1;
  }

  const file = PriorSeasonSchema.parse({
    season,
    maxprepsYear: args.year,
    sportSeasonId: ssid,
    source: 'maxpreps-api',
    fetchedAt: new Date().toISOString(),
    excluded,
    games,
  } satisfies PriorSeason);

  const played = new Set(games.flatMap((g) => [g.homeSlug, g.awaySlug]));
  const without = TEAMS.filter((t) => !played.has(t.slug)).map((t) => t.slug);
  console.log(
    `fetch-prior-season: ${games.length} finals between registry teams, ${games[0]?.date ?? '-'} to ${games.at(-1)?.date ?? '-'}; ` +
      `left out: ${Object.entries(excluded).map(([k, v]) => `${k} ${v}`).join(', ')}; ` +
      (without.length ? `no game for ${without.join(', ')}` : `every registry team has a game`),
  );
  if (args.dryRun) return 0;
  writeFileSync(args.out, render(file));
  console.log(`fetch-prior-season: wrote ${path.relative(process.cwd(), args.out)}`);
  return 0;
}

runCli(main);
