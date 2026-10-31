/**
 * `lib/postseason-outcomes.ts` ccsOutcomeFor and playInWinnerPurpose, and the play-in card's winner line
 * (components/playoffs/PlayInCard.tsx), plan final-10 (2026-10-30). The pairings are written out as
 * lib/standings.ts leaguePairings returns them on the 2026-10-29 snapshot (SCVAL #1 St. Ignatius v Mitty, #2 Saint
 * Francis v Los Gatos, #3 Valley Christian v Palo Alto, #4 Los Altos v Santa Clara; BVAL Westmont, the Santa Teresa
 * champion, hosting Willow Glen, Mt. Hamilton #4), with synthetic finals from the shared game builder.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PlayInCard, { type PlayInSide } from '../components/playoffs/PlayInCard';
import { getLeague } from '../lib/leagues';
import { ccsOutcomeFor, playInWinnerPurpose } from '../lib/postseason-outcomes';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import type { Game, LeaguePairing, PostseasonTag } from '../lib/types';
import { game } from './game-builder';
import { textOf } from './ui/html-text';

const MOD = 'lib/postseason-outcomes.ts';

const seat = (slug: string) => {
  const team = getTeamBySlug(slug);
  if (!team) throw new Error(`no team ${slug}`);
  return [{ teamId: team.id, slug: team.slug }];
};

const crossoverTag: PostseasonTag = { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' };
const bvalTag: PostseasonTag = { kind: 'bval-play-in', leagueId: 'bval', via: 'config-pairing' };

function scvalPairings(games: Partial<Record<1 | 2 | 3 | 4, Game>>): LeaguePairing[] {
  const seats: Record<1 | 2 | 3 | 4, [string, string]> = {
    1: ['st-ignatius', 'mitty'],
    2: ['saint-francis', 'los-gatos'],
    3: ['valley-christian', 'palo-alto'],
    4: ['los-altos', 'santa-clara'],
  };
  const ps = getLeague('scval').postseason;
  if (ps.kind !== 'ccs-ladder') throw new Error('SCVAL is a CCS ladder league');
  return ([1, 2, 3, 4] as const).map((n) => {
    const config = ps.pairings[n - 1];
    return {
      id: config.id,
      leagueId: 'scval',
      date: games[n]?.dateKey ?? config.date,
      time: null,
      seats: [seat(seats[n][0]), seat(seats[n][1])],
      seatLabels: [config.seatLabels[0], config.seatLabels[1]],
      host: null,
      isPlayIn: config.isPlayIn,
      label: config.label,
      game: games[n] ?? null,
    };
  });
}

function bvalPairing(g: Game | null): LeaguePairing[] {
  const ps = getLeague('bval').postseason;
  if (ps.kind !== 'ccs-ladder') throw new Error('BVAL is a CCS ladder league');
  const config = ps.pairings[0];
  return [{
    id: config.id, leagueId: 'bval', date: config.date, time: config.time,
    seats: [seat('westmont'), seat('willow-glen')], seatLabels: [config.seatLabels[0], config.seatLabels[1]],
    host: 0, isPlayIn: true, label: config.label, game: g,
  }];
}

const scvalPlayIn = game({
  home: 'los-altos', away: 'santa-clara', hs: 2, as: 1, date: '2026-10-30', league: false, postseason: crossoverTag, official: null,
});
const bvalPlayIn = game({
  home: 'westmont', away: 'willow-glen', hs: 3, as: 0, date: '2026-10-31', league: false, postseason: bvalTag, official: null,
});

describe('ccsOutcomeFor — the SCVAL 4th-place play-in', () => {
  const pairings = scvalPairings({ 4: scvalPlayIn });

  it('Los Altos 2-1 Santa Clara on Fri Oct 30: the winner and the loser', () => {
    expect(ccsOutcomeFor('los-altos', { pairings }), MOD).toMatchObject({
      kind: 'play-in', result: 'won', label: 'Won the play-in',
      sentence: 'Won the 4th-place play-in: an automatic CCS qualifier.', pairingId: 'scval-crossover-4',
    });
    expect(ccsOutcomeFor('santa-clara', { pairings }), MOD).toMatchObject({
      kind: 'play-in', result: 'lost', label: 'Lost the play-in',
      sentence: 'Lost the play-in; SCVAL submits the loser for at-large consideration.',
    });
  });

  it('gives every other SCVAL team no outcome', () => {
    for (const team of TEAMS.filter((t) => t.league === 'scval' && t.slug !== 'los-altos' && t.slug !== 'santa-clara')) {
      expect(ccsOutcomeFor(team.slug, { pairings }), `${MOD}: ${team.slug}`).toBeNull();
    }
  });

  it('reads nothing before the game is final, or from a level final with no W flag', () => {
    const scheduled = game({ home: 'los-altos', away: 'santa-clara', date: '2026-10-30', league: false, postseason: crossoverTag, official: null });
    expect(ccsOutcomeFor('los-altos', { pairings: scvalPairings({ 4: scheduled }) }), MOD).toBeNull();
    const level = game({
      home: 'los-altos', away: 'santa-clara', hs: 1, as: 1, date: '2026-10-30', league: false, postseason: crossoverTag, official: null,
      results: { home: 'T', away: 'T' },
    });
    expect(ccsOutcomeFor('los-altos', { pairings: scvalPairings({ 4: level }) }), MOD).toBeNull();
  });

  it('a level final goes to the side MaxPreps marks W', () => {
    const so = game({
      home: 'los-altos', away: 'santa-clara', hs: 1, as: 1, date: '2026-10-30', league: false, postseason: crossoverTag, official: null,
      results: { home: 'L', away: 'W' },
    });
    const p = scvalPairings({ 4: so });
    expect(ccsOutcomeFor('santa-clara', { pairings: p })?.label, MOD).toBe('Won the play-in');
    expect(ccsOutcomeFor('los-altos', { pairings: p })?.label, MOD).toBe('Lost the play-in');
  });
});

describe('ccsOutcomeFor — a SCVAL crossover', () => {
  it('Archbishop Mitty 2-0 St. Ignatius on Thu Oct 29: no label, one sentence for both teams', () => {
    const x1 = game({
      home: 'mitty', away: 'st-ignatius', hs: 2, as: 0, date: '2026-10-29', league: false, postseason: crossoverTag, official: null,
    });
    const pairings = scvalPairings({ 1: x1, 4: scvalPlayIn });
    const sentence = 'Archbishop Mitty beat St. Ignatius 2–0 in the #1 v #1 crossover on Thu Oct 29; CCS uses it when it seeds.';
    expect(ccsOutcomeFor('mitty', { pairings }), MOD).toMatchObject({ kind: 'crossover', result: 'won', label: null, sentence });
    expect(ccsOutcomeFor('st-ignatius', { pairings }), MOD).toMatchObject({ kind: 'crossover', result: 'lost', label: null, sentence });
    expect(ccsOutcomeFor('los-gatos', { pairings }), MOD).toBeNull();
  });
});

describe('ccsOutcomeFor — the BVAL play-in', () => {
  it('Westmont 3-0 Willow Glen on Sat Oct 31: the winner and the loser', () => {
    const pairings = bvalPairing(bvalPlayIn);
    expect(ccsOutcomeFor('westmont', { pairings }), MOD).toMatchObject({
      kind: 'play-in', result: 'won', label: 'Won the play-in',
      sentence: 'Won the play-in: BVAL’s fourth automatic CCS berth.',
    });
    expect(ccsOutcomeFor('willow-glen', { pairings }), MOD).toMatchObject({
      kind: 'play-in', result: 'lost', label: 'Lost the play-in',
      sentence: 'Lost the play-in; no automatic berth remains, and at-large berths are the CCS committee’s call.',
    });
    expect(ccsOutcomeFor('leigh', { pairings }), MOD).toBeNull();
    expect(ccsOutcomeFor('westmont', { pairings: bvalPairing(null) }), MOD).toBeNull();
  });

  it('never says "eliminat…" (DESIGN §15.8)', () => {
    const all = [
      ...['los-altos', 'santa-clara'].map((s) => ccsOutcomeFor(s, { pairings: scvalPairings({ 4: scvalPlayIn }) })),
      ...['westmont', 'willow-glen'].map((s) => ccsOutcomeFor(s, { pairings: bvalPairing(bvalPlayIn) })),
    ];
    for (const o of all) {
      expect(o, MOD).not.toBeNull();
      expect(`${o!.label} ${o!.sentence}`, MOD).not.toMatch(/eliminat/i);
    }
  });
});

describe('playInWinnerPurpose and the play-in card’s winner line', () => {
  it('reads the berth from the config label or the card’s purpose sentence', () => {
    expect(playInWinnerPurpose('De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'), MOD).toBe(
      'SCVAL’s 7th automatic qualifier',
    );
    expect(playInWinnerPurpose('For the SCVAL 7th automatic qualifier.'), MOD).toBe('SCVAL’s 7th automatic qualifier');
    expect(playInWinnerPurpose('Mt. Hamilton #4 at Santa Teresa #1 — play-in for BVAL’s 4th automatic CCS berth'), MOD).toBe(
      'BVAL’s 4th automatic CCS berth',
    );
    expect(playInWinnerPurpose('For BVAL’s 4th automatic CCS berth.'), MOD).toBe('BVAL’s 4th automatic CCS berth');
    // A crossover is for seeding, and the MCAL play-in card's purpose is its rule: neither is a berth.
    expect(playInWinnerPurpose('For CCS seeding, not qualification.'), MOD).toBeNull();
    expect(playInWinnerPurpose('De Anza #1 vs El Camino #1 — crossover (for CCS seeding, not qualification)'), MOD).toBeNull();
    expect(playInWinnerPurpose('6th place hosts 7th place.'), MOD).toBeNull();
  });

  const side = (slug: string, label: string): PlayInSide => ({ label, contenders: [{ team: getTeamBySlug(slug)! }], host: false });
  const card = (g: Game | null, purpose: string) =>
    textOf(
      renderToStaticMarkup(
        createElement(PlayInCard, {
          title: 'Play-in', sides: [side('los-altos', 'De Anza #4'), side('santa-clara', 'El Camino #4')],
          connector: 'vs', sentence: 'Play-in.', purpose, game: g,
        }),
      ),
    );

  it('names the winner under a final play-in, and nobody before it or under a crossover', () => {
    const CARD = 'components/playoffs/PlayInCard.tsx';
    expect(card(scvalPlayIn, 'For the SCVAL 7th automatic qualifier.'), CARD).toContain(
      'Winner: Los Altos — SCVAL’s 7th automatic qualifier',
    );
    const scheduled = game({ home: 'los-altos', away: 'santa-clara', date: '2026-10-30', league: false, postseason: crossoverTag, official: null });
    expect(card(scheduled, 'For the SCVAL 7th automatic qualifier.'), CARD).not.toContain('Winner:');
    expect(card(scvalPlayIn, 'For CCS seeding, not qualification.'), CARD).not.toContain('Winner:');
  });
});
