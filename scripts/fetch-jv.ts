#!/usr/bin/env tsx
/**
 * `--level freshman` (added 2026-11-25, girls soccer and boys basketball: owner decision) reads the freshman level the
 * same way: each school's MaxPreps schedule feed with the freshman season id (lib/season.ts FRESHMAN_SPORT_SEASON_ID)
 * instead of the JV one, into data/<sport>/freshman.json, a file of the JV file's shape (lib/jv/jv-schema.ts). It reads
 * MaxPreps only: si.com is unavailable for every school, and none of the JV file's other sources (school sites, league
 * schedules) is read. A build with no freshman season id (the fall sports, the VAL) refuses the flag. Captures and
 * fixtures are `freshman-sched-<slug>.json`. Everything else below holds for both levels.
 *
 * Fetch every registry school's JV games into data/field-hockey/jv.json: MaxPreps' JV schedule feed for all 102
 * schools, and si.com's JV team page for each of the 102 (lib/jv/jv-teams.ts).
 *
 *   pnpm fetch-jv                       live: 102 MaxPreps JSON calls + up to 102 si.com pages
 *   pnpm fetch-jv --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-jv --no-sblive           MaxPreps only; si.com rows are carried from the previous file
 *   pnpm fetch-jv --fixtures <dir>      offline: read jv-sched-<slug>.json and jv-sblive-<slug>.html captures
 *   pnpm fetch-jv --capture <dir>       live, and save each response under those names in <dir>
 *   pnpm fetch-jv --out <path>          write somewhere else
 *   pnpm fetch-jv --dry-run             parse and report, write nothing (captures included)
 *   pnpm fetch-jv --fetched-at <iso>    pin the stamp (reproducible fixture builds)
 *   pnpm fetch-jv --force               run even outside the Aug 1 – Nov 28 season window
 *   pnpm fetch-jv --all-box-scores      read every JV box score again, whatever its row says
 *   pnpm fetch-jv --level freshman      the freshman level instead (below), into data/<sport>/freshman.json
 *
 * The MaxPreps call is the varsity pipeline's own schedule-calculated read with the JV season id
 * (JV_SPORT_SEASON_ID) and the school's registry id, through the MaxPreps client's budget
 * (concurrency <= 3, 500 ms between request starts); each JV row becomes a Game exactly as a
 * varsity row does (lib/pipeline/normalize.ts normalizeGames), except that no JV game is read as a shootout
 * win (`level: 'jv'`: the sections' shootout rules are varsity rules). si.com pages go through the si.com client's
 * own gate (one at a time, 1 s apart, the browser User-Agent si.com requires). The file keeps what
 * each source said; lib/jv/jv-merge.ts decides what the site shows, MaxPreps first.
 *
 * JV box scores (added 2026-11-27, for the JV game pages): for each covered school, MaxPreps' per-game JV stats
 * table and, for each MaxPreps JV final of the school's whose row there has a count above zero, the school's box
 * score for that game, read with the varsity reader (scripts/lib/box-scores.ts) and the JV season id, again only
 * when the row changed. One more call per school, plus one per new or edited game. Captures and fixtures are
 * `jv-game-stats-<slug>.json` and `jv-box-<slug>-<contest id>.json`. A failure here never fails the school or the
 * run (readJvBoxScores). The freshman level reads none.
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
 * (scripts/lib/team-scope.ts readPreviousFile): each team row, each game and each si.com row is held to its
 * own schema, and one that fails costs only itself, named in the log. The whole-file schema fails
 * whenever the registry grows (it wants one row per registry team, in registry order), and before
 * this salvage a `--leagues` run over such a file carried nothing: every team outside the run went
 * to 'pending' and lost its games. A team outside the run whose own row is dropped is 'pending' and
 * its games are not carried (the run exits 1, as the other two scripts do). A file of another season
 * or JV season id keeps nothing. Only a previous file that is not JSON, or holds no teams[] array,
 * stops the run (exit 1, nothing written), since nothing in it can be told apart from a wipe.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ZodType } from 'zod';

import { parseFetchedAtFlag, parseLeaguesFlag } from '../lib/cli-flags';
import {
  describeIssues,
  describePrevious,
  formatLeagueSummary,
  inScope,
  readPreviousFile,
  runExitCode,
  summarizeByLeague,
  teamsInScope,
  type PreviousRows,
} from './lib/team-scope';
import { droppedTeams, loadPreviousOrFail, prepareCapture, saveCapture, validateAssembled, writeIfChanged } from './lib/team-file';
import { readBoxScores, readGameRows, type BoxScoreSource } from './lib/box-scores';
import type { BoxScore } from '../lib/players/player-stats-schema';
import { RostersSchema } from '../lib/players/rosters-schema';
import type { RosterJoinPlayer } from '../lib/sources/maxpreps-player-stats';
import { byDateThenId, localDateKey, monthDay } from '../lib/format';
import { mergeJv } from '../lib/jv/jv-merge';
import {
  JvFileSchema,
  JvGameSchema,
  JvSbliveRowSchema,
  JvTeamSchema,
  countJv,
  jvContentKey,
  type JvFile,
  type JvSbliveRow,
  type JvSourceState,
  type JvTeam,
} from '../lib/jv/jv-schema';
import { jvMaxprepsScheduleUrl, jvSbliveGamesUrl, jvSbliveTeamId } from '../lib/jv/jv-teams';
import { INDEPENDENT_LEAGUES, LEAGUES_PROPER, seasonWindowBounds } from '../lib/leagues';
import { normalizeGames } from '../lib/pipeline/normalize';
import { inSeasonWindow } from '../lib/pipeline/steps/window';
import { FRESHMAN_SPORT_SEASON_ID, JV_SPORT_SEASON_ID, SEASON_YEAR, maxprepsLevelTeamUrl } from '../lib/season';
import { HttpClient } from '../lib/sources/http';
import { MaxPrepsClient, ScheduleResponseSchema, assertFeedHasTeam, maxprepsScheduleUrl, splitTbaRows, type ScheduleRow } from '../lib/sources/maxpreps';
import { SBLIVE_HTTP_OPTIONS } from '../lib/sources/sblive';
import { combineJvCopies, parseJvTeamGamesPage, type JvSbliveCopy } from '../lib/sources/sblive-jv';
import { TEAMS } from '../lib/teams';
import type { Game, LeagueId, Team } from '../lib/types';
import { runCliIfMain } from './cli';
import { DATA_DIR, PRIMARY_SOURCE } from '../lib/sports/current';
import { parseTeamsidelinePage } from '../lib/sources/teamsideline';
import { fallYearOf, teamsidelineGames } from '../lib/sources/teamsideline-games';
import { teamsidelineLevel, teamsidelineLevelUrl, teamsidelinePageMismatch } from '../lib/sources/teamsideline-season';

/** The level a run reads: the JV (the default) or the freshman team. */
export type FetchLevel = 'jv' | 'freshman';

