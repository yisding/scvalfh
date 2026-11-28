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
    ['Sophie (mai Lam) Vu', 'Sophie (Mai Lam) Vu'],
    ['Kiana Van every', 'Kiana Van Every'],
    ['K. Van every', 'K. Van Every'],
    ['gigi Giraldiana', 'Gigi Giraldiana'],
    ['Iris jin', 'Iris Jin'],
    ['Ann Katrin SaynWittgenstein', 'Ann-Katrin Sayn-Wittgenstein'],
    ['A. SaynWittgenstein', 'A. Sayn-Wittgenstein'],
    ['Lorenz D. De leon', 'Lorenz D. De Leon'],
    ['Camille (cj) Bulatao', 'Camille (CJ) Bulatao'],
    ['Amelia "mimi" Scatena', 'Amelia "Mimi" Scatena'],
    ['K. kekobad', 'K. Kekobad'],
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
    // An entry whose two sides differ in word count respells a part only when the part is the whole run.
    expect(recaseNameParts({ firstName: 'Ann Katrin', lastName: 'SaynWittgenstein', fullName: 'Ann Katrin SaynWittgenstein' })).toEqual({
      firstName: 'Ann-Katrin',
      lastName: 'Sayn-Wittgenstein',
      fullName: 'Ann-Katrin Sayn-Wittgenstein',
    });
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

  it('swaps a first and last name MaxPreps has the other way round, on that row only', () => {
    expect(recaseName('Decker Alina')).toBe('Alina Decker');
    expect(recaseNameParts({ firstName: 'Decker', lastName: 'Alina', fullName: 'Decker Alina' })).toEqual({
      firstName: 'Alina',
      lastName: 'Decker',
      fullName: 'Alina Decker',
    });
    // Anyone else named Decker or Alina keeps her name.
    expect(recaseNameParts({ firstName: 'Alina', lastName: 'Buckelew', fullName: 'Alina Buckelew' })).toEqual({
      firstName: 'Alina',
      lastName: 'Buckelew',
      fullName: 'Alina Buckelew',
    });
    expect(recaseName('Israel Decker')).toBe('Israel Decker');
    // A fixed point: a refetch of the respelled row changes nothing.
    expect(recaseNameParts({ firstName: 'Alina', lastName: 'Decker', fullName: 'Alina Decker' })).toEqual({
      firstName: 'Alina',
      lastName: 'Decker',
      fullName: 'Alina Decker',
    });
  });

  it('respells a misspelled half of a hyphenated last name, on the roster row and the stat sheet (2026-11-27)', () => {
    expect(recaseNameParts({ firstName: 'Melina', lastName: 'Gklaros-Stavropolous', fullName: 'Melina Gklaros-Stavropolous' })).toEqual({
      firstName: 'Melina',
      lastName: 'Gklaros-Stavropoulos',
      fullName: 'Melina Gklaros-Stavropoulos',
    });
    expect(recaseName('M. Gklaros-Stavropolous')).toBe('M. Gklaros-Stavropoulos');
    // A fixed point, and her brother's row (spelled right by MaxPreps) is left alone.
    expect(recaseName('Melina Gklaros-Stavropoulos')).toBe('Melina Gklaros-Stavropoulos');
    expect(recaseName('Nick Gklaros-Stavropoulos')).toBe('Nick Gklaros-Stavropoulos');
  });

  it('respells a last name on one row, keyed to the whole name (2026-11-27)', () => {
    expect(recaseNameParts({ firstName: 'Victoria', lastName: 'Tuipolotu', fullName: 'Victoria Tuipolotu' })).toEqual({
      firstName: 'Victoria',
      lastName: 'Tuipulotu',
      fullName: 'Victoria Tuipulotu',
    });
    expect(recaseName('Victoria Tuipulotu')).toBe('Victoria Tuipulotu');
    // Anyone else of either spelling keeps hers.
    expect(recaseName('Leinata Tuipolotu')).toBe('Leinata Tuipolotu');
  });

  it('gives a last name MaxPreps has only the initial of, on that row only (2026-11-28)', () => {
    expect(recaseNameParts({ firstName: 'Jarett', lastName: 'P', fullName: 'Jarett P' })).toEqual({
      firstName: 'Jarrett',
      lastName: 'Poon',
      fullName: 'Jarrett Poon',
    });
    // Another Jarett, or another player with the initial P, keeps his.
    expect(recaseNameParts({ firstName: 'Jarett', lastName: 'Smith', fullName: 'Jarett Smith' }).firstName).toBe('Jarett');
    expect(recaseNameParts({ firstName: 'Sam', lastName: 'P', fullName: 'Sam P' }).lastName).toBe('P');
    // Only the whole name: a longer name that holds it is someone else's.
    expect(recaseNameParts({ firstName: 'Jarett', lastName: 'P Smith', fullName: 'Jarett P Smith' })).toEqual({
      firstName: 'Jarett',
      lastName: 'P Smith',
      fullName: 'Jarett P Smith',
    });
    expect(recaseName('Jarett P Smith')).toBe('Jarett P Smith');
    expect(recaseName('Jarett P')).toBe('Jarrett Poon');
  });

  it('respells the misspellings the 2026-11-27 sweep found, each on its own row', () => {
    const cases: Array<[string, string, string, string, string]> = [
      // [MaxPreps first, last, then the corrected first, last, full]
      ['Thas', 'Ettori', 'Thaïs', 'Ettori', 'Thaïs Ettori'],
      ['Caylee', 'Chinn', 'Caylee', 'Chin', 'Caylee Chin'],
      ['Chelsie', 'Chinn', 'Chelsie', 'Chin', 'Chelsie Chin'],
      ['Dhrishti', 'Shan', 'Dhrishti', 'Shah', 'Dhrishti Shah'],
      ['Nethra', 'Lyer', 'Nethra', 'Iyer', 'Nethra Iyer'],
      ['Madina', 'Nooray', 'Madina', 'Noorzay', 'Madina Noorzay'],
      ['Kyraiki', 'Pries', 'Kyriaki', 'Pries', 'Kyriaki Pries'],
      ['Ella', 'Bradfrd', 'Ella', 'Bradford', 'Ella Bradford'],
      ['Guiliana (GiGi)', 'Borello', 'Giuliana (GiGi)', 'Borello', 'Giuliana (GiGi) Borello'],
      ['Daisy', 'Regaldo', 'Daisy', 'Regalado', 'Daisy Regalado'],
      ['Varun', 'Pannikar', 'Varun', 'Panikkar', 'Varun Panikkar'],
    ];
    for (const [first, last, firstTo, lastTo, fullTo] of cases) {
      expect(recaseNameParts({ firstName: first, lastName: last, fullName: `${first} ${last}` })).toEqual({ firstName: firstTo, lastName: lastTo, fullName: fullTo });
      expect(recaseName(fullTo), fullTo).toBe(fullTo); // a fixed point
    }
    expect(recaseName('E. Bradfrd')).toBe('E. Bradford'); // the stat sheet's short form
    // Keyed to the whole name: anyone else of a surname keeps it.
    for (const name of ['Grace Chinn', 'Amy Shan', 'Mia Nooray', 'Tom Pannikar', 'Ana Regaldo']) expect(recaseName(name)).toBe(name);
  });

  it('respells a parenthesized middle name on a roster row', () => {
    expect(
      recaseNameParts({ firstName: 'Sophie (mai Lam)', lastName: 'Vu', fullName: 'Sophie (mai Lam) Vu' }),
    ).toEqual({ firstName: 'Sophie (Mai Lam)', lastName: 'Vu', fullName: 'Sophie (Mai Lam) Vu' });
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
    const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'field-hockey', file), 'utf8')) as {
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
