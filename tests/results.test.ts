/**
 * The recorded result of a final (lib/results/result.ts): every way a game ends, and what each second source's
 * score does to the record. The scenes are 2026 games, with the scores the sources carried on 2026-11-13.
 */

import { describe, expect, it } from 'vitest';

import { describeGame, resultSentence, tiebreakRuleOf } from '../components/ui/describe-game';
import { sideOutcome } from '../lib/format';
import {
  applyResultCorrection, correctionProblems, excessOver, finalizeResult, finalizeResults, readExcess, resolveResult, unfoldShootout,
} from '../lib/results/result';
import { DATA_QUALITY } from '../lib/league-config/data-quality';
import type { DataQualityConfig } from '../lib/league-config/shape';
import { loadSnapshot } from '../lib/snapshot/snapshot-load';
import { boxEvidenceFrom, type BoxEvidence } from '../lib/results/box-evidence';
import type { BoxSide, Game } from '../lib/types';
import { game } from './game-builder';
import { readFileSync } from 'node:fs';

const CIFSS_URL = 'https://www.cifsshome.org/widget/schedule-score?section_id=3';
const cifss = (home: number, away: number) => ({ cifss: { home, away }, cifssUrl: CIFSS_URL });
const withSblive = (g: Game, home: number, away: number): Game => ({
  ...g,
  provenance: { ...g.provenance, scoreConflict: { sblive: { home, away }, note: 'Sources disagree.' } },
});
const MARKED_HOME = { home: 'W', away: 'L' } as const;

describe('a plain final', () => {
  it('is its score, reported, with no basis to print', () => {
    expect(finalizeResult(game({ home: 'homestead', away: 'cupertino', hs: 3, as: 1 })).result).toEqual({ winner: 'home', ending: 'regulation', certainty: 'reported' });
    expect(finalizeResult(game({ home: 'homestead', away: 'cupertino', hs: 1, as: 2, ot: 1 })).result).toEqual({ winner: 'away', ending: 'overtime', certainty: 'reported' });
    // One sudden-victory period and still level: a tie after overtime.
    expect(finalizeResult(game({ home: 'homestead', away: 'cupertino', hs: 1, as: 1, ot: 1 })).result).toEqual({ winner: null, ending: 'overtime', certainty: 'reported' });
    expect(finalizeResult(game({ home: 'homestead', away: 'cupertino', hs: 0, as: 0 })).result).toEqual({ winner: null, ending: 'regulation', certainty: 'reported' });
  });

  it('is a forfeit when MaxPreps marks one', () => {
    expect(finalizeResult(game({ home: 'homestead', away: 'cupertino', hs: 1, as: 0, forfeit: true })).result).toMatchObject({ winner: 'home', ending: 'forfeit' });
  });

  it('has no result until it is final, and loses a stale one', () => {
    const scheduled = game({ home: 'homestead', away: 'cupertino' });
    expect(resolveResult(scheduled)).toBeNull();
    expect(finalizeResult(scheduled)).toBe(scheduled);
    const stale: Game = { ...scheduled, result: { winner: 'home', ending: 'regulation', certainty: 'reported' } };
    expect(finalizeResult(stale).result).toBeUndefined();
  });

  it('always agrees with sideOutcome, and finalizing twice changes nothing', () => {
    const games = [
      game({ home: 'homestead', away: 'cupertino', hs: 3, as: 1 }),
      game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: MARKED_HOME }),
      game({ home: 'escondido', away: 'el-capitan', hs: 0, as: 0, league: false, results: MARKED_HOME }),
    ];
    const once = finalizeResults(games);
    for (const g of once) {
      const o = sideOutcome(g, 'home');
      expect(g.result?.winner).toBe(o === 'W' ? 'home' : o === 'L' ? 'away' : null);
    }
    expect(finalizeResults(once)).toBe(once);
  });
});

