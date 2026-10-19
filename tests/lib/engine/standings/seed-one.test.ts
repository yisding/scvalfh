/**
 * lib/engine/standings/seed-one.ts: the seed-one-restart procedure (BVAL, MCAL; SPEC §5.4) and MCAL's last
 * tournament place (SPEC §5.4b), with lib/engine/postseason's sixthPlaceRule held to the same tables.
 */

import { describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import { sixthPlaceRule } from '@/lib/engine/postseason';
import { computeStandings, lastSpotOutcome, outcomesFor, playoffOutcomeLabel } from '@/lib/engine/standings';
import type { Game } from '@/lib/model/game';
import { game } from '@/tests/support/game-builder';
import { type Spec, finals, table, row, places } from '@/tests/support/standings';

// ---------------------------------------------------------------- BVAL (seed-one-restart)

describe('BVAL: seed-one-restart', () => {
  it('a three-way mini-league (3-1-0 among the tied teams) seeds one team, then restarts', () => {
    // Three level on 6: A beat B and C; B and C split. A out by head-to-head; B–C restart.
    const rows = table(
      finals([
        ['branham', 'christopher', 2, 0], ['branham', 'gilroy', 2, 0],
        ['christopher', 'gilroy', 3, 0], ['gilroy', 'christopher', 1, 0],
        ['christopher', 'leigh', 1, 0], ['gilroy', 'leigh', 1, 0], ['gilroy', 'leland', 0, 0],
        ['leland', 'branham', 0, 0], ['branham', 'willow-glen', 0, 1], ['christopher', 'willow-glen', 2, 2],
      ]),
      'mt-hamilton',
    );
    expect(places(rows, ['branham', 'christopher', 'gilroy']).every((p) => p <= 3)).toBe(true);
    for (const s of ['branham', 'christopher', 'gilroy']) expect(row(rows, s).computed.pts, s).toBe(7);
    expect(row(rows, 'branham').computed.place).toBe(1);
    expect(row(rows, 'branham').tiebreak.resolvedBy).toBe('head-to-head');
    expect(row(rows, 'branham').tiebreak.note).toMatch(/§6b \(head-to-head/);
    // Christopher–Gilroy: 3 points each head to head (equal), equal division wins; goal diff +2 vs −2.
    expect(places(rows, ['christopher', 'gilroy'])).toEqual([2, 3]);
    expect(row(rows, 'christopher').tiebreak.resolvedBy).toBe('h2h-goal-diff');
  });

  it('division-goals-against (§6e) separates teams level on every head-to-head step', () => {
    const rows = table(
      finals([
        ['leigh', 'leland', 1, 0], ['leland', 'leigh', 1, 0],
        ['leigh', 'gilroy', 2, 2], ['leland', 'branham', 0, 0],
      ]),
      'mt-hamilton',
    );
    expect(row(rows, 'leigh').computed.pts).toBe(4);
    expect(row(rows, 'leland').computed.pts).toBe(4);
    expect(places(rows, ['leland', 'leigh'])).toEqual([1, 2]);
    expect(row(rows, 'leland').tiebreak.resolvedBy).toBe('division-goals-against');
    expect(row(rows, 'leland').tiebreak.note).toMatch(/§6e \(fewest goals allowed/);
    // Gilroy and Branham never met: head-to-head is skipped, not scored 0-0.
    expect(places(rows, ['branham', 'gilroy'])).toEqual([3, 4]);
    expect(row(rows, 'branham').tiebreak.resolvedBy).toBe('division-goals-against');
  });

  it('an unresolvable BVAL tie stays level on the §6f coin flip', () => {
    const rows = table(
      finals([
        ['del-mar', 'live-oak', 2, 0], ['live-oak', 'prospect', 2, 0], ['prospect', 'del-mar', 2, 0],
      ]),
      'santa-teresa',
    );
    for (const s of ['del-mar', 'live-oak', 'prospect']) {
      const r = row(rows, s);
      expect(r.computed.place).toBe(1);
      expect(r.tiebreak.shared).toBe(true);
      expect(r.tiebreak.resolvedBy).toBe('coin-flip');
      expect(r.tiebreak.note).toMatch(/§6f \(coin flip/);
    }
    // A shared 1st in Santa Teresa straddles the play-in host rung.
    expect(outcomesFor(row(rows, 'del-mar'))).toEqual(['play-in', 'no-aq-route']);
  });
});

// ---------------------------------------------------------------- MCAL

/** Top five strictly ordered (21, 18, 15, 12, 9); MA and CSH take their losses. */
const MCAL_TOP: Spec[] = [
  ['archie-williams', 'redwood', 1, 0], ['archie-williams', 'tamalpais', 1, 0],
  ['archie-williams', 'berkeley', 1, 0], ['archie-williams', 'lick-wilmerding', 1, 0],
  ['redwood', 'tamalpais', 1, 0], ['redwood', 'berkeley', 1, 0], ['redwood', 'lick-wilmerding', 1, 0],
  ['tamalpais', 'berkeley', 1, 0], ['tamalpais', 'lick-wilmerding', 1, 0],
  ['berkeley', 'lick-wilmerding', 1, 0],
  ...(['archie-williams', 'redwood', 'tamalpais', 'berkeley', 'lick-wilmerding'] as const).flatMap(
    (t): Spec[] => [[t, 'marin-academy', 2, 0], ['marin-academy', t, 0, 2], [t, 'convent-sacred-heart', 1, 0]],
  ),
];

describe('MCAL: the chain (h2h win pct, record above the tie, draw number)', () => {
  it('Berkeley above Archie Williams: 5 points each, Berkeley won their meeting 3-1', () => {
    const rows = table(
      [
        game({ home: 'berkeley', away: 'archie-williams', hs: 3, as: 1, date: '2026-09-22' }),
        ...finals([
          ['berkeley', 'redwood', 1, 1], ['tamalpais', 'berkeley', 0, 0],
          ['archie-williams', 'marin-academy', 2, 0], ['archie-williams', 'lick-wilmerding', 1, 1],
          ['university-sf', 'archie-williams', 2, 2],
        ]),
      ],
      'marin-county',
    );
    expect(row(rows, 'berkeley').computed.pts).toBe(5);
    expect(row(rows, 'archie-williams').computed.pts).toBe(5);
    expect(places(rows, ['berkeley', 'archie-williams'])).toEqual([1, 2]);
    expect(row(rows, 'berkeley').tiebreak.resolvedBy).toBe('h2h-win-pct');
    expect(row(rows, 'berkeley').tiebreak.note).toMatch(/step 1 \(head-to-head winning percentage\)/);
  });

  it('skips h2h-win-pct and record-above-tie when they cannot apply; the draw number always resolves', () => {
    // Redwood (draw 2) and Tamalpais (draw 3) level for 1st, never met.
    const rows = table(
      finals([['redwood', 'marin-academy', 1, 0], ['tamalpais', 'convent-sacred-heart', 1, 0]]),
      'marin-county',
    );
    expect(places(rows, ['redwood', 'tamalpais'])).toEqual([1, 2]);
    expect(row(rows, 'redwood').tiebreak.resolvedBy).toBe('draw-number');
    expect(row(rows, 'redwood').tiebreak.shared).toBe(false);
  });

  it('record against the teams above the tie (criterion 2)', () => {
    // AW alone on top. Redwood and Tamalpais level, split their meetings; Redwood took a point off AW.
    const rows = table(
      finals([
        ['archie-williams', 'redwood', 1, 1], ['archie-williams', 'tamalpais', 1, 0],
        ['archie-williams', 'marin-academy', 5, 0], ['archie-williams', 'berkeley', 1, 0],
        ['redwood', 'tamalpais', 1, 0], ['tamalpais', 'redwood', 1, 0],
        ['tamalpais', 'university-sf', 1, 1],
      ]),
      'marin-county',
    );
    expect(row(rows, 'redwood').computed.pts).toBe(4);
    expect(row(rows, 'tamalpais').computed.pts).toBe(4);
    expect(places(rows, ['redwood', 'tamalpais'])).toEqual([2, 3]);
    expect(row(rows, 'redwood').tiebreak.resolvedBy).toBe('record-above-tie');
  });
});

describe('MCAL: the last tournament place (§5.4b)', () => {
  it('a pair at 6/7 that split 1W-1T shares 6th, resolvedBy play-in', () => {
    const rows = table(
      finals([
        ...MCAL_TOP,
        ['university-sf', 'marin-catholic', 2, 1], ['marin-catholic', 'university-sf', 1, 1],
        ['marin-catholic', 'convent-sacred-heart', 1, 0],
      ]),
      'marin-county',
    );
    expect(row(rows, 'lick-wilmerding').computed.place).toBe(5);
    const u = row(rows, 'university-sf');
    const mc = row(rows, 'marin-catholic');
    expect(u.computed.pts).toBe(4);
    expect(mc.computed.pts).toBe(4);
    expect([u.computed.place, mc.computed.place]).toEqual([6, 6]);
    for (const r of [u, mc]) {
      expect(r.tiebreak.resolvedBy).toBe('play-in');
      expect(r.tiebreak.shared).toBe(true);
      expect(r.tiebreak.note).toMatch(/for the last tournament place — MCAL Tie-Breaking Criteria \(rev\. 3\/26\) \(final play-off spot/);
      expect(r.tiebreak.note).toMatch(/We show them level\.$/);
    }
    expect(outcomesFor(u)).toEqual(['tournament', 'below-line']);
    expect(playoffOutcomeLabel('marin-county', outcomesFor(u))).toBe(
      'MCAL tournament or below the tournament line — a play-in on Fri Oct 23 decides it (MCAL Tie-Breaking Criteria)',
    );
    expect(row(rows, 'convent-sacred-heart').computed.place).toBe(8);
  });

  it('a 2-0 sweep separates the pair: no play-in', () => {
    const rows = table(
      finals([
        ...MCAL_TOP,
        ['university-sf', 'marin-catholic', 2, 1], ['marin-catholic', 'university-sf', 0, 1],
        ['marin-catholic', 'convent-sacred-heart', 1, 0], ['convent-sacred-heart', 'marin-catholic', 0, 1],
      ]),
      'marin-county',
    );
    const u = row(rows, 'university-sf');
    const mc = row(rows, 'marin-catholic');
    expect(u.computed.pts).toBe(6);
    expect(mc.computed.pts).toBe(6);
    expect([u.computed.place, mc.computed.place]).toEqual([6, 7]);
    expect(u.tiebreak.resolvedBy).toBe('h2h-win-pct');
    expect(u.tiebreak.shared).toBe(false);
    expect(u.playoffStatus).toBe('tournament');
    expect(mc.playoffStatus).toBe('below-line');
  });

  it('a three-way tie for 5-7: the lowest draw number is 5th, the other two share 6th', () => {
    const top4: Spec[] = [
      ['archie-williams', 'redwood', 1, 0], ['archie-williams', 'tamalpais', 1, 0], ['archie-williams', 'berkeley', 1, 0],
      ['redwood', 'tamalpais', 1, 0], ['redwood', 'berkeley', 1, 0], ['tamalpais', 'berkeley', 1, 0],
      ...(['archie-williams', 'redwood', 'tamalpais', 'berkeley'] as const).flatMap(
        (t): Spec[] => [[t, 'marin-academy', 2, 0], ['marin-academy', t, 0, 2], [t, 'convent-sacred-heart', 1, 0]],
      ),
    ];
    const rows = table(
      finals([
        ...top4,
        ['lick-wilmerding', 'university-sf', 1, 0], ['university-sf', 'marin-catholic', 1, 0],
        ['marin-catholic', 'lick-wilmerding', 1, 0],
      ]),
      'marin-county',
    );
    for (const s of ['lick-wilmerding', 'university-sf', 'marin-catholic']) expect(row(rows, s).computed.pts, s).toBe(3);
    expect(row(rows, 'berkeley').computed.place).toBe(4);
    // Lick-Wilmerding has draw number 5, University 6, Marin Catholic 7.
    expect(row(rows, 'lick-wilmerding').computed.place).toBe(5);
    expect(row(rows, 'lick-wilmerding').tiebreak.resolvedBy).toBe('draw-number');
    expect(places(rows, ['university-sf', 'marin-catholic'])).toEqual([6, 6]);
    expect(row(rows, 'university-sf').tiebreak.resolvedBy).toBe('play-in');
  });

  it('a three-way tie for 6-8: criteria 1-2 then the draw number pick the play-in pair; the third is 8th', () => {
    const rows = table(
      finals([
        ...MCAL_TOP,
        ['university-sf', 'marin-catholic', 1, 0], ['marin-catholic', 'convent-sacred-heart', 1, 0],
        ['convent-sacred-heart', 'university-sf', 1, 0],
      ]),
      'marin-county',
    );
    for (const s of ['university-sf', 'marin-catholic', 'convent-sacred-heart']) {
      expect(row(rows, s).computed.pts, s).toBe(3);
    }
    // All 1-1 among themselves; none has a game against the five above except CSH (lost to all) —
    // so record-above-tie is skipped; draw numbers put University (6) first, then the criteria start
    // over between Marin Catholic and Convent: Marin Catholic won their meeting.
    expect(places(rows, ['university-sf', 'marin-catholic'])).toEqual([6, 6]);
    expect(row(rows, 'university-sf').tiebreak.resolvedBy).toBe('play-in');
    expect(row(rows, 'marin-catholic').tiebreak.resolvedBy).toBe('play-in');
    expect(row(rows, 'convent-sacred-heart').computed.place).toBe(8);
    expect(row(rows, 'convent-sacred-heart').tiebreak.shared).toBe(false);
    expect(row(rows, 'marin-academy').computed.place).toBe(9);
  });

  /**
   * Four level on 9 for 5th-8th. Head-to-head among the four is a cycle (LW > MA > CSH > LW) and all
   * three beat Berkeley, so criterion 1 leaves LW, MA and CSH level. That remainder is NOT the
   * "three-way tie for 5 & 6" (three teams tied on points): the criteria keep going among it ("The
   * above criteria will be used to break the tie, seeding one team"), and criterion 2 — MA beat
   * Tamalpais, LW and CSH lost to teams above — seeds Marin Academy 5th. LW, CSH and Berkeley are then
   * three level at 6th: CSH (2-0 among them) and LW (beat Berkeley) play in.
   */
  const fourWayFiveToEight = (): Game[] =>
    finals([
      ['marin-academy', 'lick-wilmerding', 0, 1], ['convent-sacred-heart', 'marin-academy', 0, 1],
      ['lick-wilmerding', 'convent-sacred-heart', 0, 1],
      ['berkeley', 'lick-wilmerding', 0, 1], ['berkeley', 'marin-academy', 0, 1], ['berkeley', 'convent-sacred-heart', 0, 1],
      ['tamalpais', 'marin-academy', 0, 1], ['university-sf', 'lick-wilmerding', 1, 0], ['redwood', 'convent-sacred-heart', 1, 0],
      ['archie-williams', 'lick-wilmerding', 0, 1], ['archie-williams', 'convent-sacred-heart', 0, 1],
      ['archie-williams', 'marin-academy', 1, 0],
      ['archie-williams', 'berkeley', 0, 1], ['berkeley', 'archie-williams', 1, 0], ['marin-catholic', 'berkeley', 0, 1],
      ['tamalpais', 'archie-williams', 5, 0], ['archie-williams', 'tamalpais', 0, 5], ['tamalpais', 'redwood', 2, 0],
      ['tamalpais', 'university-sf', 2, 0],
      ['university-sf', 'archie-williams', 5, 0], ['archie-williams', 'university-sf', 0, 5],
      ['university-sf', 'marin-catholic', 2, 0], ['university-sf', 'redwood', 2, 0],
      ['redwood', 'archie-williams', 5, 0], ['archie-williams', 'redwood', 0, 5], ['redwood', 'marin-catholic', 2, 0],
      ['redwood', 'university-sf', 2, 0],
      ['marin-catholic', 'archie-williams', 5, 0], ['archie-williams', 'marin-catholic', 0, 5],
      ['marin-catholic', 'tamalpais', 2, 0], ['marin-catholic', 'redwood', 2, 0], ['marin-catholic', 'university-sf', 2, 0],
    ]);

  it('a four-way tie for 5-8 keeps applying the criteria to a three-team remainder (no draw-number shortcut)', () => {
    const rows = table(fourWayFiveToEight(), 'marin-county');
    for (const s of ['lick-wilmerding', 'marin-academy', 'convent-sacred-heart', 'berkeley']) {
      expect(row(rows, s).computed.pts, s).toBe(9);
    }
    expect(row(rows, 'tamalpais').computed.place).toBe(4);
    const ma = row(rows, 'marin-academy');
    expect(ma.computed.place).toBe(5);
    expect(ma.tiebreak.resolvedBy).toBe('record-above-tie');
    expect(ma.tiebreak.shared).toBe(false);
    expect(places(rows, ['convent-sacred-heart', 'lick-wilmerding'])).toEqual([6, 6]);
    for (const s of ['convent-sacred-heart', 'lick-wilmerding']) {
      expect(row(rows, s).tiebreak.resolvedBy, s).toBe('play-in');
      expect(row(rows, s).tiebreak.shared, s).toBe(true);
    }
    expect(row(rows, 'berkeley').computed.place).toBe(8);
  });

  /**
   * Four level on 9 for 6th-9th. Criterion 1 leaves University, Marin Catholic and Convent level (a
   * cycle; all beat Marin Academy); criterion 2 picks Marin Catholic (1-0 against the teams above)
   * as the first play-in team; the criteria start over among the other three for the second: Convent.
   */
  const fourWaySixToNine = (): Game[] => {
    const top = ['archie-williams', 'redwood', 'tamalpais', 'berkeley', 'lick-wilmerding'];
    const specs: Spec[] = [];
    for (const a of top) for (const b of top) if (a !== b) specs.push([a, b, 1, 1]);
    for (const t of top) specs.push([t, 'marin-academy', 2, 0]);
    specs.push(
      ['university-sf', 'marin-catholic', 1, 0], ['marin-catholic', 'convent-sacred-heart', 1, 0],
      ['convent-sacred-heart', 'university-sf', 1, 0],
      ['university-sf', 'marin-academy', 1, 0], ['marin-catholic', 'marin-academy', 1, 0],
      ['convent-sacred-heart', 'marin-academy', 1, 0],
      ['marin-academy', 'archie-williams', 1, 0], ['marin-academy', 'redwood', 1, 0], ['marin-academy', 'tamalpais', 1, 0],
      ['tamalpais', 'university-sf', 1, 1], ['berkeley', 'university-sf', 1, 1], ['lick-wilmerding', 'university-sf', 1, 1],
      ['marin-catholic', 'tamalpais', 1, 0],
      ['archie-williams', 'convent-sacred-heart', 1, 0], ['convent-sacred-heart', 'redwood', 1, 0],
    );
    return finals(specs);
  };

  it('a four-way tie for 6-9: the play-in pair comes from criteria 1-2 among the remainder; the rest follow', () => {
    const rows = table(fourWaySixToNine(), 'marin-county');
    for (const s of ['university-sf', 'marin-catholic', 'convent-sacred-heart', 'marin-academy']) {
      expect(row(rows, s).computed.pts, s).toBe(9);
    }
    expect(places(rows, ['convent-sacred-heart', 'marin-catholic'])).toEqual([6, 6]);
    expect(row(rows, 'marin-catholic').tiebreak.resolvedBy).toBe('play-in');
    expect(places(rows, ['university-sf', 'marin-academy'])).toEqual([8, 9]);
  });

  it('sixthPlaceRule agrees with the table in both four-way cases', () => {
    const mcal = getLeague('mcal');
    const a = fourWayFiveToEight();
    const da = sixthPlaceRule(computeStandings(a), a, mcal);
    expect([...da.contenders].sort()).toEqual(['convent-sacred-heart', 'lick-wilmerding']);
    expect(da.seats).toEqual([6]);
    // Two teams for one play-in place: the higher draw number hosts (Convent 8, Lick-Wilmerding 5).
    expect(da.host).toBe('convent-sacred-heart');
    const b = fourWaySixToNine();
    const db = sixthPlaceRule(computeStandings(b), b, mcal);
    expect([...db.contenders].sort()).toEqual(['convent-sacred-heart', 'marin-catholic']);
    expect(db.host).toBe('convent-sacred-heart');
  });

  it('lastSpotOutcome: the play-in pair and the teams level at 6th, and null for a league without a tournament', () => {
    const games = fourWayFiveToEight();
    const rows = computeStandings(games);
    const slugOf = (id: string): string => rows.find((r) => r.teamId === id)?.slug ?? id;
    const out = lastSpotOutcome(rows, games, getLeague('mcal'));
    if (out?.kind !== 'play-in') throw new Error(`expected a play-in, got ${JSON.stringify(out)}`);
    expect(out.pair.map(slugOf).sort()).toEqual(['convent-sacred-heart', 'lick-wilmerding']);
    expect(out.group.map(slugOf).sort()).toEqual(['berkeley', 'convent-sacred-heart', 'lick-wilmerding']);
    expect(out.fifth).toBeNull();
    expect(lastSpotOutcome(rows, games, getLeague('scval'))).toBeNull();
  });
});

describe('MCAL: lib/engine/postseason sixthPlaceRule agrees with the engine (§5.4b ⇄ §6.2)', () => {
  // sixthPlaceRule takes its play-in pair from the engine's lastSpotOutcome; this keeps the bracket's
  // play-in pair and the table's shared 6th (resolvedBy 'play-in') in lockstep over many random seasons.
  const MCAL_SLUGS = Object.keys(getLeague('mcal').rules.drawNumbers ?? {});
  const mcal = getLeague('mcal');

  function rng(seed: number): () => number {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 0x100000000;
    };
  }

  function season(seed: number): Game[] {
    const r = rng(seed);
    const out: Game[] = [];
    let n = 0;
    for (const home of MCAL_SLUGS) {
      for (const away of MCAL_SLUGS) {
        if (home === away) continue;
        n += 1;
        const date = new Date(Date.UTC(2026, 8, 1 + (n % 50))).toISOString().slice(0, 10);
        const roll = r();
        if (roll < 0.08) {
          out.push(game({ home, away, date }));
          continue;
        }
        // Ties are common enough to build crowded points buckets.
        const outcome = r();
        const [hs, as] = outcome < 0.4 ? [1, 0] : outcome < 0.8 ? [0, 1] : [1, 1];
        out.push(game({ home, away, hs, as, date }));
      }
    }
    return out;
  }

  it('the play-in contenders are exactly the rows sharing 6th by play-in, in 1500 random seasons', () => {
    let playIns = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const games = season(seed);
      const rows = computeStandings(games);
      const own = rows.filter((x) => x.division === 'marin-county');
      const decision = sixthPlaceRule(rows, games, mcal);
      const tableSlugs = own.filter((x) => x.tiebreak.resolvedBy === 'play-in').map((x) => x.slug).sort();
      if (decision.playInNeeded === 'no') {
        expect(tableSlugs, `seed ${seed}`).toEqual([]);
        continue;
      }
      playIns += 1;
      expect([...decision.contenders].sort(), `seed ${seed}`).toEqual(tableSlugs);
      for (const x of own.filter((y) => y.tiebreak.resolvedBy === 'play-in')) {
        expect(x.computed.place, `seed ${seed} ${x.slug}`).toBe(decision.seats[decision.seats.length - 1]);
        expect(x.tiebreak.shared, `seed ${seed} ${x.slug}`).toBe(true);
      }
    }
    // The generator must actually exercise the play-in branch.
    expect(playIns).toBeGreaterThan(50);
  });
});
