/**
 * MaxPreps team PLAYER STATS — `GET /gatewayweb/react/team-season-player-stats/rollup/v1
 * ?teamId=&sportSeasonId=` on the ghost API (SPEC §1.1k).
 *
 * This is the call the team's `/stats/` page makes from the browser (page component `/team/stats`,
 * function `eM` in the 2026-10-02 build): the page itself server-renders only a top-3 "leaders"
 * card, and the legacy print view (`/print/team_stats.aspx`) carries the same table without the
 * career links. The JSON carries them, so every row joins to the roster on the career id.
 *
 * Every registry team (all nine leagues and the three independents) is read the same way, and joined to the rosters on the
 * career id.
 *
 * Shape [V] 2026-10-02, all 15 SCVAL teams (the other leagues' teams are read by the same code
 * and fail loudly on any drift, never silently): `data.groups[]` ("Field Stats", "Goaltending Stats"), each
 * with `subgroups[]` (a second subgroup "… (2)" holds the overflow columns), each a table of
 * `stats.columns[]` ({name, header, displayName, overallValue, columnType}) and `stats.rows[]`
 * whose `columns[i]` lines up with `stats.columns[i]` ({value, href, caption}). Column `Name`
 * carries the career URL in `href` and the class year as `caption` ("(Sr)").
 *
 * A team whose coach has entered no stats answers HTTP 400 `{status: 400, message: "No data was
 * found for this request.", data: null}` — five teams on 2026-10-02, exactly the five whose roster
 * pages flag no athlete `hasStats`. That is "publishes no stats", not a failure.
 *
 * What a number means. MaxPreps returns every cell as a string, "0" included, whether or not the
 * coach tracks that stat at all ("Min" is "0" for every player on most teams). So a stat is
 * TRACKED for a team when the team's own total (`overallValue`) is above zero, and only then are
 * its cells read: a tracked 0 is a real zero, an untracked column is null for everyone. Per-game
 * and percentage columns are dropped — they are arithmetic on the counts, and recomputing them is
 * safer than trusting a rounded string. A total with no player holding any of it (Hollister's
 * minutes) is not tracked either, and a count whose rows add up to more than the team total is
 * flagged in `warnings` (reconcileTotals).
 *
 * Loud on drift, like the roster adapter: a missing Name column, a row whose cell count differs
 * from the header, a non-numeric count, or two subgroups disagreeing about the same player's
 * goals all THROW, which the fetch script turns into a per-team failure.
 */

import { z } from 'zod';

import { MaxPrepsError, type MaxPrepsClient } from './maxpreps';
import { careerIdFromUrl } from './maxpreps-roster';
import {
  FIELD_STAT_KEYS,
  GOALIE_STAT_KEYS,
  type FieldStatKey,
  type FieldStats,
  type GoalieStatKey,
  type GoalieStats,
  type TeamPlayerStats,
} from '../player-stats-schema';
import type { Team } from '../types';
import { MAXPREPS_API, SPORT_SEASON_ID } from '../season';

// ---------------------------------------------------------------- the columns we keep

/** MaxPreps column name → our key, for the "Field Stats" group. */
export const FIELD_COLUMNS = {
  GamesPlayed: 'gamesPlayed',
  FieldMinutesPlayed: 'minutes',
  Goals: 'goals',
  Assists: 'assists',
  Points: 'points',
  Steals: 'steals',
  Shots: 'shots',
  ShotsOnGoal: 'shotsOnGoal',
  GameWinningGoal: 'gameWinningGoals',
} as const satisfies Record<string, FieldStatKey>;

/** MaxPreps column name → our key, for the "Goaltending Stats" group. */
export const GOALIE_COLUMNS = {
  GamesPlayed: 'gamesPlayed',
  MinutesPlayed: 'minutes',
  OvertimeMinutesPlayed: 'overtimeMinutes',
  OpponentShotsOnGoal: 'opponentShotsOnGoal',
  GoalsAgainst: 'goalsAgainst',
  Saves: 'saves',
  ShutOuts: 'shutouts',
  Win: 'wins',
  Loss: 'losses',
  Tie: 'ties',
} as const satisfies Record<string, GoalieStatKey>;

