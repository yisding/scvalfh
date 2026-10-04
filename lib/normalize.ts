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
 *
 * SPEC §7.6 adds, in pipeline order (all pure):
 *   1. `splitTbaRows` (lib/sources/maxpreps.ts) — a row with an unnamed side is dropped and recorded;
 *      `normalizeGames` applies it too, so raw feed rows can be passed straight in
 *   2. `normalizeGames` — plus `contestTypes`, `provenance.resultConflict`, and the `countsFor` /
 *      `postseason` placeholders that lib/classify.ts fills
 *   3. `applyExclusions` — DATA_QUALITY ghosts and excluded contests
 *   4. `dedupePhantomPairs` — same-division phantom duplicates only
 */

import { getLeague, type DataQualityConfig } from './leagues';
import { getTeamById, resolveTeam } from './teams';
import type {
  ContestId,
  Decider,
  DivisionId,
  DroppedContest,
  Game,
  GameSide,
  GameStatus,
  Outcome,
  SeasonWindow,
  SourceId,
} from './types';
import { splitTbaRows, type ContestTeam, type ScheduleRow } from './sources/maxpreps';

export interface NormalizeOptions {
  /** ISO UTC stamp written into every Game.provenance.fetchedAt. */
  fetchedAt: string;
  scores?: SourceId;
  schedule?: SourceId;
}