interface Args {
  level: FetchLevel;
  fixtures: string | null;
  capture: string | null;
  leagues: LeagueId[] | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
  force: boolean;
  sblive: boolean;
  allBoxScores: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    level: 'jv',
    fixtures: null,
    capture: null,
    leagues: null,
    out: '',
    dryRun: false,
    fetchedAt: null,
    force: false,
    sblive: true,
    allBoxScores: false,
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
    else if (arg === '--all-box-scores') out.allBoxScores = true;
    else if (arg === '--level') {
      const level = next();
      if (level !== 'jv' && level !== 'freshman') throw new Error(`--level must be jv or freshman, not ${level}`);
      out.level = level;
    } else throw new Error(`unknown flag: ${arg}`);
  }
  if (!out.out) out.out = path.join(process.cwd(), DATA_DIR, out.level === 'freshman' ? 'freshman.json' : 'jv.json');
  if (out.fixtures && out.capture) throw new Error('--capture records live responses; it cannot be combined with --fixtures');
  return out;
}

const NOTES = [
  `One entry per registry school, all ${LEAGUES_PROPER.length} leagues and the ${INDEPENDENT_LEAGUES.map((l) => l.name).join(', ')}. games are MaxPreps’ JV contests (the schedule feed read with the JV season id), built exactly as a varsity game is; sblive are si.com’s scored JV finals from each school’s JV team page.`,
  'The site shows lib/jv/jv-merge.ts over these two lists: MaxPreps first; si.com fills a score MaxPreps lacks, adds a game MaxPreps does not list, and is noted beside a MaxPreps score it disagrees with.',
  'A si.com JV side is one of ours only by its si.com JV team id (lib/jv/jv-teams.ts), never by name.',
  'JV games are kept apart from varsity: no varsity standings, leaders, ratings or postseason read them. games are stored unclassified; lib/jv/jv-standings.ts decides at load which JV table each counts for, from its varsity counterpart.',
  'A source with status carried-forward kept the previous file’s rows after a failed fetch; its own fetchedAt says when those rows were read.',
  'boxScores, where present, are the JV team’s box scores (team-contest-player-stats), one per MaxPreps JV final of the school’s whose row in its per-game JV stats table (stats) has a count above zero, read as the varsity ones in player-stats.json are and joined to jv-rosters.json and rosters.json on the career id. unreadBoxScores are finals whose box score could not be read and none is kept.',
];