/** Arithmetic on the counts above; dropped on purpose (see the header). */
export const DERIVED_COLUMNS = new Set([
  'GoalsPerGame',
  'AssistsPerGame',
  'PointsPerGame',
  'ShotsPerGame',
  'ShotsOnGoalPerGame',
  'ShotsOnGoalPercentage',
  'SavesPerGame',
  'SavePercentage',
  'GoalsAgainstAverage',
]);

/** Minutes can be fractional; every other kept stat is a whole count. */
const FRACTIONAL = new Set(['minutes', 'overtimeMinutes']);

const GROUPS = {
  'Field Stats': { kind: 'field', columns: FIELD_COLUMNS },
  'Goaltending Stats': { kind: 'goalkeeping', columns: GOALIE_COLUMNS },
} as const;

// ---------------------------------------------------------------- the wire format

const CellSchema = z.looseObject({
  value: z.string().nullable(),
  href: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
});

const ColumnSchema = z.looseObject({
  name: z.string(),
  header: z.string().optional(),
  overallValue: z.string().nullable().optional(),
});

const SubgroupSchema = z.looseObject({
  name: z.string(),
  stats: z.looseObject({
    columns: z.array(ColumnSchema),
    rows: z.array(z.looseObject({ columns: z.array(CellSchema) })),
  }),
});

export const PlayerStatsResponseSchema = z.looseObject({
  status: z.union([z.number(), z.string()]).optional(),
  message: z.unknown().optional(),
  data: z
    .looseObject({
      teamId: z.string(),
      sportSeasonId: z.string(),
      groups: z.array(z.looseObject({ name: z.string(), subgroups: z.array(SubgroupSchema) })),
      lastUpdated: z.looseObject({ timeStamp: z.string().nullable().optional() }).nullable().optional(),
    })
    .nullable(),
});

// ---------------------------------------------------------------- parsed shape

export interface StatsSheetPlayer {
  /** The `?careerid=` key from the Name cell's link: the join to the roster. */
  careerId: string | null;
  careerUrl: string | null;
  /** As the stats sheet prints it: "K. Tsiagkas". */
  shortName: string;
  jersey: string | null;
  /** Null when the player is in no Field Stats subgroup. */
  field: FieldStats | null;
  /** Null when the player is in no Goaltending Stats subgroup. */
  goalkeeping: GoalieStats | null;
}

export interface PlayerStatsPage {
  teamId: string;
  sportSeasonId: string;
  /** MaxPreps' own "last updated" stamp (naive local time), when it gives one. */
  lastUpdated: string | null;
  tracked: { field: FieldStatKey[]; goalkeeping: GoalieStatKey[] };
  /** The team's own totals for the tracked stats. */
  totals: {
    field: Partial<Record<FieldStatKey, number>>;
    goalkeeping: Partial<Record<GoalieStatKey, number>>;
  };
  players: StatsSheetPlayer[];
  warnings: string[];
}

