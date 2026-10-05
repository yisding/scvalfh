/**
 * Real plurals in count copy (SPEC §0.4): components/ui/plural.ts, and a source guard against the
 * '1 league games' / '1 games' templates it replaced (StandingsTable, MyTeamCard, the team page,
 * TeamStatTiles).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { formStripName, gameWord, plural } from '../../components/ui/plural';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('plural()', () => {
  it('says 1 game and 0 / 2 games', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(0, 'game')).toBe('0 games');
    expect(plural(2, 'game')).toBe('2 games');
    expect(plural(1, 'match', 'matches')).toBe('1 match');
    expect(plural(3, 'match', 'matches')).toBe('3 matches');
  });

  it('names a one-entry form strip in the singular', () => {
    expect(formStripName('Del Mar', 1)).toBe('Del Mar last 1 league game');
    expect(formStripName('Del Mar', 5)).toBe('Del Mar last 5 league games');
  });

  it('gives the bare word for a count printed separately', () => {
    expect(gameWord(1)).toBe('game');
    expect(gameWord(0)).toBe('games');
    expect(gameWord(2)).toBe('games');
  });
});

describe('no count template ignores n === 1', () => {
  it('app/ and components/ never interpolate a count straight before "games"', () => {
    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        // A line that already branches on the singular (`n === 1 ? … : `${n} games``) is fine.
        if (/=== 1\b/.test(line)) continue;
        for (const m of line.matchAll(/\$\{[^}]*(?:\.length|\.gp)\} (?:league )?games\b/g)) {
          offenders.push(`${path.relative(ROOT, file)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
