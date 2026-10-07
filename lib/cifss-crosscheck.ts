/**
 * MaxPreps ↔ cifsshome.org score comparison (docs/DATA-SOURCES.md §1.2a). The third cross-check,
 * beside MaxPreps' own tables (lib/standings.ts buildCrossCheck) and si.com (lib/crosscheck.ts).
 *
 * MaxPreps is primary and nothing here changes a game: `compareCifss` only builds the report /about
 * prints. Schools enter their own rows on the widget, so most of what it lacks says nothing about
 * MaxPreps; the report is therefore built from the widget's SCORED rows alone:
 *   - both sources score the game: an agreement, or a conflict row (MaxPreps' score stands);
 *   - MaxPreps lists the game without a score: a `cifssOnlyScored` row;
 *   - MaxPreps has no contest for the pair within three days of the date: a `notOnMaxPreps` row,
 *     only when both sides are our teams (an opponent's name on the widget and on MaxPreps often
 *     differ, so a name-only side that finds no game proves nothing), and unless MaxPreps marks a contest of the pair near that date Deleted (a scrimmage, a
 *     reschedule or a cancellation: a school's own widget row is often left behind) or the pipeline
 *     dropped one on purpose (`Snapshot.dropped`), or the row's note says it was a scrimmage.
 *
 * The join is `(date, unordered pair)` with lib/teams.ts sideJoinKey, as the si.com join is, then
 * the pair's nearest unmatched game within three days (a school that never moved its row after a
 * reschedule). A pair listed by both schools is one game; when their scores differ it agrees if
 * either matches MaxPreps and is set aside otherwise (`ambiguous`).
 */

import { gamePairKey } from './crosscheck';
import { dayNumber } from './format';
import { cifssListingUrl, type CifssRow, type CifssSide } from './sources/cifss';
import { getTeamBySlug, sideJoinKey, unorderedPairKey } from './teams';
import type { CifssConflictRow, CifssCrossCheck, CifssOnlyRow, Game } from './types';

/** How far apart the widget's date and MaxPreps' may be and still be one game. */
export const CIFSS_DATE_TOLERANCE_DAYS = 3;

/** A MaxPreps contest that is not a game: Deleted on MaxPreps, or dropped by the pipeline. */
export interface NonGame {
  dateKey: string;
  pairKey: string;
}

export interface CompareCifssOptions {
  /** ISO UTC stamp of the run that read the widget. */
  cifssFetchedAt: string;
  /** MaxPreps contests reported Deleted, and contests the pipeline dropped. */
  nonGames?: readonly NonGame[];
}

export interface CompareCifssResult {
  report: CifssCrossCheck;
  /** Widget games set aside because two schools' rows give different scores, none of them MaxPreps', as "date pair" strings for the log. */
  ambiguous: string[];
  /** Scored widget games with no MaxPreps contest that match a Deleted or dropped one (not reported). */
  nonGameMatches: number;
}

export const CIFSS_NOTES = {
  pending: 'MaxPreps lists the game with no score yet, so it stays unreported here.',
  postponed: 'MaxPreps lists the game as postponed, so it stays unreported here.',
  notOnMaxPreps:
    'MaxPreps has no game between these teams within three days of this date. Schools enter their own rows on cifsshome.org, so this may be a scrimmage or a game played on another date; nothing is published from it.',
} as const;

const sidePairKey = (r: Pick<CifssRow, 'home' | 'away'>): string =>
  unorderedPairKey(sideJoinKey(r.home), sideJoinKey(r.away));

const isScored = (r: Pick<CifssRow, 'home' | 'away'>): boolean => r.home.score !== null && r.away.score !== null;

/** The two scores keyed by side, so two rows with home and away swapped compare equal. */
function scoreByKey(r: Pick<CifssRow, 'home' | 'away'>): Map<string, number> {
  return new Map([
    [sideJoinKey(r.home), r.home.score as number],
    [sideJoinKey(r.away), r.away.score as number],
  ]);
}

function sameScores(a: CifssRow, b: CifssRow): boolean {
  const x = scoreByKey(a);
  const y = scoreByKey(b);
  return [...x].every(([k, v]) => y.get(k) === v);
}

const byDateKey = (a: { dateKey: string; contestId: string }, b: { dateKey: string; contestId: string }): number =>
  a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId);

function displayName(side: CifssSide): string {
  return (side.slug ? getTeamBySlug(side.slug)?.name : undefined) ?? side.name;
}

function rowUrl(row: CifssRow): string {
  return cifssListingUrl(row.section, { from: row.dateKey, to: row.dateKey });
}

/** Within the tolerance of `dateKey`. */
function near(a: string, b: string): boolean {
  return Math.abs(dayNumber(a) - dayNumber(b)) <= CIFSS_DATE_TOLERANCE_DAYS;
}

