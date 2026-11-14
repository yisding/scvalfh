/**
 * The recorded result of a final (lib/types.ts GameResult): the one place a game's winner, ending and certainty
 * are decided, from everything the game carries. Pure: no I/O, no clock, no bundled data.
 *
 * `finalizeResults` is the pipeline's last word on every game before the standings count it, and the snapshot
 * loader runs the same function over a stored file (lib/snapshot/snapshot-migrate.ts), so a rule added here
 * reaches the committed data without a refetch. In order, per game:
 *
 *  1. `applyResultCorrection`: a result recorded from a better source (DataQualityConfig.resultCorrections)
 *     replaces the feed's: goals in play, overtime periods, the shootout tally, with MaxPreps' version kept.
 *  2. `withCifssScore`, `withBoxScore`: the evidence onto the game: cifsshome.org's differing score (the
 *     cross-check's conflict row) and the two teams' box scores where they bear on the record.
 *  3. `adjudicateScore`: where two sources agree on another score and nothing defends MaxPreps', that score is
 *     published. `withBoxOvertime`: overtime a goalkeeper's minutes show and MaxPreps does not count.
 *  4. `settleLevelFinal` (lib/postseason/level-final.ts): level with the winner marked, in a game that must have
 *     one, is the marked side's win.
 *  5. `unfoldShootout`: a second source's score that is the level score with a tally added becomes the tally.
 *  6. `resolveResult`: the GameResult, stored as `game.result`.
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

import { classifyGames } from '../classify';
import { SPORT_OVERTIME_IS_SUDDEN_VICTORY, byDateThenId, datesAtLocal, localDateKey, numberWord, sideOutcome } from '../format';
import { officialContestId } from '../game-id';
import { DATA_QUALITY } from '../league-config/data-quality';
import type { DataQualityConfig } from '../league-config/shape';
import { isLevelWithWinner, settleLevelFinal } from '../postseason/level-final';
import { SPORT } from '../sports/current';
import { withRoundSite } from '../postseason/round-site';
import { getTeamBySlug } from '../teams';
import type { AddedGame, CifssConflictRow, Decider, Game, GameResult, GameSide, Outcome, Team } from '../types';
import { boxGoals, boxOvertimeMinutes, withBoxScore, type BoxEvidence } from './box-evidence';
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
 * The correction for this contest, applied to a final, or to a game listed with no score, between the two teams it
 * names; the same object otherwise (no correction, another status, already applied, or the slugs are not this game's sides, which
 * `correctionProblems` reports). The published score becomes the goals in play, the flags follow the winner
 * (the tally's, else the goals'), and `provenance.resultCorrection` keeps what MaxPreps had.
 */
