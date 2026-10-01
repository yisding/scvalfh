/**
 * MaxPreps schedule-calculated rows → Game[].
 *
 * Rules are SPEC §5.5 verbatim:
 *   1. dedupe on contest.contestId (each league game appears in both teams' feeds; 293 team-rows
 *      collapsed to 174 contests in the captured fixtures)
 *   2. DROP calculatedFields.contestState === 1 (Deleted) before anything else — such rows can
 *      carry a real scrimmage score, so keeping them would publish scrimmages as results
 *   3. a missing score is pending, NEVER 0-0
 *   4. home/away from teams[].homeAwayType (0/1/2), never from contestType and never from row order
 *   5. league flag from teams[].contestType === 0
 *   6. store both date forms (naive local + UTC)
 *   7. opponent identity by GUID; a non-member is a name only
 */

import { resolveTeam } from './teams';
import type {
  ContestId,
  Decider,
  Division,
  Game,
  GameSide,
  GameStatus,
  Outcome,
  SourceId,
} from './types';
import type { ContestTeam, ScheduleRow } from './sources/maxpreps';

export interface NormalizeOptions {
  /** ISO UTC stamp written into every Game.provenance.fetchedAt. */
  fetchedAt: string;
  scores?: SourceId;
  schedule?: SourceId;
}

export interface NormalizeResult {
  games: Game[];
  /** Non-fatal oddities worth a log line (SPEC §5.5.5 "log, don't pick silently"). */
  warnings: string[];
  stats: {
    rows: number;
    unique: number;
    dropped: { deleted: number; malformed: number };
    finals: number;
    pending: number;
    league: number;
  };
}

const OUTCOMES = new Set(['W', 'L', 'T']);

function toOutcome(value: string | null | undefined): Outcome | null {
  return value && OUTCOMES.has(value) ? (value as Outcome) : null;
}

/** contestState → our status (SPEC §1.1g). State 1 never reaches here. */
function statusFromContestState(state: number, isLive: boolean): GameStatus {
  switch (state) {
    case 4:
      return 'final';
    case 5:
      return 'score-pending';
    case 3:
      return 'live';
    case 2:
      return isLive ? 'live' : 'scheduled';
    default:
      // 0 = Unknown, never observed. Treat as scheduled; never as a result.
      return isLive ? 'live' : 'scheduled';
  }
}

/** YYYY-MM-DD from a naive local timestamp — no Date involved, so no zone can shift it. */
export function dateKeyOf(dateLocal: string): string {
  return dateLocal.slice(0, 10);
}

/** `calculatedFields.contestDateInGMT` is UTC but unsuffixed; make it explicit. */
export function toUtcIso(gmt: string): string {
  if (/[Zz]$/.test(gmt)) return gmt.slice(0, -1) + 'Z';
  if (/[+-]\d{2}:?\d{2}$/.test(gmt)) return gmt;
  return `${gmt}Z`;
}

/**
 * Build-time recap cleanup (DESIGN §5.8): drop the leading "On 9/24, ", drop "(City, CA)", and
 * shorten "the <School> varsity field hockey team" to "<School>".
 */
/**
 * MaxPreps' `contest.location` is a 50-character field, and it is free text: real values in this
 * season include "Senior Night", "Scrimmage", "Too be rescheduled", a coach's scoring note and a
 * genuine venue. Two consequences, both handled here.
 *
 * 1. A value that literally starts "Location:" IS a venue statement, and treating it as a note
 *    let the game page say "Hosted by St. Ignatius, San Francisco" directly above its own
 *    "Note: Location: Archbishop Mitty High School" — two places 45 miles apart, on one page.
 *    That prefix is unambiguous, so the rest of the string becomes `venue.name`.
 * 2. Anything else stays a note, but a note cut off at the source limit is marked as cut off:
 *    "…Noa played last quart" shipped verbatim and read as our bug rather than MaxPreps'.
 */
const LOCATION_LIMIT = 50;

export function splitLocation(raw: string | null | undefined): {
  name?: string;
  text: string | null;
} {
  const trimmed = raw?.trim();
  if (!trimmed) return { text: null };

  const venue = /^location\s*:\s*(.+)$/i.exec(trimmed);
  if (venue && venue[1].trim()) return { name: venue[1].trim(), text: null };

  // At the source's field limit and not ending on a sentence: drop the partial word and say so.
  if (trimmed.length >= LOCATION_LIMIT - 1 && !/[.!?…]$/.test(trimmed)) {
    const lastSpace = trimmed.lastIndexOf(' ');
    const kept = lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed;
    return { text: `${kept.replace(/[,;:]$/, '')}…` };
  }
  return { text: trimmed };
}

