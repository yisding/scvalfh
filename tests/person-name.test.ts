/**
 * lib/person-name.ts: an all-caps or all-lowercase name is recased, a cased name is kept apart from a lowercase letter
 * after a hyphen, "O'", "D'" or "Mc", and no committed roster or stats sheet still carries a name to recase.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { recaseName, recaseNameParts } from '../lib/person-name';
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
    ['addie dawson', 'Addie Dawson'],
    ['A. dawson', 'A. Dawson'],
    ["mary o'brien-mcdonald", "Mary O'Brien-McDonald"],
    ['Allison Wright-lopez', 'Allison Wright-Lopez'],
    ['Dylan-marie Nicholas', 'Dylan-Marie Nicholas'],
    ['Verenice Villa-de Jesus', 'Verenice Villa-De Jesus'],
    ['L. Oneil-dunne', 'L. Oneil-Dunne'],
    ["Valentina D'angelo", "Valentina D'Angelo"],
    ["Sean O’brien", "Sean O’Brien"],
    ['Lydia Mcdonald', 'Lydia McDonald'],
    ['Mckenna Matson', 'McKenna Matson'],
    ['Harmony Cooks-mcdonald', 'Harmony Cooks-McDonald'],
  ])('%s → %s', (name, cased) => {
    expect(recaseName(name)).toBe(cased);
  });

  it.each([
    'AJ Smith',
    'TJ',
    'Olivia Van De Braak',
    'McKenna Lee',
    'Anna van der Berg',
    'Harmony Cooks-Macdonald',
    'Amelia Macias',
    'Mackenzie Nitti',
    'Mc',
    'A.',
    'Q',
  ])(
    'keeps %s',
    (name) => {
      expect(recaseName(name)).toBe(name);
    },
  );
});

describe('recaseNameParts', () => {
  it('takes one decision from the full name', () => {
    const parts = (firstName: string, lastName: string) => ({ firstName, lastName, fullName: `${firstName} ${lastName}` });
    expect(recaseNameParts(parts('Anna', 'de la cruz'))).toEqual(parts('Anna', 'de la cruz'));
    expect(recaseNameParts(parts('addie', 'dawson'))).toEqual(parts('Addie', 'Dawson'));
    expect(recaseNameParts(parts('McKAELA', 'DANZE'))).toEqual(parts('McKaela', 'Danze'));
    expect(recaseNameParts(parts('Brooke', 'Pearce-percy'))).toEqual(parts('Brooke', 'Pearce-Percy'));
    expect(recaseNameParts({ firstName: null, lastName: null, fullName: 'MIA VEGA' })).toEqual({
      firstName: null,
      lastName: null,
      fullName: 'Mia Vega',
    });
  });
});

describe('committed names', () => {
  it.each(['rosters.json', 'player-stats.json', 'rosters-enrichment.json'])('%s has no name left to recase', (file) => {
    const raw = JSON.parse(readFileSync(path.join(REPO, 'data', file), 'utf8')) as {
      teams: { slug: string; players: Record<string, unknown>[] }[];
    };
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const shouted = raw.teams.flatMap((t) =>
      t.players.flatMap((p) => {
        const parts = { firstName: str(p.firstName), lastName: str(p.lastName), fullName: str(p.fullName) ?? '' };
        const shortName = str(p.shortName);
        return [
          ...(JSON.stringify(recaseNameParts(parts)) === JSON.stringify(parts) ? [] : [`${t.slug}: ${parts.fullName}`]),
          ...(shortName !== null && recaseName(shortName) !== shortName ? [`${t.slug}: ${shortName}`] : []),
        ];
      }),
    );
    expect(shouted).toEqual([]);
  });
});
