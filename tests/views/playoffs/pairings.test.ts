/**
 * views/playoffs/pairings.ts (SPEC §6.1, §10.7): the league pairings (SCVAL crossover, BVAL play-in).
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through
 * useCorpusModules (tests/support/playoffs-view.ts), so live fetch #2 cannot break them. On that snapshot De Anza's
 * 3rd place is shared (Los Altos, Valley Christian), El Camino's 4th straddles the play-in and at-large places,
 * Santa Teresa's champions are level (Prospect, Westmont) and Mt. Hamilton's 4th is shared: every by-law consequence
 * of an uncomputable tiebreak shows up at once. Every assertion message names the module that produced the value.
 */

import { describe, expect, it } from 'vitest';

import { getTeamById } from '@/lib/registry/teams';
import { PAIRINGS, m } from '@/tests/support/playoffs-view';

describe('buildPairingView — the BVAL play-in card', () => {
  it('marks the Santa Teresa #1 seat as host and names both co-champions with the by-law that decides', () => {
    const [pairing] = m.data.getLeaguePairings('bval');
    const resolve = (id: string) => {
      const team = getTeamById(id);
      return team ? { team, standing: m.data.getStandingFor(id) } : undefined;
    };
    const v = m.pairings.buildPairingView(pairing, resolve, m.pairings.pairingNotesFor(pairing));
    expect(v.title, PAIRINGS).toBe('Play-in');
    expect(v.dateLabel, PAIRINGS).toBe('Sat Oct 31');
    expect(v.timeLabel, PAIRINGS).toBe('11 AM PT');
    expect(v.connector, PAIRINGS).toBe('at');
    expect(v.seats.map((s) => s.label), PAIRINGS).toEqual(['Santa Teresa #1', 'Mt. Hamilton #4']);
    expect(v.seats.map((s) => s.host), PAIRINGS).toEqual([true, false]);
    expect(v.seats[0].contenders.map((c) => c.team.slug), PAIRINGS).toEqual(['prospect', 'westmont']);
    expect(v.seats[1].contenders.map((c) => c.team.slug), PAIRINGS).toEqual(['branham', 'willow-glen']);
    expect(v.unsettled, PAIRINGS).toBe(true);
    expect(v.notes[0], PAIRINGS).toBe('Santa Teresa co-champions: BVAL By-Laws §6b-f decide who hosts.');
    expect(m.pairings.pairingSentence(v), PAIRINGS).toBe(
      'Play-in, Sat Oct 31, 11 AM PT: Branham or Willow Glen (Mt. Hamilton #4) at Prospect or Westmont (Santa Teresa #1, host).',
    );
  });

  it('states the by-law once when only the host seat is level (F95)', () => {
    const [pairing] = m.data.getLeaguePairings('bval');
    // Willow Glen unresolved: Mt. Hamilton #4 is Branham alone, so only the host seat is level.
    const v = m.pairings.buildPairingView(
      pairing,
      (id) => {
        const team = getTeamById(id);
        return team && team.slug !== 'willow-glen' ? { team, standing: m.data.getStandingFor(id) } : undefined;
      },
      m.pairings.pairingNotesFor(pairing),
    );
    expect(v.notes, PAIRINGS).toEqual([
      'Santa Teresa co-champions: BVAL By-Laws §6b-f decide who hosts.',
      'Not settled yet: the pairing follows the table, so it moves with every result.',
    ]);
  });

  it('SCVAL crossover: seat labels from config, no host, the play-in last', () => {
    const views = m.data.getLeaguePairings('scval').map((p) =>
      m.pairings.buildPairingView(p, (id) => {
        const team = getTeamById(id);
        return team ? { team, standing: m.data.getStandingFor(id) } : undefined;
      }, m.pairings.pairingNotesFor(p)),
    );
    expect(views.map((v) => v.title), PAIRINGS).toEqual(['Crossover · #1 v #1', 'Crossover · #2 v #2', 'Crossover · #3 v #3', 'Play-in']);
    expect(views.every((v) => v.connector === 'vs' && v.seats.every((s) => !s.host)), PAIRINGS).toBe(true);
    expect(views[3].seats.map((s) => s.label), PAIRINGS).toEqual(['De Anza #4', 'El Camino #4']);
    expect(views[3].unsettled, PAIRINGS).toBe(true);
    expect(views[3].notes, PAIRINGS).toEqual([
      'Not settled yet: teams are level across a seat, and Article VI §7 decides it with a coin flip. The pairing follows the table, so it moves with every result.',
    ]);
  });
});
