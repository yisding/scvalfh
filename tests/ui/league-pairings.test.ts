/**
 * components/playoffs/LeaguePairings.tsx asListed (DESIGN §32.4): once MaxPreps lists a pairing's game, the card and
 * its screen-reader sentence read as the game does — visitor first, 'at' the home side ('vs' at a neutral site) — and
 * "(host)" stays only where the config's host seat is the game's home side.
 */
import { describe, expect, it } from 'vitest';

import { asListed } from '../../components/playoffs/LeaguePairings';
import { pairingSentence, type PairingView, type SeatView } from '../../components/playoffs/playoff-view';

const VIEW = 'components/playoffs/LeaguePairings.tsx';

const seat = (label: string, slug: string, name: string, host = false): SeatView =>
  ({ label, host, contenders: [{ team: { slug, name }, standing: undefined }] }) as unknown as SeatView;

const pairing = (seats: [SeatView, SeatView], connector: 'at' | 'vs', game: { home: string; away: string; site?: string } | null): PairingView =>
  ({
    id: 'p',
    label: 'x',
    title: 'Play-in',
    dateKey: '2026-10-31',
    dateLabel: 'Sat Oct 31',
    timeLabel: '11 AM PT',
    seats,
    connector,
    isPlayIn: true,
    unsettled: false,
    notes: [],
    game: game ? { home: { slug: game.home }, away: { slug: game.away }, site: game.site ?? 'home' } : null,
  }) as unknown as PairingView;

describe('asListed', () => {
  it('reads a crossover with no host as its game: the visitor at the home side', () => {
    const p = pairing([seat('De Anza #1', 'st-ignatius', 'St. Ignatius'), seat('El Camino #1', 'mitty', 'Archbishop Mitty')], 'vs', {
      home: 'mitty',
      away: 'st-ignatius',
    });
    const v = asListed(p);
    expect(v.connector, VIEW).toBe('at');
    expect(v.seats.map((s) => s.label), VIEW).toEqual(['De Anza #1', 'El Camino #1']);
    expect(pairingSentence(v), VIEW).toBe('Play-in, Sat Oct 31, 11 AM PT: St. Ignatius (De Anza #1) at Archbishop Mitty (El Camino #1).');
  });

  it('flips the seats when the first seat is at home', () => {
    const p = pairing([seat('De Anza #4', 'los-altos', 'Los Altos'), seat('El Camino #4', 'santa-clara', 'Santa Clara')], 'vs', {
      home: 'los-altos',
      away: 'santa-clara',
    });
    expect(pairingSentence(asListed(p)), VIEW).toBe('Play-in, Sat Oct 31, 11 AM PT: Santa Clara (El Camino #4) at Los Altos (De Anza #4).');
  });

  it('keeps "(host)" on the host seat at home, and never marks a visitor the host', () => {
    const host = seat('Santa Teresa #1', 'westmont', 'Westmont', true);
    const visitor = seat('Mt. Hamilton #4', 'willow-glen', 'Willow Glen');
    const asConfigured = asListed(pairing([host, visitor], 'at', { home: 'westmont', away: 'willow-glen' }));
    expect(pairingSentence(asConfigured), VIEW).toBe('Play-in, Sat Oct 31, 11 AM PT: Willow Glen (Mt. Hamilton #4) at Westmont (Santa Teresa #1, host).');
    const swapped = asListed(pairing([host, visitor], 'at', { home: 'willow-glen', away: 'westmont' }));
    expect(swapped.seats.some((s) => s.host), VIEW).toBe(false);
    expect(pairingSentence(swapped), VIEW).toBe('Play-in, Sat Oct 31, 11 AM PT: Westmont (Santa Teresa #1) at Willow Glen (Mt. Hamilton #4).');
  });

  it('says "versus" at a neutral site, and leaves a pairing with no game or no seated home team alone', () => {
    const seats: [SeatView, SeatView] = [seat('A #1', 'a', 'A'), seat('B #1', 'b', 'B')];
    expect(asListed(pairing(seats, 'vs', { home: 'b', away: 'a', site: 'neutral' })).connector, VIEW).toBe('vs');
    const none = pairing(seats, 'vs', null);
    expect(asListed(none), VIEW).toBe(none);
    const elsewhere = pairing(seats, 'vs', { home: 'c', away: 'a' });
    expect(asListed(elsewhere), VIEW).toBe(elsewhere);
  });
});
