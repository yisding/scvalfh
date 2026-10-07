/**
 * lib/person-name.ts: an all-caps name is recased, everything a school already cased is kept, and
 * no committed roster or stats sheet still carries a shouted name.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { recaseName } from '../lib/person-name';
import { REPO } from './helpers';

describe('recaseName', () => {
  it.each([
    ['PAIGE PIERSON', 'Paige Pierson'],
    ['McKAELA DANZE', 'McKaela Danze'],
    ['P. PIERSON', 'P. Pierson'],
    ['MCDONALD', 'McDonald'],
    ["O'BRIEN-SMITH", "O'Brien-Smith"],
    ["D'ANGELO", "D'Angelo"],
    ['JOSÉ ÑUÑEZ', 'José Ñuñez'],
    ['JOHN SMITH III', 'John Smith III'],
  ])('%s → %s', (name, cased) => {
    expect(recaseName(name)).toBe(cased);
  });

  it.each(['AJ Smith', 'TJ', 'Olivia Van De Braak', "Valentina D'angelo", 'McKenna Lee', 'addie dawson'])(
    'keeps %s',
    (name) => {
      expect(recaseName(name)).toBe(name);
    },
  );
});

describe('committed names', () => {
  it.each(['rosters.json', 'player-stats.json', 'rosters-enrichment.json'])('%s has no all-caps name', (file) => {
    const raw = JSON.parse(readFileSync(path.join(REPO, 'data', file), 'utf8')) as {
      teams: { slug: string; players: Record<string, unknown>[] }[];
    };
    const shouted = raw.teams.flatMap((t) =>
      t.players.flatMap((p) =>
        (['fullName', 'firstName', 'lastName', 'shortName'] as const)
          .map((k) => p[k])
          .filter((v): v is string => typeof v === 'string' && recaseName(v) !== v)
          .map((v) => `${t.slug}: ${v}`),
      ),
    );
    expect(shouted).toEqual([]);
  });
});
