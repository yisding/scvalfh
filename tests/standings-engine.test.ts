/**
 * The stage interpreter beyond SCVAL (SPEC §5.3-§5.8): every new stage, both multi-team
 * procedures, MCAL's last tournament place, uncomputable stages, ladders, pairings, the
 * cross-check trust levels and missingOfficialResults. Synthetic tables only.
 */

import { describe, expect, it } from 'vitest';

import { getLeague } from '../lib/leagues';
import { sixthPlaceRule } from '../lib/postseason';
import {
  buildCrossCheck,
  computeStandings,
  crossCheckSkipReason,
  unevenGamesSentence,
  lastSpotOutcome,
  leaguePairings,
  missingOfficialResults,
  outcomesFor,
  playoffOutcomeLabel,
  playoffStatusFor,
  statusBadge,
  statusLegend,
} from '../lib/standings';
import type { Game, OfficialFixture, ReportedRecord, Standing } from '../lib/types';
import { game } from './game-builder';

type Spec = [home: string, away: string, hs: number, as: number];

let day = 0;
/** Final league games on distinct dates (Sep 1 onward), so order never depends on a date tie. */
function finals(specs: readonly Spec[]): Game[] {
  return specs.map(([home, away, hs, as]) => {
    day += 1;
    const d = new Date(Date.UTC(2026, 8, 1 + (day % 45)));
    const date = d.toISOString().slice(0, 10);
    return game({ home, away, hs, as, date });
  });
}

function table(games: readonly Game[], division: string): Standing[] {
  return computeStandings(games)
    .filter((r) => r.division === division)
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug));
}

function row(rows: readonly Standing[], slug: string): Standing {
  const found = rows.find((r) => r.slug === slug);
  if (!found) throw new Error(`no row for ${slug}`);
  return found;
}

const places = (rows: readonly Standing[], slugs: readonly string[]) =>
  slugs.map((s) => row(rows, s).computed.place);

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

