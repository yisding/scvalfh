/**
 * What the site shows for JV: MaxPreps' JV games, supplemented by si.com's scored JV finals.
 *
 * MaxPreps is primary, as it is for varsity (owner decision D2), and si.com only ever adds to it:
 *
 *   1. disagreement — a MaxPreps final whose si.com copy has a different score keeps MaxPreps'
 *                     score; si.com's is recorded as `provenance.scoreConflict` and the page says
 *                     so beside the row.
 *   2. fill         — a MaxPreps game dated today or earlier with no score (scheduled or score not
 *                     reported, never postponed) whose si.com copy is a scored final takes si.com's
 *                     score, marked `provenance.scores: 'sblive'` (the † on the page).
 *   3. si.com only  — a si.com final between two registry schools with no MaxPreps JV contest of
 *                     that pair within ±14 days becomes a `sblive:<id>` game.
 *
 * A si.com row is matched to a MaxPreps game by the unordered pair of registry schools and a date
 * within ±1 day (a posted reschedule), and is used at most once. Both sides must be registry
 * schools identified by their si.com JV team id (JV_SBLIVE_PATHS), never by name, and a row two JV
 * pages list with different scores is never used. A row against a school outside the registry is
 * not matched: there is no id to match it by.
 *
 * Nothing here decides a table: a JV game counts for no varsity table or postseason (countsFor and
 * postseason stay null), and no JV table is computed yet. Pure: no I/O, no clock — `today` is an input.
 */

import { datesOf } from './backfill';
import { byDateThenId, dayDiff } from './format';
import type { JvSbliveRow } from './jv-schema';
import { getTeamBySlug } from './teams';
import type { BackfillProvenance, ContestId, Game, GameSide, Outcome, Team, TeamSlug } from './types';

/** Rules 1-2: a si.com final within ±1 day of the MaxPreps date. */
export const JV_SBLIVE_DATE_TOLERANCE_DAYS = 1;
/** Rule 3 precondition: no MaxPreps JV contest of the pair within ±14 days. */
export const JV_MAXPREPS_PAIR_WINDOW_DAYS = 14;

export const JV_FILL_NOTE = 'MaxPreps has no score for this JV game, so the score is si.com’s.';
export const JV_SBLIVE_ONLY_NOTE = 'MaxPreps lists no JV contest for this game, so it is si.com’s.';

export type JvUnusedReason =
  | 'copies-disagree'
  | 'opponent-not-registry'
  | 'ambiguous'
  | 'maxpreps-pair-nearby'
  | 'not-needed';

export interface JvMergeResult {
  /** MaxPreps' games, filled and annotated, plus the si.com-only games; by date, then id. */
  games: Game[];
  /** MaxPreps contests whose score is si.com's (rule 2). */
  filled: ContestId[];
  /** MaxPreps finals si.com disagrees with (rule 1). */
  differs: ContestId[];
  /** `sblive:<id>` games (rule 3). */
  added: ContestId[];
  /** si.com rows the merge did not publish, and why. 'not-needed': it matched and agreed. */
  unused: Array<{ sbliveGameId: string; reason: JvUnusedReason }>;
}

function pairKey(a: TeamSlug, b: TeamSlug): string {
  return [a, b].sort().join('~');
}

function rowPair(row: JvSbliveRow): string | null {
  const [a, b] = row.sides;
  return a.slug && b.slug ? pairKey(a.slug, b.slug) : null;
}

function scoreOf(row: JvSbliveRow, slug: TeamSlug): number {
  const side = row.sides.find((s) => s.slug === slug);
  if (!side) throw new Error(`jv-merge: si.com row ${row.sbliveGameId} has no side ${slug}`);
  return side.score;
}

function outcome(mine: number, theirs: number): Outcome {
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
}

function scoreText(g: Pick<Game, 'home' | 'away'>, score: { home: number; away: number }): string {
  return `${g.away.name} ${score.away}, ${g.home.name} ${score.home}`;
}

/** Rule 2: si.com's score written onto the MaxPreps contest (its id, date and host kept). */
function filled(g: Game, row: JvSbliveRow, score: { home: number; away: number }): Game {
  const backfill: BackfillProvenance = {
    rule: 'score-pending',
    sbliveGameId: row.sbliveGameId,
    maxpreps: null,
    note: JV_FILL_NOTE,
  };
  return {
    ...g,
    home: { ...g.home, score: score.home, result: outcome(score.home, score.away) },
    away: { ...g.away, score: score.away, result: outcome(score.away, score.home) },
    status: 'final',
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: 'REG',
    shootout: null,
    urls: { ...g.urls, sblive: row.url ?? g.urls.sblive },
    provenance: { ...g.provenance, scores: 'sblive', backfill },
  };
}

/** Rule 1: MaxPreps' final kept, si.com's score recorded beside it. */
function annotated(g: Game, row: JvSbliveRow, score: { home: number; away: number }): Game {
  return {
    ...g,
    urls: { ...g.urls, sblive: row.url ?? g.urls.sblive },
    provenance: {
      ...g.provenance,
      scoreConflict: {
        sblive: score,
        note: `si.com has ${scoreText(g, score)}; MaxPreps’ score is shown.`,
      },
    },
  };
}

function sideOf(team: Team, score: number, other: number): GameSide {
  return { teamId: team.id, slug: team.slug, name: team.name, score, result: outcome(score, other) };
}