export function applyResultCorrection(
  game: Game,
  corrections: DataQualityConfig['resultCorrections'] = DATA_QUALITY.resultCorrections,
): Game {
  const c = corrections[game.contestId];
  if (!c || game.provenance.resultCorrection) return game;
  const scored = game.status === 'final' && game.home.score !== null && game.away.score !== null;
  // A game MaxPreps lists with no score is scored by its correction; any other state is not a result to correct.
  if (!scored && game.status !== 'score-pending') return game;
  const { slug: h } = game.home;
  const { slug: a } = game.away;
  if (!h || !a || !(h in c.goals) || !(a in c.goals)) return game;
  const goals = { home: c.goals[h], away: c.goals[a] };
  const shootout = c.shootout ? { home: c.shootout[h], away: c.shootout[a] } : null;
  // The tally's winner; else the named winner of a tiebreak after a level score; else the goals'.
  const named = !shootout && goals.home === goals.away && c.shootoutWinner ? (c.shootoutWinner === h ? 1 : c.shootoutWinner === a ? -1 : 0) : 0;
  const lead = shootout ? shootout.home - shootout.away : named !== 0 ? named : goals.home - goals.away;
  const { resultConflict: _flags, ...provenance } = game.provenance;
  void _flags;
  return {
    ...game,
    home: { ...game.home, score: goals.home, result: lead > 0 ? 'W' : lead < 0 ? 'L' : 'T' },
    away: { ...game.away, score: goals.away, result: lead < 0 ? 'W' : lead > 0 ? 'L' : 'T' },
    status: 'final',
    otPeriods: c.otPeriods,
    isOt: c.otPeriods > 0,
    isForfeit: false,
    forfeitBy: null,
    decider: shootout || named !== 0 ? 'SO' : overtimeDecider(c.otPeriods),
    shootout,
    provenance: {
      ...provenance,
      resultCorrection: {
        maxpreps: scored ? { home: game.home.score as number, away: game.away.score as number, otPeriods: game.otPeriods } : null,
        source: c.source,
        url: c.url,
        ...(c.certainty ? { certainty: c.certainty } : {}),
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

const outcomeOf = (own: number, other: number): Outcome => (own > other ? 'W' : own < other ? 'L' : 'T');

/** The game as MaxPreps had it, where `adjudicateScore` published another score; the same object otherwise. */
function unadjudicated(game: Game): Game {
  const was = game.provenance.adjudicated;
  if (!was) return game;
  const { adjudicated: _gone, ...provenance } = game.provenance;
  void _gone;
  return {
    ...game,
    home: { ...game.home, score: was.maxpreps.home, result: was.maxpreps.homeResult },
    away: { ...game.away, score: was.maxpreps.away, result: was.maxpreps.awayResult },
    provenance,
  };
}

/**
 * The score the sources agree on, when it is not MaxPreps'. Every source this site reads is wrong now and then,
 * so MaxPreps' score is challenged by the others' and the best-supported one is published:
 *
 *  - a challenger is a whole score another source records (si.com's, cifsshome.org's) that differs from MaxPreps';
 *  - it is supported by each such source that records it, and by each box-score number (`boxGoals`) that equals
 *    its figure on a side where it differs from MaxPreps';
 *  - MaxPreps' score is defended by each box-score number that equals ITS figure on such a side;
 *  - the challenger is published when at least two sources support it and none defends MaxPreps';
 *  - with no other source's score at all, the two teams' own box scores are a challenger when they agree with each
 *    other on a side's goals (one team's scorers, the other's goalkeepers) and not with MaxPreps.
 *
 * Mission Hills 1, San Pasqual 0 on MaxPreps (Oct 30): si.com has 2-1 and Mission Hills' own box score totals 2
 * goals, so 2-1 is published. Carmel 4, Santa Catalina 0: si.com has 3-0, Carmel's box score totals 4, so
 * MaxPreps' score stands. One source against one (Salinas 1, Santa Catalina 0; si.com 1-1) changes nothing and
 * is recorded as disputed.
 *
 * Never applied to a level score with the winner marked (the other sources' higher scores are then the shootout,
 * `unfoldShootout`), a forfeit (sources differ on its nominal score), a corrected game, or a game already filled
 * from si.com. `provenance.adjudicated` keeps MaxPreps' score and flags, so the choice is made afresh each time.
 */
export function adjudicateScore(game: Game): Game {
  const base = unadjudicated(game);
  if (base.status !== 'final' || base.home.score === null || base.away.score === null) return base === game ? game : base;
  const p = base.provenance;
  if (base.isForfeit || p.resultCorrection || p.backfill || isLevelWithWinner(base.home, base.away)) return base === game ? game : base;
  const mp = { home: base.home.score, away: base.away.score };
  const others = otherScores(base).filter((o) => o.score.home !== mp.home || o.score.away !== mp.away);
  const box = boxGoals(base);
  let best: { score: Pair; by: string[] } | null = null;
  let tied = false;
  for (const o of others) {
    const x = o.score;
    const by = others.filter((q) => q.score.home === x.home && q.score.away === x.away).map((q) => q.name as string);
    let defended = 0;
    for (const side of ['home', 'away'] as const) {
      if (x[side] === mp[side]) continue;
      const name = base[side].name;
      if (box[side].some((n) => n === x[side])) by.push(`a box score with ${x[side]} for ${name}`);
      defended += box[side].filter((n) => n === mp[side]).length;
    }
    if (by.length < 2 || defended > 0) continue;
    if (best && (best.score.home !== x.home || best.score.away !== x.away)) {
      if (by.length === best.by.length) tied = true;
      if (by.length <= best.by.length) continue;
      tied = false;
    }
    best = { score: x, by };
  }
  // The two teams' own box scores against MaxPreps': one side's scorers and the other side's goalkeepers, entered by
  // different coaches, total the same figure and it is not MaxPreps' (Pleasant Valley 6, Lassen 1 on Sep 16: Pleasant
  // Valley's scorers total 7 and Lassen's goalkeeper conceded 7). Only when no other source offers a score.
  if (!best && others.length === 0) {
    const b = base.provenance.boxScore;
    const agreed = {
      home: b?.home?.goals !== undefined && b.home.goals === b.away?.goalsAgainst ? b.home.goals : mp.home,
      away: b?.away?.goals !== undefined && b.away.goals === b.home?.goalsAgainst ? b.away.goals : mp.away,
    };
    const by: string[] = [];
    for (const side of ['home', 'away'] as const) {
      if (agreed[side] === mp[side]) continue;
      const other = side === 'home' ? 'away' : 'home';
      by.push(`${base[side].name}’s scorers’ total of ${agreed[side]}`, `${base[other].name}’s goalkeepers’ ${agreed[side]} goals against`);
    }
    if (by.length > 0) best = { score: agreed, by };
  }
  if (!best || tied) return base === game ? game : base;
  const adopted: Game = {
    ...base,
    home: { ...base.home, score: best.score.home, result: outcomeOf(best.score.home, best.score.away) },
    away: { ...base.away, score: best.score.away, result: outcomeOf(best.score.away, best.score.home) },
    // A score decided on goals: the decider is the overtime count (a level MaxPreps score may have read otherwise).
    decider: base.decider === 'SO' || base.decider === null ? overtimeDecider(base.otPeriods) : base.decider,
    provenance: {
      ...p,
      adjudicated: { maxpreps: { home: mp.home, away: mp.away, homeResult: base.home.result, awayResult: base.away.result }, by: best.by },
    },
  };
  const was = game.provenance.adjudicated;
  const same =
    was !== undefined && game.home.score === adopted.home.score && game.away.score === adopted.away.score &&
    was.by.join('|') === best.by.join('|') && was.maxpreps.home === mp.home && was.maxpreps.away === mp.away;
  return same ? game : adopted;
}

/**
 * Overtime a box score shows and MaxPreps does not count: a goalkeeper's overtime minutes in a final with 0
 * overtime periods recorded (Los Altos 2, Stevenson 2, Sep 18: 7 minutes, the SCVAL period). One period is
 * recorded, since minutes do not say how many, and `provenance.overtimeEvidence` says where it came from, as
 * `overtimeNote` does for a coach's note. As for a note, a sudden-victory sport believes it only on a level or
 * one-goal score.
 */
export function withBoxOvertime(game: Game): Game {
  if (game.status !== 'final' || game.isForfeit || game.home.score === null || game.away.score === null) return game;
  if (game.provenance.resultCorrection) return game;
  const fromBox = game.provenance.overtimeEvidence === 'box-score';
  const fits = !SPORT_OVERTIME_IS_SUDDEN_VICTORY || Math.abs(game.home.score - game.away.score) <= 1;
  const shows = boxOvertimeMinutes(game) > 0 && fits;
  if (shows && game.otPeriods === 0) {
    return {
      ...game,
      otPeriods: 1,
      isOt: true,
      decider: game.decider === 'REG' ? 'OT' : game.decider,
      provenance: { ...game.provenance, overtimeEvidence: 'box-score' },
    };
  }
  if (!shows && fromBox) {
    // The evidence is gone (the box score changed): back to MaxPreps' count of none.
    const { overtimeEvidence: _gone, ...provenance } = game.provenance;
    void _gone;
    return { ...game, otPeriods: 0, isOt: false, decider: game.decider === 'OT' ? 'REG' : game.decider, provenance };
  }
  return game;
}

/** The game without a tally `unfoldShootout` read into it; the same object when its tally is recorded or absent. */
function withoutReadTally(game: Game): Game {
  if (!game.provenance.shootoutSource) return game;
  const { shootoutSource: _read, ...provenance } = game.provenance;
  void _read;
  return { ...game, shootout: null, provenance };
}

/**
 * Step 4: on an 'SO' final with no tally, a second source's score that is the level score plus a tally (the
 * loser's side also raised: `readExcess` 'tally') becomes `shootout`, and `provenance.shootoutSource` says whose
 * score it was read from. Two sources that give different tallies give none. The published score stays the
 * goals in play.
 */
export function unfoldShootout(stored: Game): Game {
  // A cited correction is the record: no tally is read into it from another listing (Granite Hills 0, Hilltop 0 on
  // Oct 30: si.com's 2-1 there is the previous day's score copied across).
  if (stored.provenance.resultCorrection) return stored;
  // A tally this step read on an earlier pass (`shootoutSource` marks it) is read again from today's evidence, so
  // a source that changed its score, or dropped it, changes or drops the tally. A recorded tally is left alone.
  const game = withoutReadTally(stored);
  if (game.status !== 'final' || game.decider !== 'SO' || game.shootout !== null || game.home.score === null) return game;
  const winner = markedWinner(game);
  if (!winner) return game;
  const tallies = otherScores(game)
    .map((o) => ({ o, extra: excessOver(game.home.score as number, o.score, winner) }))
    .filter((t): t is { o: OtherScore; extra: Pair } => readExcess(t.extra) === 'tally');
  if (tallies.length === 0) return game;
  const [first] = tallies;
  if (tallies.some((t) => t.extra.home !== first.extra.home || t.extra.away !== first.extra.away)) return game;
  const was = stored.provenance.shootoutSource;
  const same =
    was !== undefined && stored.shootout !== null &&
    stored.shootout.home === first.extra.home && stored.shootout.away === first.extra.away &&
    was.source === first.o.source && was.score.home === first.o.score.home && was.score.away === first.o.score.away;
  if (same) return stored;
  return {
    ...game,
    shootout: first.extra,
    provenance: { ...game.provenance, shootoutSource: { source: first.o.source, score: first.o.score } },
  };
}

const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

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
          basis: `another source, ${dissent.name}, records ${game.home.name} ${dissent.score.home}, ${game.away.name} ${dissent.score.away}: a different outcome, with nothing else to settle it, so MaxPreps’ score stands`,
        }
      : null;

  if ((game.isForfeit || game.decider === 'FORFEIT') && !p.resultCorrection) {
    return { winner, ending: 'forfeit', certainty: 'reported', basis: 'MaxPreps records a forfeit' };
  }

  if (p.resultCorrection) {
    const ending = game.isForfeit ? 'forfeit' : game.shootout || game.decider === 'SO' ? 'shootout' : game.otPeriods > 0 ? 'overtime' : 'regulation';
    return { winner, ending, certainty: p.resultCorrection.certainty ?? 'confirmed', basis: p.resultCorrection.source };
  }

  if (p.adjudicated) {
    const was = p.adjudicated.maxpreps;
    return {
      winner,
      ending: game.otPeriods > 0 ? 'overtime' : 'regulation',
      certainty: 'inferred',
      basis: `${numberWord(p.adjudicated.by.length)} sources agree on ${game.home.name} ${game.home.score}, ${game.away.name} ${game.away.score} (${listOf(p.adjudicated.by)}); MaxPreps lists ${game.home.name} ${was.home}, ${game.away.name} ${was.away}, and nothing else supports that`,
    };
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
    // Both teams' box scores total the level score: the game WAS level in play, so the marked win came after it,
    // and the sport has one way to break a level score.
    const box = boxGoals(game);
    if (SPORT.scoring.tiebreak && box.home.length > 0 && box.away.length > 0 && [...box.home, ...box.away].every((n) => n === level)) {
      return {
        winner,
        ending: 'shootout',
        certainty: 'inferred',
        basis: `MaxPreps lists ${level}-${level} and marks ${winnerName} the winner, and both teams’ box scores have ${level} ${level === 1 ? SPORT.scoring.unit : SPORT.scoring.units} each, so the game was level in play and was settled after it; no source gives the tally`,
      };
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
  if (dissent && !p.backfill && !p.resultConflict) {
    // One source against MaxPreps: a box score that has MaxPreps' figure where they differ settles it for MaxPreps.
    const box = boxGoals(game);
    const backed = (['home', 'away'] as const).some(
      (side) => dissent.score[side] !== game[side].score && box[side].some((n) => n === game[side].score),
    );
    if (backed) {
      return {
        winner,
        ending,
        certainty: 'confirmed',
        basis: `a box score agrees with MaxPreps’ ${game.home.name} ${game.home.score}, ${game.away.name} ${game.away.score}; another source, ${dissent.name}, records ${dissent.score.home}-${dissent.score.away}`,
      };
    }
  }
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
  /** The box scores of the season (lib/results/box-evidence.ts); undefined leaves each game's box evidence as stored. */
  box?: BoxEvidence;
}

/** Steps 1 to 5 on one game: the same object when nothing changes. */
export function finalizeResult(
  game: Game,
  opts: { cifss?: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>; corrections?: DataQualityConfig['resultCorrections']; box?: BoxEvidence } = {},
): Game {
  // The correction first: a corrected game is settled by its citation and carries no box evidence.
  const evidenced = withBoxScore(withCifssScore(applyResultCorrection(game, opts.corrections), opts.cifss), opts.box);
  const scored = withBoxOvertime(adjudicateScore(evidenced));
  const read = withRoundSite(unfoldShootout(settleLevelFinal(scored)));
  const result = resolveResult(read);
  if (sameResult(read.result, result)) return read;
  if (result === null) {
    const { result: _gone, ...rest } = read;
    void _gone;
    return rest;
  }
  return { ...read, result };
}

/**
 * The game an AddedGame lists (DataQualityConfig.addedGames): contest id `official:<date>-<away>-at-<home>`, the
 * source's date, start, host and result, classified like any other game (lib/classify.ts), with the citation in
 * `provenance.resultCorrection` so the game page prints it. null when a school is outside the registry.
 */
export function addedGame(a: AddedGame, fetchedAt: string): Game | null {
  const home = getTeamBySlug(a.home);
  const away = getTeamBySlug(a.away);
  if (!home || !away) return null;
  const scored = a.goals !== null && a.home in a.goals && a.away in a.goals;
  const h = scored ? (a.goals as Record<string, number>)[a.home] : null;
  const w = scored ? (a.goals as Record<string, number>)[a.away] : null;
  const forfeit = a.forfeitBy !== null;
  // With no score, the side the source says won is marked W and the other L: the bracket reads who advanced,
  // while no record counts a game that has no score.
  const side = (team: Team, own: number | null, other: number | null): GameSide => ({
    teamId: team.id, slug: team.slug, name: team.name, score: own,
    result: own !== null && other !== null ? outcomeOf(own, other) : a.winner ? (a.winner === team.slug ? 'W' : 'L') : null,
  });
  const base: Game = {
    contestId: officialContestId(a.dateKey, away.slug, home.slug),
    ...datesAtLocal(a.dateKey, a.time),
    isDateTba: false,
    home: side(home, h, w),
    away: side(away, w, h),
    site: a.neutral ? 'neutral' : 'home',
    // Unscored: still to play before its day, played with no score published after it. Never 0-0.
    status: scored ? 'final' : a.dateKey < localDateKey(fetchedAt) ? 'score-pending' : 'scheduled',
    isLeague: home.division === away.division,
    leagueDivision: home.division === away.division ? home.division : null,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: scored ? a.otPeriods : 0,
    isOt: scored && a.otPeriods > 0,
    isForfeit: scored && forfeit,
    forfeitBy: scored && forfeit ? (a.forfeitBy === a.home ? 'home' : 'away') : null,
    decider: !scored ? null : forfeit ? 'FORFEIT' : overtimeDecider(a.otPeriods),
    shootout: null,
    venue: { text: a.note ?? null, ...(a.venue ? { name: a.venue } : {}) },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: {
      scores: a.from,
      schedule: a.from,
      fetchedAt,
      ...(scored ? { resultCorrection: { maxpreps: null, source: a.source, url: a.url, ...(a.certainty ? { certainty: a.certainty } : {}) } } : {}),
    },
  };
  return classifyGames([base])[0];
}

/**
 * `games` with every configured added game no feed lists: one is left out while a feed game of the same two
 * schools on the same date exists (the feed has it after all) or its id is already there, and none is added to a
 * file stamped before its day or without both schools' games. The same array when nothing is added.
 */
export function withAddedGames(
  games: readonly Game[],
  fetchedAt: string,
  added: DataQualityConfig['addedGames'] = DATA_QUALITY.addedGames,
): Game[] {
  const ids = new Set(games.map((g) => g.contestId));
  const pairOn = new Set(games.map((g) => `${g.dateKey}|${[g.home.slug, g.away.slug].sort().join('~')}`));
  const more: Game[] = [];
  // Only into a file that could hold the game: one stamped on or after its day (an earlier capture never saw it)
  // whose games include both schools (a run restricted to other leagues carries neither's schedule).
  const today = localDateKey(fetchedAt);
  const slugs = new Set(games.flatMap((g) => [g.home.slug, g.away.slug]));
  for (const a of added) {
    if (a.dateKey > today || !slugs.has(a.home) || !slugs.has(a.away)) continue;
    const g = addedGame(a, fetchedAt);
    if (!g || ids.has(g.contestId) || pairOn.has(`${a.dateKey}|${[a.home, a.away].sort().join('~')}`)) continue;
    ids.add(g.contestId);
    more.push(g);
  }
  return more.length > 0 ? [...games, ...more].sort(byDateThenId) : (games as Game[]);
}

/** `finalizeResult` over a list: the same array when no game changes. */
export function finalizeResults(games: readonly Game[], opts: FinalizeOptions = {}): Game[] {
  const cifss = new Map((opts.cifssConflicts ?? []).map((r) => [r.contestId, r]));
  const out = games.map((g) => finalizeResult(g, { cifss: cifss.get(g.contestId), corrections: opts.corrections, box: opts.box }));
  return out.some((g, i) => g !== games[i]) ? out : (games as Game[]);
}