export function playerStatsUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
  return `${MAXPREPS_API}/gatewayweb/react/team-season-player-stats/rollup/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
}

/** The human-facing page for the same numbers: `<team url>/stats/`. */
export function teamStatsPageUrl(maxprepsTeamUrl: string | null): string | null {
  return maxprepsTeamUrl ? `${maxprepsTeamUrl.replace(/\/+$/, '')}/stats/` : null;
}

/**
 * The entry for a team no run has covered yet: nothing fetched, so nothing claimed (status
 * 'pending', no players). Built by scripts/fetch-player-stats.ts for a team its `--leagues` scope
 * leaves out when the previous file held no row for it.
 */
export function pendingPlayerStats(team: Team): TeamPlayerStats {
  return {
    slug: team.slug,
    teamId: team.id,
    name: team.name,
    maxprepsTeamId: null,
    statsUrl: teamStatsPageUrl(team.external.maxprepsTeamUrl),
    status: 'pending',
    lastUpdated: null,
    tracked: { field: [], goalkeeping: [] },
    totals: { field: {}, goalkeeping: {} },
    players: [],
    warnings: [],
    fetchedAt: null,
    error: null,
  };
}

// ---------------------------------------------------------------- parsing

function fail(what: string, url: string): never {
  throw new MaxPrepsError(`player stats: ${what}`, { url });
}

const NO_DATA = /^no data was found for this request\.?$/i;

/** The envelope's `message`, or its first `errors` entry. */
function describe(envelope: { message?: unknown; errors?: unknown }): string {
  if (typeof envelope.message === 'string') return envelope.message;
  if (Array.isArray(envelope.errors) && typeof envelope.errors[0] === 'string') return envelope.errors[0];
  return '(no message)';
}

/** MaxPreps' answer for a team whose coach has entered no stats [V] 2026-10-02. */
function isNoDataAnswer(envelope: { message?: unknown; errors?: unknown }): boolean {
  return NO_DATA.test(describe(envelope).trim());
}

function toNumber(raw: string | null, key: string, where: string, url: string): number | null {
  const v = raw?.trim() ?? '';
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) fail(`${where}: ${key} is "${raw}", not a count`, url);
  if (!FRACTIONAL.has(key) && !Number.isInteger(n)) fail(`${where}: ${key} is "${raw}", not a whole count`, url);
  return n;
}

const emptyField = (): FieldStats =>
  Object.fromEntries(FIELD_STAT_KEYS.map((k) => [k, null])) as FieldStats;
const emptyGoalie = (): GoalieStats =>
  Object.fromEntries(GOALIE_STAT_KEYS.map((k) => [k, null])) as GoalieStats;

export interface ParsePlayerStatsOptions {
  expectedTeamId?: string;
  expectedSeasonId?: string;
  url?: string;
}

/**
 * The rollup response → one record per player, or null when MaxPreps has no stats for the team
 * (the 400 "No data was found" envelope). Throws on anything it cannot read with certainty.
 */
export function parsePlayerStats(
  raw: unknown,
  opts: ParsePlayerStatsOptions = {},
): PlayerStatsPage | null {
  const url = opts.url ?? '(player stats)';
  const parsed = PlayerStatsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    fail(`schema drift: ${issues}`, url);
  }
  const data = parsed.data.data;
  const status = String(parsed.data.status);
  // Only MaxPreps' own "no stats" answer means no stats. Any other 400 (a bad team or season id)
  // or empty envelope is a failure, so the fetch script carries the previous rows forward.
  if (data === null || status === '400') {
    if (status === '400' && data === null && isNoDataAnswer(parsed.data)) return null;
    fail(`no data and status ${status}: ${describe(parsed.data)}`, url);
  }
  const expectedSeason = opts.expectedSeasonId ?? SPORT_SEASON_ID;
  if (data.sportSeasonId !== expectedSeason) {
    fail(`sportSeasonId ${data.sportSeasonId}, expected ${expectedSeason}`, url);
  }
  if (opts.expectedTeamId && data.teamId !== opts.expectedTeamId) {
    fail(`teamId ${data.teamId}, expected ${opts.expectedTeamId}`, url);
  }

  const warnings: string[] = [];
  const tracked = { field: new Set<FieldStatKey>(), goalkeeping: new Set<GoalieStatKey>() };
  const totals: PlayerStatsPage['totals'] = { field: {}, goalkeeping: {} };
  const byKey = new Map<string, StatsSheetPlayer>();
  const order: string[] = [];

  for (const group of data.groups) {
    const spec = GROUPS[group.name as keyof typeof GROUPS];
    if (!spec) {
      warnings.push(`ignored stats group "${group.name}"`);
      continue;
    }
    for (const sub of group.subgroups) {
      const where = `${group.name}${sub.name ? ` / ${sub.name}` : ''}`;
      const cols = sub.stats.columns;
      const nameAt = cols.findIndex((c) => c.name === 'Name');
      const jerseyAt = cols.findIndex((c) => c.name === 'Jersey');
      if (nameAt < 0) fail(`${where}: no Name column`, url);

      // Which columns this subgroup contributes, and which of them the team actually tracks.
      const kept: Array<{ at: number; key: string }> = [];
      cols.forEach((c, at) => {
        if (at === nameAt || at === jerseyAt || DERIVED_COLUMNS.has(c.name)) return;
        const key = (spec.columns as Record<string, string>)[c.name];
        if (!key) {
          warnings.push(`${where}: ignored unknown column ${c.name}`);
          return;
        }
        const total = toNumber(c.overallValue ?? null, key, `${where} total`, url);
        if (total === null || total <= 0) return;
        (tracked[spec.kind] as Set<string>).add(key);
        const sums = totals[spec.kind] as Record<string, number>;
        if (key in sums && sums[key] !== total) {
          fail(`${where}: team total for ${key} is ${total} here, ${sums[key]} elsewhere`, url);
        }
        sums[key] = total;
        kept.push({ at, key });
      });

      for (const row of sub.stats.rows) {
        if (row.columns.length !== cols.length) {
          fail(`${where}: a row has ${row.columns.length} cells for ${cols.length} columns`, url);
        }
        const nameCell = row.columns[nameAt];
        const shortName = nameCell.value?.trim() ?? '';
        if (!shortName) fail(`${where}: a row has no player name`, url);
        const careerUrl = nameCell.href?.trim() || null;
        const careerId = careerIdFromUrl(careerUrl);
        const jersey = jerseyAt >= 0 ? row.columns[jerseyAt].value?.trim() || null : null;
        const key = careerId ?? `${shortName}|${jersey ?? ''}`;

        let player = byKey.get(key);
        if (!player) {
          player = { careerId, careerUrl, shortName, jersey, field: null, goalkeeping: null };
          byKey.set(key, player);
          order.push(key);
        }
        let line: Record<string, number | null>;
        if (spec.kind === 'field') line = player.field ??= emptyField();
        else line = player.goalkeeping ??= emptyGoalie();
        for (const { at, key: stat } of kept) {
          const value = toNumber(row.columns[at].value, stat, `${where} / ${shortName}`, url);
          if (line[stat] !== null && value !== null && line[stat] !== value) {
            fail(`${where} / ${shortName}: ${stat} is ${value} here, ${line[stat]} in another table`, url);
          }
          line[stat] = value ?? line[stat];
        }
      }
    }
  }

  const players = order.map((k) => byKey.get(k)!);
  for (const p of players) {
    const f = p.field;
    if (f && f.points !== null && f.goals !== null && f.assists !== null && f.points !== 2 * f.goals + f.assists) {
      warnings.push(`${p.shortName}: points ${f.points} is not 2 × ${f.goals} goals + ${f.assists} assists`);
    }
  }

  return reconcileTotals({
    teamId: data.teamId,
    sportSeasonId: data.sportSeasonId,
    lastUpdated: data.lastUpdated?.timeStamp ?? null,
    tracked: {
      field: FIELD_STAT_KEYS.filter((k) => tracked.field.has(k)),
      goalkeeping: GOALIE_STAT_KEYS.filter((k) => tracked.goalkeeping.has(k)),
    },
    totals,
    players,
    warnings,
  });
}

/** Counts that add up across players; games, minutes and overtime minutes do not, so are not compared. */
const ADDITIVE_FIELD = new Set<FieldStatKey>([
  'goals', 'assists', 'points', 'shots', 'shotsOnGoal', 'gameWinningGoals', 'steals',
]);
const ADDITIVE_GOALIE = new Set<GoalieStatKey>([
  'opponentShotsOnGoal', 'saves', 'goalsAgainst', 'shutouts', 'wins', 'losses', 'ties',
]);

/**
 * Hold the tracked stats to the rows. A stat is tracked when the team's total is above zero, but
 * MaxPreps sometimes serves a total with no player holding any of it (Hollister's minutes: team 60,
 * every player 0). Those per-player zeros are not real zeros, so the stat is dropped for the team
 * (untracked, null for everyone) with a warning, rather than shown as 0 for every player. And when
 * the rows add up to MORE than the team total for a count, the figures are MaxPreps' own and are
 * kept as published, but the disagreement is recorded in `warnings`.
 *
 * Generic over the rows so scripts can apply the same rule to an already-built file.
 */
export function reconcileTotals<
  T extends {
    tracked: { field: FieldStatKey[]; goalkeeping: GoalieStatKey[] };
    totals: {
      field: Partial<Record<FieldStatKey, number>>;
      goalkeeping: Partial<Record<GoalieStatKey, number>>;
    };
    players: Array<{
      field: Record<string, number | null> | null;
      goalkeeping: Record<string, number | null> | null;
    }>;
    warnings: string[];
  },
>(page: T): T {
  const warnings = [...page.warnings];
  const kinds = [
    { kind: 'field', additive: ADDITIVE_FIELD as ReadonlySet<string>, label: 'field' },
    { kind: 'goalkeeping', additive: ADDITIVE_GOALIE as ReadonlySet<string>, label: 'goalkeeping' },
  ] as const;
  const tracked = { field: [...page.tracked.field], goalkeeping: [...page.tracked.goalkeeping] };
  const totals = { field: { ...page.totals.field }, goalkeeping: { ...page.totals.goalkeeping } };
  const players = page.players.map((p) => ({
    ...p,
    field: p.field ? { ...p.field } : null,
    goalkeeping: p.goalkeeping ? { ...p.goalkeeping } : null,
  }));

  for (const { kind, additive, label } of kinds) {
    const keys = tracked[kind] as string[];
    const sums = totals[kind] as Record<string, number>;
    for (const key of [...keys]) {
      const cells = players
        .map((p) => p[kind]?.[key])
        .filter((v): v is number => typeof v === 'number');
      const total = sums[key];
      const sum = cells.reduce((a, b) => a + b, 0);
      if (!cells.some((v) => v > 0)) {
        keys.splice(keys.indexOf(key), 1);
        delete sums[key];
        for (const p of players) if (p[kind]) p[kind]![key] = null;
        warnings.push(
          `${label} ${key}: team total is ${total} but no player has any; not shown rather than as zeros`,
        );
      } else if (additive.has(key) && sum > total) {
        warnings.push(
          `${label} ${key}: players add up to ${sum}, above MaxPreps' team total of ${total}; both as published`,
        );
      }
    }
  }
  return { ...page, tracked, totals, players, warnings };
}