export interface NormalizeResult {
  games: Game[];
  /**
   * Contests removed on purpose (SPEC §7.6): here only 'tba-opponent', one entry per TBA row, for a
   * contest that no other row published. Deleted and malformed rows are counted in `stats`.
   */
  dropped: DroppedContest[];
  /** Non-fatal oddities worth a log line (SPEC §5.5.5 "log, don't pick silently"). */
  warnings: string[];
  stats: {
    rows: number;
    unique: number;
    dropped: { deleted: number; malformed: number; tba: number };
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

function sideOf(team: ContestTeam, name: string, score: number | null): GameSide {
  const known = resolveTeam(team.teamId);
  return {
    teamId: known ? known.id : team.teamId || null,
    slug: known ? known.slug : null,
    name: known ? known.name : name,
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

/** The result a score implies for `own` against `other`. */
function impliedOutcome(own: number, other: number): Outcome {
  return own > other ? 'W' : own < other ? 'L' : 'T';
}

/**
 * Score per teamId of one row, when that row is a final with two numbers; null otherwise.
 * Used to compare the two feeds' copies of one contest (D2 rule 4a, "the two rows disagree").
 */
function finalScoreByTeam(row: ScheduleRow): Map<string, number> | null {
  if (row.calculatedFields.contestState !== 4) return null;
  const teams = row.contest.teams;
  if (teams.length !== 2 || teams.some((t) => t.score === null || !t.teamId)) return null;
  return new Map(teams.map((t) => [t.teamId as string, t.score as number]));
}

function scoreLine(row: ScheduleRow): string {
  return row.contest.teams.map((t) => `${t.name ?? 'TBA'} ${t.score ?? '–'}`).join(', ');
}

/** A level score whose result flags are complementary W and L (either order): a 1 v 1 win's shape. */
function isLevelWithWinner(home: GameSide, away: GameSide): boolean {
  return (
    home.score !== null &&
    home.score === away.score &&
    ((home.result === 'W' && away.result === 'L') || (home.result === 'L' && away.result === 'W'))
  );
}

/**
 * D2 rule 4a evidence for a FINAL: a side's result flag contradicts the score (the side with more
 * goals marked L, a level score marked W, …), or two copies of the contest (one per team feed)
 * disagree on the score. One plain sentence, or undefined. In a shootout league (EAL) a level score
 * flagged W/L is how MaxPreps records a 1 v 1 win, so that one shape is not a contradiction there;
 * the feed-disagreement note still applies.
 */
function resultConflictOf(
  home: GameSide,
  away: GameSide,
  copies: readonly ScheduleRow[],
  opts: { shootoutLeague: boolean },
): string | undefined {
  const notes: string[] = [];
  if (home.score !== null && away.score !== null && !(opts.shootoutLeague && isLevelWithWinner(home, away))) {
    const wrong = [
      { side: home, own: home.score, other: away.score },
      { side: away, own: away.score, other: home.score },
    ].filter(({ side, own, other }) => side.result !== null && side.result !== impliedOutcome(own, other));
    if (wrong.length > 0) {
      notes.push(
        `MaxPreps marks ${home.name} ${home.result ?? 'unflagged'} and ${away.name} ${away.result ?? 'unflagged'} ` +
          `on a ${home.score}-${away.score} score.`,
      );
    }
  }
  const scored = copies
    .map((row) => ({ row, byTeam: finalScoreByTeam(row) }))
    .filter((c): c is { row: ScheduleRow; byTeam: Map<string, number> } => c.byTeam !== null);
  const [first, ...rest] = scored;
  const differing = first
    ? rest.find(({ byTeam }) =>
        [...first.byTeam].some(([teamId, score]) => byTeam.has(teamId) && byTeam.get(teamId) !== score),
      )
    : undefined;
  if (first && differing) {
    notes.push(
      `MaxPreps' two team feeds disagree on the score (${scoreLine(first.row)} in one; ` +
        `${scoreLine(differing.row)} in the other).`,
    );
  }
  return notes.length > 0 ? notes.join(' ') : undefined;
}

export function normalizeGames(
  rows: readonly ScheduleRow[],
  opts: NormalizeOptions,
): NormalizeResult {
  const warnings: string[] = [];
  const stats = {
    rows: rows.length,
    unique: 0,
    dropped: { deleted: 0, malformed: 0, tba: 0 },
    finals: 0,
    pending: 0,
    league: 0,
  };

  // --- §7.6 step 1: rows with an unnamed (TBA) side never become games. A no-op when the caller
  // already split them off per feed.
  const split = splitTbaRows(rows);
  stats.dropped.tba = split.dropped.length;

  // --- 1 + 2: dedupe on contestId, dropping Deleted rows first.
  const best = new Map<ContestId, ScheduleRow>();
  const copies = new Map<ContestId, ScheduleRow[]>();
  for (const row of split.rows) {
    if (row.calculatedFields.contestState === 1) {
      stats.dropped.deleted += 1;
      continue;
    }
    const id = row.contest.contestId;
    const prior = best.get(id);
    if (!prior || completeness(row) > completeness(prior)) best.set(id, row);
    const list = copies.get(id);
    if (list) list.push(row);
    else copies.set(id, [row]);
  }

  const games: Game[] = [];
  for (const [id, row] of best) {
    const game = toGame(row, copies.get(id) ?? [row], opts, warnings);
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

  // A TBA row whose contest another feed published with both sides named is not a dropped contest.
  const published = new Set(games.map((g) => g.contestId));
  const dropped = split.dropped.filter((d) => {
    if (!published.has(d.contestId)) return true;
    warnings.push(`contest ${d.contestId}: a TBA copy was ignored; another feed names both sides`);
    return false;
  });

  stats.unique = games.length;
  stats.finals = games.filter((g) => g.status === 'final').length;
  stats.pending = games.filter((g) => g.status === 'score-pending').length;
  stats.league = games.filter((g) => g.isLeague).length;

  return { games, dropped, warnings, stats };
}

function toGame(
  row: ScheduleRow,
  copies: readonly ScheduleRow[],
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

  // splitTbaRows already removed every row with an unnamed side; this only narrows the types.
  if (first.name === null || second.name === null) {
    warnings.push(`contest ${c.contestId}: a side has no name — dropped`);
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

  const home = sideOf(first, first.name, keepScores ? homeScore : null);
  const away = sideOf(second, second.name, keepScores ? awayScore : null);

  // --- 7 + leagueDivision: set only when BOTH sides are registry members of the same division.
  // Resolved before the result check: whether a level W/L final is a 1 v 1 win depends on the league.
  const homeTeam = resolveTeam(first.teamId);
  const awayTeam = resolveTeam(second.teamId);
  const leagueDivision: DivisionId | null =
    homeTeam && awayTeam && homeTeam.division === awayTeam.division ? homeTeam.division : null;
  // Both sides members of one league that decides a level game on 1 v 1s (the EAL).
  const sharedLeague =
    homeTeam && awayTeam && homeTeam.league === awayTeam.league ? getLeague(homeTeam.league) : null;
  const shootoutLeague = sharedLeague?.rules.leagueOvertime === 'shootout';

  // --- D2 rule 4a evidence, on finals only.
  const resultConflict =
    status === 'final' ? resultConflictOf(home, away, copies, { shootoutLeague }) : undefined;
  if (resultConflict) warnings.push(`contest ${c.contestId}: ${resultConflict}`);

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
    // SCVAL By-Laws Article IV: one 7-minute sudden-victory period, then the game ends in a tie.
    // No SCVAL, BVAL, PCAL or MCAL league game has a shootout (`rules.leagueOvertime` is
    // 'sudden-victory' or 'none'), so none of them produces 'SO'. The EAL decides a level varsity
    // game on 1 v 1s (NS Guidelines §VII.E.4): a level final MaxPreps flags W/L between two EAL
    // teams is a 1 v 1 win, 'SO' with no tally stored. Otherwise the decider is MaxPreps' overtime
    // count as recorded (never clamped: 3 periods stays '2OT'; the view adds a caveat).
    if (isForfeit) decider = 'FORFEIT';
    else if (shootoutLeague && isLevelWithWinner(home, away)) decider = 'SO';
    else decider = otPeriods >= 2 ? '2OT' : otPeriods === 1 ? 'OT' : 'REG';
    if (!isForfeit && shootoutLeague && home.score === away.score && decider !== 'SO') {
      warnings.push(
        `contest ${c.contestId}: a level ${sharedLeague?.shortName} final with no 1 v 1 winner flagged`,
      );
    }
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
    // Raw per-row contestType, in the same home/away slots as the sides.
    contestTypes: { home: first.contestType, away: second.contestType },
    // Placeholders: lib/classify.ts classifyGames sets both (pipeline step 10).
    countsFor: null,
    postseason: null,
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
      ...(resultConflict ? { resultConflict } : {}),
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

function droppedRow(
  game: Game,
  reason: DroppedContest['reason'],
  note: string,
): DroppedContest {
  return {
    contestId: game.contestId,
    reason,
    note,
    dateKey: game.dateKey,
    teams: [game.home.name, game.away.name],
  };
}

/**
 * SPEC §7.6 step 3: drop every contest with a side in `dq.ghostTeamIds` ('ghost-team') and every
 * contest in `dq.excludedContestIds` ('excluded-by-config'); a contest that is both is recorded once,
 * as 'ghost-team'. `unused` lists the excluded ids that no longer appear among `games`, in config
 * order; the caller logs each once as `exclusion no longer needed: <id>`. Order is kept.
 */
export function applyExclusions(
  games: readonly Game[],
  dq: DataQualityConfig,
): { games: Game[]; dropped: DroppedContest[]; unused: ContestId[] } {
  const ghosts = new Map(Object.entries(dq.ghostTeamIds));
  const excluded = new Map(Object.entries(dq.excludedContestIds));
  const kept: Game[] = [];
  const dropped: DroppedContest[] = [];
  const seen = new Set<ContestId>();
  for (const game of games) {
    seen.add(game.contestId);
    const ghostId = [game.home.teamId, game.away.teamId].find(
      (id): id is string => id !== null && ghosts.has(id),
    );
    if (ghostId !== undefined) {
      dropped.push(droppedRow(game, 'ghost-team', ghosts.get(ghostId) as string));
      continue;
    }
    const why = excluded.get(game.contestId);
    if (why !== undefined) {
      dropped.push(droppedRow(game, 'excluded-by-config', why));
      continue;
    }
    kept.push(game);
  }
  const unused = [...excluded.keys()].filter((id) => !seen.has(id));
  return { games: kept, dropped, unused };
}

/** final-with-score > score-pending > scheduled (then live/postponed/canceled last). */
function phantomStatusRank(g: Game): number {
  if (g.status === 'final' && g.home.score !== null && g.away.score !== null) return 3;
  if (g.status === 'score-pending') return 2;
  if (g.status === 'scheduled') return 1;
  return 0;
}

/** Negative when `a` is the better row to keep (SPEC §7.6 step 4 preference order). */
function comparePhantom(a: Game, b: Game): number {
  const status = phantomStatusRank(b) - phantomStatusRank(a);
  if (status !== 0) return status;
  const leagueTyped = (g: Game) => (g.contestTypes.home === 0 || g.contestTypes.away === 0 ? 1 : 0);
  const typed = leagueTyped(b) - leagueTyped(a);
  if (typed !== 0) return typed;
  const am = a.provenance.maxprepsModifiedOn ?? '';
  const bm = b.provenance.maxprepsModifiedOn ?? '';
  if (am !== bm) return am > bm ? -1 : 1;
  return a.contestId < b.contestId ? -1 : a.contestId > b.contestId ? 1 : 0;
}

/**
 * SPEC §7.6 step 4: ONLY contests whose two sides are registry members of the SAME division are
 * grouped, by (dateKey, unordered teamId pair); each group keeps one contest (final with a score >
 * score-pending > scheduled, then a contestType 0 row, then the later `maxprepsModifiedOn`, then the
 * smaller contestId) and records the others as 'phantom-duplicate'. Any other pair — a non-league
 * double-header, a cross-division or non-member game — is never touched. Order is kept.
 *
 * `preferred` (optional) ranks above everything else: a group keeps a preferred contest over any other
 * (the pipeline prefers this run's rows over games carried from the previous snapshot).
 */
export function dedupePhantomPairs(
  games: readonly Game[],
  opts: { preferred?: (game: Game) => boolean } = {},
): {
  games: Game[];
  dropped: DroppedContest[];
} {
  const preferred = opts.preferred ?? (() => false);
  const order = (a: Game, b: Game): number =>
    (preferred(a) === preferred(b) ? 0 : preferred(a) ? -1 : 1) || comparePhantom(a, b);
  const groups = new Map<string, Game[]>();
  for (const game of games) {
    const home = game.home.teamId ? getTeamById(game.home.teamId) : undefined;
    const away = game.away.teamId ? getTeamById(game.away.teamId) : undefined;
    if (!home || !away || home.id === away.id || home.division !== away.division) continue;
    const pair = [home.id, away.id].sort().join('|');
    const key = `${game.dateKey}|${pair}`;
    const list = groups.get(key);
    if (list) list.push(game);
    else groups.set(key, [game]);
  }

  const losers = new Map<ContestId, Game>();
  const dropped: DroppedContest[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...rest] = [...group].sort(order);
    for (const g of rest) {
      losers.set(g.contestId, g);
      dropped.push(
        droppedRow(
          g,
          'phantom-duplicate',
          `MaxPreps lists ${g.home.name} and ${g.away.name} twice on ${g.dateKey}; kept contest ${keep.contestId}.`,
        ),
      );
    }
  }
  return { games: games.filter((g) => !losers.has(g.contestId)), dropped };
}

/** The season window, computed from the games and never hardcoded (SPEC §5.8). */
export function seasonWindowOf(games: readonly Game[]): SeasonWindow {
  const dates = games.map((g) => g.dateLocal).sort();
  const leagueDates = games.filter((g) => g.isLeague).map((g) => g.dateLocal).sort();
  return {
    firstGame: dates[0] ?? null,
    lastGame: dates[dates.length - 1] ?? null,
    lastLeagueGame: leagueDates[leagueDates.length - 1] ?? null,
  };
}