describe('a second source’s score against a level score with the winner marked', () => {
  it('reads what was added to the level score', () => {
    expect(excessOver(0, { home: 1, away: 0 }, 'home')).toEqual({ home: 1, away: 0 });
    expect(readExcess({ home: 1, away: 0 })).toBe('credited-goal');
    expect(readExcess({ home: 3, away: 2 })).toBe('tally');
    expect(readExcess({ home: 0, away: 2 })).toBe('unclear');
    // Lower on a side, level, or the other team ahead: not this game's level score with goals added.
    expect(excessOver(1, { home: 0, away: 2 }, 'away')).toBeNull();
    expect(excessOver(1, { home: 2, away: 2 }, 'home')).toBeNull();
    expect(excessOver(0, { home: 0, away: 1 }, 'home')).toBeNull();
    expect(readExcess(null)).toBeNull();
  });

  // Escondido 0, El Capitan 0 (Sep 1), Escondido marked W: si.com and cifsshome.org both record 1-0.
  it('confirms the shootout when it is the level score plus the one credited goal', () => {
    const base = game({ home: 'escondido', away: 'el-capitan', hs: 0, as: 0, league: false, date: '2026-09-01', results: MARKED_HOME });
    expect(resolveResult(base), 'San Diego, MaxPreps alone: the win is credited, the shootout not asserted').toMatchObject({ ending: 'unstated', certainty: 'reported' });
    const g = finalizeResult(withSblive(base, 1, 0), { cifss: cifss(1, 0) });
    expect(g.shootout, 'a credited goal is not a tally').toBeNull();
    expect(g.result).toEqual({
      winner: 'home',
      ending: 'shootout',
      certainty: 'confirmed',
      basis: 'MaxPreps lists 0-0 and marks Escondido the winner; si.com and cifsshome.org record 1-0, the level score with the one goal a shootout winner is credited',
    });
    // The views now say what the record says: the tag, and "in a shootout".
    expect(tiebreakRuleOf(g).inference).toBe('verified');
    expect(describeGame(g).deciderTag).toBe('SO');
    expect(describeGame(g).sentence).toBe('Escondido 0, El Capitan 0, final; Escondido won in a shootout.');
  });

  // Vista 0, Escondido 0 (Oct 5), Vista marked W: cifsshome.org records Vista 3, Escondido 2.
  it('records the tally when both sides are raised, and keeps the goals in play', () => {
    const base = game({ home: 'vista', away: 'escondido', hs: 0, as: 0, date: '2026-10-05', results: MARKED_HOME });
    const g = finalizeResult(base, { cifss: cifss(3, 2) });
    expect([g.home.score, g.away.score]).toEqual([0, 0]);
    expect(g.shootout).toEqual({ home: 3, away: 2 });
    expect(g.provenance.shootoutSource).toEqual({ source: 'cifss', score: { home: 3, away: 2 } });
    expect(g.result).toMatchObject({ winner: 'home', ending: 'shootout', certainty: 'inferred' });
    expect(describeGame(g).shootoutText).toBe('(3–2 SO)');
    expect(resultSentence(g)).toContain('in a shootout (3–2) after a 0–0 tie');
  });

  // Mt. Carmel 0, Poway 0 (Sep 11), Mt. Carmel marked W: cifsshome.org records 2-0.
  it('records only the difference when the score may be a tally or another score', () => {
    const base = game({ home: 'poway', away: 'mt-carmel', hs: 0, as: 0, league: false, date: '2026-09-11', results: { home: 'L', away: 'W' } });
    const g = finalizeResult(base, { cifss: cifss(0, 2) });
    expect(g.shootout).toBeNull();
    expect(g.result).toMatchObject({ winner: 'away', ending: 'unstated', certainty: 'reported' });
    expect(g.result?.basis).toContain('cifsshome.org records 2-0, which may be a tally or another score');
    expect(describeGame(g).deciderTag).toBeNull();
  });

  it('records no tally when two sources give different ones', () => {
    const base = game({ home: 'vista', away: 'escondido', hs: 0, as: 0, results: MARKED_HOME });
    const g = unfoldShootout({ ...withSblive(base, 4, 3), provenance: { ...withSblive(base, 4, 3).provenance, cifssScore: { home: 3, away: 2, url: CIFSS_URL } } });
    expect(g.shootout).toBeNull();
  });

  // A tally read on an earlier pass follows its evidence (PR #127 review): finalizing a stored game again with a
  // changed score re-reads the tally, and with the evidence gone the tally goes too. A recorded tally stays.
  it('re-reads a tally it read before when the evidence changes or goes', () => {
    const base = game({ home: 'vista', away: 'escondido', hs: 0, as: 0, results: MARKED_HOME });
    const first = unfoldShootout(withSblive(base, 3, 2));
    expect(first.shootout).toEqual({ home: 3, away: 2 });
    expect(unfoldShootout(first), 'unchanged evidence: the same object').toBe(first);
    const changed = unfoldShootout(withSblive(first, 5, 4));
    expect(changed.shootout).toEqual({ home: 5, away: 4 });
    expect(changed.provenance.shootoutSource).toEqual({ source: 'sblive', score: { home: 5, away: 4 } });
    const { scoreConflict: _gone, ...bare } = first.provenance;
    void _gone;
    const dropped = unfoldShootout({ ...first, provenance: bare });
    expect(dropped.shootout).toBeNull();
    expect(dropped.provenance.shootoutSource).toBeUndefined();
    const recorded = { ...withSblive(base, 5, 4), decider: 'SO' as const, shootout: { home: 3, away: 2 } };
    expect(unfoldShootout(recorded), 'a recorded tally is not read over').toBe(recorded);
  });

  // Westview 0, Poway 0 (Aug 22, a tournament), marked T and T: cifsshome.org records Westview 1-0.
  it('marks a result disputed when another source names a different outcome', () => {
    const tie = game({ home: 'westview', away: 'poway', hs: 0, as: 0, league: false, contestTypes: { home: 2, away: 2 } });
    const g = finalizeResult(tie, { cifss: cifss(1, 0) });
    expect(g.result).toEqual({
      winner: null,
      ending: 'regulation',
      certainty: 'disputed',
      basis: 'another source, cifsshome.org, records Westview 1, Poway 0: a different outcome, with nothing else to settle it, so MaxPreps’ score stands',
    });
    // The same winner on another score is a difference, not a dispute.
    const won = finalizeResult(game({ home: 'westview', away: 'poway', hs: 4, as: 0 }), { cifss: cifss(3, 0) });
    expect(won.result).toEqual({ winner: 'home', ending: 'regulation', certainty: 'reported' });
  });

  it('drops a cifsshome.org score once the cross-check no longer lists it', () => {
    const base = game({ home: 'westview', away: 'poway', hs: 4, as: 0 });
    const had = finalizeResult(base, { cifss: cifss(3, 0) });
    expect(had.provenance.cifssScore).toEqual({ home: 3, away: 0, url: CIFSS_URL });
    expect(finalizeResult(had).provenance.cifssScore).toBeUndefined();
  });
});