/** One widget game: its rows' distinct scores, `variants[0]` first listed (two schools can enter one game differently). */
export interface WidgetGame {
  variants: CifssRow[];
}

/** The widget's scored games, one per (date, pair): rows with one of our teams, not marked a scrimmage. */
export function cifssGames(rows: readonly CifssRow[]): WidgetGame[] {
  const groups = new Map<string, CifssRow[]>();
  for (const r of rows) {
    if (r.home.slug === null && r.away.slug === null) continue;
    if (r.note && /scrimmage/i.test(r.note)) continue;
    if (!isScored(r)) continue;
    const key = `${r.dateKey}|${sidePairKey(r)}`;
    const list = groups.get(key);
    if (!list) groups.set(key, [r]);
    else if (!list.some((x) => sameScores(x, r))) list.push(r);
  }
  return [...groups.values()]
    .map((variants) => ({ variants }))
    .sort((a, b) => a.variants[0].dateKey.localeCompare(b.variants[0].dateKey) || a.variants[0].cifssId.localeCompare(b.variants[0].cifssId));
}

/** A disagreement row for a scored MaxPreps game and the widget's (aligned) score. */
function conflictRow(
  game: Game,
  maxpreps: { home: number; away: number },
  cifss: { home: number; away: number },
  cifssDateKey: string,
  cifssUrl: string,
): CifssConflictRow {
  // Away first, as the row's label and the si.com conflict rows read.
  const moved = cifssDateKey === game.dateKey ? '' : ` cifsshome.org dates it ${cifssDateKey}.`;
  return {
    contestId: game.contestId,
    dateKey: game.dateKey,
    label: `${game.away.name} at ${game.home.name}`,
    maxpreps,
    cifss,
    cifssDateKey,
    maxprepsUrl: game.urls.maxpreps,
    cifssUrl,
    note:
      `Sources disagree: we show MaxPreps' ${maxpreps.away}-${maxpreps.home} (${game.away.name}–${game.home.name}); ` +
      `cifsshome.org reports ${cifss.away}-${cifss.home}.${moved} MaxPreps’ score stands.`,
  };
}

export function compareCifss(
  games: readonly Game[],
  rows: readonly CifssRow[],
  opts: CompareCifssOptions,
): CompareCifssResult {
  const found = cifssGames(rows);
  const widget = found.map((w) => w.variants[0]);
  const variantsOf = new Map(found.map((w) => [w.variants[0], w.variants]));
  const ambiguous: string[] = [];
  const setAside = (r: CifssRow) => ambiguous.push(`${r.dateKey} ${sidePairKey(r)}`);

  const byPair = new Map<string, Game[]>();
  for (const g of games) {
    const k = gamePairKey(g);
    const list = byPair.get(k);
    if (list) list.push(g);
    else byPair.set(k, [g]);
  }
  const nonGames = new Map<string, string[]>();
  for (const n of opts.nonGames ?? []) {
    const list = nonGames.get(n.pairKey);
    if (list) list.push(n.dateKey);
    else nonGames.set(n.pairKey, [n.dateKey]);
  }

  // Pass 1, same date; pass 2, the nearest game of the pair within the tolerance not already taken.
  const matchOf = new Map<CifssRow, Game>();
  const taken = new Set<string>();
  for (const r of widget) {
    const hit = (byPair.get(sidePairKey(r)) ?? []).find((g) => g.dateKey === r.dateKey && !taken.has(g.contestId));
    if (hit) {
      matchOf.set(r, hit);
      taken.add(hit.contestId);
    }
  }
  for (const r of widget) {
    if (matchOf.has(r)) continue;
    const day = dayNumber(r.dateKey);
    const hit = (byPair.get(sidePairKey(r)) ?? [])
      .filter((g) => !taken.has(g.contestId) && near(g.dateKey, r.dateKey))
      .sort((a, b) => Math.abs(dayNumber(a.dateKey) - day) - Math.abs(dayNumber(b.dateKey) - day) || a.contestId.localeCompare(b.contestId))[0];
    if (hit) {
      matchOf.set(r, hit);
      taken.add(hit.contestId);
    }
  }

  const conflicts: CifssConflictRow[] = [];
  const cifssOnlyScored: CifssOnlyRow[] = [];
  const notOnMaxPreps: CifssOnlyRow[] = [];
  let agreements = 0;
  let nonGameMatches = 0;

  for (const r of widget) {
    const game = matchOf.get(r);
    const variants = variantsOf.get(r) ?? [r];
    if (!game) {
      const pair = sidePairKey(r);
      if ((byPair.get(pair) ?? []).some((g) => near(g.dateKey, r.dateKey))) continue; // its game matched another row
      if ((nonGames.get(pair) ?? []).some((d) => near(d, r.dateKey))) {
        nonGameMatches += 1;
        continue;
      }
      if (variants.length > 1) {
        setAside(r);
        continue;
      }
      if (r.home.slug === null || r.away.slug === null) continue;
      notOnMaxPreps.push({
        contestId: `cifss:${r.cifssId}`,
        dateKey: r.dateKey,
        label: `${displayName(r.away)} at ${displayName(r.home)}`,
        cifss: { home: r.home.score as number, away: r.away.score as number },
        pairKey: pair,
        cifssDateKey: r.dateKey,
        maxprepsUrl: null,
        cifssUrl: rowUrl(r),
        note: CIFSS_NOTES.notOnMaxPreps,
      });
      continue;
    }
    if (game.status === 'live') continue;
    const aligned = (v: CifssRow) => {
      const scores = scoreByKey(v);
      return { home: scores.get(sideJoinKey(game.home)) as number, away: scores.get(sideJoinKey(game.away)) as number };
    };
    const cifss = aligned(r);
    const label = `${game.away.name} at ${game.home.name}`;
    const home = game.home.score;
    const away = game.away.score;
    const agrees = (v: CifssRow) => aligned(v).home === home && aligned(v).away === away;
    // Two schools entered the game with different scores: it agrees when either entry matches MaxPreps,
    // and is set aside otherwise (the widget does not say which entry is right).
    if (variants.length > 1) {
      if (home !== null && away !== null && variants.some(agrees)) agreements += 1;
      else setAside(r);
      continue;
    }
    if (home === null || away === null) {
      cifssOnlyScored.push({
        contestId: game.contestId,
        dateKey: game.dateKey,
        label,
        cifss,
        pairKey: gamePairKey(game),
        cifssDateKey: r.dateKey,
        maxprepsUrl: game.urls.maxpreps,
        cifssUrl: rowUrl(r),
        note: game.status === 'postponed' ? CIFSS_NOTES.postponed : CIFSS_NOTES.pending,
      });
      continue;
    }
    if (agrees(r)) {
      agreements += 1;
      continue;
    }
    conflicts.push(conflictRow(game, { home, away }, cifss, r.dateKey, rowUrl(r)));
  }

  return {
    report: {
      cifssFetchedAt: opts.cifssFetchedAt,
      compared: agreements + conflicts.length,
      agreements,
      conflicts: conflicts.sort(byDateKey),
      cifssOnlyScored: cifssOnlyScored.sort(byDateKey),
      notOnMaxPreps: notOnMaxPreps.sort(byDateKey),
    },
    ambiguous: ambiguous.sort(),
    nonGameMatches,
  };
}