const FRESHMAN_NOTES = [
  `One entry per registry school, all ${LEAGUES_PROPER.length} leagues. games are MaxPreps’ freshman contests (the schedule feed read with the freshman season id), built exactly as a JV game is.`,
  'MaxPreps is the only source of the freshman level: sblive is empty and si.com unavailable for every school.',
  'Freshman games are kept apart from varsity and JV: no table, record, leader board, rating or postseason of either reads them, and the site keeps no freshman tables (owner decision, 2026-11-25).',
  'A source with status carried-forward kept the previous file’s rows after a failed fetch; its own fetchedAt says when those rows were read.',
];

/** The MaxPreps season id a level is read with; null when this build does not cover the level. */
function levelSeasonId(level: FetchLevel): string | null {
  return level === 'freshman' ? FRESHMAN_SPORT_SEASON_ID : JV_SPORT_SEASON_ID;
}

/** MaxPreps' human-facing schedule page of a school's team at the level. */
function levelScheduleUrl(team: Team, level: FetchLevel): string | null {
  if (level === 'jv') return jvMaxprepsScheduleUrl(team);
  const base = team.external.maxprepsTeamUrl;
  return base ? `${maxprepsLevelTeamUrl(base, 'freshman')}schedule/` : null;
}

/** What a run may take from the previous file: its team rows (PreviousRows), games and si.com rows. */
interface PreviousJv extends PreviousRows<JvTeam, JvFile> {
  readable: true;
  games: Game[];
  sblive: JvSbliveRow[];
  /** The log lines naming every row, game and si.com row not kept. */
  log: string[];
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
  const kept: T[] = [];
  list.forEach((entry, i) => {
    const parsed = schema.safeParse(entry);
    if (parsed.success) kept.push(parsed.data);
    else log.push(`WARN previous ${label}[${i}] does not validate and is dropped: ${describeIssues(parsed.error.issues)}`);
  });
  const times = new Map<string, number>();
  for (const row of kept) times.set(idOf(row), (times.get(idOf(row)) ?? 0) + 1);
  for (const [id, n] of times) if (n > 1) log.push(`WARN previous ${label}: ${n} entries claim ${id}; none is kept`);
  return kept.filter((row) => times.get(idOf(row)) === 1);
}

/**
 * The previous file's text, salvaged (see the header): `readable: false` when the run must stop.
 * Its log names every row, game and si.com row not kept.
 */
function readPrevious(text: string, label: string, seasonId: string): PreviousJv | { readable: false; reason: string } {
  const read = readPreviousFile(text, { season: SEASON_YEAR, row: JvTeamSchema, file: JvFileSchema });
  if (!read.readable) return { readable: false, reason: read.reason };
  const json = JSON.parse(text) as Record<string, unknown>;
  // This season's year with another JV (or freshman) season id is another season's games, as readPreviousFile treats
  // another year: every row is ignored and named.
  const rows: PreviousRows<JvTeam, JvFile> =
    read.otherSeason === null && json.sportSeasonId !== seasonId
      ? {
          rows: new Map(),
          dropped: [
            ...read.dropped,
            ...[...read.rows.keys()].map((slug) => ({
              slug,
              team: slug,
              reason: `season id ${String(json.sportSeasonId)}, not ${seasonId}`,
            })),
          ],
          otherSeason: `${String(json.season)} (JV season id ${String(json.sportSeasonId)})`,
          whole: null,
          problems: [],
        }
      : read;
  const log = describePrevious(rows, label);
  if (rows.otherSeason !== null) return { ...rows, readable: true, games: [], sblive: [], log };
  const games = salvageList(json.games, JvGameSchema, (g) => g.contestId, `${label} games`, log);
  const sblive = salvageList(json.sblive, JvSbliveRowSchema, (r) => r.sbliveGameId, `${label} sblive`, log);
  return { ...rows, readable: true, games, sblive, log };
}