/** Box evidence for one game: each named team's box score. */
const boxFor = (g: Game, sides: Record<string, BoxSide>): BoxEvidence => new Map([[g.contestId, new Map(Object.entries(sides))]]);

describe('weighing the sources: every one of them is wrong now and then', () => {
  it('reads a player-stats file into box evidence, counting only what a coach tracked', () => {
    const evidence = boxEvidenceFrom({
      teams: [
        {
          slug: 'mission-hills',
          games: [
            {
              contestId: 'c1',
              tracked: { field: ['goals', 'assists'], goalkeeping: ['saves', 'overtimeMinutes'] },
              players: [
                { field: { goals: 1, assists: 1 }, goalkeeping: null },
                { field: { goals: 1 }, goalkeeping: null },
                { field: null, goalkeeping: { saves: 5, overtimeMinutes: 10 } },
              ],
            },
            // Nothing tracked that bears on a result: no entry.
            { contestId: 'c2', tracked: { field: ['assists'], goalkeeping: ['saves'] }, players: [{ field: { assists: 2 }, goalkeeping: null }] },
          ],
        },
        { slug: 'broken', games: 'nope' },
      ],
    });
    expect(evidence.get('c1')?.get('mission-hills')).toEqual({ goals: 2, overtimeMinutes: 10 });
    expect(evidence.has('c2')).toBe(false);
    expect(boxEvidenceFrom(null).size).toBe(0);
  });

  // San Pasqual 0, Mission Hills 1 on MaxPreps (Oct 30); si.com has 1-2 and Mission Hills' box score totals 2.
  it('publishes the score two sources agree on when nothing defends MaxPreps’', () => {
    const mp = game({ home: 'san-pasqual', away: 'mission-hills', hs: 0, as: 1, league: false, date: '2026-10-30' });
    const g = finalizeResult(withSblive(mp, 1, 2), { box: boxFor(mp, { 'mission-hills': { goals: 2 } }) });
    expect([g.home.score, g.away.score]).toEqual([1, 2]);
    expect(g.provenance.adjudicated?.maxpreps).toMatchObject({ home: 0, away: 1 });
    expect(g.result).toMatchObject({ winner: 'away', ending: 'regulation', certainty: 'inferred' });
    expect(g.result?.basis).toContain('two sources agree on San Pasqual 1, Mission Hills 2 (si.com and a box score with 2 for Mission Hills)');
    // Made afresh each time: the same evidence changes nothing, and without it MaxPreps' score is back.
    expect(finalizeResult(g, { box: boxFor(mp, { 'mission-hills': { goals: 2 } }) })).toBe(g);
    const back = finalizeResult(g, { box: new Map() });
    expect([back.home.score, back.away.score, back.provenance.adjudicated]).toEqual([0, 1, undefined]);
  });

  // Westview 0, Poway 0 on MaxPreps, marked a tie (Aug 22); cifsshome.org has Westview 1-0 and Westview's box score a goal.
  it('gives a tie its winner when two sources have one', () => {
    const tie = game({ home: 'westview', away: 'poway', hs: 0, as: 0, league: false, contestTypes: { home: 2, away: 2 } });
    const g = finalizeResult(tie, { cifss: cifss(1, 0), box: boxFor(tie, { westview: { goals: 1 } }) });
    expect([g.home.score, g.away.score, g.home.result, g.away.result]).toEqual([1, 0, 'W', 'L']);
    expect(sideOutcome(g, 'home')).toBe('W');
    expect(g.result).toMatchObject({ winner: 'home', certainty: 'inferred' });
  });

  // Santa Catalina 0, Carmel 4 on MaxPreps (Oct 9); si.com has 0-3; Carmel's box score totals 4.
  it('keeps MaxPreps’ score when a box score defends it, or when it is one source against one', () => {
    const mp = game({ home: 'santa-catalina', away: 'carmel', hs: 0, as: 4 });
    const defended = finalizeResult(withSblive(mp, 0, 3), { box: boxFor(mp, { carmel: { goals: 4 } }) });
    expect([defended.home.score, defended.away.score, defended.provenance.adjudicated]).toEqual([0, 4, undefined]);
    const alone = finalizeResult(withSblive(mp, 0, 3), { box: new Map() });
    expect([alone.home.score, alone.away.score]).toEqual([0, 4]);
    // A different OUTCOME from one source, with a box score for MaxPreps: confirmed, not disputed.
    const salinas = game({ home: 'salinas', away: 'santa-catalina', hs: 1, as: 0 });
    const backed = finalizeResult(withSblive(salinas, 1, 1), { box: boxFor(salinas, { salinas: { goalsAgainst: 0 } }) });
    expect(backed.result).toMatchObject({ winner: 'home', certainty: 'confirmed' });
    expect(finalizeResult(withSblive(salinas, 1, 1), { box: new Map() }).result).toMatchObject({ certainty: 'disputed' });
  });

  it('never rescores a level game with the winner marked, or a forfeit: the higher scores there are the shootout or a convention', () => {
    const level = game({ home: 'westview', away: 'mission-vista', hs: 1, as: 1, league: false, contestTypes: { home: 2, away: 2 }, results: { home: 'L', away: 'W' } });
    const g = finalizeResult(withSblive(level, 3, 4), { box: boxFor(level, { 'mission-vista': { goals: 4, goalsAgainst: 3 }, westview: { goals: 1 } }) });
    expect([g.home.score, g.away.score, g.shootout]).toEqual([1, 1, { home: 2, away: 3 }]);
    const forfeit = game({ home: 'del-norte', away: 'valley-center', hs: 1, as: 0, forfeit: true });
    const f = finalizeResult(forfeit, { cifss: cifss(3, 0), box: new Map() });
    expect([f.home.score, f.away.score, f.result?.ending]).toEqual([1, 0, 'forfeit']);
  });

  // Saint Francis 1, Archbishop Mitty 1 (CCS semifinal, Nov 11): both teams' box scores total one goal.
  it('reads a shootout when both box scores confirm the game was level in play', () => {
    const semi = game({
      home: 'saint-francis', away: 'mitty', hs: 1, as: 1, league: false, date: '2026-11-11',
      postseason: { kind: 'ccs', leagueId: 'scval', via: 'maxpreps-bracket' }, results: MARKED_HOME,
    });
    expect(finalizeResult(semi, { box: new Map() }).result).toMatchObject({ ending: 'unstated', certainty: 'reported' });
    const g = finalizeResult(semi, { box: boxFor(semi, { 'saint-francis': { goals: 1 }, mitty: { goals: 1 } }) });
    expect(g.result).toMatchObject({ winner: 'home', ending: 'shootout', certainty: 'inferred' });
    expect(describeGame(g).deciderTag).toBe('SO');
    expect(describeGame(g).sentence).toBe('Saint Francis 1, Archbishop Mitty 1, final; Saint Francis won in a shootout.');
    // One box score that disagrees leaves it unstated.
    const off = finalizeResult(semi, { box: boxFor(semi, { 'saint-francis': { goals: 2 }, mitty: { goals: 1 } }) });
    expect(off.result).toMatchObject({ ending: 'unstated' });
  });

  // Los Altos 2, Stevenson 2 (Sep 18): MaxPreps counts no overtime; Stevenson's goalkeeper has 7 overtime minutes.
  it('records overtime a goalkeeper’s minutes show, and takes it back when the evidence goes', () => {
    const mp = game({ home: 'los-altos', away: 'stevenson', hs: 2, as: 2, league: false });
    const g = finalizeResult(mp, { box: boxFor(mp, { stevenson: { goals: 2, goalsAgainst: 2, overtimeMinutes: 7 } }) });
    expect([g.otPeriods, g.isOt, g.decider, g.provenance.overtimeEvidence]).toEqual([1, true, 'OT', 'box-score']);
    expect(g.result).toMatchObject({ winner: null, ending: 'overtime' });
    expect(finalizeResult(g, { box: boxFor(mp, { stevenson: { goals: 2, goalsAgainst: 2, overtimeMinutes: 7 } }) }), 'a fixed point').toBe(g);
    const gone = finalizeResult(g, { box: new Map() });
    expect([gone.otPeriods, gone.decider, gone.provenance.overtimeEvidence]).toEqual([0, 'REG', undefined]);
    // Sudden victory cannot leave two goals between the sides: not believed there.
    const wide = game({ home: 'los-altos', away: 'stevenson', hs: 3, as: 1, league: false });
    expect(finalizeResult(wide, { box: boxFor(wide, { stevenson: { overtimeMinutes: 7 } }) }).otPeriods).toBe(0);
  });
});

