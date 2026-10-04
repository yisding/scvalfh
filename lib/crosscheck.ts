/**
 * MaxPreps ↔ si.com (ex-SBLive) score reconciliation (SPEC §7.9, owner decision D2).
 *
 * MaxPreps is primary. si.com values reach a published score ONLY through D2's mechanical rules 2-4,
 * which live in lib/backfill.ts and run BEFORE this join. What this module does with what is left:
 *   - rule 5, plain disagreement: both sources scored and no rule-4 condition held → MaxPreps stays and
 *     a `ScoreConflictRow` is published (never averaged, never silently resolved);
 *   - a si.com score that D2 did NOT publish (a MaxPreps contest without a score, or a si.com Final MaxPreps
 *     has no contest for) → a `SbliveOnlyRow` whose note names why D2 did not publish it;
 *   - games D2 already published from si.com (`provenance.backfill`) are not compared again: their two
 *     values are in `SbliveCrossCheck.backfilled` (withBackfill).
 *
 * The join is `(local date, {teamA, teamB} as an UNORDERED pair)`, because the statewide si.com
 * scoreboard exposes neither home/away nor a web path — only two names, two logo URLs and two score
 * strings. Team identity comes from lib/sources/sblive.ts `resolveSbliveSide` (id first).
 *
 * Only scores are compared; no W/L/T is derived here (that is lib/format.ts `sideOutcome`). So an EAL 1 v 1
 * win, level on goals with decider 'SO' (MaxPreps 1-1), and si.com's 1-1 for the same game agree.
 *
 * Nothing here mutates its input: `reconcile()` returns a new `Game[]`.
 */

import { dayNumber } from './format';
import { sblivePairKey, type SbliveGame, type SbliveSide } from './sources/sblive';
import { getTeamBySlug } from './teams';
import type { BackfillRow, Game, SbliveCrossCheck, ScoreConflictRow, SbliveOnlyRow } from './types';

