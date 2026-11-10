/**
 * The standings engine under the basketball build (SCVAL_SPORT=basketball): a table ordered on the league record
 * (LeagueRules.orderBy 'win-pct', SCVAL Basketball By-Laws Article VI §1), the By-Laws' tiebreak walk
 * ('head-to-head', then 'record-vs-placed', then the 'coaches-vote' terminal: Article VI §1.1) and the notes the
 * rows carry. Every other engine test runs on field hockey (the default); this file sets the switch before
 * importing anything that reads it, as tests/soccer.test.ts does.
 *
 * The games are synthetic De Anza finals (Gunn, Homestead, Los Gatos, Lynbrook, Milpitas, Mountain View,
 * Palo Alto), built with tests/game-builder.ts so each carries the official stamp that makes it count.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game, Standing } from '../lib/types';

type Modules = {
  engine: typeof import('../lib/standings/engine');
  builder: typeof import('./game-builder');
  order: typeof import('../lib/standings/order');
  leagues: typeof import('../lib/leagues');
  format: typeof import('../lib/format');
  ccs: typeof import('../lib/sources/ccs');
  sections: typeof import('../lib/league-config/sections');
};

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'basketball');
  vi.resetModules();
  m = {
    engine: await import('../lib/standings/engine'),
    builder: await import('./game-builder'),
    order: await import('../lib/standings/order'),
    leagues: await import('../lib/leagues'),
    format: await import('../lib/format'),
    ccs: await import('../lib/sources/ccs'),
    sections: await import('../lib/league-config/sections'),
  };
});

let day = 0;
/** `winner` beat `loser` (at the winner's gym), each game on its own January day. */
function win(winner: string, loser: string, score: [number, number] = [60, 50]): Game {
  day += 1;
  return m.builder.game({ home: winner, away: loser, hs: score[0], as: score[1], date: `2027-01-${String((day % 28) + 2).padStart(2, '0')}` });
}

/** The De Anza rows over `games`, in table order, as [slug, place, resolvedBy, shared]. */
function table(games: Game[]): Standing[] {
  return m.engine.sortStandings(m.engine.computeStandings(games).filter((s) => s.division === 'de-anza'));
}
const row = (rows: Standing[], slug: string): Standing => {
  const found = rows.find((r) => r.slug === slug);
  if (!found) throw new Error(`no row for ${slug}`);
  return found;
};