/** A schedule body → its rows, with MaxPreps' routing guard: a non-empty feed must contain the school. */
function parseSchedule(body: string, team: Team, label: string): ScheduleRow[] {
  const rows = ScheduleResponseSchema.parse(JSON.parse(body) as unknown).data;
  assertFeedHasTeam(rows, team.id, `${label} feed`);
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

/** The capture and fixture file name of the second level's TeamSideline page. */
export const TEAMSIDELINE_JV_FILE = 'jv-teamsideline-second.html';

const TEAMSIDELINE_NOTES = [
  'One entry per registry school. games are the league\u2019s own second-level schedule page (lib/sports/shape.ts TeamsidelineSportSeason.pages.second), read as the varsity build reads its main page (lib/sources/teamsideline-games.ts); league says whether it was read this run.',
  'MaxPreps and si.com carry none of these schools, so both are unavailable for every team.',
  'JV games are kept apart from the main level: no table, leader board, rating or playoff picture of the main level reads them. games are stored unclassified; lib/jv/jv-standings.ts decides at load which second-level table each counts for, from its main-level counterpart.',
  'A league page that cannot be read keeps the previous file\u2019s games (league status carried-forward, with the previous read\u2019s fetchedAt).',
];

/**
 * The second level of a build whose primary source is the league's TeamSideline site (the VAL's 6th/7th grade): one
 * page, read whole, instead of a MaxPreps feed and a si.com page per school. The page must be the configured program
 * and level (teamsidelinePageMismatch); one that cannot be read, or is another, keeps the previous file's games.
 */
async function fetchJvFromTeamsideline(args: Args, fetchedAt: string): Promise<number> {
  const level = teamsidelineLevel('second');
  const url = teamsidelineLevelUrl('second');
  let previous: JvFile | null = null;
  try {
    const parsed = JvFileSchema.safeParse(JSON.parse(readFileSync(args.out, 'utf8')) as unknown);
    if (parsed.success && parsed.data.season === SEASON_YEAR) previous = parsed.data;
    else console.log(`previous ${path.relative(process.cwd(), args.out)}: not this season's valid file; nothing is carried`);
  } catch {
    console.log(`previous ${path.relative(process.cwd(), args.out)}: none; nothing is carried`);
  }

  let games: Game[] = [];
  let league: NonNullable<JvFile['league']>;
  try {
    let body: string;
    if (args.fixtures) {
      body = readFileSync(path.join(args.fixtures, TEAMSIDELINE_JV_FILE), 'utf8');
    } else {
      body = (await new HttpClient({ onLog: (l) => console.log(`  ${l}`) }).text(url)).body;
      const capture = prepareCapture(args);
      if (capture) saveCapture(capture, TEAMSIDELINE_JV_FILE, body);
    }
    const page = parseTeamsidelinePage(body);
    const mismatch = teamsidelinePageMismatch(page, 'second');
    if (mismatch !== null) throw new Error(`not the configured page: ${mismatch}`);
    const read = teamsidelineGames({ page, scheduleId: level.scheduleId, fallYear: fallYearOf(SEASON_YEAR), fetchedAt });
    for (const name of read.unknownNames) console.log(`  WARN "${name}" is no registry team's name; its games keep a side that is not ours`);
    games = read.games.map((g) => ({ ...g }) as Game);
    league = { url, status: 'ok', rowCount: page.games.length + page.playoffs.length, fetchedAt, error: null };
    console.log(`fetch-jv: ${page.title} · ${page.subtitle} · ${games.length} games (${games.filter((g) => g.status === 'final').length} final)`);
  } catch (err) {
    const error = (err as Error).message;
    const prior = previous?.league;
    if (previous && prior && (prior.status === 'ok' || prior.status === 'carried-forward')) {
      games = previous.games;
      league = { url, status: 'carried-forward', rowCount: prior.rowCount, fetchedAt: prior.fetchedAt, error };
    } else {
      league = { url, status: 'error', rowCount: null, fetchedAt: null, error };
    }
    console.log(`fetch-jv: the league's ${level.subtitle} page could not be read (${error}); ${league.status}`);
  }

  games.sort(byDateThenId);
  const teams: JvTeam[] = TEAMS.map((team) => ({
    slug: team.slug,
    teamId: team.id,
    name: team.name,
    maxprepsScheduleUrl: null,
    sbliveUrl: null,
    maxpreps: UNAVAILABLE,
    sblive: UNAVAILABLE,
  }));
  const file: JvFile = {
    season: SEASON_YEAR,
    fetchedAt,
    sportSeasonId: null,
    league,
    source: { builtBy: 'scripts/fetch-jv.ts', notes: TEAMSIDELINE_NOTES },
    teams,
    games,
    sblive: [],
    counts: countJv(teams, games, []),
  };
  const validated = validateAssembled(JvFileSchema, file);
  if (!validated) return 1;
  let whole: JvFile | undefined;
  if (previous) whole = previous;
  return writeIfChanged({
    out: args.out,
    dryRun: args.dryRun,
    whole,
    contentKey: jvContentKey,
    validated,
    file,
    exitCode: league.status === 'ok' ? 0 : 1,
  });
}

/** What a team row holds of its JV stats: the per-game table's read, its box scores, the finals not read. */
type TeamStats = Pick<JvTeam, 'stats' | 'boxScores' | 'unreadBoxScores'>;

/** A team row's stats fields as the previous file had them (nothing, when it had none). */
function priorStats(prior: JvTeam | undefined): TeamStats {
  if (!prior?.stats) return {};
  return {
    stats: prior.stats,
    ...(prior.boxScores ? { boxScores: prior.boxScores } : {}),
    ...(prior.unreadBoxScores ? { unreadBoxScores: prior.unreadBoxScores } : {}),
  };
}

/** The players a JV box score's lines are named from: the JV roster first, then the varsity one (a player called up or down). */
function jvRosterPlayers(): (slug: string) => RosterJoinPlayer[] {
  const read = (name: string) => {
    const file = path.join(process.cwd(), DATA_DIR, name);
    return existsSync(file) ? RostersSchema.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown).teams : [];
  };
  const varsity = read('rosters.json');
  const jv = read('jv-rosters.json');
  // joinToRoster keys on the career id and the last row wins, so the JV roster's spelling is the one kept.
  return (slug) => [...(varsity.find((t) => t.slug === slug)?.players ?? []), ...(jv.find((t) => t.slug === slug)?.players ?? [])];
}