describe('a tournament game settled after a level score', () => {
  // Mission Vista 1, Westview 1 (Oct 17, contestType 2), Mission Vista marked W: si.com records 4-3.
  const base = game({
    home: 'westview', away: 'mission-vista', hs: 1, as: 1, league: false, date: '2026-10-17',
    contestTypes: { home: 2, away: 2 }, results: { home: 'L', away: 'W' },
  });

  it('counts the marked win and reads the 3-2 shootout out of si.com’s 4-3', () => {
    const g = finalizeResult(withSblive(base, 3, 4));
    expect(g.decider).toBe('SO');
    expect([g.home.score, g.away.score]).toEqual([1, 1]);
    expect(g.shootout).toEqual({ home: 2, away: 3 });
    expect(g.result).toEqual({
      winner: 'away',
      ending: 'shootout',
      certainty: 'inferred',
      basis: 'MaxPreps lists 1-1 and marks Mission Vista the winner; si.com records 4-3, the level score with the tally added',
    });
    expect(describeGame(g, 'mission-vista').perspectiveOutcome).toBe('W');
    // The tally is quoted winner's count first, whichever side is home, and the sentence names who won it.
    expect(describeGame(g).shootoutText).toBe('(3–2 SO)');
    expect(describeGame(g).sentence).toBe('Westview 1, Mission Vista 1, final; Mission Vista won in a shootout, 3–2.');
  });

  it('with no second source, counts the win and says no source states how', () => {
    const g = finalizeResult(base);
    expect(g.result).toMatchObject({ winner: 'away', ending: 'unstated', certainty: 'reported' });
  });
});