export function cleanRecap(description: string | null | undefined): string | null {
  if (!description) return null;
  let s = description.trim();
  if (!s) return null;
  s = s.replace(/^On \d{1,2}\/\d{1,2}(\/\d{2,4})?,\s*/, '');
  s = s.replace(/\s*\([^()]*\bCA\)/g, '');
  s = s.replace(/\bthe\s+(.+?)\s+varsity field hockey team\b/gi, '$1');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sideOf(team: ContestTeam, score: number | null): GameSide {
  const known = resolveTeam(team.teamId);
  return {
    teamId: known ? known.id : team.teamId || null,
    slug: known ? known.slug : null,
    name: known ? known.name : team.name,
    ...(team.city ? { city: team.city } : {}),
    score,
    result: toOutcome(team.result),
  };
}

/** Prefer the more complete of two rows for the same contest (scores can land in one feed first). */
function completeness(row: ScheduleRow): number {
  const cf = row.calculatedFields;
  const scored = row.contest.teams.filter((t) => t.score !== null).length;
  const stateRank = cf.contestState === 4 ? 4 : cf.contestState === 5 ? 3 : cf.contestState === 3 ? 2 : 1;
  return scored * 10 + stateRank + (cf.canonicalUrl ? 1 : 0);
}

export function normalizeGames(
  rows: readonly ScheduleRow[],
  opts: NormalizeOptions,
): NormalizeResult {
  const warnings: string[] = [];
  const stats = {
    rows: rows.length,
    unique: 0,
    dropped: { deleted: 0, malformed: 0 },
    finals: 0,
    pending: 0,
    league: 0,
  };

  // --- 1 + 2: dedupe on contestId, dropping Deleted rows first.
  const best = new Map<ContestId, ScheduleRow>();
  for (const row of rows) {
    if (row.calculatedFields.contestState === 1) {
      stats.dropped.deleted += 1;
      continue;
    }
    const id = row.contest.contestId;
    const prior = best.get(id);
    if (!prior || completeness(row) > completeness(prior)) best.set(id, row);
  }

  const games: Game[] = [];
  for (const row of best.values()) {
    const game = toGame(row, opts, warnings);
    if (!game) {
      stats.dropped.malformed += 1;
      continue;
    }
    games.push(game);
  }

  // Stable order: by local date, then by contestId so the JSON diff is small.
  games.sort((a, b) =>
    a.dateLocal === b.dateLocal
      ? a.contestId.localeCompare(b.contestId)
      : a.dateLocal.localeCompare(b.dateLocal),
  );

  stats.unique = games.length;
  stats.finals = games.filter((g) => g.status === 'final').length;
  stats.pending = games.filter((g) => g.status === 'score-pending').length;
  stats.league = games.filter((g) => g.isLeague).length;

  return { games, warnings, stats };
}

function toGame(
  row: ScheduleRow,
  opts: NormalizeOptions,
  warnings: string[],
): Game | null {
  const c = row.contest;
  const cf = row.calculatedFields;

  if (c.teams.length !== 2) {
    warnings.push(`contest ${c.contestId}: ${c.teams.length} team rows, expected 2 — dropped`);
    return null;
  }

  // --- 4: home/away strictly from homeAwayType.
  const byHomeAway = [...c.teams].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  const homeRow = byHomeAway.find((t) => t.homeAwayType === 0);
  const awayRow = byHomeAway.find((t) => t.homeAwayType === 1);
  const neutral = byHomeAway.every((t) => t.homeAwayType === 2);

  let first: ContestTeam;
  let second: ContestTeam;
  let site: Game['site'];
  if (homeRow && awayRow && homeRow !== awayRow) {
    first = homeRow;
    second = awayRow;
    site = 'home';
  } else if (neutral) {
    // Neutral site: no host. The slots are only a stable ordering (teams[].index), and the UI
    // renders "vs" rather than "at" because site === 'neutral'.
    [first, second] = byHomeAway;
    site = 'neutral';
  } else {
    warnings.push(
      `contest ${c.contestId}: unusable homeAwayType pair ` +
        `[${c.teams.map((t) => t.homeAwayType).join(',')}] — dropped`,
    );
    return null;
  }

  // --- 3: a missing score stays null, forever.
  const homeScore = first.score ?? null;
  const awayScore = second.score ?? null;

  const isLive = cf.isLiveGameInProgress === true;
  let status = statusFromContestState(cf.contestState, isLive);

  // Defensive: a "final" without two numbers is a pending score, not a 0. Keeps the snapshot
  // invariant true and never invents a scoreline (SPEC §5.5.3, DESIGN §5.3).
  if (status === 'final' && (homeScore === null || awayScore === null)) {
    warnings.push(`contest ${c.contestId}: contestState 4 with a null score — treated as score-pending`);
    status = 'score-pending';
  }
  // A non-final must not carry numbers either: the scores belong to a state the feed has not
  // published yet (or to a row MaxPreps is still editing).
  const keepScores = status === 'final';

  const location = splitLocation(c.location);
  // The only postponement signal we have is a /reschedul/i note on `location` — [U] (SPEC §4).
  if (status !== 'final' && location.text && /reschedul/i.test(location.text)) {
    status = 'postponed';
  }

  // --- 5: league flag from contestType === 0, on either team row.
  const leagueFlags = c.teams.map((t) => t.contestType === 0);
  const isLeague = leagueFlags.some(Boolean);
  const leagueFlagConflict =
    leagueFlags[0] === leagueFlags[1]
      ? undefined
      : `contestType disagrees between team rows (${c.teams
          .map((t) => `${t.name}:${t.contestType}`)
          .join(', ')})`;
  if (leagueFlagConflict) warnings.push(`contest ${c.contestId}: ${leagueFlagConflict}`);

  const home = sideOf(first, keepScores ? homeScore : null);
  const away = sideOf(second, keepScores ? awayScore : null);

  // --- 7 + leagueDivision: set only when BOTH sides are registry members of the same division.
  const homeTeam = resolveTeam(first.teamId);
  const awayTeam = resolveTeam(second.teamId);
  const leagueDivision: Division | null =
    homeTeam && awayTeam && homeTeam.division === awayTeam.division ? homeTeam.division : null;

  const otPeriods = cf.overtimePeriodsPlayed ?? 0;
  const isForfeit = c.teams.some((t) => t.isForfeit);
  const forfeitBy: Game['forfeitBy'] = !isForfeit
    ? null
    : first.isForfeit
      ? 'home'
      : second.isForfeit
        ? 'away'
        : null;

  let decider: Decider | null = null;
  if (status === 'final') {
    // By-Laws Article IV: one 7-minute sudden-victory period, then the game ends in a tie.
    // There is no shootout in league play, so 'SO' can never be produced here.
    decider = isForfeit ? 'FORFEIT' : otPeriods >= 2 ? '2OT' : otPeriods === 1 ? 'OT' : 'REG';
  }

  const game: Game = {
    contestId: c.contestId,
    dateLocal: c.date,
    dateUtc: toUtcIso(cf.contestDateInGMT),
    dateKey: dateKeyOf(c.date),
    isDateTba: cf.isDateTba,
    isTimeTba: cf.isTimeTba,
    home,
    away,
    site,
    status,
    isLeague,
    leagueDivision,
    otPeriods,
    isOt: otPeriods > 0,
    isForfeit,
    forfeitBy,
    decider,
    shootout: null,
    venue: { text: location.text, ...(location.name ? { name: location.name } : {}) },
    recap: status === 'final' ? cleanRecap(cf.description) : null,
    urls: {
      maxpreps: httpUrlOrNull(cf.canonicalUrl, c.contestId, 'canonicalUrl', warnings),
      nfhsStream: httpUrlOrNull(row.nfhsStreamUrl, c.contestId, 'nfhsStreamUrl', warnings),
      goFan: httpUrlOrNull(row.goFanUrl, c.contestId, 'goFanUrl', warnings),
    },
    provenance: {
      scores: opts.scores ?? 'maxpreps-api',
      schedule: opts.schedule ?? 'maxpreps-api',
      fetchedAt: opts.fetchedAt,
      ...(c.modifiedOn ? { maxprepsModifiedOn: c.modifiedOn } : {}),
      ...(leagueFlagConflict ? { leagueFlagConflict } : {}),
    },
  };
  return game;
}

/**
 * A third-party URL, or null.
 *
 * These three strings come straight out of the MaxPreps JSON and end up in an `href` on a
 * prerendered page, and React does not filter a URL scheme — so a `javascript:` or `data:` value
 * upstream would be emitted verbatim into a clickable link. The zod contract refuses one
 * (`httpUrl`); this drops it to null with a warning first, because one bad row must not take a
 * whole run down with it (SPEC §5.3).
 */
function httpUrlOrNull(
  value: string | null | undefined,
  contestId: string,
  field: string,
  warnings: string[],
): string | null {
  if (!value) return null;
  if (/^https?:\/\/\S+$/i.test(value)) return value;
  warnings.push(`contest ${contestId}: ${field} is not an http(s) URL — dropped (${value.slice(0, 60)})`);
  return null;
}

/** The season window, computed from the games and never hardcoded (SPEC §5.8). */
export function seasonWindowOf(games: readonly Game[]): {
  firstGame: string | null;
  lastLeagueGame: string | null;
  lastGame: string | null;
} {
  const dates = games.map((g) => g.dateLocal).sort();
  const leagueDates = games.filter((g) => g.isLeague).map((g) => g.dateLocal).sort();
  return {
    firstGame: dates[0] ?? null,
    lastGame: dates[dates.length - 1] ?? null,
    lastLeagueGame: leagueDates[leagueDates.length - 1] ?? null,
  };
}