/**
 * Each covered school's JV box scores (scripts/lib/box-scores.ts, the varsity reader with the JV season id): its
 * per-game JV stats table, then a box score for each MaxPreps JV final of its in `games` whose row has a count above
 * zero, read again only when the row changed. Failures never fail the school or the run: a table that cannot be read,
 * or that lists no game where the previous file holds box scores (a blip, not a wipe), keeps the previous box scores
 * (`stats` carried-forward); a box score that cannot be read keeps the previous one, or is named in `unreadBoxScores`.
 * Offline, a school with no `jv-game-stats-<slug>.json` capture keeps what the previous file had.
 */
async function readJvBoxScores(
  args: Args,
  client: MaxPrepsClient,
  capture: string | null,
  covered: readonly Team[],
  games: readonly Game[],
  priorTeam: ReadonlyMap<string, JvTeam>,
  seasonId: string,
  fetchedAt: string,
): Promise<Map<string, TeamStats>> {
  const src: BoxScoreSource = { client, fixtures: args.fixtures, capture, all: args.allBoxScores, prefix: 'jv-', sportSeasonId: seasonId };
  const rosterOf = jvRosterPlayers();
  const out = new Map<string, TeamStats>();
  await Promise.all(
    covered.map(async (team) => {
      const prior = priorTeam.get(team.slug);
      const kept = priorStats(prior);
      const read = await readGameRows(src, team.slug, team.id);
      if ('missing' in read && read.missing) {
        out.set(team.slug, kept);
        return;
      }
      const table = 'rows' in read && read.rows.length === 0 && kept.boxScores ? { error: 'the per-game JV stats table lists no game, but the previous file has box scores' } : read;
      if (!('rows' in table)) {
        console.warn(`WARN ${team.slug} JV stats: ${table.error}`);
        out.set(team.slug, { ...kept, stats: failed(prior?.stats, table.error, true) });
        return;
      }
      const finals = new Set(games.filter((g) => g.status === 'final' && involves(g, team.slug)).map((g) => g.contestId));
      const warnings: string[] = [];
      const box = await readBoxScores(src, team.slug, team.id, table.rows, finals, rosterOf(team.slug), kept.boxScores ?? [], warnings);
      for (const w of warnings) console.warn(`WARN ${team.slug} JV ${w}`);
      const have = new Set(box.games.map((b: BoxScore) => b.contestId));
      const unread = box.failed.filter((id) => !have.has(id));
      out.set(team.slug, {
        stats: ok(table.rows.length, fetchedAt),
        ...(box.games.length ? { boxScores: box.games } : {}),
        ...(unread.length ? { unreadBoxScores: unread } : {}),
      });
    }),
  );
  return out;
}