describe('a result recorded from a better source (DATA_QUALITY.resultCorrections)', () => {
  // Tamalpais 3, Marin Catholic 1 on MaxPreps (Oct 28, MCAL semifinal): 0-0 after two overtimes, 3-1 in the shootout.
  const id = '7bb048ba-9e33-4ad1-a743-2348c6637602';
  const maxpreps = game({ home: 'tamalpais', away: 'marin-catholic', hs: 3, as: 1, league: false, date: '2026-10-28', contestId: id });

  it('replaces the feed’s score with the goals in play, the overtime and the tally, and keeps what MaxPreps had', () => {
    expect(DATA_QUALITY.resultCorrections[id]).toBeDefined();
    const g = finalizeResult(maxpreps);
    expect([g.home.score, g.away.score, g.otPeriods, g.isOt, g.decider]).toEqual([0, 0, 2, true, 'SO']);
    expect(g.shootout).toEqual({ home: 3, away: 1 });
    expect([g.home.result, g.away.result]).toEqual(['W', 'L']);
    expect(g.provenance.resultCorrection?.maxpreps).toEqual({ home: 3, away: 1, otPeriods: 0 });
    expect(g.result).toMatchObject({ winner: 'home', ending: 'shootout', certainty: 'confirmed' });
    expect(g.result?.basis).toContain('Marin Independent Journal');
    expect(describeGame(g).shootoutText).toBe('(3–1 SO)');
    expect(finalizeResult(g), 'applied once').toBe(g);
  });

  it('can record a plain corrected score, and never touches a game that is not the one named', () => {
    const corrections: DataQualityConfig['resultCorrections'] = {
      [id]: { goals: { tamalpais: 2, 'marin-catholic': 1 }, otPeriods: 1, shootout: null, source: 'a report', url: null },
    };
    const g = applyResultCorrection(maxpreps, corrections);
    expect([g.home.score, g.away.score, g.decider, g.shootout]).toEqual([2, 1, 'OT', null]);
    expect(resolveResult(g)).toMatchObject({ winner: 'home', ending: 'overtime', certainty: 'confirmed', basis: 'a report' });
    const other = game({ home: 'redwood', away: 'tamalpais', hs: 2, as: 1, contestId: id });
    expect(applyResultCorrection(other, corrections)).toBe(other);
    expect(correctionProblems([other], corrections)).toHaveLength(1);
    expect(correctionProblems([maxpreps], corrections)).toEqual([]);
  });
});