describe('MCAL: lib/postseason sixthPlaceRule agrees with the engine (§5.4b ⇄ §6.2)', () => {
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

describe('ladders and pairings by league', () => {
  it('maps places to each league’s statuses', () => {
    expect(playoffStatusFor('mt-hamilton', 3)).toBe('aq');
    expect(playoffStatusFor('mt-hamilton', 4)).toBe('play-in');
    expect(playoffStatusFor('mt-hamilton', 5)).toBe('no-aq-route');
    expect(playoffStatusFor('santa-teresa', 1)).toBe('play-in');
    expect(playoffStatusFor('santa-teresa', 2)).toBe('no-aq-route');
    expect(playoffStatusFor('pcal', 2)).toBe('aq');
    expect(playoffStatusFor('pcal', 3)).toBe('no-aq-route');
    expect(playoffStatusFor('marin-county', 2)).toBe('bye');
    expect(playoffStatusFor('marin-county', 6)).toBe('tournament');
    expect(playoffStatusFor('marin-county', 7)).toBe('below-line');
  });

  it('resolves legends with the league’s first pairing date, and badges', () => {
    expect(statusLegend('mt-hamilton', 'play-in')).toBe(
      '4th place — plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(statusLegend('santa-teresa', 'play-in')).toBe(
      'Champion — hosts Mt. Hamilton #4 Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(statusLegend('marin-county', 'bye')).toBe('Places 1-2 — bye to the semifinals, Wed Oct 28');
    expect(statusBadge('santa-teresa', 'play-in')).toBe('Play-in host');
    expect(statusBadge('pcal', 'no-aq-route')).toBe('No AQ route');
    expect(playoffOutcomeLabel('pcal', [])).toBe('No automatic-berth route');
  });

  it('builds the BVAL play-in pairing and attaches the contest once it exists', () => {
    const games = [
      ...finals([
        ['live-oak', 'prospect', 2, 0],
        ['branham', 'gilroy', 1, 0], ['branham', 'leigh', 1, 0], ['branham', 'leland', 1, 0],
        ['gilroy', 'leigh', 1, 0], ['gilroy', 'leland', 1, 0], ['leigh', 'willow-glen', 1, 0],
        ['christopher', 'leland', 1, 0],
      ]),
    ];
    const rows = computeStandings(games);
    const before = leaguePairings(rows, games, 'bval');
    expect(before).toHaveLength(1);
    expect(before[0].seats[0].map((s) => s.slug)).toEqual(['live-oak']);
    // Branham 9, Gilroy 6, then Leigh and Christopher level on 3: BVAL's chain seeds one 3rd, one 4th.
    expect(before[0].seats[1].map((s) => s.slug)).toHaveLength(1);
    expect(before[0].host).toBe(0);
    expect(before[0].time).toBe('11:00');
    expect(before[0].game).toBeNull();
    const fourth = before[0].seats[1][0].slug;
    expect(rows.find((r) => r.slug === fourth)?.computed.place).toBe(4);
    const playIn = game({ home: 'live-oak', away: fourth, date: '2026-10-31' });
    expect(playIn.postseason?.kind).toBe('bval-play-in');
    const after = leaguePairings(rows, [...games, playIn], 'bval');
    expect(after[0].game?.contestId).toBe(playIn.contestId);
    expect(leaguePairings(rows, games, 'pcal')).toEqual([]);
    expect(leaguePairings(rows, games, 'mcal')).toEqual([]);
  });
});

describe('cross-check trust levels (§5.8)', () => {
  const reported = (over: Partial<ReportedRecord>): ReportedRecord => ({
    conferenceWins: 9, conferenceLosses: 9, conferenceTies: 9,
    overallWins: 9, overallLosses: 9, overallTies: 9,
    conferencePoints: 99, conferencePointsAgainst: 99, points: 0, pointsAgainst: 0,
    conferenceContestsPlayed: 0, overallContestsPlayed: 0,
    conferenceStandingPlacement: 9, conferenceWinningPercentage: 0.999, winningPercentage: 0,
    streak: 0, streakResult: null,
    homeWins: 0, homeLosses: 0, homeTies: 0, awayWins: 0, awayLosses: 0, awayTies: 0,
    neutralWins: 0, neutralLosses: 0, neutralTies: 0,
    modifiedOn: '2026-10-01T00:00:00', ...over,
  });

  it('compares six, four or one field by the division’s trust level, with its known cause', () => {
    const games = finals([
      ['saint-francis', 'fremont', 1, 0], ['live-oak', 'prospect', 1, 0],
      ['tamalpais', 'redwood', 1, 0], ['carmel', 'salinas', 1, 0],
    ]);
    const ids = ['saint-francis', 'live-oak', 'tamalpais', 'carmel'].map(
      (slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId,
    );
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, reported({})])) });
    const check = buildCrossCheck(rows);
    const fields = (slug: string) => check.filter((r) => r.slug === slug).map((r) => r.field);
    expect(fields('saint-francis')).toHaveLength(6); // full
    expect(fields('live-oak')).toEqual(['league record', 'overall record', 'league goals for', 'league goals against']);
    expect(fields('tamalpais')).toHaveLength(4); // records-only
    expect(fields('carmel')).toEqual(['league record']); // informational
    expect(check.find((r) => r.slug === 'saint-francis')?.knownCause).toBeUndefined();
    expect(check.find((r) => r.slug === 'live-oak')?.knownCause).toMatch(/leaves out Prospect/);
    expect(check.find((r) => r.slug === 'carmel')?.url).toMatch(/leagueid=50ac53cd/);
  });

  it('the place row cites each league’s own points rule (SCVAL Art. VI §2 verbatim; BVAL §6a)', () => {
    const games = finals([
      ['saint-francis', 'fremont', 1, 0], ['leigh', 'branham', 1, 0],
    ]);
    const ids = ['saint-francis', 'leigh'].map((slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId);
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, reported({})])) });
    const place = (slug: string) =>
      buildCrossCheck(rows).find((r) => r.slug === slug && r.field.startsWith('place'))?.field;
    expect(place('saint-francis')).toBe('place (we order on points, Art. VI §2; MaxPreps orders on win pct)');
    expect(place('leigh')).toBe('place (we order on points, BVAL by-laws §6a; MaxPreps orders on win pct)');
    expect(place('leigh')).not.toMatch(/Art\. VI/);
  });
});