/**
 * Fetch one team's rollup. The client throws on any non-2xx, so a 400 is read from the error's
 * body: MaxPreps' "No data was found" envelope comes back as null, the same as parsing that
 * envelope, and any other 400 — or one whose body cannot be read — still throws.
 *
 * `onRaw` sees the body as received, BEFORE it is decoded or validated, so a response that drifted
 * (or is not JSON at all) is still handed over — what --capture saves is exactly what failed.
 * parsePlayerStats does the schema check, once.
 */
export async function fetchPlayerStats(
  client: MaxPrepsClient,
  teamId: string,
  /** Sees the raw body before anything reads it — scripts/fetch-player-stats.ts --capture. */
  onRaw?: (body: string) => void,
): Promise<PlayerStatsPage | null> {
  const url = playerStatsUrl(teamId);
  let raw: unknown;
  try {
    const res = await client.text(url, 'application/json');
    onRaw?.(res.data);
    try {
      raw = JSON.parse(res.data) as unknown;
    } catch (err) {
      throw new MaxPrepsError(`invalid JSON: ${(err as Error).message}`, { url, httpStatus: res.meta.httpStatus });
    }
  } catch (err) {
    if (!(err instanceof MaxPrepsError) || err.httpStatus !== 400 || !err.body) throw err;
    onRaw?.(err.body);
    try {
      raw = JSON.parse(err.body) as unknown;
    } catch {
      // A 400 that is not JSON is not MaxPreps' "no data" envelope: the HTTP error says it best.
      throw err;
    }
  }
  return parsePlayerStats(raw, { expectedTeamId: teamId, url });
}