describe('what the data audit of 2026-11-13 found', () => {
  it('scores a game MaxPreps lists with no score from its citation, and says how sure the source is', () => {
    // Bonita Vista at Helix, Oct 7: no score on MaxPreps; cifsshome.org has Helix 2-1.
    const id = '3a37744f-8264-47f8-baa3-6c660b8e3892';
    const pending = game({ home: 'helix', away: 'bonita-vista', date: '2026-10-07', status: 'score-pending', contestId: id });
    expect([pending.home.score, pending.decider]).toEqual([null, null]);
    const g = finalizeResult(pending);
    expect([g.status, g.home.score, g.away.score, g.decider, g.home.result]).toEqual(['final', 2, 1, 'REG', 'W']);
    expect(g.provenance.resultCorrection?.maxpreps).toBeNull();
    expect(g.result).toMatchObject({ winner: 'home', ending: 'regulation', certainty: 'reported' });
    // A scheduled game is not a result to correct.
    const scheduled = game({ home: 'helix', away: 'bonita-vista', date: '2026-10-07', contestId: id });
    expect(finalizeResult(scheduled)).toBe(scheduled);
  });

  it('records the shootout tallies MaxPreps’ game pages print: Saint Francis 5-2, Pleasant Valley 3-2', () => {
    const semi = game({
      home: 'saint-francis', away: 'mitty', hs: 1, as: 1, league: false, date: '2026-11-11', results: MARKED_HOME,
      postseason: { kind: 'ccs', leagueId: 'scval', via: 'maxpreps-bracket' }, contestId: '7d6e0426-a989-44cc-9f3e-e69e6ee0cec6',
    });
    const g = finalizeResult(semi);
    expect(g.shootout).toEqual({ home: 5, away: 2 });
    expect(g.result).toMatchObject({ winner: 'home', ending: 'shootout', certainty: 'confirmed' });
    expect(describeGame(g).sentence).toBe('Saint Francis 1, Archbishop Mitty 1, final; Saint Francis won in a shootout, 5–2.');
    expect(DATA_QUALITY.resultCorrections['ca27178a-9f11-46c0-9397-8289585bdb76'].shootout).toEqual({ 'pleasant-valley': 3, chico: 2 });
  });

  // Pleasant Valley 6, Lassen 1 on MaxPreps (Sep 16): Pleasant Valley's scorers total 7, Lassen's goalkeeper conceded 7.
  it('takes the figure the two teams’ own box scores agree on over MaxPreps’', () => {
    const mp = game({ home: 'pleasant-valley', away: 'lassen', hs: 6, as: 1 });
    const g = finalizeResult(mp, { box: boxFor(mp, { 'pleasant-valley': { goals: 7 }, lassen: { goals: 1, goalsAgainst: 7 } }) });
    expect([g.home.score, g.away.score]).toEqual([7, 1]);
    expect(g.result).toMatchObject({ winner: 'home', certainty: 'inferred' });
    expect(g.result?.basis).toContain('Pleasant Valley’s scorers’ total of 7 and Lassen’s goalkeepers’ 7 goals against');
    // One box score alone, or two that do not agree with each other, change nothing.
    const cases: Array<Record<string, BoxSide>> = [{ 'pleasant-valley': { goals: 7 } }, { 'pleasant-valley': { goals: 7 }, lassen: { goalsAgainst: 8 } }];
    for (const sides of cases) {
      const same = finalizeResult(mp, { box: boxFor(mp, sides) });
      expect([same.home.score, same.away.score, same.provenance.adjudicated]).toEqual([6, 1, undefined]);
    }
  });

  it('ignores a box score that repeats another of the same team’s, player for player', () => {
    const players = [{ field: { goals: 1 }, goalkeeping: null }, { field: { assists: 1 }, goalkeeping: null }];
    const tracked = { field: ['goals', 'assists'], goalkeeping: [] };
    const evidence = boxEvidenceFrom({
      teams: [{ slug: 'westview', games: [{ contestId: 'aug-22', tracked, players }, { contestId: 'sep-12', tracked, players }, { contestId: 'other', tracked, players: [{ field: { goals: 2 }, goalkeeping: null }] }] }],
    });
    expect([evidence.has('aug-22'), evidence.has('sep-12'), evidence.has('other')]).toEqual([false, false, true]);
  });
});

