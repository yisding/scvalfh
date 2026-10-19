/**
 * lib/engine/standings/tiebreak.ts: the stage interpreter (SPEC §5.3, §5.5): SCVAL's Article VI tiebreakers, one
 * scenario per stage, PCAL's partition-restart by the bucket-start chain, and EAL's 1 v 1 wins, points and no
 * tiebreak. The seed-one-restart procedure is tested in ./seed-one.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import {
  buildCrossCheck, computeStandings, leaguePairings, outcomesFor, playoffOutcomeLabel, playoffStatusFor,
} from '@/lib/engine/standings';
import type { Game } from '@/lib/model/game';
import type { ReportedRecord } from '@/lib/model/standings';
import { game } from '@/tests/support/game-builder';
import { finals, table, row, places, order } from '@/tests/support/standings';

/**
 * One constructed scenario per Article VI step. Each uses De Anza teams only, so every other
 * De Anza team has zero games and sorts last.
 */
describe('standings: Article VI tiebreakers, one scenario per step', () => {
  it('§3 head-to-head brings a team out of a points tie', () => {
    // Both finish 1-1-0 (3 pts) with one division win each. Cupertino beat Fremont head to head.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' }),
      game({ home: 'cupertino', away: 'homestead', hs: 0, as: 1, date: '2026-09-11' }),
      game({ home: 'fremont', away: 'los-altos', hs: 2, as: 1, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    expect(row(rows, 'cupertino').computed.pts).toBe(3);
    expect(row(rows, 'fremont').computed.pts).toBe(3);
    expect(row(rows, 'cupertino').computed.place).toBeLessThan(row(rows, 'fremont').computed.place);
    expect(row(rows, 'cupertino').tiebreak.resolvedBy).toBe('head-to-head');
    expect(row(rows, 'cupertino').tiebreak.shared).toBe(false);
    expect(row(rows, 'cupertino').tiebreak.note).toMatch(/Article VI §3/);
  });

  it('§4 division wins separates teams tied on points with an equal head-to-head', () => {
    // Cupertino 2-1-0 = 6 pts (2 wins); Fremont 1-1-3 = 6 pts (1 win). They split their two
    // meetings, so the head-to-head record is level (3 pts each) and §4 must separate them.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'cupertino', hs: 1, as: 0, date: '2026-09-11' }),
      game({ home: 'cupertino', away: 'homestead', hs: 3, as: 0, date: '2026-09-14' }),
      game({ home: 'fremont', away: 'los-altos', hs: 1, as: 1, date: '2026-09-16' }),
      game({ home: 'fremont', away: 'saint-francis', hs: 2, as: 2, date: '2026-09-18' }),
      game({ home: 'fremont', away: 'st-ignatius', hs: 1, as: 1, date: '2026-09-21' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    expect(cu.computed.pts).toBe(6);
    expect(fr.computed.pts).toBe(6);
    expect(cu.computed.w).toBe(2);
    expect(fr.computed.w).toBe(1);
    expect(cu.computed.place).toBeLessThan(fr.computed.place);
    expect(cu.tiebreak.resolvedBy).toBe('division-wins');
    expect(cu.tiebreak.note).toMatch(/Article VI §4/);
  });

  it('§5 fewest goals allowed head-to-head separates a split pair', () => {
    // They split: Cupertino won 3-0, Fremont won 1-0. Identical points (3) and division wins (1);
    // Cupertino conceded 1 in the pair, Fremont conceded 3.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 3, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'cupertino', hs: 1, as: 0, date: '2026-09-23' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    expect(cu.computed.pts).toBe(3);
    expect(fr.computed.pts).toBe(3);
    expect(cu.computed.w).toBe(1);
    expect(fr.computed.w).toBe(1);
    expect(cu.computed.place).toBe(1);
    expect(fr.computed.place).toBe(2);
    expect(cu.tiebreak.resolvedBy).toBe('h2h-goals-against');
    expect(cu.tiebreak.note).toMatch(/Article VI §5/);
  });

  it('§6 head-to-head goal differential separates a three-way tie', () => {
    // A perfect cycle: every team 1-1-0 (3 pts, 1 win), every team concedes exactly 3 in the
    // group, so only the head-to-head differential is left: CU +1, FR 0, HM −1.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 3, as: 1, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'homestead', away: 'cupertino', hs: 2, as: 1, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    for (const slug of ['cupertino', 'fremont', 'homestead']) {
      expect(row(rows, slug).computed.pts, slug).toBe(3);
      expect(row(rows, slug).computed.w, slug).toBe(1);
      expect(row(rows, slug).computed.ga, slug).toBe(3);
    }
    expect(order(rows, 'de-anza').slice(0, 3)).toEqual(['cupertino', 'fremont', 'homestead']);
    expect(row(rows, 'cupertino').tiebreak.resolvedBy).toBe('h2h-goal-diff');
    expect(row(rows, 'cupertino').tiebreak.note).toMatch(/Article VI §6/);
  });

  it('§7 leaves a genuinely unresolvable tie level and flags the coin flip', () => {
    // A symmetric cycle: identical points, wins, head-to-head goals against and differential.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 0, date: '2026-09-09' }),
      game({ home: 'fremont', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'homestead', away: 'cupertino', hs: 2, as: 0, date: '2026-09-14' }),
    ];
    const rows = computeStandings(games);
    const tied = ['cupertino', 'fremont', 'homestead'].map((s) => row(rows, s));
    for (const s of tied) {
      expect(s.computed.place).toBe(1);
      expect(s.tiebreak.resolvedBy).toBe('coin-flip');
      expect(s.tiebreak.shared).toBe(true);
      expect(s.tiebreak.tiedWith.length).toBe(2);
      expect(s.tiebreak.note).toMatch(/Article VI §7/);
    }
    // A shared place consumes its slots: the next team down is 4th, not 2nd.
    const next = rows
      .filter((r) => r.division === 'de-anza' && r.computed.place > 1)
      .sort((a, b) => a.computed.place - b.computed.place)[0];
    expect(next.computed.place).toBe(4);
  });

  it('restarts the chain once a team is brought out (Article VI §3)', () => {
    // Three teams on 6 points. Cupertino beat both of the others, so §3 brings it out; Fremont and
    // Homestead never met, so restarting the chain for the pair ends in §7 and they stay level.
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 2, as: 0, date: '2026-09-09' }),
      game({ home: 'cupertino', away: 'homestead', hs: 2, as: 0, date: '2026-09-11' }),
      game({ home: 'fremont', away: 'los-altos', hs: 1, as: 0, date: '2026-09-14' }),
      game({ home: 'fremont', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-16' }),
      game({ home: 'homestead', away: 'los-altos', hs: 1, as: 0, date: '2026-09-18' }),
      game({ home: 'homestead', away: 'saint-francis', hs: 1, as: 0, date: '2026-09-21' }),
    ];
    const rows = computeStandings(games);
    const cu = row(rows, 'cupertino');
    const fr = row(rows, 'fremont');
    const hm = row(rows, 'homestead');
    for (const s of [cu, fr, hm]) expect(s.computed.pts).toBe(6);
    expect(cu.computed.place).toBe(1);
    expect(cu.tiebreak.resolvedBy).toBe('head-to-head');
    // The remaining pair restarts the chain and lands on the coin flip, sharing 2nd.
    expect(fr.computed.place).toBe(2);
    expect(hm.computed.place).toBe(2);
    expect(fr.tiebreak.resolvedBy).toBe('coin-flip');
    expect(fr.tiebreak.tiedWith).toEqual([hm.teamId]);
    for (const slug of ['cupertino', 'fremont', 'homestead', 'los-altos']) {
      expect(row(rows, slug).tiebreak.note.length).toBeGreaterThan(10);
    }
  });

  it('a forfeit counts in W-L-T but not in goals (DESIGN §11.6)', () => {
    const games: Game[] = [
      game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, date: '2026-09-09', forfeit: true }),
    ];
    const rows = computeStandings(games);
    expect(row(rows, 'cupertino').computed.w).toBe(1);
    expect(row(rows, 'cupertino').computed.gf).toBe(0);
    expect(row(rows, 'fremont').computed.ga).toBe(0);
  });
});

