/**
 * scripts/build-bval-winter-fixtures.ts: the BVAL boys basketball and girls soccer schedules' text → the bundled
 * official fixtures (data/basketball/official/bval-2026.json, data/soccer/official/bval-2026.json).
 *
 * The time-note reader and the text parser are pure and tested here directly; the two bundles are held to their
 * transcriptions by running the script's `--check` under each sport's build.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { clock, parseDivisionText, readTimeNote } from '../scripts/build-bval-winter-fixtures';
import { REPO, runScript } from './helpers';

const source = (file: string) => readFileSync(path.join(REPO, 'tests', 'fixtures', 'official', 'source', file), 'utf8');

describe('the time notes', () => {
  it('reads every clock form the documents use as an afternoon or evening start', () => {
    expect(clock('4p')).toBe('16:00');
    expect(clock('615p')).toBe('18:15');
    expect(clock('6:30pm')).toBe('18:30');
    expect(clock('730')).toBe('19:30');
    expect(clock('6')).toBe('18:00');
  });

  it('reads JV first when a note does not label its two starts, and the labels when it does', () => {
    expect(readTimeNote('6/730')).toEqual({ jv: '18:00', varsity: '19:30' });
    expect(readTimeNote('4p/615p')).toEqual({ jv: '16:00', varsity: '18:15' });
    expect(readTimeNote('4pm/6pm')).toEqual({ jv: '16:00', varsity: '18:00' });
    expect(readTimeNote('V 5p/JV 7p')).toEqual({ varsity: '17:00', jv: '19:00' });
    expect(readTimeNote('JV 4p/V 6p')).toEqual({ jv: '16:00', varsity: '18:00' });
  });

  it('reads a varsity start alone, and throws on a note it cannot place', () => {
    expect(readTimeNote('V 6pm')).toEqual({ varsity: '18:00', jv: null });
    expect(readTimeNote('V 430p')).toEqual({ varsity: '16:30', jv: null });
    expect(readTimeNote('4p VAR')).toEqual({ varsity: '16:00', jv: null });
    expect(() => readTimeNote('4p')).toThrow(/unreadable time note/);
    expect(() => readTimeNote('noon')).toThrow(/unreadable time/);
  });
});

describe('the division texts', () => {
  it('reads Mt. Hamilton boys basketball: its seven teams, 42 games and the revision date', () => {
    const parsed = parseDivisionText('mt-hamilton', source('bval-basketball-boys-mt-hamilton-2026.txt'));
    expect(parsed.teams).toEqual(['CHRISTOPHER', 'EVERGREEN VALLEY', 'LEIGH', 'PIONEER', 'SANTA TERESA', 'WESTMONT', 'WILLOW GLEN']);
    expect(parsed.games).toHaveLength(42);
    expect(parsed.games[0]).toEqual({ date: '2027-01-06', away: 'Willow Glen', home: 'Santa Teresa', note: null });
    expect(parsed.revisedOn).toBe('10/12/26');
  });

  it('reads West Valley girls soccer: a note touching the name, and Gunderson with no JV team', () => {
    const parsed = parseDivisionText('west-valley', source('bval-soccer-girls-west-valley-2026.txt'));
    expect(parsed.games).toHaveLength(90);
    expect(parsed.noJv).toEqual(['GUNDERSON']);
    expect(parsed.games.find((g) => g.away === 'Independence' && g.home === 'Yerba Buena')?.note).toBe('4p/6p');
    expect(parsed.games[0].date).toBe('2026-12-03');
  });
});

describe('the bundles', () => {
  for (const sport of ['basketball', 'soccer'] as const) {
    it(`data/${sport}/official/bval-2026.json is its transcription, byte for byte`, () => {
      const run = runScript('scripts/build-bval-winter-fixtures.ts', ['--check'], { env: { ...process.env, SCVAL_SPORT: sport } });
      expect(run.status, run.output).toBe(0);
    });
  }
});