describe('the committed snapshot, as the loader records it', () => {
  it('drops a row the config has since excluded, lists it as dropped, and recounts the table', () => {
    const raw = JSON.parse(readFileSync('data/snapshot.json', 'utf8')) as { games: Array<{ contestId: string }> };
    const loaded = loadSnapshot(raw);
    for (const id of Object.keys(DATA_QUALITY.excludedContestIds)) {
      expect(loaded.games.some((g) => g.contestId === id), id).toBe(false);
      if (raw.games.some((g) => g.contestId === id)) expect(loaded.dropped.some((d) => d.contestId === id), id).toBe(true);
    }
    // Torrey Pines at La Costa Canyon, Oct 13 (8c6b3f6a), was an 11th Avocado game in a 10-game schedule.
    for (const row of loaded.standings.filter((r) => r.division === 'avocado')) expect(row.computed.gp, row.slug).toBeLessThanOrEqual(10);
  });

  const snapshot = loadSnapshot(JSON.parse(readFileSync('data/snapshot.json', 'utf8')) as unknown);

  it('gives every final a result that agrees with its outcome, and no other game one', () => {
    for (const g of snapshot.games) {
      if (g.status !== 'final') {
        expect(g.result, g.contestId).toBeUndefined();
        continue;
      }
      const o = sideOutcome(g, 'home');
      expect(g.result?.winner, g.contestId).toBe(o === 'W' ? 'home' : o === 'L' ? 'away' : null);
      // A tally is only ever shown for a shootout the record stands behind.
      if (g.shootout) expect(g.result?.ending, g.contestId).toBe('shootout');
      if (g.result?.certainty !== 'reported' || g.result.ending === 'unstated') expect(g.result?.basis, g.contestId).toBeTruthy();
    }
  });

  it('is a fixed point with the season’s box scores weighed in, as lib/data.ts loads it', () => {
    const box = boxEvidenceFrom(JSON.parse(readFileSync('data/player-stats.json', 'utf8')) as unknown);
    const once = loadSnapshot(JSON.parse(readFileSync('data/snapshot.json', 'utf8')) as unknown, { box });
    const twice = loadSnapshot(JSON.parse(JSON.stringify(once)) as unknown, { box });
    expect(JSON.stringify(twice.games)).toBe(JSON.stringify(once.games));
    expect(JSON.stringify(twice.standings)).toBe(JSON.stringify(once.standings));
    for (const g of once.games) {
      const o = sideOutcome(g, 'home');
      if (g.status === 'final') expect(g.result?.winner, g.contestId).toBe(o === 'W' ? 'home' : o === 'L' ? 'away' : null);
    }
  });

  it('applies every configured correction to its game', () => {
    expect(correctionProblems(snapshot.games)).toEqual([]);
    for (const id of Object.keys(DATA_QUALITY.resultCorrections)) {
      const g = snapshot.games.find((x) => x.contestId === id);
      if (g?.status === 'final') expect(g.provenance.resultCorrection, id).toBeDefined();
    }
  });
});

