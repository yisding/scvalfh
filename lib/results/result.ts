/**
 * The recorded result of a final (lib/types.ts GameResult): the one place a game's winner, ending and certainty
 * are decided, from everything the game carries. Pure: no I/O, no clock, no bundled data.
 *
 * `finalizeResults` is the pipeline's last word on every game before the standings count it, and the snapshot
 * loader runs the same function over a stored file (lib/snapshot/snapshot-migrate.ts), so a rule added here
 * reaches the committed data without a refetch. In order, per game:
 *
 *  1. `withCifssScore`: cifsshome.org's differing score, from the cross-check's conflict row, onto the game.
 *  2. `applyResultCorrection`: a result recorded from a better source (DataQualityConfig.resultCorrections)
 *     replaces the feed's: goals in play, overtime periods, the shootout tally, with MaxPreps' version kept.
 *  3. `settleLevelFinal` (lib/postseason/level-final.ts): level with the winner marked, in a game that must have
 *     one, is the marked side's win.
 *  4. `unfoldShootout`: a second source's score that is the level score with a tally added becomes the tally.
 *  5. `resolveResult`: the GameResult, stored as `game.result`.
 *
 * How sources record a game settled after a level score, as read in 2026 (docs/LEAGUE-RULES.md, "How a game's
 * result is read"):
 *  - MaxPreps: the level score with W and L (Escondido 0, El Capitan 0), or the shootout tally as the score of
 *    a regulation game (Tamalpais 3, Marin Catholic 1 was 0-0);
 *  - si.com and cifsshome.org: the level score plus one goal for the winner, as the San Diego officials'
 *    procedure credits it (Escondido 1-0), or plus the whole tally (Vista 3, Escondido 2 where MaxPreps has
 *    0-0; Mission Vista 4, Westview 3 where MaxPreps has 1-1);
 *  - the San Diego Section's bracket sheet: "1-1 (2-1 SO)".
 * So a second source's score that is the published level score plus (a, b), with the marked winner ahead, says
 * the game was settled after it: (1, 0) is the credited goal and confirms the shootout without a tally; b >= 1
 * is a tally a-b; (a >= 2, 0) may be a tally or another score altogether and is recorded as a difference only.
 */

import { sideOutcome } from '../format';
import { DATA_QUALITY } from '../league-config/data-quality';
import type { DataQualityConfig } from '../league-config/shape';
import { isLevelWithWinner, settleLevelFinal } from '../postseason/level-final';
import type { CifssConflictRow, Decider, Game, GameResult } from '../types';
import { shootoutRuleSectionOf } from './section-rule';

type Pair = { home: number; away: number };

/** Another source's score for the game, where the game carries one that differs from the published score. */
export interface OtherScore {
  source: 'sblive' | 'cifss';
  name: 'si.com' | 'cifsshome.org';
  score: Pair;
}

/** si.com's differing score (D2 rule 5 keeps it on the game) and cifsshome.org's, in that order. */
export function otherScores(game: Pick<Game, 'provenance'>): OtherScore[] {
  const out: OtherScore[] = [];
  const p = game.provenance;
  // On a backfilled game `scoreConflict.sblive` holds MaxPreps' overridden value, not si.com's.
  if (p.scoreConflict && !p.backfill) out.push({ source: 'sblive', name: 'si.com', score: p.scoreConflict.sblive });
  if (p.cifssScore) out.push({ source: 'cifss', name: 'cifsshome.org', score: { home: p.cifssScore.home, away: p.cifssScore.away } });
  return out;
}

/** The marked winner of a level score flagged W and L, else null. */
function markedWinner(game: Pick<Game, 'home' | 'away'>): 'home' | 'away' | null {
  if (!isLevelWithWinner(game.home, game.away)) return null;
  return game.home.result === 'W' ? 'home' : 'away';
}