/** Rule 3: a si.com-only JV game. The host is si.com's `isHome` when exactly one side says so. */
function sbliveOnlyGame(row: JvSbliveRow, fetchedAt: string): Game | null {
  const [a, b] = row.sides;
  const ta = a.slug ? getTeamBySlug(a.slug) : undefined;
  const tb = b.slug ? getTeamBySlug(b.slug) : undefined;
  if (!ta || !tb) return null;
  const aHosts = a.isHome === true && b.isHome !== true;
  const bHosts = b.isHome === true && a.isHome !== true;
  const [home, away, homeTeam, awayTeam] = bHosts ? [b, a, tb, ta] : [a, b, ta, tb];
  const dates = datesOf(row);
  return {
    contestId: `sblive:${row.sbliveGameId}`,
    dateLocal: dates.dateLocal,
    dateUtc: dates.dateUtc,
    dateKey: dates.dateKey,
    isDateTba: false,
    isTimeTba: dates.isTimeTba,
    home: sideOf(homeTeam, home.score, away.score),
    away: sideOf(awayTeam, away.score, home.score),
    site: aHosts || bHosts ? 'home' : 'neutral',
    status: 'final',
    isLeague: false,
    leagueDivision: homeTeam.division === awayTeam.division ? homeTeam.division : null,
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
    recap: null,
    urls: { maxpreps: null, ...(row.url ? { sblive: row.url } : {}), nfhsStream: null, goFan: null },
    provenance: {
      scores: 'sblive',
      schedule: 'sblive',
      backfill: { rule: 'absent-fixture', sbliveGameId: row.sbliveGameId, maxpreps: null, note: JV_SBLIVE_ONLY_NOTE },
      fetchedAt,
    },
  };
}

export function mergeJv(input: {
  games: readonly Game[];
  sblive: readonly JvSbliveRow[];
  /** YYYY-MM-DD, Pacific: the file's fetchedAt date. */
  today: string;
  /** Stamped on a si.com-only game's provenance. */
  fetchedAt: string;
}): JvMergeResult {
  const unused: JvMergeResult['unused'] = [];
  const usable: JvSbliveRow[] = [];
  for (const row of input.sblive) {
    if (row.copiesDisagree) unused.push({ sbliveGameId: row.sbliveGameId, reason: 'copies-disagree' });
    else if (!rowPair(row)) unused.push({ sbliveGameId: row.sbliveGameId, reason: 'opponent-not-registry' });
    else usable.push(row);
  }
  const used = new Set<string>();
  const filledIds: ContestId[] = [];
  const differs: ContestId[] = [];

  const games = input.games.map((g) => {
    if (!g.home.slug || !g.away.slug) return g;
    const key = pairKey(g.home.slug, g.away.slug);
    const near = usable
      .filter((r) => !used.has(r.sbliveGameId) && rowPair(r) === key)
      .map((r) => ({ r, d: Math.abs(dayDiff(g.dateKey, r.dateKey)) }))
      .filter(({ d }) => d <= JV_SBLIVE_DATE_TOLERANCE_DAYS)
      .sort((x, y) => x.d - y.d);
    if (near.length === 0) return g;
    if (near.length > 1 && near[0].d === near[1].d) {
      for (const { r } of near) {
        if (used.has(r.sbliveGameId)) continue;
        used.add(r.sbliveGameId);
        unused.push({ sbliveGameId: r.sbliveGameId, reason: 'ambiguous' });
      }
      return g;
    }
    const row = near[0].r;
    used.add(row.sbliveGameId);
    const score = { home: scoreOf(row, g.home.slug), away: scoreOf(row, g.away.slug) };
    if (g.status === 'final') {
      if (g.home.score === score.home && g.away.score === score.away) {
        unused.push({ sbliveGameId: row.sbliveGameId, reason: 'not-needed' });
        return g;
      }
      differs.push(g.contestId);
      return annotated(g, row, score);
    }
    if (g.status === 'postponed' || g.dateKey > input.today) {
      unused.push({ sbliveGameId: row.sbliveGameId, reason: 'not-needed' });
      return g;
    }
    filledIds.push(g.contestId);
    return filled(g, row, score);
  });

  const added: Game[] = [];
  for (const row of usable) {
    if (used.has(row.sbliveGameId)) continue;
    const key = rowPair(row);
    const nearby = games.some(
      (g) =>
        g.home.slug &&
        g.away.slug &&
        pairKey(g.home.slug, g.away.slug) === key &&
        Math.abs(dayDiff(g.dateKey, row.dateKey)) <= JV_MAXPREPS_PAIR_WINDOW_DAYS,
    );
    if (nearby) {
      unused.push({ sbliveGameId: row.sbliveGameId, reason: 'maxpreps-pair-nearby' });
      continue;
    }
    const game = row.dateKey > input.today ? null : sbliveOnlyGame(row, input.fetchedAt);
    if (!game) {
      unused.push({ sbliveGameId: row.sbliveGameId, reason: 'not-needed' });
      continue;
    }
    added.push(game);
  }

  return {
    games: [...games, ...added].sort(byDateThenId),
    filled: filledIds,
    differs,
    added: added.map((g) => g.contestId),
    unused: unused.sort((a, b) => a.sbliveGameId.localeCompare(b.sbliveGameId)),
  };
}