describe('basketball: the table is ordered on the league record', () => {
  it('a game builds as a counted De Anza final, and the record prints W-L', () => {
    const g = win('gunn', 'milpitas');
    expect(g.countsFor).toBe('de-anza');
    expect(m.format.SPORT_HAS_NO_TIES).toBe(true);
    expect(m.format.recordString({ w: 3, l: 1, t: 0 })).toBe('3-1');
    expect(m.format.recordWords({ w: 3, l: 1, t: 0 })).toBe('3 wins, 1 loss');
    // A tie a source records anyway is never hidden.
    expect(m.format.recordString({ w: 3, l: 1, t: 1 })).toBe('3-1-1');
  });

  it('2-0 is ahead of 2-1 though both have two wins (the same `pts`), and the note cites the record', () => {
    const rows = table([
      win('gunn', 'milpitas'),
      win('gunn', 'mountain-view'),
      win('homestead', 'mountain-view'),
      win('homestead', 'mountain-view'),
      win('milpitas', 'homestead'),
    ]);
    const gunn = row(rows, 'gunn');
    const homestead = row(rows, 'homestead');
    expect(gunn.computed.pts).toBe(homestead.computed.pts);
    expect(rows.slice(0, 4).map((r) => [r.slug, r.computed.place])).toEqual([
      ['gunn', 1],
      ['homestead', 2],
      ['milpitas', 3],
      ['mountain-view', 4],
    ]);
    expect(gunn.tiebreak.resolvedBy).toBe('points');
    expect(gunn.tiebreak.note).toBe(
      '2-0 in division games (1.000) — placed on its league record alone, SCVAL Basketball By-Laws (approved 3.23.23), Article VI §1 (a team’s league record determines its finish).',
    );
    // Teams with no result are listed last, with the order named as the league record.
    expect(row(rows, 'palo-alto').tiebreak.note).toMatch(/^No division results reported for Palo Alto, so it is listed last; De Anza order is the order of league record \(/);
  });

  it('the order helpers print PCT for the league and a winning percentage for a row', () => {
    const { rules } = m.leagues.getLeague('scval');
    const { order } = m;
    expect(order.ordersByRecord(rules)).toBe(true);
    expect(order.orderHead(rules)).toBe('PCT');
    expect(order.orderNoun(rules)).toBe('league record');
    const r = { pts: 7, winPct: 0.875, gp: 8 };
    expect(order.orderValue(rules, r)).toBe('.875');
    expect(order.orderValueShort(rules, r)).toBe('.875');
    expect(order.orderValueWords(rules, r)).toBe('winning percentage .875');
    expect(order.levelInOrder(rules, { pts: 3, winPct: 1, gp: 3 }, { pts: 3, winPct: 0.75, gp: 4 })).toBe(false);
    expect(order.compareInOrder(rules, { pts: 3, winPct: 1, gp: 3 }, { pts: 4, winPct: 0.8, gp: 5 })).toBeLessThan(0);
  });
});

describe('basketball: teams level on their record (Article VI §1.1)', () => {
  it('two teams: head-to-head separates them', () => {
    const rows = table([
      win('gunn', 'homestead'),
      win('gunn', 'mountain-view'),
      win('milpitas', 'gunn'),
      win('homestead', 'mountain-view'),
      win('homestead', 'milpitas'),
    ]);
    const gunn = row(rows, 'gunn');
    const homestead = row(rows, 'homestead');
    expect([gunn.computed.place, homestead.computed.place]).toEqual([1, 2]);
    expect(gunn.tiebreak.resolvedBy).toBe('head-to-head');
    expect(gunn.tiebreak.shared).toBe(false);
    expect(gunn.tiebreak.note).toBe('Level at 2-1 (.667); separated by Article VI §1.1 (head-to-head competition).');
  });

  it('three teams: head-to-head partitions them 2-0, 1-1, 0-2', () => {
    const rows = table([
      win('gunn', 'homestead'),
      win('gunn', 'los-gatos'),
      win('homestead', 'los-gatos'),
      win('lynbrook', 'gunn'),
      win('lynbrook', 'gunn'),
      win('lynbrook', 'homestead'),
      win('homestead', 'mountain-view'),
      win('los-gatos', 'mountain-view'),
      win('los-gatos', 'mountain-view'),
    ]);
    expect(rows.slice(0, 5).map((r) => [r.slug, r.computed.place, r.tiebreak.resolvedBy])).toEqual([
      ['lynbrook', 1, 'points'],
      ['gunn', 2, 'head-to-head'],
      ['homestead', 3, 'head-to-head'],
      ['los-gatos', 4, 'head-to-head'],
      ['mountain-view', 5, 'points'],
    ]);
  });

  it('a split head-to-head goes to the record against the highest-placed opponent', () => {
    const rows = table([
      win('gunn', 'homestead'),
      win('homestead', 'gunn'),
      win('gunn', 'lynbrook'),
      win('lynbrook', 'homestead'),
      win('homestead', 'milpitas'),
      win('milpitas', 'gunn'),
      win('lynbrook', 'milpitas'),
      win('lynbrook', 'mountain-view'),
      win('lynbrook', 'mountain-view'),
      win('lynbrook', 'palo-alto'),
    ]);
    const gunn = row(rows, 'gunn');
    const homestead = row(rows, 'homestead');
    expect(row(rows, 'lynbrook').computed.place).toBe(1);
    expect([gunn.computed.place, homestead.computed.place]).toEqual([2, 3]);
    expect(gunn.tiebreak.resolvedBy).toBe('record-vs-placed');
    expect(gunn.tiebreak.note).toBe(
      'Level at 2-2 (.500); separated by Article VI §1.1 (record against the highest-placed opponent in the division, then the next, in descending order).',
    );
  });

  it('level against the teams above, the walk goes on to the teams below, in order', () => {
    const rows = table([
      win('gunn', 'homestead'),
      win('homestead', 'gunn'),
      win('lynbrook', 'gunn'),
      win('lynbrook', 'homestead'),
      win('gunn', 'palo-alto'),
      win('gunn', 'palo-alto'),
      win('homestead', 'palo-alto'),
      win('homestead', 'palo-alto'),
      // Milpitas (2-3) is the first team below the tie: Gunn beat it, Homestead lost to it.
      win('gunn', 'milpitas'),
      win('milpitas', 'homestead'),
      win('homestead', 'mountain-view'),
      win('mountain-view', 'gunn'),
      win('milpitas', 'mountain-view'),
      win('lynbrook', 'milpitas'),
      win('lynbrook', 'milpitas'),
    ]);
    expect(rows.map((r) => r.slug).slice(0, 6)).toEqual(['lynbrook', 'gunn', 'homestead', 'milpitas', 'mountain-view', 'palo-alto']);
    expect(row(rows, 'gunn').tiebreak.resolvedBy).toBe('record-vs-placed');
    expect(row(rows, 'homestead').tiebreak.shared).toBe(false);
  });

  it('a meeting not yet played stops the walk: the teams stay level, for the coaches’ vote', () => {
    const rows = table([
      win('lynbrook', 'gunn'),
      win('lynbrook', 'mountain-view'),
      win('lynbrook', 'milpitas'),
      win('gunn', 'mountain-view'),
      win('homestead', 'mountain-view'),
      win('milpitas', 'homestead'),
      win('milpitas', 'mountain-view'),
    ]);
    const gunn = row(rows, 'gunn');
    const homestead = row(rows, 'homestead');
    // Gunn and Homestead (1-1) have not met, and only Gunn has played first-place Lynbrook.
    expect(gunn.computed.place).toBe(homestead.computed.place);
    expect(gunn.tiebreak.shared).toBe(true);
    expect(gunn.tiebreak.resolvedBy).toBe('coaches-vote');
    expect(gunn.tiebreak.tiedWith).toEqual([homestead.teamId]);
    expect(gunn.tiebreak.note).toBe(
      'Level at 1-1 (.500) with Homestead and unresolved by every criterion — Article VI §1.1 (a blind coaches’ vote of the division, then a coin flip — we cannot compute either, so the teams stay level). We show them level.',
    );
  });

  it('teams that split against a level group do not separate, above the group or below it', () => {
    const rows = table([
      win('gunn', 'homestead'),
      win('homestead', 'gunn'),
      win('lynbrook', 'gunn'),
      win('lynbrook', 'homestead'),
      win('gunn', 'palo-alto'),
      win('gunn', 'palo-alto'),
      win('homestead', 'palo-alto'),
      win('homestead', 'palo-alto'),
      // Milpitas and Mountain View finish level (1-3) without meeting: Gunn beat one, Homestead the other.
      win('gunn', 'milpitas'),
      win('milpitas', 'homestead'),
      win('homestead', 'mountain-view'),
      win('mountain-view', 'gunn'),
      win('lynbrook', 'milpitas'),
      win('lynbrook', 'milpitas'),
      win('lynbrook', 'mountain-view'),
      win('lynbrook', 'mountain-view'),
    ]);
    const gunn = row(rows, 'gunn');
    const homestead = row(rows, 'homestead');
    const milpitas = row(rows, 'milpitas');
    const mountainView = row(rows, 'mountain-view');
    expect([gunn.computed.place, homestead.computed.place]).toEqual([2, 2]);
    expect(gunn.tiebreak.resolvedBy).toBe('coaches-vote');
    // The lower pair is level too: it split against the level pair above it, which has no order to walk.
    expect([milpitas.computed.place, mountainView.computed.place]).toEqual([4, 4]);
    expect(milpitas.tiebreak.shared).toBe(true);
    expect(row(rows, 'palo-alto').computed.place).toBe(6);
  });
});

/** The CCS basketball calendar's ten events (cifccs.org/calendar/Basketball?print=ical, read 2026-11-10). */
const BASKETBALL_FEED: ReadonlyArray<[string, string]> = [
  ['2027-02-17', '(Basketball) CCS Seeding Meeting at CCS Office'],
  ['2027-02-19', '(Basketball) CCS D1-D5 1st Round & Open Game #1 at Home Sites'],
  ['2027-02-20', '(Basketball) CCS D1-D5 2nd Round at Home Sites'],
  ['2027-02-22', '(Basketball) CCS Open Game #2 at Neutral Sites'],
  ['2027-02-23', '(Basketball) CCS D1-D5 Quarterfinals at Home Sites'],
  ['2027-02-24', '(Basketball) CCS Open Game #3 at Home Sites'],
  ['2027-02-25', '(Basketball) CCS D1-D5 Semifinals at Home Sites'],
  ['2027-02-26', '(Basketball) CCS Open Finals at Neutral Sites'],
  ['2027-02-27', '(Basketball) CCS D1-D5 Finals at Neutral Sites'],
  ['2027-03-11', '(Basketball) Evaluation Meeting at TBD'],
];

describe('basketball: the CCS bracket opens with a first round', () => {
  it('the first CCS day is the first round, and the last the Division 1-5 finals', () => {
    const { CCS, ccsFirstDay, ccsLastDay } = m.sections;
    expect(CCS.keyDates.firstRound).toBe('2027-02-19');
    expect(CCS.keyDates.secondRound).toBe('2027-02-20');
    expect(ccsFirstDay(CCS.keyDates)).toBe('2027-02-19');
    expect(ccsLastDay(CCS.keyDates)).toBe('2027-02-27');
    // A sport with no first round opens at the quarterfinals.
    expect(ccsFirstDay({ quarterfinals: '2026-11-07' })).toBe('2026-11-07');
  });

  it('the calendar feed’s summaries are read as their rounds, and confirm every date and site config publishes', () => {
    const { classifyCcsSummary, cleanCcsSummary, confirmKeyDates } = m.ccs;
    expect(BASKETBALL_FEED.map(([, s]) => classifyCcsSummary(s))).toEqual([
      'seeding', 'first-round', 'second-round', 'other', 'quarterfinals', 'other', 'semifinals', 'finals', 'finals', 'evaluation',
    ]);
    expect(cleanCcsSummary('(Basketball) CCS D1-D5 2nd Round at Home Sites')).toBe('CCS D1-D5 2nd Round at Home Sites');
    expect(cleanCcsSummary('Basketball: (Basketball) CCS Seeding Meeting at CCS Office, 12:00 noon')).toBe('CCS Seeding Meeting at CCS Office, 12:00 noon');
    const events = BASKETBALL_FEED.map(([date, summary]) => ({
      date, summary: cleanCcsSummary(summary), kind: classifyCcsSummary(summary), uid: null, detail: null,
    }));
    const check = confirmKeyDates(events);
    expect(check.differences).toEqual([]);
    expect(check.confirmed).toBe(true);
    // A first round the feed moves is reported, never adopted.
    const moved = events.map((e) => (e.kind === 'first-round' ? { ...e, date: '2027-02-18' } : e));
    expect(confirmKeyDates(moved).differences).toEqual(['first round: we publish 2027-02-19, CCS calendar says 2027-02-18']);
  });

  it('a CCS pair dated in the first round is inside the CCS window', () => {
    const g = m.builder.game({ home: 'gunn', away: 'los-altos', hs: 60, as: 50, date: '2027-02-19', league: false, official: null });
    expect(g.postseason).toMatchObject({ kind: 'ccs', via: 'ccs-window' });
    const before = m.builder.game({ home: 'gunn', away: 'los-altos', hs: 60, as: 50, date: '2026-12-05', league: false, official: null });
    expect(before.postseason).toBeNull();
  });
});