/**
 * What `other` adds to a level score of `level` goals each, when it is that score with goals added and `winner`
 * ahead: { home, away } >= 0 and unequal; null when `other` is anything else (lower on a side, level, or the
 * other team ahead).
 */
export function excessOver(level: number, other: Pair, winner: 'home' | 'away'): Pair | null {
  const extra = { home: other.home - level, away: other.away - level };
  if (extra.home < 0 || extra.away < 0 || extra.home === extra.away) return null;
  return (extra.home > extra.away ? 'home' : 'away') === winner ? extra : null;
}

/** How a second source's score reads against a level score with a marked winner (the module comment's three cases). */
export function readExcess(extra: Pair | null): 'credited-goal' | 'tally' | 'unclear' | null {
  if (!extra) return null;
  const [more, less] = extra.home > extra.away ? [extra.home, extra.away] : [extra.away, extra.home];
  if (less >= 1) return 'tally';
  return more === 1 ? 'credited-goal' : 'unclear';
}

/** Step 1: the cifss conflict row's score onto its game (or off it, when the row is gone). */
export function withCifssScore(game: Game, row: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'> | undefined): Game {
  const have = game.provenance.cifssScore;
  if (!row) {
    if (!have) return game;
    const { cifssScore: _gone, ...provenance } = game.provenance;
    void _gone;
    return { ...game, provenance };
  }
  if (have && have.home === row.cifss.home && have.away === row.cifss.away && have.url === row.cifssUrl) return game;
  return { ...game, provenance: { ...game.provenance, cifssScore: { home: row.cifss.home, away: row.cifss.away, url: row.cifssUrl } } };
}

function overtimeDecider(otPeriods: number): Decider {
  return otPeriods >= 2 ? '2OT' : otPeriods === 1 ? 'OT' : 'REG';
}

/**
 * Step 2: the correction for this contest, applied to a final between the two teams it names; the same object
 * otherwise (no correction, not final, already applied, or the slugs are not this game's sides, which
 * `correctionProblems` reports). The published score becomes the goals in play, the flags follow the winner
 * (the tally's, else the goals'), and `provenance.resultCorrection` keeps what MaxPreps had.
 */
export function applyResultCorrection(
  game: Game,
  corrections: DataQualityConfig['resultCorrections'] = DATA_QUALITY.resultCorrections,
): Game {
  const c = corrections[game.contestId];
  if (!c || game.status !== 'final' || game.home.score === null || game.away.score === null) return game;
  if (game.provenance.resultCorrection) return game;
  const { slug: h } = game.home;
  const { slug: a } = game.away;
  if (!h || !a || !(h in c.goals) || !(a in c.goals)) return game;
  const goals = { home: c.goals[h], away: c.goals[a] };
  const shootout = c.shootout ? { home: c.shootout[h], away: c.shootout[a] } : null;
  const lead = shootout ? shootout.home - shootout.away : goals.home - goals.away;
  const { resultConflict: _flags, ...provenance } = game.provenance;
  void _flags;
  return {
    ...game,
    home: { ...game.home, score: goals.home, result: lead > 0 ? 'W' : lead < 0 ? 'L' : 'T' },
    away: { ...game.away, score: goals.away, result: lead < 0 ? 'W' : lead > 0 ? 'L' : 'T' },
    otPeriods: c.otPeriods,
    isOt: c.otPeriods > 0,
    isForfeit: false,
    forfeitBy: null,
    decider: shootout ? 'SO' : overtimeDecider(c.otPeriods),
    shootout,
    provenance: {
      ...provenance,
      resultCorrection: {
        maxpreps: { home: game.home.score, away: game.away.score, otPeriods: game.otPeriods },
        source: c.source,
        url: c.url,
      },
    },
  };
}