// ---------------------------------------------------------------- PCAL (partition-restart)

describe('PCAL: partition-restart by the bucket-start chain', () => {
  /**
   * §5.3 regression case: X, Y, Z level for 1st. Y–X W,T; Y–Z L,T; X–Z X won both. Three-way
   * head-to-head points: X 7, Y 5, Z 4 → X, Y, Z. (A seed-one restart re-runs Y–Z and gives X, Z, Y.)
   */
  const tri = (x: string, y: string, z: string, a: string, b: string, c: string): Game[] =>
    finals([
      [y, x, 2, 1], [x, y, 1, 1],
      [y, z, 0, 1], [z, y, 2, 2],
      [x, z, 3, 0], [z, x, 0, 1],
      // level everyone on 10 points: X +3, Y +5, Z +6
      [x, a, 2, 0],
      [y, a, 1, 0], [y, b, 1, 1], [y, c, 0, 0],
      [z, b, 2, 0], [z, c, 3, 1],
    ]);

  it('orders the tri-champions X, Y, Z by the three-way head-to-head', () => {
    const rows = table(tri('carmel', 'greenfield', 'hollister', 'monterey', 'salinas', 'santa-catalina'), 'pcal');
    for (const s of ['carmel', 'greenfield', 'hollister']) expect(row(rows, s).computed.pts, s).toBe(10);
    expect(places(rows, ['carmel', 'greenfield', 'hollister'])).toEqual([1, 2, 3]);
    for (const s of ['carmel', 'greenfield', 'hollister']) {
      expect(row(rows, s).tiebreak.resolvedBy, s).toBe('head-to-head');
      expect(row(rows, s).tiebreak.shared).toBe(false);
      expect(row(rows, s).tiebreak.note).toMatch(/§23\.3 \(head-to-head/);
    }
  });

  it('the same results under seed-one-restart (BVAL) give X, Z, Y', () => {
    const rows = table(tri('branham', 'christopher', 'gilroy', 'leigh', 'leland', 'willow-glen'), 'mt-hamilton');
    for (const s of ['branham', 'christopher', 'gilroy']) expect(row(rows, s).computed.pts, s).toBe(10);
    expect(places(rows, ['branham', 'gilroy', 'christopher'])).toEqual([1, 2, 3]);
  });

  it('a tie for 2nd: record against the higher-placed team decides', () => {
    // C champion. A and B split their meetings; A took a point off C, B took none.
    const rows = table(
      finals([
        ['carmel', 'greenfield', 1, 1], ['greenfield', 'carmel', 0, 1],
        ['carmel', 'hollister', 2, 0], ['hollister', 'carmel', 0, 1],
        ['greenfield', 'hollister', 1, 0], ['hollister', 'greenfield', 1, 0],
        ['hollister', 'monterey', 1, 1],
      ]),
      'pcal',
    );
    expect(row(rows, 'greenfield').computed.pts).toBe(4);
    expect(row(rows, 'hollister').computed.pts).toBe(4);
    expect(row(rows, 'carmel').computed.place).toBe(1);
    expect(places(rows, ['greenfield', 'hollister'])).toEqual([2, 3]);
    expect(row(rows, 'greenfield').tiebreak.resolvedBy).toBe('record-vs-higher-placed');
    expect(row(rows, 'greenfield').tiebreak.note).toMatch(/§23\.3\.3/);
  });

  it('a tie for 2nd: lower-placed teams are compared one at a time', () => {
    // Equal against C (both lost twice) and against D (one win each); E separates them.
    const rows = table(
      finals([
        ['carmel', 'greenfield', 1, 0], ['greenfield', 'carmel', 0, 1],
        ['carmel', 'hollister', 1, 0], ['hollister', 'carmel', 0, 1],
        ['greenfield', 'hollister', 1, 0], ['hollister', 'greenfield', 1, 0],
        ['greenfield', 'monterey', 1, 0], ['monterey', 'greenfield', 1, 0],
        ['hollister', 'monterey', 1, 0], ['monterey', 'hollister', 1, 0],
        ['greenfield', 'salinas', 1, 0], ['salinas', 'greenfield', 0, 1],
        ['hollister', 'salinas', 1, 1], ['salinas', 'hollister', 1, 1],
        ['hollister', 'santa-catalina', 1, 0], ['stevenson', 'hollister', 0, 0],
        ['carmel', 'monterey', 1, 0], ['carmel', 'salinas', 1, 0],
      ]),
      'pcal',
    );
    expect(row(rows, 'greenfield').computed.pts).toBe(row(rows, 'hollister').computed.pts);
    expect(row(rows, 'carmel').computed.place).toBe(1);
    // monterey (6) is above salinas (2) and both are single clusters.
    expect(row(rows, 'monterey').computed.place).toBeLessThan(row(rows, 'salinas').computed.place);
    expect(places(rows, ['greenfield', 'hollister'])).toEqual([2, 3]);
    expect(row(rows, 'greenfield').tiebreak.resolvedBy).toBe('record-vs-lower-placed');
    // A tie for 2nd is §23.3.3 (its clause (c)), not the co-champions clause alone.
    expect(row(rows, 'greenfield').tiebreak.note).toMatch(/§23\.3\.3\(c\) \(record against each lower-placed team/);
  });

  it('stops at a shared lower cluster that would decide it: the teams stay level (ccs-points)', () => {
    // D and E are level below and share a place; A beat D twice and lost to E twice, B the reverse.
    const rows = table(
      finals([
        ['carmel', 'greenfield', 1, 0], ['greenfield', 'carmel', 0, 1],
        ['carmel', 'hollister', 1, 0], ['hollister', 'carmel', 0, 1],
        ['greenfield', 'hollister', 1, 0], ['hollister', 'greenfield', 1, 0],
        ['greenfield', 'monterey', 1, 0], ['monterey', 'greenfield', 0, 1],
        ['greenfield', 'salinas', 0, 1], ['salinas', 'greenfield', 1, 0],
        ['hollister', 'monterey', 0, 1], ['monterey', 'hollister', 1, 0],
        ['hollister', 'salinas', 1, 0], ['salinas', 'hollister', 0, 1],
        // a single lower team that WOULD separate them, reached only after the shared cluster
        ['greenfield', 'santa-catalina', 1, 0], ['hollister', 'santa-catalina', 1, 1],
        ['hollister', 'stevenson', 1, 1], ['stevenson', 'hollister', 1, 1],
        ['carmel', 'monterey', 1, 0], ['carmel', 'salinas', 1, 0],
        ['carmel', 'santa-catalina', 1, 0], ['carmel', 'stevenson', 1, 0],
      ]),
      'pcal',
    );
    const a = row(rows, 'greenfield');
    const b = row(rows, 'hollister');
    expect(a.computed.pts).toBe(b.computed.pts);
    expect(row(rows, 'monterey').computed.pts).toBe(row(rows, 'salinas').computed.pts);
    expect(row(rows, 'monterey').tiebreak.shared).toBe(true);
    expect(row(rows, 'monterey').tiebreak.resolvedBy).toBe('no-rule');
    expect(places(rows, ['greenfield', 'hollister'])).toEqual([2, 2]);
    for (const s of [a, b]) {
      expect(s.tiebreak.shared).toBe(true);
      expect(s.tiebreak.resolvedBy).toBe('ccs-points');
      expect(s.tiebreak.note).toMatch(/unresolved by every criterion — PCAL By-laws \(rev\. May 2025\) §23\.3 \(the CCS-points step/);
      expect(s.tiebreak.note).toMatch(/We show them level\.$/);
    }
    // A level place straddling the AQ line carries both outcomes.
    expect(outcomesFor(a)).toEqual(['aq', 'no-aq-route']);
    expect(playoffOutcomeLabel('pcal', outcomesFor(a))).toBe(
      'Automatic qualifier or no automatic-berth route — PCAL By-laws §23.3 ends in a coin flip or blind draw by the Commissioner',
    );
  });

  it('a tie whose points bucket starts at 3rd or lower stays level with the no-rule note', () => {
    const rows = table(
      finals([
        ['carmel', 'greenfield', 2, 0], ['carmel', 'hollister', 2, 0], ['greenfield', 'hollister', 1, 0],
        ['carmel', 'monterey', 1, 0], ['greenfield', 'monterey', 1, 0],
        ['hollister', 'salinas', 1, 0], ['monterey', 'salinas', 1, 0],
      ]),
      'pcal',
    );
    expect(row(rows, 'hollister').computed.pts).toBe(3);
    expect(row(rows, 'monterey').computed.pts).toBe(3);
    // They never met, but no tiebreak applies to a bucket starting at 3rd anyway (§23.3 is for AQ places).
    expect(places(rows, ['carmel', 'greenfield', 'hollister', 'monterey'])).toEqual([1, 2, 3, 3]);
    const h = row(rows, 'hollister');
    expect(h.tiebreak.resolvedBy).toBe('no-rule');
    expect(h.tiebreak.shared).toBe(true);
    expect(h.tiebreak.note).toBe(
      'Tied on 3 points with Monterey and unresolved by every criterion — PCAL’s by-laws break ties only for the two CCS places; this tie is left as it is. We show them level.',
    );
  });

  it('skips head-to-head when a tied team has not met the others (never scores the unmet 0)', () => {
    // Three level for 1st: Carmel beat Greenfield; Hollister met neither. Under SCVAL's 'zero' rule
    // Carmel would come out on head-to-head; PCAL skips the stage instead. Lower-placed then falls on
    // a shared lower cluster (Monterey, Salinas), so all three stay level.
    const rows = table(
      finals([
        ['carmel', 'greenfield', 1, 0],
        ['greenfield', 'monterey', 1, 0],
        ['hollister', 'salinas', 1, 0],
      ]),
      'pcal',
    );
    for (const s of ['carmel', 'greenfield', 'hollister']) {
      const r = row(rows, s);
      expect(r.computed.pts, s).toBe(3);
      expect(r.computed.place, s).toBe(1);
      expect(r.tiebreak.resolvedBy, s).toBe('ccs-points');
      expect(r.tiebreak.shared, s).toBe(true);
    }
    expect(places(rows, ['monterey', 'salinas'])).toEqual([4, 4]);
  });

  it('a tie for 1st: a lower-placed team one of them has not played yet decides nothing (no invented 0)', () => {
    // Stevenson and Hollister level on 6, never met. Stevenson beat Carmel (3rd); Hollister has not
    // played Carmel yet. Scoring that unplayed meeting as 0 would hand Stevenson the title.
    const rows = table(
      finals([
        ['stevenson', 'carmel', 2, 0], ['stevenson', 'salinas', 2, 0],
        ['hollister', 'greenfield', 2, 0], ['hollister', 'santa-catalina', 2, 0],
        ['carmel', 'monterey', 1, 0], ['carmel', 'salinas', 1, 1],
      ]),
      'pcal',
    );
    expect(row(rows, 'carmel').computed.place).toBe(3);
    expect(places(rows, ['stevenson', 'hollister'])).toEqual([1, 1]);
    for (const s of ['stevenson', 'hollister']) {
      expect(row(rows, s).tiebreak.resolvedBy, s).toBe('ccs-points');
      expect(row(rows, s).tiebreak.shared, s).toBe(true);
    }
  });

  it('a tie for 2nd: a higher-placed team one of them has not played yet decides nothing (no invented 0)', () => {
    // Stevenson champion. Hollister drew Stevenson; Carmel has not played Stevenson yet. Hollister's
    // 1 point vs Carmel's unplayed 0 must not take the second CCS automatic berth.
    const rows = table(
      finals([
        ['stevenson', 'monterey', 2, 0], ['stevenson', 'salinas', 2, 0], ['stevenson', 'greenfield', 2, 0],
        ['hollister', 'stevenson', 1, 1], ['hollister', 'greenfield', 2, 0],
        ['carmel', 'santa-catalina', 2, 0], ['carmel', 'monterey', 1, 1],
      ]),
      'pcal',
    );
    expect(row(rows, 'stevenson').computed.place).toBe(1);
    expect(places(rows, ['hollister', 'carmel'])).toEqual([2, 2]);
    for (const s of ['hollister', 'carmel']) {
      expect(row(rows, s).tiebreak.resolvedBy, s).toBe('ccs-points');
      expect(row(rows, s).tiebreak.shared, s).toBe(true);
      expect(outcomesFor(row(rows, s)), s).toEqual(['aq', 'no-aq-route']);
    }
  });

  it('an undecidable higher-placed comparison stops the chain: lower-placed teams do not decide it', () => {
    // Greenfield and Hollister level on 8 for 2nd. Against Carmel (1st) Greenfield has 1 meeting (a win)
    // and Hollister 2 (a win and a loss): 3 points each, on unequal meetings, so it cannot be compared
    // yet. Monterey (3rd, lower-placed) would separate them, but §23.3.3 reaches lower-placed teams only
    // once the higher-placed comparison is made, so they stay level.
    const rows = table(
      finals([
        ['greenfield', 'carmel', 1, 0],
        ['hollister', 'carmel', 1, 0], ['carmel', 'hollister', 1, 0],
        ['carmel', 'monterey', 1, 0], ['carmel', 'salinas', 1, 0], ['carmel', 'santa-catalina', 1, 0],
        ['carmel', 'stevenson', 1, 0],
        ['greenfield', 'hollister', 1, 1], ['hollister', 'greenfield', 1, 1],
        ['greenfield', 'monterey', 1, 0], ['monterey', 'hollister', 1, 0],
        ['hollister', 'santa-catalina', 1, 0],
      ]),
      'pcal',
    );
    expect(row(rows, 'carmel').computed.place).toBe(1);
    expect(row(rows, 'greenfield').computed.pts).toBe(8);
    expect(row(rows, 'hollister').computed.pts).toBe(8);
    expect(row(rows, 'monterey').computed.place).toBe(4);
    expect(places(rows, ['greenfield', 'hollister'])).toEqual([2, 2]);
    for (const s of ['greenfield', 'hollister']) {
      expect(row(rows, s).tiebreak.resolvedBy, s).toBe('ccs-points');
      expect(row(rows, s).tiebreak.shared, s).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- ladders, pairings, cross-check

// ---------------------------------------------------------------- EAL (points for the title, no tiebreak)

describe('EAL: 1 v 1 wins, points, and no tiebreak', () => {
  // A synthetic 16-game EAL season with the records MaxPreps showed on 2026-10-04 (PV 5-0-0, Chico 4-1-0,
  // Davis 3-2-0, Bella Vista and Lassen 2-4-0, Corning 0-5-0). Chico–Davis is level 1-1, flagged W/L: a
  // 1 v 1 win for Chico, as on 2026-09-28.
  const oneVOne = game({
    home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' },
  });
  const season: Game[] = [
    ...finals([
      ['pleasant-valley', 'chico', 2, 1], ['pleasant-valley', 'davis', 3, 0], ['pleasant-valley', 'bella-vista', 4, 0],
      ['pleasant-valley', 'lassen', 5, 0], ['pleasant-valley', 'corning', 6, 0],
      ['chico', 'bella-vista', 2, 0], ['chico', 'lassen', 3, 0], ['chico', 'corning', 4, 0],
      ['davis', 'bella-vista', 1, 0], ['davis', 'lassen', 2, 0], ['davis', 'corning', 3, 0],
      ['bella-vista', 'corning', 2, 1], ['lassen', 'corning', 1, 0],
      ['bella-vista', 'lassen', 1, 0], ['lassen', 'bella-vista', 2, 1],
    ]),
    oneVOne,
  ];
  const rows = table(season, 'eal');

  it('counts the 1 v 1 win for the flagged side, while its goals stay as recorded', () => {
    expect(oneVOne.decider).toBe('SO');
    expect(oneVOne.countsFor).toBe('eal');
    const chico = row(rows, 'chico').computed;
    const davis = row(rows, 'davis').computed;
    expect([chico.w, chico.l, chico.t, chico.pts]).toEqual([4, 1, 0, 12]);
    expect([davis.w, davis.l, davis.t, davis.pts]).toEqual([3, 2, 0, 9]);
    // 1-1: one goal for and one against on each side.
    expect([chico.gf, chico.ga]).toEqual([1 + 1 + 2 + 3 + 4, 2 + 1]);
    expect([davis.gf, davis.ga]).toEqual([1 + 1 + 2 + 3, 3 + 1]);
    expect(chico.last5[chico.last5.length - 1]).toBe('W');
    expect(davis.last5[davis.last5.length - 1]).toBe('L');
  });

  it('orders on 3/1/0 points and leaves a tie level: the Guidelines break none', () => {
    expect(rows.map((r) => [r.slug, r.computed.pts])).toEqual([
      ['pleasant-valley', 15], ['chico', 12], ['davis', 9], ['bella-vista', 6], ['lassen', 6], ['corning', 0],
    ]);
    expect(places(rows, ['pleasant-valley', 'chico', 'davis', 'bella-vista', 'lassen', 'corning'])).toEqual([
      1, 2, 3, 4, 4, 6,
    ]);
    const bv = row(rows, 'bella-vista');
    expect(bv.tiebreak.resolvedBy).toBe('no-rule');
    expect(bv.tiebreak.shared).toBe(true);
    expect(bv.tiebreak.tiedWith).toEqual([row(rows, 'lassen').teamId]);
    expect(bv.tiebreak.note).toContain(getLeague('eal').rules.citations.stages['no-rule']);
  });

  it('puts every placed team in the Super Regional ladder and draws no pairing', () => {
    for (const r of rows) expect(r.playoffStatus).toBe('tournament');
    expect(playoffStatusFor('eal', 6)).toBe('tournament');
    expect(playoffStatusFor('eal', 7)).toBe('below-line');
    expect(leaguePairings(computeStandings(season), season, 'eal')).toEqual([]);
  });

  it('cross-checks records only against MaxPreps, with the win-percentage cause', () => {
    const chicoId = row(rows, 'chico').teamId;
    const reported: ReportedRecord = {
      conferenceWins: 4, conferenceLosses: 1, conferenceTies: 0,
      overallWins: 4, overallLosses: 1, overallTies: 0,
      conferencePoints: 11, conferencePointsAgainst: 3, points: 0, pointsAgainst: 0,
      conferenceContestsPlayed: 5, overallContestsPlayed: 5,
      conferenceStandingPlacement: 2, conferenceWinningPercentage: 0.8, winningPercentage: 0.8,
      streak: 0, streakResult: null,
      homeWins: 0, homeLosses: 0, homeTies: 0, awayWins: 0, awayLosses: 0, awayTies: 0,
      neutralWins: 0, neutralLosses: 0, neutralTies: 0,
      modifiedOn: '2026-10-04T00:00:00',
    };
    expect(getLeague('eal').divisions[0].reportedTrust).toBe('records-only');
    const withReported = computeStandings([oneVOne], { reported: new Map([[chicoId, reported]]) });
    const check = buildCrossCheck(withReported).filter((r) => r.slug === 'chico');
    expect(check).toHaveLength(4);
    expect(check[0].knownCause).toBe(getLeague('eal').divisions[0].knownCause);
  });
});