describe('Southern California: ladders, the cross-check skip, uneven games (DESIGN-socal §2.1.7)', () => {
  it('maps every Sunset place to no-postseason, and San Diego 1st to tournament, 2nd and below to selection', () => {
    for (const place of [1, 5, 10, 99]) expect(playoffStatusFor('sunset', place)).toBe('no-postseason');
    for (const d of ['city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay']) {
      expect(playoffStatusFor(d, 1), d).toBe('tournament');
      expect(playoffStatusFor(d, 2), d).toBe('selection');
      expect(playoffStatusFor(d, 7), d).toBe('selection');
    }
    expect(statusBadge('sunset', 'no-postseason')).toBe('No playoffs');
    expect(statusBadge('palomar', 'selection')).toBe('Selection only');
    expect(playoffOutcomeLabel('valley', ['tournament', 'selection'])).toBe(
      'League champion: at least a play-in or no league route into the playoffs',
    );
    expect(statusLegend('sunset', 'no-postseason')).toBe('The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)');
  });

  it('places a Sunset or San Diego table on site points, and never says the rules require it', () => {
    const games = finals([['la-jolla', 'scripps-ranch', 2, 0], ['bonita', 'marina', 1, 0]]);
    const rows = computeStandings(games);
    const lj = rows.find((r) => r.slug === 'la-jolla')!;
    expect(lj.tiebreak.note).toBe(
      '3 points (3 per win, 1 per tie) — placed on points alone, no league document orders the table; this site orders it by its own 3-1-0 points.',
    );
    const idle = rows.find((r) => r.slug === 'mission-bay')!;
    expect(idle.tiebreak.note).toBe(
      'No division games counted for Mission Bay yet, so it is listed last; City Western order is the order of team points (no league document orders the table; this site orders it by its own 3-1-0 points).',
    );
    expect(rows.find((r) => r.slug === 'edison')!.tiebreak.note).toMatch(/^No league games counted for Edison yet, /);
    for (const r of rows.filter((x) => ['sunset', 'city-western'].includes(x.division))) {
      expect(r.tiebreak.note).not.toMatch(/rules require|results reported/);
    }
  });

  it('skips the MaxPreps comparison for Valley, which has no MaxPreps table, and says why', () => {
    expect(crossCheckSkipReason('valley')).toBe('MaxPreps publishes no table for this division');
    expect(crossCheckSkipReason('palomar')).toBeNull();
    expect(crossCheckSkipReason('de-anza')).toBeNull();
    const games = finals([['escondido', 'vista', 1, 0], ['del-norte', 'poway', 1, 0]]);
    const ids = ['escondido', 'del-norte'].map((slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId);
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, {
      conferenceWins: 9, conferenceLosses: 9, conferenceTies: 9, overallWins: 9, overallLosses: 9, overallTies: 9,
      conferencePoints: 99, conferencePointsAgainst: 99, points: 0, pointsAgainst: 0,
      conferenceContestsPlayed: 0, overallContestsPlayed: 0, conferenceStandingPlacement: 9,
      conferenceWinningPercentage: 0.999, winningPercentage: 0, streak: 0, streakResult: null,
      homeWins: 0, homeLosses: 0, homeTies: 0, awayWins: 0, awayLosses: 0, awayTies: 0,
      neutralWins: 0, neutralLosses: 0, neutralTies: 0, modifiedOn: '2026-10-01T00:00:00',
    }])) });
    const check = buildCrossCheck(rows);
    expect(check.filter((r) => r.slug === 'escondido')).toEqual([]);
    // Palomar is 'informational': its league record only, with its known cause and its MaxPreps page.
    const palomar = check.filter((r) => r.slug === 'del-norte');
    expect(palomar.map((r) => r.field)).toEqual(['league record']);
    expect(palomar[0].url).toMatch(/leagueid=e4a7e9c3/);
    expect(palomar[0].knownCause).toMatch(/Rancho Buena Vista/);
  });

  it('words an uneven games-played spread with "of N" for a fixed schedule and without it for the Sunset', () => {
    expect(unevenGamesSentence('mcal', { min: 9, max: 12, scheduled: 16 })).toBe(
      'Teams have played between 9 and 12 of 16 league games, so points favour teams that have played more.',
    );
    expect(unevenGamesSentence('sunset', { min: 2, max: 7, scheduled: null })).toBe(
      'Teams have played between 2 and 7 of the games MaxPreps marks as Sunset league games, and there is no fixed league schedule, so points favour teams that have played more.',
    );
    expect(unevenGamesSentence('sunset', { min: 2, max: 3, scheduled: null })).toBeNull();
    expect(unevenGamesSentence('palomar', { min: 4, max: 5, scheduled: 12 })).toBeNull();
  });
});

describe('missingOfficialResults (§5.2)', () => {
  const fixture = (over: Partial<OfficialFixture>): OfficialFixture => ({
    id: 'santa-teresa:2026-09-24:prospect@del-mar',
    league: 'bval',
    division: 'santa-teresa',
    dateKey: '2026-09-24',
    time: null,
    awayName: 'Prospect',
    homeName: 'Del Mar',
    awaySlug: 'prospect',
    homeSlug: 'del-mar',
    source: 'bval-docx',
    ...over,
  });

  it('lists past unmatched fixtures and matched contests with no result; postponed separately', () => {
    const pending = game({ home: 'live-oak', away: 'westmont', date: '2026-09-25', status: 'score-pending' });
    const postponed = game({ home: 'sobrato', away: 'silver-creek', date: '2026-09-26', status: 'postponed' });
    const finalGame = game({ home: 'live-oak', away: 'prospect', hs: 1, as: 0, date: '2026-09-23' });
    const future = game({ home: 'del-mar', away: 'westmont', date: '2026-10-05' });
    const other = game({ home: 'leigh', away: 'leland', date: '2026-09-20' });
    const rows = missingOfficialResults(
      [pending, postponed, finalGame, future, other],
      [
        fixture({}),
        fixture({ id: 'santa-teresa:2026-10-09:x@y', dateKey: '2026-10-09' }),
        fixture({ id: 'mt-hamilton:2026-09-01:a@b', division: 'mt-hamilton' }),
      ],
      'santa-teresa',
      '2026-10-02',
    );
    expect(rows.map((r) => [r.kind, r.dateKey])).toEqual([
      ['missing', '2026-09-24'],
      ['missing', '2026-09-25'],
      ['postponed', '2026-09-26'],
    ]);
    expect(rows[0].game).toBeNull();
    expect(rows[1].game?.contestId).toBe(pending.contestId);
    expect(rows[1].homeSlug).toBe('live-oak');
    // 'today' itself is not in the past.
    expect(missingOfficialResults([pending], [], 'santa-teresa', '2026-09-25')).toEqual([]);
  });

  it('is the same function for every league’s config (SCVAL included)', () => {
    expect(getLeague('scval').divisions.map((d) => missingOfficialResults([], [], d.id, '2026-12-01'))).toEqual([[], []]);
  });
});