/** Corrections that name a contest among `games` but not its two sides: one line each, for the run log and a test. */
export function correctionProblems(
  games: readonly Game[],
  corrections: DataQualityConfig['resultCorrections'] = DATA_QUALITY.resultCorrections,
): string[] {
  const out: string[] = [];
  for (const g of games) {
    const c = corrections[g.contestId];
    if (!c) continue;
    if (!g.home.slug || !g.away.slug || !(g.home.slug in c.goals) || !(g.away.slug in c.goals)) {
      out.push(`resultCorrections ${g.contestId}: names ${Object.keys(c.goals).join(' and ')}, but the contest is ${g.away.name} at ${g.home.name}`);
    }
  }
  return out;
}

/**
 * Step 4: on an 'SO' final with no tally, a second source's score that is the level score plus a tally (the
 * loser's side also raised: `readExcess` 'tally') becomes `shootout`, and `provenance.shootoutSource` says whose
 * score it was read from. Two sources that give different tallies give none. The published score stays the
 * goals in play.
 */
export function unfoldShootout(game: Game): Game {
  if (game.status !== 'final' || game.decider !== 'SO' || game.shootout !== null || game.home.score === null) return game;
  const winner = markedWinner(game);
  if (!winner) return game;
  const tallies = otherScores(game)
    .map((o) => ({ o, extra: excessOver(game.home.score as number, o.score, winner) }))
    .filter((t): t is { o: OtherScore; extra: Pair } => readExcess(t.extra) === 'tally');
  if (tallies.length === 0) return game;
  const [first] = tallies;
  if (tallies.some((t) => t.extra.home !== first.extra.home || t.extra.away !== first.extra.away)) return game;
  return {
    ...game,
    shootout: first.extra,
    provenance: { ...game.provenance, shootoutSource: { source: first.o.source, score: first.o.score } },
  };
}

const pairText = (p: Pair, winner: 'home' | 'away' | null): string =>
  winner === 'away' ? `${p.away}-${p.home}` : `${p.home}-${p.away}`;

/**
 * Step 5: the recorded result of a final with both scores; null for any other game. Reads only the game (its
 * score, flags, decider, tally and provenance) and the section rule that reaches it.
 */