/** The same normalization `sblivePairKey` uses, so the two halves of the join agree exactly. */
function sideKey(side: { slug: string | null; name: string }): string {
  return side.slug ?? `name:${side.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

export function gamePairKey(game: Pick<Game, 'home' | 'away'>): string {
  return [sideKey(game.home), sideKey(game.away)].sort().join('~');
}

export function gameJoinKey(game: Pick<Game, 'dateKey' | 'home' | 'away'>): string {
  return `${game.dateKey}|${gamePairKey(game)}`;
}

export function sbliveJoinKey(g: Pick<SbliveGame, 'dateKey' | 'sides'>): string {
  return `${g.dateKey}|${sblivePairKey(g.sides)}`;
}

export interface ReconcileOptions {
  /** ISO UTC stamp for the run that fetched the si.com rows. */
  sbliveFetchedAt: string;
  /** The run's local date; a game dated today or later is never backfilled. */
  today?: string;
  /**
   * The rows D2 (lib/backfill.ts) explained instead of publishing (`applyBackfill().skipped`). A game
   * one is keyed on carries that row's note, so its own note and the si.com-only row withBackfill
   * publishes give the same reason.
   */
  skipped?: readonly Pick<SbliveOnlyRow, 'contestId' | 'note'>[];
}

export interface ReconcileResult {
  games: Game[];
  report: SbliveCrossCheck;
  /** si.com rows that matched no MaxPreps contest on their date (the si.com-only Finals among them are published as rows). */
  unmatched: number;
}

/** The notes naming why D2 did not publish a si.com score (SbliveOnlyRow.note, rendered verbatim). */
export const NOT_PUBLISHED = {
  notOurTeam: 'One side is not one of our teams.',
  nameOnly: 'Resolved by name only.',
  notOfficial: 'Not on an official schedule.',
  notFinal: 'si.com has not marked it final.',
  notPast: 'The game is dated today; si.com scores are used only for past games.',
  notPending: 'MaxPreps still lists it as not yet played, not as played without a score.',
  other: 'It meets none of the rules for using a si.com score.',
} as const;

const idResolved = (s: SbliveSide) => s.slug !== null && (s.via === 'team-id' || s.via === 'school-id');

function whyNotPublished(game: Game, match: SbliveGame, today: string | undefined): string {
  if (!game.home.slug || !game.away.slug) return NOT_PUBLISHED.notOurTeam;
  if (!match.sides.every(idResolved)) return NOT_PUBLISHED.nameOnly;
  if (!match.isFinal) return NOT_PUBLISHED.notFinal;
  if (today !== undefined && game.dateKey >= today) return NOT_PUBLISHED.notPast;
  if (game.status !== 'score-pending') return NOT_PUBLISHED.notPending;
  return NOT_PUBLISHED.other;
}

function displayName(side: SbliveSide): string {
  return (side.slug ? getTeamBySlug(side.slug)?.name : undefined) ?? side.name;
}

/**
 * Line up a si.com pair with a MaxPreps game's home/away slots by identity. Returns null when the
 * two sides cannot be told apart, in which case only the sorted score pair is comparable.
 */
function alignToHomeAway(
  game: Game,
  sides: readonly SbliveSide[],
): { home: SbliveSide; away: SbliveSide } | null {
  const homeKey = sideKey(game.home);
  const awayKey = sideKey(game.away);
  if (homeKey === awayKey) return null;
  const home = sides.find((s) => sideKey(s) === homeKey);
  const away = sides.find((s) => sideKey(s) === awayKey);
  if (!home || !away || home === away) return null;
  return { home, away };
}

function scorePair(a: number | null, b: number | null): string {
  return `${a ?? '—'}-${b ?? '—'}`;
}

export function reconcile(
  games: readonly Game[],
  sbliveGames: readonly SbliveGame[],
  opts: ReconcileOptions,
): ReconcileResult {
  const skipNote = new Map((opts.skipped ?? []).map((r) => [r.contestId, r.note]));
  const bySbliveKey = new Map<string, SbliveGame>();
  for (const g of sbliveGames) {
    const key = sbliveJoinKey(g);
    const prior = bySbliveKey.get(key);
    // Prefer the row that actually carries two numbers.
    if (!prior || (g.isScored && !prior.isScored)) bySbliveKey.set(key, g);
  }

  const conflicts: ScoreConflictRow[] = [];
  const sbliveOnlyScored: SbliveOnlyRow[] = [];
  const matchedKeys = new Set<string>();
  let compared = 0;
  let agreements = 0;

  const out: Game[] = games.map((game) => {
    const key = gameJoinKey(game);
    const match = bySbliveKey.get(key);
    if (!match) return game;
    matchedKeys.add(key);
    // D2 already published si.com's value here (lib/backfill.ts): it is reported in `backfilled`.
    if (game.provenance.backfill) return game;
    // The JOIN, not the comparison: a si.com row can match on date and teams and still carry no
    // numbers. Those rows fall out below and land in neither `agreements` nor `conflicts`, so
    // `compared` is always ≥ `agreements + conflicts.length` and copy that prints them has to name
    // both figures (components/about/SbliveCrossCheckSummary.tsx).
    compared += 1;

    if (!match.isScored) return game;

    const aligned = alignToHomeAway(game, match.sides);
    const sbHome = aligned ? aligned.home.score : match.sides[0].score;
    const sbAway = aligned ? aligned.away.score : match.sides[1].score;
    if (sbHome === null || sbAway === null) return game;

    const ourHome = game.home.score;
    const ourAway = game.away.score;

    // --- MaxPreps has no score and D2 did not publish si.com's (lib/backfill.ts ran first): record
    //     why, and leave the game unreported. A missing score is never shown as 0-0.
    if (ourHome === null || ourAway === null) {
      const reason = skipNote.get(game.contestId) ?? whyNotPublished(game, match, opts.today);
      const note =
        `si.com reports ${match.sides[0].name} ${match.sides[0].score}` +
        `, ${match.sides[1].name} ${match.sides[1].score}` +
        `; MaxPreps has not published a score, so this game stays unreported. ${reason}`;
      sbliveOnlyScored.push({
        contestId: game.contestId,
        dateKey: game.dateKey,
        label: `${game.away.name} at ${game.home.name}`,
        sblive: { home: sbHome, away: sbAway },
        aligned: aligned !== null,
        sbliveUrl: match.url,
        maxprepsUrl: game.urls.maxpreps,
        status: game.status,
        note: reason,
      });
      return {
        ...game,
        provenance: { ...game.provenance, scoreConflict: { sblive: { home: sbHome, away: sbAway }, note } },
      };
    }

    // --- Both scored: compare. When the sides could not be aligned, compare the sorted pair so a
    //     name-order difference is not reported as a disagreement.
    const agree = aligned
      ? ourHome === sbHome && ourAway === sbAway
      : [ourHome, ourAway].sort().join(',') === [sbHome, sbAway].sort().join(',');
    if (agree) {
      agreements += 1;
      return game;
    }

    // AWAY first, in both the note and the table cells that render beside it: the row is labelled
    // "<away> at <home>", and printing the same MaxPreps result as "0-3" here and "3–0" there put
    // one score in two opposite orientations inside one row.
    const note =
      `Sources disagree: we show MaxPreps' ${scorePair(ourAway, ourHome)}` +
      ` (${game.away.name}–${game.home.name}); si.com reports ${scorePair(sbAway, sbHome)}.` +
      ' MaxPreps’ score stands.';
    conflicts.push({
      contestId: game.contestId,
      dateKey: game.dateKey,
      label: `${game.away.name} at ${game.home.name}`,
      maxpreps: { home: ourHome, away: ourAway },
      sblive: { home: sbHome, away: sbAway },
      aligned: aligned !== null,
      maxprepsUrl: game.urls.maxpreps,
      sbliveUrl: match.url,
      note,
    });
    return {
      ...game,
      provenance: { ...game.provenance, scoreConflict: { sblive: { home: sbHome, away: sbAway }, note } },
    };
  });

  const unmatchedKeys = [...bySbliveKey.keys()].filter((k) => !matchedKeys.has(k));

  // si.com Finals with a registry side that MaxPreps has no contest for (none of the pair within ±3
  // days, so not a mere date difference) and that D2 did not publish: published as rows, with why.
  const pairDates = new Map<string, number[]>();
  for (const g of games) {
    const k = gamePairKey(g);
    const list = pairDates.get(k);
    if (list) list.push(dayNumber(g.dateKey));
    else pairDates.set(k, [dayNumber(g.dateKey)]);
  }
  for (const key of unmatchedKeys) {
    const sb = bySbliveKey.get(key)!;
    if (!sb.isFinal || !sb.isScored || !sb.sides.some((s) => s.slug !== null)) continue;
    const day = dayNumber(sb.dateKey);
    if ((pairDates.get(sblivePairKey(sb.sides)) ?? []).some((d) => Math.abs(d - day) <= 3)) continue;
    const [a, b] = sb.sides;
    const note = !a.slug || !b.slug
      ? NOT_PUBLISHED.notOurTeam
      : !idResolved(a) || !idResolved(b)
        ? NOT_PUBLISHED.nameOnly
        : NOT_PUBLISHED.notOfficial;
    sbliveOnlyScored.push({
      contestId: `sblive:${sb.sbliveGameId}`,
      dateKey: sb.dateKey,
      // si.com's scoreboard does not say who hosted: the pair is named without a host.
      label: `${displayName(a)} vs ${displayName(b)}`,
      sblive: { home: a.score!, away: b.score! },
      aligned: false,
      sbliveUrl: sb.url,
      maxprepsUrl: null,
      // MaxPreps lists no result for this game.
      status: 'scheduled',
      note,
    });
  }
  const unmatched = unmatchedKeys.length;

  const byDate = (a: { dateKey: string; contestId: string }, b: { dateKey: string; contestId: string }) =>
    a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId);
  return {
    games: out,
    unmatched,
    report: {
      sbliveFetchedAt: opts.sbliveFetchedAt,
      compared,
      agreements,
      conflicts: conflicts.sort(byDate),
      sbliveOnlyScored: sbliveOnlyScored.sort(byDate),
      backfilled: [],
    },
  };
}

