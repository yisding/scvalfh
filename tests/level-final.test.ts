/**
 * A level final in a game that must have a winner (lib/postseason/level-final.ts), and how every view words it
 * (components/ui/describe-game.ts tiebreakRuleOf). The scene is the CCS Division 1 semifinal of Nov 11, 2026:
 * Saint Francis 1, Archbishop Mitty 1, MaxPreps marking Saint Francis W (contest 7d6e0426). Before this rule the
 * game was a tie in both teams' records while the bracket advanced Saint Francis.
 */

import { describe, expect, it } from 'vitest';

import { describeGame, overtimeDoubtOf, resultSentence, tiebreakRuleOf } from '../components/ui/describe-game';
import { sideOutcome } from '../lib/format';
import { stepClassify } from '../lib/pipeline/steps/classify';
import { winningSide } from '../lib/postseason/game-winner';
import { flagConflictSentence, isUnsettledLevelFinal, settleLevelFinal, settleLevelFinals } from '../lib/postseason/level-final';
import { computeStandings } from '../lib/standings/engine';
import type { Game, PostseasonTag } from '../lib/types';
import { game } from './game-builder';

const CCS_TAG: PostseasonTag = { kind: 'ccs', leagueId: 'scval', via: 'maxpreps-bracket' };
const MARKED = { home: 'W', away: 'L' } as const;

/** The semifinal as lib/pipeline/normalize.ts leaves it: REG, with the flags written up as a contradiction. */
function semifinal(over: Partial<Game> = {}): Game {
  const g = game({
    home: 'saint-francis', away: 'mitty', hs: 1, as: 1, date: '2026-11-11', league: false,
    contestTypes: { home: 4, away: 4 }, postseason: null, results: MARKED,
  });
  return {
    ...g,
    postseason: CCS_TAG,
    provenance: { ...g.provenance, resultConflict: flagConflictSentence(g.home, g.away) },
    ...over,
  };
}