export function resolveResult(game: Game): GameResult | null {
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) return null;
  const outcome = sideOutcome(game, 'home');
  const winner: GameResult['winner'] = outcome === 'W' ? 'home' : outcome === 'L' ? 'away' : null;
  const p = game.provenance;
  const others = otherScores(game);
  const winnerName = winner ? game[winner].name : null;
  /** Another source that gives the win to the other side, or a win where this is a tie, or a tie where this is a win. */
  const dissent = others.find((o) => {
    const theirs = o.score.home > o.score.away ? 'home' : o.score.home < o.score.away ? 'away' : null;
    // A level second score says nothing against a win settled after a level score.
    return theirs !== winner && !(theirs === null && game.decider === 'SO');
  });
  const disputed = (ending: GameResult['ending']): GameResult | null =>
    dissent
      ? {
          winner,
          ending,
          certainty: 'disputed',
          basis: `${dissent.name} records ${game.home.name} ${dissent.score.home}, ${game.away.name} ${dissent.score.away}, a different outcome; the published score stands`,
        }
      : null;

  if (game.isForfeit || game.decider === 'FORFEIT') {
    return { winner, ending: 'forfeit', certainty: 'reported', basis: 'MaxPreps records a forfeit' };
  }

  if (p.resultCorrection) {
    const ending = game.shootout ? 'shootout' : game.otPeriods > 0 ? 'overtime' : 'regulation';
    return { winner, ending, certainty: 'confirmed', basis: p.resultCorrection.source };
  }

  if (game.decider === 'SO') {
    const level = game.home.score;
    if (game.shootout) {
      if (p.shootoutSource) {
        const from = p.shootoutSource.source === 'sblive' ? 'si.com' : 'cifsshome.org';
        return {
          winner,
          ending: 'shootout',
          certainty: 'inferred',
          basis: `MaxPreps lists ${level}-${level} and marks ${winnerName} the winner; ${from} records ${pairText(p.shootoutSource.score, winner)}, the level score with the tally added`,
        };
      }
      return {
        winner,
        ending: 'shootout',
        certainty: 'confirmed',
        basis: p.scores === 'cifsds-sheet' || p.sectionSheet ? 'the San Diego Section’s bracket sheet gives the tally' : 'a tally is recorded',
      };
    }
    if (p.scores === 'cifsds-sheet') {
      return { winner, ending: 'shootout', certainty: 'confirmed', basis: 'the San Diego Section’s bracket sheet marks a shootout and gives no tally' };
    }
    const credited = winner
      ? others.filter((o) => readExcess(excessOver(level, o.score, winner)) === 'credited-goal')
      : [];
    if (credited.length > 0) {
      const names = credited.map((o) => o.name).join(' and ');
      return {
        winner,
        ending: 'shootout',
        certainty: 'confirmed',
        basis: `MaxPreps lists ${level}-${level} and marks ${winnerName} the winner; ${names} ${credited.length === 1 ? 'records' : 'record'} ${level + 1}-${level}, the level score with the one goal a shootout winner is credited`,
      };
    }
    const contested = disputed('unstated');
    if (contested) return contested;
    const section = shootoutRuleSectionOf(game);
    if (section?.shootout?.inference === 'verified') {
      return { winner, ending: 'shootout', certainty: 'inferred', basis: `MaxPreps marks the winner of a level score, and ${section.shootout.citation}` };
    }
    const unclear = winner ? others.find((o) => readExcess(excessOver(level, o.score, winner)) === 'unclear') : undefined;
    return {
      winner,
      ending: 'unstated',
      certainty: 'reported',
      basis: unclear
        ? `MaxPreps lists ${level}-${level} and marks ${winnerName} the winner; ${unclear.name} records ${pairText(unclear.score, winner)}, which may be a tally or another score`
        : `MaxPreps lists ${level}-${level} and marks ${winnerName} the winner, and no source says how the level score was broken`,
    };
  }

  const ending = game.otPeriods > 0 ? 'overtime' : 'regulation';
  if (p.backfill) return { winner, ending, certainty: 'reported', basis: 'the score is si.com’s' };
  if (p.resultConflict) return { winner, ending, certainty: 'disputed', basis: 'MaxPreps’ own result flags contradict its score, or its two team feeds disagree; the published score stands' };
  return disputed(ending) ?? { winner, ending, certainty: 'reported' };
}

function sameResult(a: GameResult | undefined, b: GameResult | null): boolean {
  if (!a || !b) return !a && !b;
  return a.winner === b.winner && a.ending === b.ending && a.certainty === b.certainty && a.basis === b.basis;
}

export interface FinalizeOptions {
  /** The cifss cross-check's conflict rows of the run (or of the stored file). */
  cifssConflicts?: readonly Pick<CifssConflictRow, 'contestId' | 'cifss' | 'cifssUrl'>[];
  corrections?: DataQualityConfig['resultCorrections'];
}

/** Steps 1 to 5 on one game: the same object when nothing changes. */
export function finalizeResult(game: Game, opts: { cifss?: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>; corrections?: DataQualityConfig['resultCorrections'] } = {}): Game {
  const read = unfoldShootout(settleLevelFinal(applyResultCorrection(withCifssScore(game, opts.cifss), opts.corrections)));
  const result = resolveResult(read);
  if (sameResult(read.result, result)) return read;
  if (result === null) {
    const { result: _gone, ...rest } = read;
    void _gone;
    return rest;
  }
  return { ...read, result };
}

/** `finalizeResult` over a list: the same array when no game changes. */
export function finalizeResults(games: readonly Game[], opts: FinalizeOptions = {}): Game[] {
  const cifss = new Map((opts.cifssConflicts ?? []).map((r) => [r.contestId, r]));
  const out = games.map((g) => finalizeResult(g, { cifss: cifss.get(g.contestId), corrections: opts.corrections }));
  return out.some((g, i) => g !== games[i]) ? out : (games as Game[]);
}