/**
 * Fold D2's outcome (lib/backfill.ts `applyBackfill`) into a reconcile report: every published si.com
 * value becomes a `backfilled` row; D2's own "not published" rows (with their precise reasons) replace
 * reconcile's row for the same contest; nothing D2 published stays listed as unpublished.
 */
export function withBackfill(
  report: SbliveCrossCheck,
  backfill: { rows: readonly BackfillRow[]; skipped: readonly SbliveOnlyRow[] },
): SbliveCrossCheck {
  const byDate = (a: { dateKey: string; contestId: string }, b: { dateKey: string; contestId: string }) =>
    a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId);
  const published = new Set(backfill.rows.map((r) => r.contestId));
  // A si.com game D2 published or explained is never listed a second time under its own sblive: id.
  const handledUrls = new Set<string>([
    ...backfill.rows.map((r) => r.sbliveUrl),
    ...backfill.skipped.flatMap((r) => (r.sbliveUrl ? [r.sbliveUrl] : [])),
  ]);
  const only = new Map<string, SbliveOnlyRow>();
  for (const r of report.sbliveOnlyScored) {
    if (r.contestId.startsWith('sblive:') && r.sbliveUrl && handledUrls.has(r.sbliveUrl)) continue;
    only.set(r.contestId, r);
  }
  for (const r of backfill.skipped) only.set(r.contestId, r);
  return {
    ...report,
    conflicts: report.conflicts.filter((r) => !published.has(r.contestId)),
    sbliveOnlyScored: [...only.values()].filter((r) => !published.has(r.contestId)).sort(byDate),
    backfilled: [...backfill.rows].sort(byDate),
  };
}