describe('a corrected score that is not a shootout says where it is from (PR #127 review)', () => {
  it('prints the correction’s source on the game page', async () => {
    const { buildGameView } = await import('../components/game/game-view');
    // Olympian 6, Sage Creek 0 (the Section's bracket sheet; MaxPreps has no score) and Helix 2, Bonita Vista 1.
    expect(buildGameView('dba373ca-9805-4eb4-a479-553059994aee')?.scoreNote, 'components/game/game-view.ts scoreNoteFor').toContain('The San Diego Section’s Division II bracket sheet');
    expect(buildGameView('3a37744f-8264-47f8-baa3-6c660b8e3892')?.scoreNote, 'components/game/game-view.ts scoreNoteFor').toContain('Cifsshome.org, the San Diego Section’s score listing');
  }, 120_000);
});

describe('a correction against a stored game (PR #127 review)', () => {
  const ID = 'stored-correction-test';
  const base = { ...game({ home: 'homestead', away: 'cupertino', hs: 1, as: 1 }), contestId: ID };
  const correction = (homestead: number, source: string): DataQualityConfig['resultCorrections'] => ({
    [ID]: { goals: { homestead, cupertino: 1 }, otPeriods: 0, shootout: null, source, url: 'https://example.org/box' },
  });

  it('applies an edited correction to a game stored with the earlier one, from what MaxPreps had', () => {
    const first = applyResultCorrection(base, correction(2, 'the league’s sheet'));
    expect([first.home.score, first.away.score]).toEqual([2, 1]);
    expect(applyResultCorrection(first, correction(2, 'the league’s sheet')), 'unchanged: the same object').toBe(first);
    const edited = applyResultCorrection(first, correction(3, 'the league’s sheet, corrected'));
    expect([edited.home.score, edited.away.score]).toEqual([3, 1]);
    expect(edited.provenance.resultCorrection).toMatchObject({ maxpreps: { home: 1, away: 1, otPeriods: 0 }, source: 'the league’s sheet, corrected' });
  });

  it('replaces an earlier adjudication, and keeps the score MaxPreps had', () => {
    const adjudicated: Game = {
      ...base,
      home: { ...base.home, score: 4, result: 'W' },
      away: { ...base.away, score: 1, result: 'L' },
      provenance: { ...base.provenance, adjudicated: { maxpreps: { home: 1, away: 1, homeResult: 'T', awayResult: 'T' }, by: ['si.com', 'cifsshome.org'] } },
    };
    const g = finalizeResult(adjudicated, { corrections: correction(2, 'the league’s sheet') });
    expect([g.home.score, g.away.score]).toEqual([2, 1]);
    expect(g.provenance.adjudicated).toBeUndefined();
    expect(g.provenance.resultCorrection?.maxpreps).toMatchObject({ home: 1, away: 1 });
  });
});
