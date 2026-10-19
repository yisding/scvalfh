/** lib/cli/flags.ts — the one declarative parser behind the argv loops of fetch-data and the scripts. */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type FlagOptions, type FlagSpec, parseFetchedAtFlag, parseFlags, parseLeaguesFlag } from '@/lib/cli/flags';
import { parseRunArgs } from '@/lib/pipeline/cli';

describe('parseLeaguesFlag', () => {
  it('reads a comma list, drops blanks and repeats', () => {
    expect(parseLeaguesFlag('scval,bval')).toEqual(['scval', 'bval']);
    expect(parseLeaguesFlag(' mcal , ,mcal')).toEqual(['mcal']);
    // The Southern California ids, hyphenated ones included (update-data.yml validates ^[a-z0-9,-]+$).
    expect(parseLeaguesFlag('sunset,city,north-county,metro')).toEqual(['sunset', 'city', 'north-county', 'metro']);
  });

  it('refuses an unknown league and an empty list, naming the flag', () => {
    expect(() => parseLeaguesFlag('scval,nope')).toThrow(/--leagues: unknown league nope/);
    expect(() => parseLeaguesFlag(' , ', '--x')).toThrow(/--x needs at least one league id/);
  });
});

describe('parseFetchedAtFlag', () => {
  it('returns an ISO timestamp as given', () => {
    expect(parseFetchedAtFlag('2026-10-04T00:00:00.000Z')).toBe('2026-10-04T00:00:00.000Z');
    expect(parseFetchedAtFlag('2026-10-04T07:02:00-07:00')).toBe('2026-10-04T07:02:00-07:00');
  });

  it('refuses a date alone, a word and an impossible stamp, naming the flag', () => {
    expect(() => parseFetchedAtFlag('2026-10-04')).toThrow(/--fetched-at: not an ISO timestamp: 2026-10-04/);
    expect(() => parseFetchedAtFlag('yesterday')).toThrow(/--fetched-at: not an ISO timestamp: yesterday/);
    expect(() => parseFetchedAtFlag('2026-13-45T00:00:00Z', '--x')).toThrow(/--x: not an ISO timestamp/);
  });
});

interface Args {
  name: string | null;
  file: string | null;
  leagues: string[] | null;
  at: string | null;
  names: string[];
  list: string[] | null;
  pair: string[] | null;
  on: boolean;
  help: boolean;
  words: string[];
}

const init = (): Args => ({
  name: null, file: null, leagues: null, at: null, names: [], list: null, pair: null, on: false, help: false, words: [],
});

const SPEC: FlagSpec<Args> = [
  { flags: '--name', value: 'string', set: (a, v) => { a.name = v; } },
  { flags: '--file', value: 'path', set: (a, v) => { a.file = v; } },
  { flags: '--leagues', value: 'leagues', set: (a, v) => { a.leagues = v; } },
  { flags: '--at', value: 'iso', set: (a, v) => { a.at = v; } },
  { flags: '--also', value: 'string', set: (a, v) => { a.names.push(v); } },
  { flags: '--list', value: 'list', set: (a, v) => { a.list = v; } },
  { flags: '--pair', value: 'words', count: 2, missing: () => '--pair needs two words', set: (a, v) => { a.pair = v; } },
  { flags: ['--on', '--enable'], toggle: (a) => { a.on = true; } },
  { flags: ['--help', '-h'], toggle: (a) => { a.help = true; } },
];

const parse = (argv: string[], opts: Partial<FlagOptions<Args>> = {}) =>
  parseFlags(argv, SPEC, { init, allowEmptyValue: false, ...opts });