// ---------------------------------------------------------------- the roster join

/** The roster fields the join reads (a subset of lib/rosters-schema.ts' RosterPlayer). */
export interface RosterJoinPlayer {
  careerId: string | null;
  athleteId: string | null;
  fullName: string;
}

export interface JoinedStatLine extends StatsSheetPlayer {
  athleteId: string | null;
  fullName: string;
  onRoster: boolean;
}

/**
 * Each stats-sheet player, joined to the team's roster on the career id: the roster's full name
 * and per-season athlete id when the join finds the player, the sheet's own short name otherwise.
 */
export function joinToRoster(
  page: PlayerStatsPage,
  roster: readonly RosterJoinPlayer[],
): { lines: JoinedStatLine[]; warnings: string[] } {
  const byCareer = new Map(
    roster.filter((p) => p.careerId !== null).map((p) => [p.careerId as string, p]),
  );
  const warnings: string[] = [];
  const lines = page.players.map((p): JoinedStatLine => {
    const r = p.careerId ? byCareer.get(p.careerId) : undefined;
    if (!r) warnings.push(`${p.shortName} has stats but is not on the MaxPreps roster`);
    return {
      ...p,
      athleteId: r?.athleteId ?? null,
      fullName: r?.fullName ?? p.shortName,
      onRoster: r !== undefined,
    };
  });
  return { lines, warnings };
}
