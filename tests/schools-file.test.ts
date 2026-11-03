/**
 * data/schools.json (lib/schools.ts): one campus address per registry school, keyed by slug, and the
 * game-address rules every Directions link and the game page's WHERE line share (lib/venue.ts).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getLeagueTournament } from '../lib/data';
import { SCHOOL_ADDRESSES, loadSchools, schoolAddress } from '../lib/schools';
import { TEAMS } from '../lib/teams';
import type { Game } from '../lib/types';
import { addressLine, gameAddress } from '../lib/venue';
import { game } from './game-builder';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'schools.json'), 'utf8')) as Record<string, unknown>;

describe('data/schools.json', () => {
  it('validates and holds exactly one record per registry school', () => {
    expect(() => loadSchools(raw)).not.toThrow();
    expect(Object.keys(SCHOOL_ADDRESSES).sort()).toEqual(TEAMS.map((t) => t.slug).sort());
  });

  it('holds the addresses as MaxPreps gives them, ordinal suffixes lower-cased and ZIPs at five digits', () => {
    expect(schoolAddress('fremont')).toEqual({ street: '575 W. Fremont Avenue', city: 'Sunnyvale', region: 'CA', postalCode: '94087' });
    expect(schoolAddress('st-ignatius').street).toBe('2001 37th Ave');
    expect(schoolAddress('redwood').postalCode).toBe('94939');
    expect(addressLine(schoolAddress('la-jolla'))).toBe('750 Nautilus St, La Jolla, CA 92037');
  });

  it('refuses a malformed record and an unknown slug', () => {
    const schools = raw.schools as Record<string, unknown>;
    const bad = (patch: Record<string, unknown>) => ({ ...raw, schools: { ...schools, ...patch } });
    expect(() => loadSchools(bad({ fremont: { street: '575 W. Fremont Avenue', city: 'Sunnyvale', region: 'CA', postalCode: '94087-1234' } })))
      .toThrow(/data\/schools.json failed validation:[\s\S]*five-digit ZIP/);
    expect(() => loadSchools(bad({ fremont: { street: ' ', city: 'Sunnyvale', region: 'CA', postalCode: '94087' } })))
      .toThrow(/data\/schools.json failed validation/);
    expect(() => schoolAddress('not-a-school')).toThrow(/no record for not-a-school/);
  });
});

describe('gameAddress (lib/venue.ts)', () => {
  it('a home game is at the host school', () => {
    const g = game({ home: 'fremont', away: 'cupertino' });
    expect(gameAddress(g)).toMatchObject({ source: 'host-school', address: schoolAddress('fremont') });
    expect(gameAddress(g)?.school?.slug).toBe('fremont');
  });

  it('the game’s own address wins over the school’s', () => {
    const own = { street: '1 Field Rd', city: 'Sunnyvale', region: 'CA', postalCode: '94087' };
    const g = game({ home: 'fremont', away: 'cupertino' });
    const withOwn: Game = { ...g, venue: { ...g.venue, address: own } };
    expect(gameAddress(withOwn)).toEqual({ address: own, source: 'game', school: null });
  });

  it('a named venue that is a registry school is at that school; any other named venue has no address', () => {
    const g = game({ home: 'st-ignatius', away: 'scripps-ranch' });
    const atMitty: Game = { ...g, venue: { ...g.venue, name: 'Archbishop Mitty High School' } };
    expect(gameAddress(atMitty)).toMatchObject({ source: 'venue-school', address: schoolAddress('mitty') });
    const elsewhere: Game = { ...g, venue: { ...g.venue, name: 'Kezar Stadium' } };
    expect(gameAddress(elsewhere)).toBeNull();
  });

  it('a neutral site and a disputed host have no address', () => {
    const g = game({ home: 'fremont', away: 'cupertino' });
    expect(gameAddress({ ...g, site: 'neutral' })).toBeNull();
    expect(gameAddress({ ...g, provenance: { ...g.provenance, hostConflict: 'the official schedule has Cupertino hosting.' } }))
      .toBeNull();
  });

  it('the MCAL final is at its fixed site (Tamalpais), whoever MaxPreps lists as home', () => {
    const final = getLeagueTournament('mcal').games.find((tg) => tg.round === 'final')?.game;
    if (!final) return; // a snapshot from before the final is set
    expect(gameAddress(final)).toMatchObject({ source: 'final-site', address: schoolAddress('tamalpais') });
    const swapped: Game = { ...final, home: final.away, away: final.home };
    expect(gameAddress(swapped)).toMatchObject({ source: 'final-site', address: schoolAddress('tamalpais') });
  });
});