/** An empty report, for a run where the si.com step read nothing. */
export function emptyCrossCheck(sbliveFetchedAt: string): SbliveCrossCheck {
  return { sbliveFetchedAt, compared: 0, agreements: 0, conflicts: [], sbliveOnlyScored: [], backfilled: [] };
}

/**
 * A previous run's report carried into a run that read no si.com data (every request failed, `--no-sblive`,
 * nothing read, or the si.com step threw). Only rows that are still true of THIS run's games survive, so the
 * published report never contradicts the scores beside it:
 *  - a conflict row stays while its game exists, is not a si.com value, and still shows exactly the MaxPreps
 *    score the row reports (a MaxPreps correction or deletion since retires it);
 *  - a si.com-only row keyed on a MaxPreps contest stays while that contest exists in the same status and is
 *    not a si.com value; one keyed `sblive:<id>` stays while that id has not become a published game;
 *  - `backfilled` is this run's (carried) fills, and nothing published is listed as unpublished.
 * `compared` and `agreements` are kept, so `compared >= agreements + conflicts` still holds.
 */
export function carryCrossCheck(
  prior: SbliveCrossCheck,
  games: readonly Game[],
  backfilled: readonly BackfillRow[],
): SbliveCrossCheck {
  const byId = new Map(games.map((g) => [g.contestId, g]));
  const published = new Set(backfilled.map((r) => r.contestId));
  const publishedUrls = new Set(backfilled.map((r) => r.sbliveUrl));
  const byDate = (a: { dateKey: string; contestId: string }, b: { dateKey: string; contestId: string }) =>
    a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId);
  const conflicts = prior.conflicts.filter((r) => {
    const g = byId.get(r.contestId);
    return (
      g !== undefined &&
      !published.has(r.contestId) &&
      g.provenance.scores !== 'sblive' &&
      g.home.score === r.maxpreps.home &&
      g.away.score === r.maxpreps.away
    );
  });
  const sbliveOnlyScored = prior.sbliveOnlyScored.filter((r) => {
    if (published.has(r.contestId)) return false;
    if (r.contestId.startsWith('sblive:')) {
      return !byId.has(r.contestId) && !(r.sbliveUrl !== null && publishedUrls.has(r.sbliveUrl));
    }
    const g = byId.get(r.contestId);
    return g !== undefined && g.provenance.scores !== 'sblive' && g.status === r.status;
  });
  return {
    sbliveFetchedAt: prior.sbliveFetchedAt,
    compared: prior.compared,
    agreements: prior.agreements,
    conflicts: [...conflicts].sort(byDate),
    sbliveOnlyScored: [...sbliveOnlyScored].sort(byDate),
    backfilled: [...backfilled].sort(byDate),
  };
}
