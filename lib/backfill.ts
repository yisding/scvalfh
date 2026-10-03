/**
 * Owner decision D2 (SPEC §7.9): si.com may backfill MaxPreps — mechanically, never by guesswork.
 *
 *   1. MaxPreps is primary. A MaxPreps final with a score is published as MaxPreps has it, unless rule 4 applies.
 *   2. absent-fixture  — an official fixture MaxPreps has NO contest for (no non-deleted contest of the pair
 *                        within ±14 days, any type/status/tag), past-dated, with a si.com Final of the same pair
 *                        within ±1 day: a new `sblive:<id>` Game is published.
 *   3. score-pending   — a past MaxPreps contest without a score, with a si.com Final of the pair within ±1 day:
 *                        si.com's score is written onto the MaxPreps contest.
 *   4. clearly wrong   — a MaxPreps final that is (a) self-contradictory, (b) more than 7 days from its official
 *                        date while si.com has the game on the official date, or (c) a 0-0 tie in a league with
 *                        no overtime while si.com has a decided Final the same day: si.com's score is published
 *                        and MaxPreps' value is kept as the conflict.
 *   5. plain disagreement — MaxPreps stays (lib/crosscheck.ts publishes the conflict row).
 *   6. never from si.com: membership, leagueRecord, gameTypeLabel, standings order.
 *   7. junk-row guards: non-`/california/field-hockey/games/` rows, duplicate ids, JV-only/withdrawn sides,
 *                        and every side not resolved BY SI.COM ID are ignored.
 *   8. budget: planBackfill picks the few team pages that cover what the scoreboard did not (cap 8).
 *  10. supersede and carry-forward.
 *
 * Every rule requires BOTH sides resolved via 'team-id' or 'school-id' (never 'name'), a si.com status
 * Final, integer scores, and a non-junk row. Pure: no I/O, no clock — `today` is an input.
 */

import { toLocalTimestamp } from './format';
import { getLeague, leagueOfDivision } from './leagues';
import {
  isCaliforniaGameRow,
  isIgnoredSbliveSide,
  sblivePairKey,
  type SbliveGame,
  type SbliveSide,
} from './sources/sblive';
import { getTeamBySlug } from './teams';
import type {
  BackfillProvenance,
  BackfillRow,
  ContestId,
  Game,
  GameSide,
  OfficialFixture,
  Outcome,
  SbliveOnlyRow,
  Snapshot,
  Team,
  TeamSlug,
} from './types';

// ---------------------------------------------------------------- constants

/** Rule 8: team-games pages per run, beyond the statewide scoreboards. */
export const BACKFILL_TEAM_PAGE_CAP = 8;
/** Rules 2-4: a si.com Final within ±1 day of the date in question (a posted reschedule). */
export const SBLIVE_DATE_TOLERANCE_DAYS = 1;
/** Rule 2 precondition: no MaxPreps contest of the pair within ±14 days of the fixture. */
export const MAXPREPS_PAIR_WINDOW_DAYS = 14;
/** Rule 4b: a pass-3 match more than this many days from its official date. */
export const OFF_SCHEDULE_DAYS = 7;

// ---------------------------------------------------------------- the API (SPEC §7.9)

export interface BackfillInput {
  /** After the official step (classification runs later). */
  games: readonly Game[];
  unmatched: readonly OfficialFixture[];
  /** Deduped, resolved si.com rows (applyBackfill re-applies the junk-row guards itself). */
  sblive: readonly SbliveGame[];
  today: string;
  /** For carry-forward and supersede. */
  previous: Snapshot | null;
  /** Every si.com request failed this run (or si.com was not read at all): every earlier fill is carried. */
  sbliveFailed: boolean;
  /**
   * Whether this run read the si.com data that decides the item of `pairKey` near `date`: a scoreboard row
   * of the pair, or a team-games page of either side, read successfully. An earlier fill (rules 2-4) whose
   * item this run did not consult (its page failed, was past the cap, or was not planned) is carried
   * (rule 10) instead of being dropped; a consulted item is decided by this run's rows alone. Defaults to
   * "everything was consulted".
   */
  consulted?: (pairKey: string, date: string) => boolean;
  /** The run's fetchedAt, stamped on a rule-2 game's provenance. Defaults to the input games' stamp. */
  fetchedAt?: string;
}

export interface EligibleItem {
  kind: 'absent-fixture' | 'score-pending' | 'clearly-wrong';
  /** `slugA~slugB`, sorted — the same key `sblivePairKey` gives two resolved sides. */
  pairKey: string;
  /** The date si.com must have the game on (±1 day): the fixture date, the contest date, or (4b) the official date. */
  date: string;
  fixture: OfficialFixture | null;
  contestId: string | null;
}

export interface BackfillPlan {
  eligible: EligibleItem[];
  /** Team-games pages to read, greedy set-cover order. */
  teamPagesNeeded: TeamSlug[];
  /** Eligible items neither the scoreboard nor the chosen pages cover (past the cap, or no si.com page known). They wait for the next run. */
  deferred: EligibleItem[];
}

