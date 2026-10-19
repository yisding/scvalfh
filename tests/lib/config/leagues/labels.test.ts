/**
 * lib/config/leagues/labels.ts: how a division, a league and a group of independents are headed and named.
 */

import { describe, expect, it } from 'vitest';

import { getLeague, isSingleDivision } from '@/lib/config/leagues';
import {
  divisionDisplay, divisionHeading, divisionLabel, independentTeamCount, leagueTitle, readerName,
} from '@/lib/config/leagues/labels';

describe('leagues: ids and helpers (SPEC §2.3)', () => {
  it('labels divisions, and single-division leagues have no division heading', () => {
    expect(divisionHeading('pcal')).toBeNull();
    expect(divisionHeading('marin-county')).toBeNull();
    expect(divisionHeading('de-anza')).toBe('De Anza');
    expect(divisionHeading('mt-hamilton')).toBe('Mt. Hamilton');
    expect(divisionLabel('pcal')).toBe('PCAL');
    expect(divisionLabel('marin-county')).toBe('MCAL');
    expect(divisionDisplay('mt-hamilton')).toBe('BVAL · Mt. Hamilton');
    expect(divisionDisplay('marin-county')).toBe('MCAL');
    expect(divisionDisplay('de-anza')).toBe('SCVAL · De Anza');
    expect(divisionHeading('eal')).toBeNull();
    expect(divisionLabel('eal')).toBe('EAL');
    expect(divisionDisplay('eal')).toBe('EAL');
    expect(isSingleDivision('eal')).toBe(true);
    expect(isSingleDivision('pcal')).toBe(true);
    expect(isSingleDivision('scval')).toBe(false);
  });
});

describe('leagues: the LA independents (DESIGN §24.9, §24.10)', () => {
  const group = getLeague('independents');

  it('heads a group by its name alone, and names it as a reader does', () => {
    expect(leagueTitle('independents')).toBe('LA independents');
    expect(leagueTitle('scval')).toBe('SCVAL — Santa Clara Valley Athletic League');
    expect(readerName('independents')).toBe('the LA independents');
    expect(readerName('north-county')).toBe('North');
    expect(independentTeamCount(group)).toBe(5);
  });
});
