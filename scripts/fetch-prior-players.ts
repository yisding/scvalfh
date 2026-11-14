#!/usr/bin/env tsx
/**
 * Read who was on each registry team's MaxPreps stat sheet LAST season into data/prior-players.json
 * (lib/players/prior-players-schema.ts): the names, numbers and classes the player registry
 * (scripts/build-players.ts) uses to follow a player from one season into the next.
 *
 *   pnpm fetch-prior-players                     the season before lib/season.ts' (26-27 → 25-26)
 *   pnpm fetch-prior-players --year 24-25        another MaxPreps season year (with --ssid)
 *   pnpm fetch-prior-players --ssid <id>         that season's varsity sportSeasonId; the default is
 *                                                the one data/prior-season.json was built from
 *   pnpm fetch-prior-players --fixtures <dir>    offline: read stats-<slug>.json captures
 *   pnpm fetch-prior-players --capture <dir>     live, and save each body as <dir>/stats-<slug>.json
 *   pnpm fetch-prior-players --refresh           ask again for teams already read
 *   pnpm fetch-prior-players --out <path>        write somewhere else
 *   pnpm fetch-prior-players --dry-run           read and report, write nothing
 *   pnpm fetch-prior-players --fetched-at <iso>  pin the stamp
 *
 * Run once a season, like fetch-prior-season (and after it: the season id comes from its file). The
 * sport is this build's (SCVAL_SPORT). Cost: one rollup read per registry team through the MaxPreps
 * client's own budget; a team with no stats that season answers MaxPreps' 400 "No data was found",
 * which is status 'none', not a failure.
 *
 * Last season is over, so a team once read never changes: a later run asks only for the teams not
 * yet read (error or pending) unless --refresh, and a team whose read fails keeps what an earlier
 * run read. MaxPreps' edge answers some of these calls with an empty 403 when they come quickly;
 * the client does not retry a 403, so run it again later rather than faster. The process exits 1
 * while any team is unread, and still writes what it read; a run that read nothing writes nothing.
 * --ssid is taken on trust: the script checks each answer is for the id it asked for, not that the
 * id is --year's.
 *
 * Why the stat sheets and not the roster pages: no roster page of a past season was ever captured,
 * and the page for one cannot be read from every network this runs on. The sheet lists only the
 * players a coach entered a line for; the file says so, and claims nothing more.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseFetchedAtFlag } from '../lib/cli-flags';
import { previousMaxprepsYear } from '../lib/history/prior-season-schema';
import {
  PriorPlayersSchema,
  countPriorPlayers,
  type PriorPlayers,
  type PriorTeam,
} from '../lib/players/prior-players-schema';
import { SEASON_YEAR } from '../lib/season';
import { MaxPrepsClient, MaxPrepsError } from '../lib/sources/maxpreps';
import { playerStatsUrl } from '../lib/sources/maxpreps-player-stats';
import { parseStatSheetNames } from '../lib/sources/maxpreps-stats-names';
import { DATA_DIR, SPORT_ID } from '../lib/sports/current';
import { stableStringify } from '../lib/stable-json';
import { TEAMS } from '../lib/teams';
import { runCliIfMain } from './cli';

const USAGE =
  'Usage: pnpm fetch-prior-players [--year <yy-yy>] [--ssid <sportSeasonId>] [--fixtures <dir> | --capture <dir>] ' +
  '[--refresh] [--out <path>] [--dry-run] [--fetched-at <iso>]';

interface Args {
  year: string;
  ssid: string | null;
  fixtures: string | null;
  capture: string | null;
  refresh: boolean;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    year: previousMaxprepsYear(SEASON_YEAR),
    ssid: null,
    fixtures: null,
    capture: null,
    refresh: false,
    out: path.join(process.cwd(), DATA_DIR, 'prior-players.json'),
    dryRun: false,
    fetchedAt: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value\n${USAGE}`);
      i += 1;
      return v;
    };
    if (flag === '--year') args.year = value();
    else if (flag === '--ssid') args.ssid = value();
    else if (flag === '--fixtures') args.fixtures = path.resolve(value());
    else if (flag === '--capture') args.capture = path.resolve(value());
    else if (flag === '--refresh') args.refresh = true;
    else if (flag === '--out') args.out = path.resolve(value());
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--fetched-at') args.fetchedAt = parseFetchedAtFlag(value(), flag);
    else if (flag === '--help') args.help = true;
    else throw new Error(`unknown flag ${flag}\n${USAGE}`);
  }
  if (!args.help && !/^\d{2}-\d{2}$/.test(args.year)) throw new Error(`--year must look like 25-26\n${USAGE}`);
  if (args.fixtures && args.capture) throw new Error('--capture records live answers; it cannot be combined with --fixtures');
  return args;
}

/** The varsity sportSeasonId data/prior-season.json was built from, when that file is for `year`. */
function seasonIdFromPriorSeason(year: string): string | null {
  const file = path.join(process.cwd(), DATA_DIR, 'prior-season.json');
  if (!existsSync(file)) return null;
  const prior = JSON.parse(readFileSync(file, 'utf8')) as { maxprepsYear?: unknown; sportSeasonId?: unknown };
  return prior.maxprepsYear === year && typeof prior.sportSeasonId === 'string' ? prior.sportSeasonId : null;
}

/** The previous file's teams, when it is this sport's file for the same season and season id. */
function readPrevious(out: string, year: string, ssid: string): Map<string, PriorTeam> {
  if (!existsSync(out)) return new Map();
  const parsed = PriorPlayersSchema.safeParse(JSON.parse(readFileSync(out, 'utf8')));
  if (!parsed.success) throw new Error(`the previous ${path.relative(process.cwd(), out)} does not validate: fix or remove it`);
  const f = parsed.data;
  if (f.season !== year || f.sport !== SPORT_ID || f.sportSeasonId !== ssid) return new Map();
  return new Map(f.teams.map((t) => [t.slug, t]));
}