export async function main(argv: readonly string[]): Promise<number> {
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
  const freshman = args.level === 'freshman';
  const seasonId = levelSeasonId(args.level);
  if (seasonId === null || (freshman && PRIMARY_SOURCE !== 'maxpreps')) {
    console.log(`fetch-jv: this build covers no ${args.level} level (lib/sports/shape.ts freshmanSportSeasonId). Nothing written.`);
    return 1;
  }
  // A build whose primary source is the league's own site reads its second level from there (the VAL).
  if (PRIMARY_SOURCE === 'teamsideline') return fetchJvFromTeamsideline(args, fetchedAt);
  /** The level in log lines and capture names: 'JV' / 'jv', 'freshman' / 'freshman'. */
  const LABEL = freshman ? 'freshman' : 'JV';
  const PREFIX = freshman ? 'freshman' : 'jv';
  // si.com is read for the JV only.
  const sbliveUrlOf = (slug: string) => (freshman ? null : jvSbliveGamesUrl(slug));
  const loaded = loadPreviousOrFail(args.out, (text, label) => readPrevious(text, label, seasonId), 'Nothing written.', (p) => p.log);
  if (!loaded.ok) return 1;
  const previous = loaded.previous;
  const priorTeam: ReadonlyMap<string, JvTeam> = previous?.rows ?? new Map();
  // Registry teams whose previous row was dropped: nothing of theirs is carried, and one outside the
  // run is 'pending' and fails the run (summarizeByLeague / runExitCode).
  const dropped = droppedTeams(previous);

  const maxpreps = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });
  const sblive = new HttpClient({ ...SBLIVE_HTTP_OPTIONS, onLog: (l) => console.log(`  ${l}`) });
  const capture = prepareCapture(args);
  const save = (name: string, body: string) => {
    if (capture) saveCapture(capture, name, body);
  };
  const read = (name: string) => readFileSync(path.join(args.fixtures as string, name), 'utf8');

  const covered = teamsInScope(args.leagues);
  console.log(
    args.fixtures
      ? `fetch-jv: offline, from ${args.fixtures}`
      : `fetch-jv: ${covered.length} MaxPreps ${LABEL} feeds` +
          (freshman ? '' : args.sblive ? ` + ${covered.filter((t) => jvSbliveGamesUrl(t.slug)).length} si.com JV pages` : ', si.com skipped') +
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
        const url = maxprepsScheduleUrl(team.id, seasonId);
        const body = args.fixtures ? read(`${PREFIX}-sched-${team.slug}.json`) : (await maxpreps.text(url, 'application/json')).data;
        if (!args.fixtures) save(`${PREFIX}-sched-${team.slug}.json`, body);
        const split = splitTbaRows(parseSchedule(body, team, LABEL));
        const live = split.rows.filter((r) => r.calculatedFields.contestState !== 1);
        for (const r of split.rows) if (r.calculatedFields.contestState === 1) deleted.add(r.contest.contestId);
        // The varsity rule: an empty answer for a school we hold games for is a blip, not a wipe.
        if (live.length === 0 && had > 0) throw new Error(`${LABEL} feed returned no games but the previous file has ${had}`);
        mpRows.push(...split.rows);
        mpState.set(team.slug, ok(live.length, fetchedAt));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(`WARN ${team.slug} MaxPreps ${LABEL}: ${error}`);
        mpState.set(team.slug, failed(prior?.maxpreps, error, had > 0));
      }
    }),
  );

  // ---- si.com: one JV team page per covered school that has one.
  const copies: JvSbliveCopy[] = [];
  const sbState = new Map<string, JvSourceState>();
  for (const team of covered) {
    const url = sbliveUrlOf(team.slug);
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
  // level 'jv': the sections' shootout rules are varsity rules (lib/pipeline/normalize.ts NormalizeOptions), so
  // a level JV final stays a tie whatever MaxPreps flags, and is never read as a shootout win. A freshman game is read
  // the same way: 'jv' there means "not varsity".
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

  // ---- MaxPreps: each covered school's JV box scores, for the JV game pages (the JV level only).
  const stats = freshman ? new Map<string, TeamStats>() : await readJvBoxScores(args, maxpreps, capture, covered, games, priorTeam, seasonId, fetchedAt);
  const boxScoreCount = [...stats.values()].reduce((n, t) => n + (t.boxScores?.length ?? 0), 0);

  const teams: JvTeam[] = TEAMS.map((team) => {
    const prior = priorTeam.get(team.slug);
    const sbliveUrl = sbliveUrlOf(team.slug);
    if (!inScope(team, args.leagues)) {
      return (
        prior ?? {
          slug: team.slug,
          teamId: team.id,
          name: team.name,
          maxprepsScheduleUrl: levelScheduleUrl(team, args.level),
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
      maxprepsScheduleUrl: levelScheduleUrl(team, args.level),
      sbliveUrl,
      maxpreps: mpState.get(team.slug) ?? PENDING,
      sblive: sbState.get(team.slug) ?? (sbliveUrl ? PENDING : UNAVAILABLE),
      ...(stats.get(team.slug) ?? {}),
    };
  });

  const file: JvFile = {
    season: SEASON_YEAR,
    fetchedAt,
    sportSeasonId: seasonId,
    source: { builtBy: freshman ? 'scripts/fetch-jv.ts --level freshman' : 'scripts/fetch-jv.ts', notes: freshman ? FRESHMAN_NOTES : NOTES },
    teams,
    games,
    sblive: sbliveRows,
    counts: countJv(teams, games, sbliveRows),
  };
  const validated = validateAssembled(JvFileSchema, file);
  if (!validated) return 1;

  const merged = mergeJv({ games, sblive: sbliveRows, today, fetchedAt });
  console.log('');
  for (const t of teams) {
    const mine = merged.games.filter((g) => involves(g, t.slug));
    console.log(
      `${t.slug.padEnd(21)} MaxPreps ${t.maxpreps.status.padEnd(15)} si.com ${t.sblive.status.padEnd(15)} ` +
        `${String(mine.length).padStart(2)} games · ${mine.filter((g) => g.status === 'final').length} final` +
        (t.boxScores ? ` · ${t.boxScores.length} box scores` : '') +
        (t.stats?.error ? ` · stats: ${t.stats.error}` : '') +
        (t.maxpreps.error ? ` · MaxPreps: ${t.maxpreps.error}` : '') +
        (t.sblive.error ? ` · si.com: ${t.sblive.error}` : ''),
    );
  }
  // One line per league; a team counts as failed when either source failed.
  const statusOf = (t: JvTeam) =>
    [t.maxpreps.status, t.sblive.status].find((s) => s === 'error' || s === 'carried-forward') ?? t.maxpreps.status;
  const byLeague = summarizeByLeague(teams.map((t) => ({ slug: t.slug, status: statusOf(t) })), args.leagues, dropped);
  console.log('');
  for (const l of byLeague) console.log(formatLeagueSummary(l));
  const c = file.counts;
  console.log(
    `\n${c.games} MaxPreps ${LABEL} games (${c.finals} final) for ${c.teamsWithGames} of ${c.teams} schools · ` +
      (freshman
        ? `${carried.length} games carried forward`
        : `${c.sbliveRows} si.com JV finals · si.com filled ${merged.filled.length}, added ${merged.added.length}, ` +
          `differs on ${merged.differs.length} · ${carried.length} games and ${carriedRows.length} si.com rows carried forward · ` +
          `${boxScoreCount} JV box scores on ${[...stats.values()].filter((t) => t.boxScores).length} schools`),
  );
  // A covered team that failed decides the exit code, and so does an uncovered one whose previous
  // row was dropped (it is pending now), as in fetch-rosters and fetch-player-stats.
  const exitCode = runExitCode(byLeague, previous?.dropped ?? []);

  return writeIfChanged({
    out: args.out,
    dryRun: args.dryRun,
    whole: previous?.whole,
    contentKey: jvContentKey,
    validated,
    file,
    exitCode,
  });
}

runCliIfMain(import.meta.url, main);