describe('parseFlags', () => {
  it('starts from init() and reads values, toggles and repeats in argv order', () => {
    expect(parse([])).toEqual(init());
    const got = parse(['--name', 'x', '--on', '--also', 'a', '--also', 'b', '--list', ' a, ,b ,c']);
    expect(got).toMatchObject({ name: 'x', on: true, names: ['a', 'b'], list: ['a', 'b', 'c'] });
  });

  it('gives every alias the one rule', () => {
    expect(parse(['--on']).on).toBe(true);
    expect(parse(['--enable']).on).toBe(true);
    expect(parse(['--help']).help).toBe(true);
    expect(parse(['-h']).help).toBe(true);
  });

  it('parses values by kind: paths against cwd, leagues and ISO stamps as the flag helpers do', () => {
    expect(parse(['--file', 'out/a.json'], { cwd: '/base' }).file).toBe(path.resolve('/base', 'out/a.json'));
    expect(parse(['--file', 'out/a.json']).file).toBe(path.resolve('out/a.json'));
    expect(parse(['--leagues', 'scval,bval']).leagues).toEqual(['scval', 'bval']);
    expect(parse(['--at', '2026-10-04T00:00:00.000Z']).at).toBe('2026-10-04T00:00:00.000Z');
  });

  it('names the flag as typed when a value does not parse', () => {
    expect(() => parse(['--leagues', 'nope'])).toThrow('--leagues: unknown league nope');
    expect(() => parse(['--at', 'yesterday'])).toThrow('--at: not an ISO timestamp: yesterday');
  });

  it('reads a flag with several words and fails with its own message when one is missing', () => {
    expect(parse(['--pair', 'a', 'b', '--on']).pair).toEqual(['a', 'b']);
    expect(() => parse(['--pair', 'a'])).toThrow(new Error('--pair needs two words'));
    expect(() => parse(['--pair', 'a', '--on'])).toThrow(new Error('--pair needs two words'));
    expect(() => parse(['--pair'])).toThrow(new Error('--pair needs two words'));
    // Empty words are words when the CLI accepts '' (build-official-fixtures does).
    expect(parse(['--pair', '', ''], { allowEmptyValue: true }).pair).toEqual(['', '']);
  });

  describe('a missing value', () => {
    it('is the end of argv, or a word starting with --', () => {
      expect(() => parse(['--name'])).toThrow(new Error('--name needs a value'));
      expect(() => parse(['--name', '--on'])).toThrow(new Error('--name needs a value'));
      expect(() => parse(['--list', '--on'])).toThrow(new Error('--list needs a value'));
    });

    it('is also an empty word unless the CLI allows one', () => {
      expect(() => parse(['--name', ''])).toThrow(new Error('--name needs a value'));
      expect(parse(['--name', ''], { allowEmptyValue: true }).name).toBe('');
      // A single dash is a value, not a flag.
      expect(parse(['--name', '-h']).name).toBe('-h');
    });

    it('names the alias that was typed', () => {
      const spec: FlagSpec<Args> = [{ flags: ['--a', '--b'], value: 'string', set: (a, v) => { a.name = v; } }];
      expect(() => parseFlags(['--b'], spec, { init, allowEmptyValue: false })).toThrow(new Error('--b needs a value'));
    });

    it('may let a --flag word be the value (fetch-mascots --only)', () => {
      expect(parse(['--name', '--on'], { allowFlagValue: true })).toMatchObject({ name: '--on', on: false });
      expect(() => parse(['--name', ''], { allowFlagValue: true })).toThrow('--name needs a value');
    });
  });

  describe('the wording of a failure is the CLI\'s own', () => {
    // The four unknown-flag spellings and the two missing-value ones in use.
    const USAGE = 'Usage: x [--name <v>]';
    it('unknown flag: X (fetch-data, the fetch scripts, build-history, discover-season)', () => {
      expect(() => parse(['--bogus'])).toThrow(new Error('unknown flag: --bogus'));
      expect(() => parse(['bare'])).toThrow(new Error('unknown flag: bare'));
    });

    it('unknown argument: X (build-official-fixtures)', () => {
      expect(() => parse(['--bogus'], { unknown: (f) => `unknown argument: ${f}` })).toThrow(new Error('unknown argument: --bogus'));
    });

    it('unknown flag X plus the usage (fetch-prior-season)', () => {
      const opts = { unknown: (f: string) => `unknown flag ${f}\n${USAGE}`, needsValue: (f: string) => `${f} needs a value\n${USAGE}` };
      expect(() => parse(['--bogus'], opts)).toThrow(new Error(`unknown flag --bogus\n${USAGE}`));
      expect(() => parse(['--name'], opts)).toThrow(new Error(`--name needs a value\n${USAGE}`));
    });

    it('unknown argument X plus the usage, also for a flag with no value (fetch-mascots --only)', () => {
      const wording = (f: string) => `unknown argument ${f}\n${USAGE}`;
      expect(() => parse(['--bogus'], { unknown: wording, needsValue: wording })).toThrow(new Error(`unknown argument --bogus\n${USAGE}`));
      expect(() => parse(['--name'], { unknown: wording, needsValue: wording })).toThrow(new Error(`unknown argument --name\n${USAGE}`));
    });
  });

  it('hands a word that is not a flag to positional(), when the CLI takes any', () => {
    const got = parse(['a', '--on', 'b'], { positional: (args, word) => { args.words.push(word); } });
    expect(got).toMatchObject({ words: ['a', 'b'], on: true });
    expect(() => parse(['--bogus'], { positional: () => undefined })).toThrow('unknown flag: --bogus');
  });

  it('stops at the first bad flag in argv order', () => {
    expect(() => parse(['--leagues', 'nope', '--bogus'])).toThrow('--leagues: unknown league nope');
    expect(() => parse(['--bogus', '--leagues', 'nope'])).toThrow('unknown flag: --bogus');
  });
});

describe('parseRunArgs (fetch-data) keeps its quirks on the shared parser', () => {
  const opts = { cwd: '/repo', now: '2026-10-04T00:00:00.000Z' };

  it('reads the alias and the empty value', () => {
    expect(parseRunArgs(['--no-scval'], opts).official).toBe(false);
    expect(parseRunArgs(['--no-official'], opts).official).toBe(false);
    expect(parseRunArgs(['-h'], opts).help).toBe(true);
    expect(parseRunArgs(['--out', ''], opts).out).toBe(path.resolve('/repo', ''));
    expect(parseRunArgs(['--accept-regression', 'scval', '--accept-regression', 'bval'], opts).acceptRegression).toEqual(['scval', 'bval']);
  });

  it('fails with its own wording', () => {
    expect(() => parseRunArgs(['--bogus'], opts)).toThrow(new Error('unknown flag: --bogus'));
    expect(() => parseRunArgs(['--out'], opts)).toThrow(new Error('--out needs a value'));
    expect(() => parseRunArgs(['--out', '--dry-run'], opts)).toThrow(new Error('--out needs a value'));
    expect(() => parseRunArgs(['--variant', 'v'], opts)).toThrow('--variant needs --fixtures');
  });
});
