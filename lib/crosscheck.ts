/**
 * MaxPreps ↔ SBLive score reconciliation (SPEC §5.7).
 *
 * The rule, in full: **prefer MaxPreps, flag disagreements, never average, never silently
 * overwrite, never backfill.** SBLive is a second manual-entry pipeline, not a more authoritative
 * one — so a value that exists only on SBLive is published as a disagreement, not as a score.
 *
 * The join is `(local date, {teamA, teamB} as an UNORDERED pair)`, because the statewide SBLive
 * scoreboard exposes neither home/away nor team ids — only two names and two score strings. Team
 * identity therefore goes through `lib/teams`' alias table (and, where SBLive exposes a numeric id,
 * through `Team.external.sbliveTeamId`).
 *
 * Nothing here mutates its input: `reconcile()` returns a new `Game[]`.
 */

import { sblivePairKey, type SbliveGame, type SbliveSide } from './sources/sblive';
import type { Game, SbliveCrossCheck, ScoreConflictRow, SbliveOnlyRow } from './types';

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
  /** ISO UTC stamp for the run that fetched the SBLive rows. */
  sbliveFetchedAt: string;
}

export interface ReconcileResult {
  games: Game[];
  report: SbliveCrossCheck;
  /** SBLive rows that matched no MaxPreps contest at all — log only, not published as data. */
  unmatched: number;
}

/**
 * Line up an SBLive pair with a MaxPreps game's home/away slots by identity. Returns null when the
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
    // The JOIN, not the comparison: an SBLive row can match on date and teams and still carry no
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

    // --- MaxPreps has no score: record, do NOT backfill (SPEC §5.7 bullet 3).
    if (ourHome === null || ourAway === null) {
      const note =
        `SBLive reports ${match.sides[0].name} ${match.sides[0].score}` +
        `, ${match.sides[1].name} ${match.sides[1].score}` +
        '; MaxPreps has not published a score. We show MaxPreps, so this game stays unreported.';
      sbliveOnlyScored.push({
        contestId: game.contestId,
        dateKey: game.dateKey,
        label: `${game.away.name} at ${game.home.name}`,
        sblive: { home: sbHome, away: sbAway },
        aligned: aligned !== null,
        sbliveUrl: match.url,
        maxprepsUrl: game.urls.maxpreps,
        status: game.status,
        note,
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
      ` (${game.away.name}–${game.home.name}); SBLive reports ${scorePair(sbAway, sbHome)}.` +
      ' MaxPreps is never overwritten.';
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

  const unmatched = [...bySbliveKey.keys()].filter((k) => !matchedKeys.has(k)).length;

  const byDate = (a: { dateKey: string }, b: { dateKey: string }) => a.dateKey.localeCompare(b.dateKey);
  return {
    games: out,
    unmatched,
    report: {
      sbliveFetchedAt: opts.sbliveFetchedAt,
      compared,
      agreements,
      conflicts: conflicts.sort(byDate),
      sbliveOnlyScored: sbliveOnlyScored.sort(byDate),
    },
  };
}

/** An empty report, for a run where the SBLive step was skipped or failed. */
export function emptyCrossCheck(sbliveFetchedAt: string): SbliveCrossCheck {
  return { sbliveFetchedAt, compared: 0, agreements: 0, conflicts: [], sbliveOnlyScored: [] };
}
