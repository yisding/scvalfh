/**
 * data/sds-brackets-2026.json — the San Diego Section's 2026 brackets, transcribed by hand from the
 * Section's published sheet once it is linked after the Sat Oct 31 seeding meeting — and its contract,
 * lib/sds-brackets-schema.ts (plan final-07, 2026-10-29).
 *
 * The committed file is the placeholder until the owner fills it. The contract is exercised on last
 * season's brackets in the same shape (tests/fixtures/sds/brackets-2025.ts seedsFromHistory), and every
 * slip the owner could make in a 20-minute transcription is refused here before it reaches /playoffs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUE_IDS, getLeague } from '../lib/leagues';
import { SdsBracketsSchema, sdsPlayoffWindow, type SdsBracketsFile } from '../lib/sds-brackets-schema';
import { sds2025Schema, seedsFromHistory } from './fixtures/sds/brackets-2025';
import { REPO } from './helpers';

const raw: unknown = JSON.parse(readFileSync(path.join(REPO, 'data', 'sds-brackets-2026.json'), 'utf8'));
const file2025 = seedsFromHistory('sds');

/** A deep copy to break one invariant in. */
const copy = (): SdsBracketsFile => structuredClone(file2025);
/** Refused, with an issue whose message contains `why` (so each case trips the invariant it names). */
const refused = (f: unknown, why: string) => {
  const r = sds2025Schema.safeParse(f);
  expect(r.success).toBe(false);
  expect(r.error!.issues.map((i) => i.message).join(' | ')).toContain(why);
};

/** Every San Diego member's playoff division on the Section's 2026 Divisions sheet. */
const divisionOf = new Map<string, 'I' | 'II'>(
  LEAGUE_IDS.flatMap((l) => {
    const ps = getLeague(l).postseason;
    return ps.kind === 'section-playoffs' ? Object.entries(ps.playoffDivisionOf) : [];
  }),
);
const placedIn2025 = new Set(
  file2025.divisions.flatMap((d) => [...d.seeds.map((s) => s.slug), ...(d.playIn ? [d.playIn.home, d.playIn.away] : [])]),
);
/** The Division II teams the 2025 brackets did not place (every Division I team was placed). */
const unplacedII = [...divisionOf].filter(([slug, d]) => d === 'II' && !placedIn2025.has(slug)).map(([slug]) => slug);

describe('the committed file', () => {
  it('is the placeholder until the Section publishes', () => {
    expect(raw).toEqual({ season: '2026-27', retrievedOn: null, source: null, divisions: [] });
    expect(SdsBracketsSchema.parse(raw).divisions).toEqual([]);
  });

  it('is checked against the config’s playoffs window, Nov 2–14', () => {
    expect(sdsPlayoffWindow()).toEqual({ first: '2026-11-02', last: '2026-11-14' });
    // Last season's dates fall outside this season's window.
    expect(SdsBracketsSchema.safeParse(file2025).success).toBe(false);
  });
});

describe('the 2025 brackets in this file shape', () => {
  it('converts into a valid file: Open 8, Division I 12, Division II 12 with the 11th place a play-in', () => {
    expect(file2025.divisions.map((d) => [d.id, d.label, d.size, d.rounds.length, d.seeds.length])).toEqual([
      ['open', 'Open Division', 8, 3, 8],
      ['division-1', 'Division I', 12, 4, 12],
      ['division-2', 'Division II', 12, 4, 11],
    ]);
    const ii = file2025.divisions[2];
    expect(ii.playIn).toEqual({ date: '2025-11-03', forSeed: 11, home: 'helix', away: 'granite-hills' });
    expect(ii.seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
    expect(ii.rounds.map((r) => r.date)).toEqual(['2025-11-05', '2025-11-08', '2025-11-12', '2025-11-15']);
    expect(file2025.divisions[0].seeds.slice(0, 2)).toEqual([
      { seed: 1, slug: 'torrey-pines' },
      { seed: 2, slug: 'bishops' },
    ]);
    expect(file2025.divisions.map((d) => d.rounds.at(-1)!.site)).toEqual(['La Jolla HS', 'La Jolla HS', 'La Jolla HS']);
  });
});

describe('a transcription slip is refused', () => {
  it('a Division II team in the Open Division', () => {
    const f = copy();
    f.divisions[0].seeds[7].slug = unplacedII[0];
    refused(f, 'an Open Division team is not a Division I team');
    // Swapping that place with a Division I team from the Division II bracket (Del Norte) passes.
    const ok = copy();
    expect(ok.divisions[2].seeds[0].slug).toBe('del-norte');
    [ok.divisions[0].seeds[7].slug, ok.divisions[2].seeds[0].slug] = ['del-norte', ok.divisions[0].seeds[7].slug];
    expect(sds2025Schema.safeParse(ok).success).toBe(true);
  });

  it('13 places in a 12-team field', () => {
    const f = copy();
    f.divisions[1].seeds.push({ seed: 13, slug: unplacedII[0] });
    refused(f, 'Too big');
  });

  it('a place missing or out of order', () => {
    const f = copy();
    f.divisions[1].seeds.splice(4, 1);
    refused(f, 'the places are not 1..size');
    const g = copy();
    [g.divisions[0].seeds[0].seed, g.divisions[0].seeds[1].seed] = [2, 1];
    refused(g, 'the places are not 1..size');
  });

  it('a team placed twice, in one division or in two', () => {
    const f = copy();
    f.divisions[1].seeds[11].slug = f.divisions[1].seeds[10].slug;
    refused(f, 'a team is placed twice');
    const g = copy();
    g.divisions[2].seeds[0].slug = g.divisions[1].seeds[0].slug;
    refused(g, 'a team is placed in two divisions');
    const h = copy();
    h.divisions[2].seeds[0].slug = 'helix'; // also in the play-in
    refused(h, 'a team is placed twice');
  });

  it('a play-in on an 8-team field, or for a place other than 11 or 12', () => {
    const f = copy();
    f.divisions[0].playIn = { date: '2025-11-03', forSeed: 11, home: unplacedII[0], away: unplacedII[1] };
    refused(f, 'a play-in belongs to a 12-team bracket');
    const g = copy();
    (g.divisions[2].playIn as { forSeed: number }).forSeed = 10;
    refused(g, 'Invalid');
  });

  it('a slug that is not a San Diego registry team', () => {
    const f = copy();
    f.divisions[1].seeds[0].slug = 'los-gatos';
    refused(f, 'not a registry slug of a San Diego league');
  });

  it('the wrong round count, rounds out of date order, or a date outside the window', () => {
    const f = copy();
    f.divisions[0].rounds.push({ name: 'Extra', date: '2025-11-15' });
    refused(f, 'an 8-team bracket has 3 rounds');
    const g = copy();
    g.divisions[1].rounds[1].date = '2025-11-03';
    refused(g, 'round dates are not increasing');
    const h = copy();
    h.divisions[1].rounds[3].date = '2025-11-16';
    refused(h, 'round dates are not increasing');
    const i = copy();
    i.divisions[2].playIn!.date = '2025-11-05'; // not before the first round
    refused(i, 'round dates are not increasing');
  });

  it('divisions out of order or missing, or a filled file with no source', () => {
    const f = copy();
    f.divisions.reverse();
    refused(f, 'divisions are [] or open');
    refused({ ...copy(), divisions: copy().divisions.slice(0, 2) }, 'divisions are [] or open');
    refused({ ...copy(), source: null }, 'a filled file names its source');
    refused({ ...copy(), retrievedOn: null }, 'a filled file names its source');
  });
});
