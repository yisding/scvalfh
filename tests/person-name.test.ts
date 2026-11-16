/**
 * lib/sources/person-name.ts: an all-caps or all-lowercase name is recased, a cased name is kept apart from a lowercase letter
 * after a hyphen, "O'", "D'" or "Mc", and no committed roster or stats sheet still carries a name to recase.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { recaseName, recaseNameParts } from '../lib/sources/person-name';
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
    'Olivia Van de Braak',
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

describe('NAME_SPELLINGS', () => {
  it.each([
    ['Olivia Van De Braak', 'Olivia Van de Braak'],
    ['O. Van De Braak', 'O. Van de Braak'],
    ['olivia van de braak', 'Olivia Van de Braak'],
    ['Van De Braak', 'Van de Braak'],
    ['OLIVIA VAN DE BRAAK', 'Olivia Van de Braak'],
    ['Gretta Jungjohann', 'Greta Jungjohann'],
    ['GRETTA JUNGJOHANN', 'Greta Jungjohann'],
  ])('%s → %s', (name, spelled) => {
    expect(recaseName(name)).toBe(spelled);
  });

  it('respells whole words only', () => {
    expect(recaseName('Ava Van De Braaker')).toBe('Ava Van De Braaker');
    expect(recaseName('Ava Smith-Van De Braak')).toBe('Ava Smith-Van De Braak');
  });

  it('leaves the same first name alone on anyone else', () => {
    expect(recaseName('Gretta Smith')).toBe('Gretta Smith');
    expect(recaseNameParts({ firstName: 'Gretta', lastName: 'Smith', fullName: 'Gretta Smith' })).toEqual({
      firstName: 'Gretta',
      lastName: 'Smith',
      fullName: 'Gretta Smith',
    });
  });

  it('respells the first name of a roster row whose full name matches', () => {
    expect(recaseNameParts({ firstName: 'Gretta', lastName: 'Jungjohann', fullName: 'Gretta Jungjohann' })).toEqual({
      firstName: 'Greta',
      lastName: 'Jungjohann',
      fullName: 'Greta Jungjohann',
    });
    expect(recaseNameParts({ firstName: 'OLIVIA', lastName: 'VAN DE BRAAK', fullName: 'OLIVIA VAN DE BRAAK' })).toEqual({
      firstName: 'Olivia',
      lastName: 'Van de Braak',
      fullName: 'Olivia Van de Braak',
    });
  });

  it('respells a roster row on all three fields', () => {
    expect(recaseNameParts({ firstName: 'Olivia', lastName: 'Van De Braak', fullName: 'Olivia Van De Braak' })).toEqual({
      firstName: 'Olivia',
      lastName: 'Van de Braak',
      fullName: 'Olivia Van de Braak',
    });
  });
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