const NOTES = [
  "One entry per registry team: the players on the team's MaxPreps season stat sheet for this past season (team-season-player-stats/rollup/v1, asked for with that season's varsity sportSeasonId), read for who is on it, not for the numbers.",
  'Not a roster: a sheet lists only the players a coach entered a line for. Status none means MaxPreps has no stats for the team that season, which says nothing about who played.',
  "A name is rebuilt from the player's career link and the sheet's last name (nameFrom: career-url); where the row links nothing it is the sheet's own short name (nameFrom: short-name). The class is the sheet's caption; a blank one is null.",
  'A team with status error or pending has not been read. Nothing is claimed for it, and a later run asks again.',
];

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const ssid = args.ssid ?? seasonIdFromPriorSeason(args.year);
  if (!ssid) {
    throw new Error(`no sportSeasonId for ${args.year}: ${DATA_DIR}/prior-season.json is not for that season; pass --ssid`);
  }
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const previous = readPrevious(args.out, args.year, ssid);
  const capture = args.dryRun ? null : args.capture;
  if (capture) mkdirSync(capture, { recursive: true });
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });
  console.log(
    `fetch-prior-players: ${SPORT_ID} ${args.year}, sportSeasonId ${ssid}` + (args.fixtures ? `, offline from ${args.fixtures}` : ''),
  );

  /** The body MaxPreps answered with: the 400 "No data" envelope included, read from the error. */
  const body = async (slug: string, url: string): Promise<string> => {
    if (args.fixtures) {
      // A missing or empty capture is a sheet nobody has read, said without the local path.
      const file = path.join(args.fixtures, `stats-${slug}.json`);
      const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (text.trim() === '') throw new Error(`no capture of this team's sheet (stats-${slug}.json)`);
      return text;
    }
    let text: string;
    try {
      text = (await client.text(url, 'application/json')).data;
    } catch (err) {
      if (!(err instanceof MaxPrepsError) || err.httpStatus !== 400 || !err.body) throw err;
      text = err.body;
    }
    if (capture) writeFileSync(path.join(capture, `stats-${slug}.json`), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return text;
  };

  const teams: PriorTeam[] = await Promise.all(
    TEAMS.map(async (team): Promise<PriorTeam> => {
      const prior = previous.get(team.slug);
      const read = prior && (prior.status === 'ok' || prior.status === 'none') && prior.teamId === team.id;
      if (read && !args.refresh) return prior;
      const base = { slug: team.slug, teamId: team.id };
      // A team with no data coverage has a placeholder registry id: there is no sheet to ask for.
      if (team.dataCoverage === 'none') return { ...base, status: 'none', players: [], error: null };
      const url = playerStatsUrl(team.id, ssid);
      try {
        const names = parseStatSheetNames(JSON.parse(await body(team.slug, url)) as unknown, {
          expectedTeamId: team.id,
          expectedSeasonId: ssid,
          url,
        });
        if (names === null || names.length === 0) return { ...base, status: 'none', players: [], error: null };
        return { ...base, status: 'ok', players: names, error: null };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(`WARN ${team.slug}: ${error}`);
        // Last season does not change: what an earlier run read is still true.
        if (read) return prior;
        return { ...base, status: 'error', players: [], error };
      }
    }),
  );

  const file: PriorPlayers = {
    season: args.year,
    sport: SPORT_ID,
    sportSeasonId: ssid,
    fetchedAt,
    source: { id: 'maxpreps-api', builtBy: 'scripts/fetch-prior-players.ts', notes: NOTES },
    teams,
    counts: countPriorPlayers(teams),
  };
  const validated = PriorPlayersSchema.safeParse(file);
  if (!validated.success) {
    console.error('FAILED: the assembled file does not validate:');
    for (const i of validated.error.issues.slice(0, 10)) console.error(`  ${i.path.join('.') || '(root)'}: ${i.message}`);
    return 1;
  }

  const c = file.counts;
  const unread = teams.filter((t) => t.status === 'error' || t.status === 'pending').map((t) => t.slug);
  console.log(
    `\n${c.players} players on ${c.teamsWithPlayers} stat sheets · ${c.withGrade} with a class · ${c.withJersey} with a number · ` +
      `${c.teamsWithNone} team(s) with no stats that season · ${c.teamsUnread} unread` +
      (unread.length ? `: ${unread.join(', ')}` : ''),
  );
  const exitCode = unread.length ? 1 : 0;
  // A run that read no sheet at all (every call refused) has nothing to say: whatever file is there,
  // this season's or another's, is worth more than a list of 'error'.
  if (c.teamsWithPlayers === 0 && teams.some((t) => t.status === 'error')) {
    console.error(`FAILED: no stat sheet could be read. Nothing written: ${path.relative(process.cwd(), args.out)} is as it was.`);
    return 1;
  }
  if (args.dryRun) {
    console.log('dry run: nothing written');
    return exitCode;
  }
  const same = (a: PriorPlayers | undefined) =>
    a !== undefined && JSON.stringify({ ...a, fetchedAt: '' }) === JSON.stringify({ ...validated.data, fetchedAt: '' });
  const before = existsSync(args.out) ? PriorPlayersSchema.safeParse(JSON.parse(readFileSync(args.out, 'utf8'))) : null;
  if (before?.success && same(before.data)) {
    console.log(`no change: ${path.relative(process.cwd(), args.out)} left as it was`);
    return exitCode;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(file), 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), args.out)}`);
  return exitCode;
}

runCliIfMain(import.meta.url, main);