/**
 * A previous run's report carried into a run that read no widget data. Each widget score it kept is
 * judged again against this run's games, so the report never contradicts the scores beside it:
 *  - a conflict or MaxPreps-unscored row whose game now carries the widget's score becomes an
 *    agreement; one whose game still differs is a conflict showing MaxPreps' current score; one whose
 *    game is gone (or unscored again, for a conflict) is dropped;
 *  - a not-on-MaxPreps row stays while MaxPreps still has no game of the pair near its date.
 * Agreements are not stored game by game, so earlier ones are kept as they were; `compared` is
 * recounted as `agreements + conflicts.length`.
 */
export function carryCifssCrossCheck(prior: CifssCrossCheck, games: readonly Game[]): CifssCrossCheck {
  const byId = new Map(games.map((g) => [g.contestId, g]));
  const pairs = new Map<string, string[]>();
  for (const g of games) {
    const k = gamePairKey(g);
    const list = pairs.get(k);
    if (list) list.push(g.dateKey);
    else pairs.set(k, [g.dateKey]);
  }
  let agreements = prior.agreements;
  const conflicts: CifssConflictRow[] = [];
  const cifssOnlyScored: CifssOnlyRow[] = [];
  const judge = (r: { contestId: string; cifss: { home: number; away: number }; cifssDateKey: string; cifssUrl: string }, unscored: () => void) => {
    const g = byId.get(r.contestId);
    if (!g || g.status === 'live') return;
    if (g.home.score === null || g.away.score === null) return unscored();
    if (g.home.score === r.cifss.home && g.away.score === r.cifss.away) agreements += 1;
    else conflicts.push(conflictRow(g, { home: g.home.score, away: g.away.score }, r.cifss, r.cifssDateKey, r.cifssUrl));
  };
  for (const r of prior.conflicts) judge(r, () => {});
  for (const r of prior.cifssOnlyScored) judge(r, () => cifssOnlyScored.push(r));
  return {
    cifssFetchedAt: prior.cifssFetchedAt,
    compared: agreements + conflicts.length,
    agreements,
    conflicts: conflicts.sort(byDateKey),
    cifssOnlyScored: cifssOnlyScored.sort(byDateKey),
    notOnMaxPreps: prior.notOnMaxPreps.filter((r) => !(pairs.get(r.pairKey) ?? []).some((d) => near(d, r.dateKey))),
  };
}