describe('settleLevelFinal', () => {
  it('makes a level postseason final marked W and L the marked side’s win, and keeps the score', () => {
    const before = semifinal();
    expect(before.decider).toBe('REG');
    expect(sideOutcome(before, 'home'), 'read off the score, the game was a tie').toBe('T');
    expect(isUnsettledLevelFinal(before)).toBe(true);
    const after = settleLevelFinal(before);
    expect(after.decider).toBe('SO');
    expect([after.home.score, after.away.score]).toEqual([1, 1]);
    expect(after.shootout).toBeNull();
    expect(sideOutcome(after, 'home')).toBe('W');
    expect(sideOutcome(after, 'away')).toBe('L');
    // The bracket's winner and the record's winner are now one answer.
    expect(winningSide(after)).toBe('home');
    expect(after.provenance.resultConflict, 'the flags are the result, not a contradiction').toBeUndefined();
    expect(settleLevelFinal(after), 'idempotent').toBe(after);
  });

  it('keeps a feed-disagreement note and the recorded overtime', () => {
    const g = semifinal({ otPeriods: 2, isOt: true, decider: '2OT' });
    const other = 'MaxPreps’ two team feeds disagree on the score (a 1, b 1 in one; a 2, b 1 in the other).';
    const after = settleLevelFinal({ ...g, provenance: { ...g.provenance, resultConflict: `${g.provenance.resultConflict} ${other}` } });
    expect(after.decider).toBe('SO');
    expect(after.provenance.resultConflict).toBe(other);
    expect([after.otPeriods, after.isOt]).toEqual([2, true]);
  });

  it('covers every kind of postseason game', () => {
    const kinds: PostseasonTag[] = [
      { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' },
      { kind: 'bval-play-in', leagueId: 'bval', via: 'config-pairing' },
      { kind: 'mcal-tournament', leagueId: 'mcal', via: 'contest-type-4' },
      { kind: 'outside-tournament', leagueId: null, via: 'outside-tournament' },
    ] as PostseasonTag[];
    for (const postseason of kinds) expect(settleLevelFinal(semifinal({ postseason })).decider, postseason.kind).toBe('SO');
  });

  it('leaves alone a regular-season game, an unmarked level final, a decided game, a forfeit and a game not final', () => {
    const untouched: Array<[string, Game]> = [
      // A level non-league game marked W and L outside a tournament: no rule says it needed a winner.
      ['regular season', semifinal({ postseason: null, contestTypes: { home: 1, away: 1 } })],
      ['T and T', semifinal({ home: { ...semifinal().home, result: 'T' }, away: { ...semifinal().away, result: 'T' } })],
      ['no flags', semifinal({ home: { ...semifinal().home, result: null }, away: { ...semifinal().away, result: null } })],
      ['W and W', semifinal({ away: { ...semifinal().away, result: 'W' } })],
      ['decided on goals', semifinal({ home: { ...semifinal().home, score: 2 } })],
      ['forfeit', semifinal({ isForfeit: true, forfeitBy: 'away', decider: 'FORFEIT' })],
      ['scheduled', semifinal({ status: 'scheduled', decider: null })],
    ];
    for (const [label, g] of untouched) {
      expect(settleLevelFinal(g), label).toBe(g);
      if (g.status === 'final' && g.home.score === g.away.score && !g.isForfeit) expect(sideOutcome(g, 'home'), label).toBe('T');
    }
    const list = untouched.map(([, g]) => g);
    expect(settleLevelFinals(list), 'the same array when nothing changes').toBe(list);
  });

  it('counts a tournament game marked W and L, and leaves one marked T and T a tie', () => {
    // Huntington Beach 0, Hockaday 0 (Aug 21) and University 0, Gilroy 0 (Sep 12): contestType 2, marked W and L.
    const marked = settleLevelFinal(semifinal({ postseason: null, contestTypes: { home: 2, away: 2 } }));
    expect(marked.decider).toBe('SO');
    expect(sideOutcome(marked, 'home')).toBe('W');
    // Pool games end level: 22 of the 24 level tournament finals of 2026 are marked T and T.
    const pool = semifinal({
      postseason: null, contestTypes: { home: 2, away: 2 },
      home: { ...semifinal().home, result: 'T' }, away: { ...semifinal().away, result: 'T' },
    });
    expect(settleLevelFinal(pool)).toBe(pool);
    expect(sideOutcome(pool, 'home')).toBe('T');
  });

  it('runs in the classify step, so the standings count the win', () => {
    const logs: string[] = [];
    const ctx = { log: (line: string) => logs.push(line) } as unknown as Parameters<typeof stepClassify>[0];
    const out = stepClassify(ctx, [semifinal()], new Set());
    expect(out[0].decider).toBe('SO');
    expect(logs.join('\n')).toMatch(/level at 1-1 and marked W\/L.*counted as Saint Francis's win/);
    const rows = computeStandings(out);
    const row = (slug: string) => rows.find((r) => r.slug === slug)!.overall;
    expect([row('saint-francis').w, row('saint-francis').t]).toEqual([1, 0]);
    expect([row('mitty').l, row('mitty').t]).toEqual([1, 0]);
    // Goals stay as recorded: one each.
    expect([row('saint-francis').gf, row('saint-francis').ga]).toEqual([1, 1]);
  });

  it('is what the game builder gives a level postseason final marked W and L', () => {
    const built = game({ home: 'saint-francis', away: 'mitty', hs: 1, as: 1, league: false, postseason: CCS_TAG, results: MARKED });
    expect(built.decider).toBe('SO');
  });
});

describe('how a settled playoff final reads', () => {
  const g = settleLevelFinal(semifinal());

  it('has no section rule, so the sport’s tiebreak words it and nothing says a shootout was played', () => {
    expect(tiebreakRuleOf(g)).toEqual({ words: 'a shootout', inference: 'unverified', section: null });
    const d = describeGame(g, 'mitty');
    expect([d.home.chip, d.away.chip]).toEqual(['W', 'L']);
    expect([d.home.weight, d.away.weight]).toEqual(['winner', 'loser']);
    expect(d.perspectiveOutcome).toBe('L');
    expect([d.home.glyph, d.away.glyph]).toEqual(['1', '1']);
    expect(d.deciderTag, 'no source confirms the shootout').toBeNull();
    expect(d.shootoutLabel).toBeNull();
    expect(d.sentence).toBe('Saint Francis 1, Archbishop Mitty 1, final; Saint Francis credited with the win (MaxPreps lists 1–1 with no tally).');
    expect(resultSentence(g)).toBe('MaxPreps credits Saint Francis with the win in their home CCS playoff game against Archbishop Mitty, level at 1–1.');
  });

  it('prints a tally and the tag once a source gives one', () => {
    const withTally = { ...g, shootout: { home: 3, away: 2 } };
    expect(tiebreakRuleOf(withTally).inference).toBe('verified');
    expect(describeGame(withTally).shootoutText).toBe('(3–2 SO)');
    expect(resultSentence(withTally)).toBe('Saint Francis won their home CCS playoff game against Archbishop Mitty in a shootout (3–2) after a 1–1 tie.');
  });
});

describe('overtimeDoubtOf: an overtime period that ends on the first goal cannot leave two goals between the sides', () => {
  // Corning 2, Bella Vista 0 (Oct 5, EAL): one overtime period recorded.
  const corning = game({ home: 'corning', away: 'bella-vista', hs: 2, as: 0, ot: 1 });

  it('doubts the margin between two teams of a shootout section, and drops the tag and the words', () => {
    expect(overtimeDoubtOf(corning)).toMatchObject({ why: 'margin' });
    const d = describeGame(corning);
    expect(d.deciderTag).toBeNull();
    expect(d.sentence).toBe('Corning 2, Bella Vista 0, final.');
    expect(resultSentence(corning)).not.toContain('overtime');
  });

  it('leaves a one-goal overtime win, a postseason game and a game outside those sections alone', () => {
    expect(overtimeDoubtOf(game({ home: 'corning', away: 'bella-vista', hs: 1, as: 0, ot: 1 }))).toBeNull();
    const playoff = { ...corning, postseason: { kind: 'league-postseason', leagueId: 'eal', via: 'contest-type-4' } as PostseasonTag };
    expect(overtimeDoubtOf(playoff)).toBeNull();
    // Hollister 3, Greenfield 1 (Sep 30, PCAL): no section rule, so MaxPreps' record stands.
    const pcal = game({ home: 'greenfield', away: 'hollister', hs: 1, as: 3, ot: 1 });
    expect(overtimeDoubtOf(pcal)).toBeNull();
    expect(describeGame(pcal).deciderTag).toBe('OT');
  });
});