export interface BackfillResult {
  games: Game[];
  /** Fixtures still unmatched after rule-2 fills. */
  unmatched: OfficialFixture[];
  /** Every si.com value published this run (rules 2-4), fresh or carried. */
  rows: BackfillRow[];
  /** si.com Finals D2 looked at and did NOT publish, with the reason. */
  skipped: SbliveOnlyRow[];
  warnings: string[];
  /** Rule 10: `sblive:<id>` → the MaxPreps contest that superseded it (carried from the previous snapshot). */
  supersededGames: Record<ContestId, ContestId>;
  /** Rule 10: the games whose si.com value was carried from the previous snapshot rather than read this run. */
  carried: ContestId[];
}

// ---------------------------------------------------------------- dates and keys

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from `a` to `b` (YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

function within(a: string, b: string, days: number): boolean {
  return Math.abs(dayDiff(a, b)) <= days;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date((dayNumber(dateKey) + days) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Sep 4' */
function md(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Sorted `slugA~slugB`. */
export function pairKeyOf(a: TeamSlug, b: TeamSlug): string {
  return [a, b].sort().join('~');
}

function gamePair(g: Pick<Game, 'home' | 'away'>): string | null {
  return g.home.slug && g.away.slug && g.home.slug !== g.away.slug ? pairKeyOf(g.home.slug, g.away.slug) : null;
}

function fixturePair(f: OfficialFixture): string | null {
  return f.homeSlug && f.awaySlug && f.homeSlug !== f.awaySlug ? pairKeyOf(f.homeSlug, f.awaySlug) : null;
}

const isSbliveContest = (id: string) => id.startsWith('sblive:');

// ---------------------------------------------------------------- si.com rows

/** A side resolved by si.com team or school id — the only identity D2 accepts. */
export function isIdResolved(side: Pick<SbliveSide, 'slug' | 'via'>): boolean {
  return side.slug !== null && (side.via === 'team-id' || side.via === 'school-id');
}

function bothIdResolved(g: SbliveGame): boolean {
  return isIdResolved(g.sides[0]) && isIdResolved(g.sides[1]) && g.sides[0].slug !== g.sides[1].slug;
}

function bothSlugged(g: SbliveGame): boolean {
  return g.sides[0].slug !== null && g.sides[1].slug !== null && g.sides[0].slug !== g.sides[1].slug;
}

const isScoredFinal = (g: SbliveGame) =>
  g.isFinal && g.isScored && g.sides.every((s) => s.score !== null && Number.isInteger(s.score) && s.score >= 0);

function rowRank(g: SbliveGame): number {
  return (g.isScored ? 8 : 0) + (g.isFinal ? 4 : 0) + g.sides.filter(isIdResolved).length;
}

/** Order-independent score signature of a row (by side key). */
function scoreSignature(g: SbliveGame): string {
  return g.sides
    .map((s) => `${s.slug ?? s.name.toLowerCase()}=${s.score ?? '-'}`)
    .sort()
    .join('|');
}

export interface CleanedSbliveRows {
  rows: SbliveGame[];
  /** Rows whose game page is not a `/california/field-hockey/games/` path. */
  junkPath: SbliveGame[];
  /** Rows with a JV-only or withdrawn side. */
  ignored: SbliveGame[];
  /** How many rows the sbliveGameId and (date, pair) collapses removed. */
  collapsed: number;
}

/**
 * D2 rule 7, in order: drop non-`/california/field-hockey/games/` rows; collapse duplicates on
 * sbliveGameId (keeping the scored, then final, then better-resolved row); drop rows with a JV-only or
 * withdrawn side; then collapse on (date, unordered pair) keeping the scored row. Two SCORED rows of
 * one (date, pair) with DIFFERENT scores are both kept, so a fill can see the conflict and refuse.
 */
export function cleanSbliveRows(input: readonly SbliveGame[]): CleanedSbliveRows {
  const junkPath: SbliveGame[] = [];
  const ignored: SbliveGame[] = [];
  const byId = new Map<string, SbliveGame>();
  let collapsed = 0;
  for (const g of input) {
    if (!isCaliforniaGameRow(g)) {
      junkPath.push(g);
      continue;
    }
    const prior = byId.get(g.sbliveGameId);
    if (prior) collapsed += 1;
    if (!prior || rowRank(g) > rowRank(prior)) byId.set(g.sbliveGameId, g);
  }
  const groups = new Map<string, SbliveGame[]>();
  for (const g of byId.values()) {
    if (g.sides.some(isIgnoredSbliveSide)) {
      ignored.push(g);
      continue;
    }
    const key = `${g.dateKey}|${sblivePairKey(g.sides)}`;
    const list = groups.get(key);
    if (list) list.push(g);
    else groups.set(key, [g]);
  }
  const rows: SbliveGame[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => rowRank(b) - rowRank(a) || a.sbliveGameId.localeCompare(b.sbliveGameId));
    const scored = sorted.filter((g) => g.isScored);
    if (scored.length === 0) {
      rows.push(sorted[0]);
      collapsed += sorted.length - 1;
      continue;
    }
    const seen = new Set<string>();
    for (const g of scored) {
      const sig = scoreSignature(g);
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push(g);
    }
    collapsed += sorted.length - seen.size;
  }
  rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.sbliveGameId.localeCompare(b.sbliveGameId));
  return { rows, junkPath, ignored, collapsed };
}

type CandidatePick =
  | { kind: 'none' }
  | { kind: 'conflict'; rows: SbliveGame[] }
  | { kind: 'one'; row: SbliveGame };

/** si.com Finals (id-resolved) of `pairKey` within ±`tolerance` days of `date`, not yet used. */
function pickCandidate(
  finals: readonly SbliveGame[],
  pairKey: string,
  date: string,
  used: ReadonlySet<string>,
  tolerance = SBLIVE_DATE_TOLERANCE_DAYS,
): CandidatePick {
  const rows = finals.filter(
    (g) => !used.has(g.sbliveGameId) && sblivePairKey(g.sides) === pairKey && within(g.dateKey, date, tolerance),
  );
  if (rows.length === 0) return { kind: 'none' };
  const sigs = new Set(rows.map(scoreSignature));
  if (sigs.size > 1) return { kind: 'conflict', rows };
  const best = [...rows].sort(
    (a, b) =>
      Math.abs(dayDiff(a.dateKey, date)) - Math.abs(dayDiff(b.dateKey, date)) ||
      a.dateKey.localeCompare(b.dateKey) ||
      a.sbliveGameId.localeCompare(b.sbliveGameId),
  )[0];
  return { kind: 'one', row: best };
}

/** si.com's score oriented to our home/away slugs. */
function scoreFor(row: SbliveGame, homeSlug: TeamSlug, awaySlug: TeamSlug): { home: number; away: number } | null {
  const home = row.sides.find((s) => s.slug === homeSlug);
  const away = row.sides.find((s) => s.slug === awaySlug);
  if (!home || !away || home === away || home.score === null || away.score === null) return null;
  return { home: home.score, away: away.score };
}

/** A covers-test over scoreboard rows for planBackfill: an id-resolved row of the pair within ±1 day. */
export function scoreboardCoverage(rows: readonly SbliveGame[]): (pairKey: string, date: string) => boolean {
  const resolved = rows.filter((g) => isCaliforniaGameRow(g) && bothIdResolved(g));
  return (pairKey, date) =>
    resolved.some((g) => sblivePairKey(g.sides) === pairKey && within(g.dateKey, date, SBLIVE_DATE_TOLERANCE_DAYS));
}

// ---------------------------------------------------------------- eligibility

function bothScored(g: Game): g is Game & { home: { score: number }; away: { score: number } } {
  return g.home.score !== null && g.away.score !== null;
}

function sameLeagueOf(g: Pick<Game, 'home' | 'away'>): string | null {
  const h = g.home.slug ? getTeamBySlug(g.home.slug) : undefined;
  const a = g.away.slug ? getTeamBySlug(g.away.slug) : undefined;
  return h && a && h.league === a.league ? h.league : null;
}

/** 4b: matched its fixture only in pass 3, more than 7 days from the official date. */
function offScheduleDate(g: Game): string | null {
  if (!g.official || g.official.pass !== 'rescheduled') return null;
  return Math.abs(dayDiff(g.official.scheduledDate, g.dateKey)) > OFF_SCHEDULE_DAYS ? g.official.scheduledDate : null;
}

/** 4c: a 0-0 final with both results T, between two members of a league whose league games have no overtime. */
function isPhantomTieCandidate(g: Game): boolean {
  if (g.status !== 'final' || g.home.score !== 0 || g.away.score !== 0) return false;
  if (g.home.result !== 'T' || g.away.result !== 'T') return false;
  const league = sameLeagueOf(g);
  return league !== null && getLeague(league).rules.leagueOvertime === 'none';
}

/**
 * Rule 2 precondition: MaxPreps contests of the pair within ±`days` of `date` that could be this fixture's
 * game. A contest already matched to a DIFFERENT official fixture (the pair's other leg) is not: it
 * counts, for that fixture. Unstamped contests (and contests excluded by contest type or a postseason
 * cut-off) still block.
 */
function hasPairContestNear(
  games: readonly Game[],
  pairKey: string,
  date: string,
  days: number,
  fixtureId: string,
): Game[] {
  return games.filter(
    (g) =>
      !isSbliveContest(g.contestId) &&
      gamePair(g) === pairKey &&
      within(g.dateKey, date, days) &&
      !(g.official && g.official.fixtureId !== fixtureId),
  );
}

/** A si.com row that is the same game as an existing MaxPreps contest (reconcile's join: same date, same pair). */
function isMaxprepsGame(games: readonly Game[], row: SbliveGame): boolean {
  const pairKey = sblivePairKey(row.sides);
  return games.some((g) => !isSbliveContest(g.contestId) && g.dateKey === row.dateKey && gamePair(g) === pairKey);
}

/** Every item D2 could act on this run, whether or not si.com has it. */
export function eligibleItems(
  games: readonly Game[],
  unmatched: readonly OfficialFixture[],
  today: string,
): EligibleItem[] {
  const out: EligibleItem[] = [];
  for (const g of games) {
    if (isSbliveContest(g.contestId)) continue;
    const pairKey = gamePair(g);
    if (!pairKey) continue;
    if (g.status === 'score-pending' && g.dateKey < today) {
      out.push({ kind: 'score-pending', pairKey, date: g.dateKey, fixture: null, contestId: g.contestId });
      continue;
    }
    if (g.status !== 'final' || !bothScored(g)) continue;
    const dates = new Set<string>();
    if (g.provenance.resultConflict) dates.add(g.dateKey);
    const official = offScheduleDate(g);
    if (official) dates.add(official);
    if (isPhantomTieCandidate(g)) dates.add(g.dateKey);
    for (const date of dates) out.push({ kind: 'clearly-wrong', pairKey, date, fixture: null, contestId: g.contestId });
  }
  for (const f of unmatched) {
    const pairKey = fixturePair(f);
    if (!pairKey || f.dateKey >= today) continue;
    if (hasPairContestNear(games, pairKey, f.dateKey, MAXPREPS_PAIR_WINDOW_DAYS, f.id).length) continue;
    out.push({ kind: 'absent-fixture', pairKey, date: f.dateKey, fixture: f, contestId: null });
  }
  return out;
}

/**
 * Rule 8: eligible items not covered by the scoreboard rows → a greedy set cover of team-games pages
 * (the page covering most uncovered (pair, date) items first, ties by slug), at most `cap` pages.
 * Only teams with a recorded si.com page are candidates.
 */
export function planBackfill(
  input: Omit<BackfillInput, 'sblive' | 'previous' | 'sbliveFailed'>,
  scoreboardCovers: (pairKey: string, date: string) => boolean,
  cap: number = BACKFILL_TEAM_PAGE_CAP,
): BackfillPlan {
  const eligible = eligibleItems(input.games, input.unmatched, input.today);
  const uncovered = eligible.filter((i) => !scoreboardCovers(i.pairKey, i.date));
  const remaining = new Map<string, EligibleItem[]>();
  for (const i of uncovered) {
    const key = `${i.pairKey}|${i.date}`;
    const list = remaining.get(key);
    if (list) list.push(i);
    else remaining.set(key, [i]);
  }
  const fetchable = (slug: string) => Boolean(getTeamBySlug(slug)?.external.sbliveGamesUrl);
  const pages: TeamSlug[] = [];
  while (remaining.size > 0 && pages.length < cap) {
    const counts = new Map<string, number>();
    for (const key of remaining.keys()) {
      for (const slug of key.split('|')[0].split('~')) {
        if (fetchable(slug)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (!best) break;
    pages.push(best[0]);
    for (const key of [...remaining.keys()]) {
      if (key.split('|')[0].split('~').includes(best[0])) remaining.delete(key);
    }
  }
  return { eligible, teamPagesNeeded: pages, deferred: [...remaining.values()].flat() };
}

// ---------------------------------------------------------------- building published values

function outcome(mine: number, theirs: number): Outcome {
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
}

function labelOf(g: Pick<Game, 'home' | 'away'>): string {
  return `${g.away.name} at ${g.home.name}`;
}

function scorePairText(g: { home: number; away: number }): string {
  return `${g.away}-${g.home}`;
}

/** The published si.com value of a game D2 touched, as a /about row. */
export function backfillRowOf(g: Game): BackfillRow | null {
  const b = g.provenance.backfill;
  if (!b || g.home.score === null || g.away.score === null || !g.urls.sblive) return null;
  return {
    contestId: g.contestId,
    dateKey: g.dateKey,
    label: labelOf(g),
    rule: b.rule,
    sblive: { home: g.home.score, away: g.away.score },
    maxpreps: b.maxpreps,
    sbliveUrl: g.urls.sblive,
    maxprepsUrl: g.urls.maxpreps,
    note: b.note,
  };
}

function sideOf(team: Team, score: number, other: number): GameSide {
  return { teamId: team.id, slug: team.slug, name: team.name, score, result: outcome(score, other) };
}

/** si.com's instant → our naive local timestamp and UTC instant; 16:00 local when si.com gives no time. */
function datesOf(row: SbliveGame): { dateLocal: string; dateUtc: string; dateKey: string; isTimeTba: boolean } {
  const hasTime = /T\d{2}:\d{2}/.test(row.dateIso);
  const instant = hasTime ? new Date(row.dateIso) : null;
  if (instant && !Number.isNaN(instant.getTime())) {
    const dateUtc = instant.toISOString().replace(/\.000Z$/, 'Z');
    const dateLocal = toLocalTimestamp(dateUtc);
    return { dateLocal, dateUtc, dateKey: dateLocal.slice(0, 10), isTimeTba: false };
  }
  const dateLocal = `${row.dateKey}T16:00:00`;
  // Pacific time is UTC-7 (PDT) or UTC-8 (PST); take whichever round-trips to 16:00 local.
  const dateUtc =
    [7, 8]
      .map((h) => new Date(Date.UTC(...ymd(row.dateKey), 16 + h)).toISOString().replace(/\.000Z$/, 'Z'))
      .find((iso) => toLocalTimestamp(iso) === dateLocal) ?? `${row.dateKey}T23:00:00Z`;
  return { dateLocal, dateUtc, dateKey: row.dateKey, isTimeTba: true };
}

function ymd(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y, m - 1, d];
}

function absentFixtureGame(
  f: OfficialFixture,
  home: Team,
  away: Team,
  row: SbliveGame,
  score: { home: number; away: number },
  fetchedAt: string,
): Game {
  const dates = datesOf(row);
  const short = leagueOfDivision(f.division).shortName;
  const note = `MaxPreps has no contest for this ${short} fixture (official date ${md(f.dateKey)}), so the score is si.com’s.`;
  const backfill: BackfillProvenance = { rule: 'absent-fixture', sbliveGameId: row.sbliveGameId, maxpreps: null, note };
  return {
    contestId: `sblive:${row.sbliveGameId}`,
    dateLocal: dates.dateLocal,
    dateUtc: dates.dateUtc,
    dateKey: dates.dateKey,
    isDateTba: false,
    isTimeTba: dates.isTimeTba,
    home: sideOf(home, score.home, score.away),
    away: sideOf(away, score.away, score.home),
    site: 'home',
    status: 'final',
    isLeague: true,
    leagueDivision: f.division,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: 'REG',
    shootout: null,
    venue: { text: null },
    official: {
      scheduledDate: f.dateKey,
      division: f.division,
      source: f.source,
      fixtureId: f.id,
      pass: dates.dateKey === f.dateKey ? 'same-date' : 'rescheduled',
    },
    recap: null,
    urls: { maxpreps: null, sblive: row.url ?? undefined, nfhsStream: null, goFan: null },
    provenance: { scores: 'sblive', schedule: 'sblive', backfill, fetchedAt },
  };
}

/** Rules 3 and 4: si.com's score written onto the MaxPreps contest (contestId kept). */
function overrideGame(
  g: Game,
  row: SbliveGame,
  score: { home: number; away: number },
  rule: BackfillProvenance['rule'],
  note: string,
): Game {
  const maxpreps = bothScored(g) ? { home: g.home.score, away: g.away.score } : null;
  const backfill: BackfillProvenance = { rule, sbliveGameId: row.sbliveGameId, maxpreps, note };
  const { scoreConflict: _dropped, ...provenance } = g.provenance;
  void _dropped;
  return {
    ...g,
    home: { ...g.home, score: score.home, result: outcome(score.home, score.away) },
    away: { ...g.away, score: score.away, result: outcome(score.away, score.home) },
    status: 'final',
    ...(rule === 'score-pending' ? { otPeriods: 0, isOt: false, isForfeit: false, forfeitBy: null, decider: 'REG' as const } : {}),
    ...(rule !== 'score-pending' && g.decider === null ? { decider: 'REG' as const } : {}),
    urls: { ...g.urls, sblive: row.url ?? g.urls.sblive },
    provenance: {
      ...provenance,
      scores: 'sblive',
      backfill,
      // Rule 4: MaxPreps' overridden value and the reason (Game.provenance.scoreConflict carries "the other value").
      ...(maxpreps ? { scoreConflict: { sblive: maxpreps, note: `${note} MaxPreps reported ${scorePairText(maxpreps)} (${g.away.name}–${g.home.name}).` } } : {}),
    },
  };
}

function skippedRow(
  contestId: string,
  dateKey: string,
  label: string,
  score: { home: number; away: number },
  sbliveUrl: string | null,
  maxprepsUrl: string | null,
  status: SbliveOnlyRow['status'],
  note: string,
): SbliveOnlyRow {
  return { contestId, dateKey, label, sblive: score, aligned: true, sbliveUrl, maxprepsUrl, status, note };
}

/** Why a MaxPreps contest of a fixture's pair does not count (rule 2's "MaxPreps has this game" row). */
function notCountedReason(c: Game, f: OfficialFixture): string {
  const league = leagueOfDivision(f.division);
  const excluded = [c.contestTypes.home, c.contestTypes.away].find(
    (t) => t !== null && league.rules.excludeContestTypes.includes(t),
  );
  if (excluded !== undefined && excluded !== null) return `MaxPreps marks it contestType ${excluded}`;
  if (league.rules.postseasonFrom && c.dateKey >= league.rules.postseasonFrom) {
    return `MaxPreps dates it ${md(c.dateKey)}, on or after ${league.shortName}’s ${md(league.rules.postseasonFrom)} postseason cut-off`;
  }
  if (c.status !== 'final') return 'MaxPreps has not posted a result for it';
  return `it did not match the official ${md(f.dateKey)} fixture`;
}

// ---------------------------------------------------------------- applyBackfill

const CONFLICT_NOTE = 'si.com has two different scores for this game.';
const NAME_ONLY_NOTE = 'Resolved by name only.';
const OUTSIDE_NOTE = 'Outside ±1 day of the official date.';

/** D2 rules 2-5 and 10 over one run's games, unmatched fixtures and si.com rows. Pure. */
export function applyBackfill(input: BackfillInput): BackfillResult {
  const warnings: string[] = [];
  const skipped: SbliveOnlyRow[] = [];
  const used = new Set<string>();
  const fetchedAt =
    input.fetchedAt ?? input.games.find((g) => g.provenance.fetchedAt)?.provenance.fetchedAt ?? `${input.today}T00:00:00.000Z`;

  const cleaned = cleanSbliveRows(input.sblive);
  const finals = cleaned.rows.filter((g) => isScoredFinal(g) && bothIdResolved(g));
  /** Finals of two registry teams where at least one side resolved only by name. */
  const nameOnly = cleaned.rows.filter((g) => isScoredFinal(g) && bothSlugged(g) && !bothIdResolved(g));
  const nameOnlyNear = (pairKey: string, date: string) =>
    nameOnly.find((g) => sblivePairKey(g.sides) === pairKey && within(g.dateKey, date, SBLIVE_DATE_TOLERANCE_DAYS));

  let games: Game[] = input.games.map((g) => g);
  let unmatched: OfficialFixture[] = [...input.unmatched];
  const touched = new Set<string>();
  const carriedIds: ContestId[] = [];

  if (input.sbliveFailed) {
    const carried = carryForward(games, unmatched, input.previous, input.today, () => true);
    games = carried.games;
    unmatched = carried.unmatched;
    for (const id of carried.touched) touched.add(id);
    carriedIds.push(...carried.touched);
    if (carried.touched.length) {
      warnings.push(
        `si.com was not read this run; re-applied ${carried.touched.length} earlier si.com ${carried.touched.length === 1 ? 'score' : 'scores'} still eligible`,
      );
    }
  } else {
    // ---- rules 3 and 4: MaxPreps contests
    games = games.map((g) => {
      if (isSbliveContest(g.contestId)) return g;
      const pairKey = gamePair(g);
      if (!pairKey || !g.home.slug || !g.away.slug) return g;
      const label = labelOf(g);

      // rule 3: score pending
      if (g.status === 'score-pending') {
        if (g.dateKey >= input.today) return g;
        const pick = pickCandidate(finals, pairKey, g.dateKey, used);
        if (pick.kind === 'none') {
          const loose = nameOnlyNear(pairKey, g.dateKey);
          const s = loose ? scoreFor(loose, g.home.slug, g.away.slug) : null;
          if (loose && s) skipped.push(skippedRow(g.contestId, g.dateKey, label, s, loose.url, g.urls.maxpreps, g.status, NAME_ONLY_NOTE));
          return g;
        }
        if (pick.kind === 'conflict') {
          warnings.push(`si.com has ${pick.rows.length} different scores for ${label} near ${g.dateKey}; not filled`);
          const s = scoreFor(pick.rows[0], g.home.slug, g.away.slug);
          if (s) skipped.push(skippedRow(g.contestId, g.dateKey, label, s, pick.rows[0].url, g.urls.maxpreps, g.status, CONFLICT_NOTE));
          return g;
        }
        const s = scoreFor(pick.row, g.home.slug, g.away.slug);
        if (!s || !pick.row.url) return g;
        const otherFinal = input.games.find(
          (o) => o !== g && o.contestId !== g.contestId && o.status === 'final' && bothScored(o) && gamePair(o) === pairKey && within(o.dateKey, g.dateKey, SBLIVE_DATE_TOLERANCE_DAYS),
        );
        if (otherFinal) {
          skipped.push(
            skippedRow(g.contestId, g.dateKey, label, s, pick.row.url, g.urls.maxpreps, g.status, `MaxPreps already has a final for this pair within a day (${otherFinal.contestId}).`),
          );
          return g;
        }
        used.add(pick.row.sbliveGameId);
        touched.add(g.contestId);
        return overrideGame(g, pick.row, s, 'score-pending', 'MaxPreps lists this game without a score, so the score is si.com’s.');
      }

      // rule 4: clearly wrong MaxPreps final
      if (g.status !== 'final' || !bothScored(g)) return g;
      const mp = { home: g.home.score, away: g.away.score };
      const differs = (s: { home: number; away: number }) => s.home !== mp.home || s.away !== mp.away;

      if (g.provenance.resultConflict) {
        const pick = pickCandidate(finals, pairKey, g.dateKey, used);
        if (pick.kind === 'conflict') warnings.push(`si.com has ${pick.rows.length} different scores for ${label} near ${g.dateKey}; rule 4a not applied`);
        if (pick.kind === 'one') {
          const s = scoreFor(pick.row, g.home.slug, g.away.slug);
          if (s && pick.row.url && differs(s)) {
            used.add(pick.row.sbliveGameId);
            touched.add(g.contestId);
            return overrideGame(g, pick.row, s, 'contradictory-result', 'MaxPreps’ score contradicts its own result flags, so si.com’s score is published.');
          }
        }
      }
      const official = offScheduleDate(g);
      if (official) {
        const pick = pickCandidate(finals, pairKey, official, used);
        if (pick.kind === 'conflict') warnings.push(`si.com has ${pick.rows.length} different scores for ${label} near ${official}; rule 4b not applied`);
        if (pick.kind === 'one') {
          const s = scoreFor(pick.row, g.home.slug, g.away.slug);
          if (s && pick.row.url && differs(s)) {
            used.add(pick.row.sbliveGameId);
            touched.add(g.contestId);
            return overrideGame(
              g,
              pick.row,
              s,
              'off-schedule-date',
              `MaxPreps dates this game ${md(g.dateKey)}, more than ${OFF_SCHEDULE_DAYS} days from its official date of ${md(official)}, and si.com has it final on ${md(pick.row.dateKey)}, so si.com’s score is published.`,
            );
          }
        }
      }
      if (isPhantomTieCandidate(g)) {
        const pick = pickCandidate(finals, pairKey, g.dateKey, used, 0);
        if (pick.kind === 'conflict') warnings.push(`si.com has ${pick.rows.length} different scores for ${label} on ${g.dateKey}; rule 4c not applied`);
        if (pick.kind === 'one') {
          const s = scoreFor(pick.row, g.home.slug, g.away.slug);
          if (s && pick.row.url && s.home !== s.away) {
            const short = getLeague(sameLeagueOf(g)!).shortName;
            used.add(pick.row.sbliveGameId);
            touched.add(g.contestId);
            return overrideGame(
              g,
              pick.row,
              s,
              'phantom-tie',
              `MaxPreps shows a 0-0 tie, but ${short} league games have no overtime and si.com has a decided final, so si.com’s score is published.`,
            );
          }
        }
      }
      return g;
    });

    // ---- rule 2: absent fixtures
    const rule2Finals = finals.filter((row) => !isMaxprepsGame(input.games, row));
    const stillUnmatched: OfficialFixture[] = [];
    const added: Game[] = [];
    for (const f of unmatched) {
      const pairKey = fixturePair(f);
      if (!pairKey || f.dateKey >= input.today || !f.homeSlug || !f.awaySlug) {
        stillUnmatched.push(f);
        continue;
      }
      const home = getTeamBySlug(f.homeSlug);
      const away = getTeamBySlug(f.awaySlug);
      if (!home || !away) {
        stillUnmatched.push(f);
        continue;
      }
      const label = `${away.name} at ${home.name}`;
      const near = hasPairContestNear(input.games, pairKey, f.dateKey, MAXPREPS_PAIR_WINDOW_DAYS, f.id);
      if (near.length) {
        const pick = pickCandidate(finals, pairKey, f.dateKey, used);
        // MaxPreps has the pair within ±14 days: never fill; say why its contest does not count.
        stillUnmatched.push(f);
        if (pick.kind === 'none') continue;
        const row = pick.kind === 'one' ? pick.row : pick.rows[0];
        const c = [...near].sort(
          (a, b) => Math.abs(dayDiff(a.dateKey, f.dateKey)) - Math.abs(dayDiff(b.dateKey, f.dateKey)) || a.contestId.localeCompare(b.contestId),
        )[0];
        if (touched.has(c.contestId)) continue;
        const s = scoreFor(row, f.homeSlug, f.awaySlug);
        if (!s) continue;
        skipped.push(
          skippedRow(c.contestId, c.dateKey, label, s, row.url, c.urls.maxpreps, c.status, `MaxPreps has this game (${c.contestId}) but it is not counted: ${notCountedReason(c, f)}.`),
        );
        continue;
      }
      // Never a si.com row that is the same game as a MaxPreps contest (the pair's other leg, days away).
      const pick = pickCandidate(rule2Finals, pairKey, f.dateKey, used);
      if (pick.kind === 'conflict') {
        stillUnmatched.push(f);
        warnings.push(`si.com has ${pick.rows.length} different scores for the ${f.dateKey} fixture ${label}; not filled`);
        const s = scoreFor(pick.rows[0], f.homeSlug, f.awaySlug);
        if (s) skipped.push(skippedRow(`sblive:${pick.rows[0].sbliveGameId}`, f.dateKey, label, s, pick.rows[0].url, null, 'scheduled', CONFLICT_NOTE));
        continue;
      }
      if (pick.kind === 'none') {
        stillUnmatched.push(f);
        const loose = nameOnlyNear(pairKey, f.dateKey);
        const outside = loose
          ? null
          : rule2Finals.find((g) => !used.has(g.sbliveGameId) && sblivePairKey(g.sides) === pairKey && within(g.dateKey, f.dateKey, OFF_SCHEDULE_DAYS));
        const row = loose ?? outside;
        const s = row ? scoreFor(row, f.homeSlug, f.awaySlug) : null;
        if (row && s) {
          skipped.push(skippedRow(`sblive:${row.sbliveGameId}`, row.dateKey, label, s, row.url, null, 'scheduled', loose ? NAME_ONLY_NOTE : OUTSIDE_NOTE));
        }
        continue;
      }
      const s = scoreFor(pick.row, f.homeSlug, f.awaySlug);
      if (!s || !pick.row.url) {
        stillUnmatched.push(f);
        continue;
      }
      used.add(pick.row.sbliveGameId);
      added.push(absentFixtureGame(f, home, away, pick.row, s, fetchedAt));
    }
    unmatched = stillUnmatched;
    games = [...games, ...added];

    // ---- rule 10: an earlier fill whose item this run did not consult (its page failed, was past the
    // team-page cap, or was not read) is carried while still eligible, never silently dropped.
    const consulted = input.consulted ?? (() => true);
    const freshlyFilled = new Set([...touched, ...added.map((g) => g.contestId)]);
    const carried = carryForward(
      games,
      unmatched,
      input.previous,
      input.today,
      (pairKey, date, contestId) => !freshlyFilled.has(contestId) && !consulted(pairKey, date),
    );
    games = carried.games;
    unmatched = carried.unmatched;
    carriedIds.push(...carried.touched);
    if (carried.touched.length) {
      warnings.push(
        `re-applied ${carried.touched.length} earlier si.com ${carried.touched.length === 1 ? 'score' : 'scores'} still eligible that si.com was not read for this run`,
      );
    }
  }

  const rows = games
    .map(backfillRowOf)
    .filter((r): r is BackfillRow => r !== null)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));

  // A row D2 published never also appears as "not published".
  const published = new Set(rows.map((r) => r.contestId));
  const skippedOut = dedupeSkipped(skipped.filter((r) => !published.has(r.contestId)));

  return {
    games,
    unmatched,
    rows,
    skipped: skippedOut,
    warnings,
    supersededGames: supersededGamesOf(games, input.previous),
    carried: [...carriedIds].sort(),
  };
}

function dedupeSkipped(rows: readonly SbliveOnlyRow[]): SbliveOnlyRow[] {
  const byId = new Map<string, SbliveOnlyRow>();
  for (const r of rows) if (!byId.has(r.contestId)) byId.set(r.contestId, r);
  return [...byId.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
}

// ---------------------------------------------------------------- rule 10

/**
 * Rule 10: an earlier run's `sblive:<id>` game whose fixture a MaxPreps contest now matches maps to that
 * contest; the previous snapshot's map is carried while both ends still hold (the key is no longer a
 * game, the value still is).
 */
export function supersededGamesOf(games: readonly Game[], previous: Snapshot | null): Record<ContestId, ContestId> {
  const ids = new Set(games.map((g) => g.contestId));
  const out: Record<ContestId, ContestId> = {};
  for (const [from, to] of Object.entries(previous?.supersededGames ?? {})) {
    if (!ids.has(from) && ids.has(to)) out[from] = to;
  }
  const byFixture = new Map<string, ContestId>();
  for (const g of games) {
    if (g.official && !isSbliveContest(g.contestId)) byFixture.set(g.official.fixtureId, g.contestId);
  }
  for (const g of previous?.games ?? []) {
    if (!isSbliveContest(g.contestId) || ids.has(g.contestId) || !g.official) continue;
    const winner = byFixture.get(g.official.fixtureId);
    if (winner) out[g.contestId] = winner;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------- carry-forward (every si.com request failed)

/**
 * Rule 10 carry-forward: the previous snapshot's si.com fills that are still eligible and that `carry`
 * accepts (by the item's pair, date and contest id) are re-applied: rules 3/4 onto the same MaxPreps
 * contest, rule 2 as the same `sblive:<id>` game.
 */
function carryForward(
  games: readonly Game[],
  unmatched: readonly OfficialFixture[],
  previous: Snapshot | null,
  today: string,
  carry: (pairKey: string, date: string, contestId: string) => boolean,
): { games: Game[]; unmatched: OfficialFixture[]; touched: string[] } {
  if (!previous) return { games: [...games], unmatched: [...unmatched], touched: [] };
  const touched: string[] = [];
  const prevById = new Map(previous.games.filter((g) => g.provenance.backfill).map((g) => [g.contestId, g]));

  // Rules 3 and 4: the same contest, still in the state the earlier override answered.
  const out = games.map((g) => {
    const prev = prevById.get(g.contestId);
    const b = prev?.provenance.backfill;
    if (!prev || !b || isSbliveContest(g.contestId) || prev.home.score === null || prev.away.score === null) return g;
    if (g.provenance.backfill) return g;
    const pairKey = gamePair(g);
    const itemDate = b.rule === 'off-schedule-date' ? (offScheduleDate(g) ?? g.dateKey) : g.dateKey;
    if (!pairKey || !carry(pairKey, itemDate, g.contestId)) return g;
    const stillEligible =
      b.rule === 'score-pending'
        ? g.status === 'score-pending' && g.dateKey < today
        : g.status === 'final' && b.maxpreps !== null && g.home.score === b.maxpreps.home && g.away.score === b.maxpreps.away;
    if (!stillEligible) return g;
    touched.push(g.contestId);
    const { scoreConflict: _dropped, ...provenance } = g.provenance;
    void _dropped;
    return {
      ...g,
      home: { ...g.home, score: prev.home.score, result: prev.home.result },
      away: { ...g.away, score: prev.away.score, result: prev.away.result },
      status: 'final' as const,
      decider: prev.decider,
      otPeriods: prev.otPeriods,
      isOt: prev.isOt,
      isForfeit: prev.isForfeit,
      forfeitBy: prev.forfeitBy,
      urls: { ...g.urls, sblive: prev.urls.sblive },
      provenance: {
        ...provenance,
        scores: 'sblive' as const,
        backfill: b,
        ...(prev.provenance.scoreConflict ? { scoreConflict: prev.provenance.scoreConflict } : {}),
      },
    };
  });

  // Rule 2: the fixture is still unmatched, past-dated and absent from MaxPreps.
  const byFixtureId = new Map(unmatched.map((f) => [f.id, f]));
  const have = new Set(games.map((g) => g.contestId));
  const added: Game[] = [];
  const filled = new Set<string>();
  for (const prev of previous.games) {
    if (!isSbliveContest(prev.contestId) || prev.provenance.backfill?.rule !== 'absent-fixture' || !prev.official) continue;
    if (have.has(prev.contestId)) continue;
    const f = byFixtureId.get(prev.official.fixtureId);
    const pairKey = f ? fixturePair(f) : null;
    if (!f || !pairKey || f.dateKey >= today || filled.has(f.id)) continue;
    if (!carry(pairKey, f.dateKey, prev.contestId)) continue;
    if (hasPairContestNear(games, pairKey, f.dateKey, MAXPREPS_PAIR_WINDOW_DAYS, f.id).length) continue;
    filled.add(f.id);
    touched.push(prev.contestId);
    added.push(prev);
  }
  return { games: [...out, ...added], unmatched: unmatched.filter((f) => !filled.has(f.id)), touched };
}
